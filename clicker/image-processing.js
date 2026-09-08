// =====================================================================
// clicker/image-processing.js
//
// "Clicker from Image" — Phase 1: image → silhouette polygon pipeline.
//
// This file is intentionally self-contained and does NOT touch, import,
// or depend on viewer.js / script.js in any way. It is split into two
// parts:
//
//   1) Browser I/O helpers   — use DOM APIs (Image, canvas). Only called
//                               from clicker-ui.js.
//   2) Pure algorithm functions — take plain typed-array data in, return
//                               plain data out. No DOM dependency, so
//                               they can be unit-tested outside the
//                               browser and safely reused later by
//                               Phase 2 geometry code without dragging
//                               UI concerns along.
//
// Phase 1 scope only: grayscale + alpha masking, threshold, invert,
// binary-raster contour tracing (with hole support), and a simple
// "closing" smoothing pass. NO 3D geometry, NO STL, NO MX stem here.
// =====================================================================

import ClipperLib from
  "https://cdn.jsdelivr.net/npm/clipper-lib@6.4.2/+esm";

import { quantizeImageColors } from "./color-quantization.js";
import { fitContourNetwork } from "./contour-fitting.js";

// A separate ClipperLib usage scale for this module only — independent
// from the CLIPPER_SCALE used by the Name Keychain die-cut outline code
// in viewer.js. Nothing here shares state with that pipeline.
const CLICKER_CLIPPER_SCALE = 100;

function nowMs() {
  return typeof performance !== "undefined" && performance.now
    ? performance.now()
    : Date.now();
}


// =====================================================================
// 1) Browser I/O helpers
// =====================================================================

/**
 * Load an uploaded File (PNG/JPG/WebP) into an HTMLImageElement.
 * @param {File} file
 * @returns {Promise<HTMLImageElement>}
 */
export function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };

    img.src = url;
  });
}

/**
 * Draw an HTMLImageElement onto an offscreen canvas (downscaled if
 * needed for performance) and return the raw ImageData, plus the
 * canvas itself for optional reuse by preview UI.
 * @param {HTMLImageElement} img
 * @param {number} maxSize working resolution cap (longest side, px)
 */
export function getImageDataFromImage(img, maxSize = 512) {
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;

  const scale = Math.min(1, maxSize / Math.max(srcW, srcH));
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);

  return { imageData, canvas, width, height };
}


// =====================================================================
// 2) Pure algorithm functions (no DOM dependency)
// =====================================================================

/**
 * Convert RGBA image data into a binary foreground/background mask.
 *
 * - Pixels with alpha below alphaThreshold are ALWAYS background
 *   (handles PNG transparent backgrounds correctly, regardless of
 *   threshold/invert).
 * - Otherwise, perceptual grayscale is compared against `threshold`
 *   (dark = foreground by default).
 * - `invert` flips which side (dark/light) counts as foreground.
 *
 * @param {{data:Uint8ClampedArray, width:number, height:number}} imageData
 * @param {{threshold?:number, invert?:boolean, alphaThreshold?:number}} options
 * @returns {{mask:Uint8Array, width:number, height:number}}
 */
export function buildMask(imageData, options = {}) {
  const { width, height, data } = imageData;
  const threshold = options.threshold ?? 128;
  const invert = !!options.invert;
  const alphaThreshold = options.alphaThreshold ?? 128;

  const mask = new Uint8Array(width * height);

  // Does this image actually carry a transparent background (a real
  // alpha-cutout PNG), or is it fully opaque (JPG, or a PNG exported
  // without transparency)? Only in the transparent case does alpha
  // alone define the silhouette correctly — see below.
  let hasTransparency = false;
  for (let i = 0; i < width * height; i++) {
    if (data[i * 4 + 3] < alphaThreshold) {
      hasTransparency = true;
      break;
    }
  }

  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const a = data[i * 4 + 3];

    if (a < alphaThreshold) {
      mask[i] = 0; // transparent pixel = always background
      continue;
    }

    // Genuine alpha-cutout: every opaque pixel is part of the drawn
    // subject by definition, regardless of its color. Re-testing color/
    // luminance here (the old behavior) incorrectly excluded light-
    // colored fill areas (e.g. a cat's cream belly) from the mask,
    // fragmenting one solid silhouette into disconnected dark-outline
    // islands. threshold/invert still apply as before to images with
    // no real transparency, where alpha can't tell foreground from
    // background at all.
    if (hasTransparency) {
      mask[i] = 1;
      continue;
    }

    const gray = 0.299 * r + 0.587 * g + 0.114 * b;

    let isForeground = gray < threshold;
    if (invert) isForeground = !isForeground;

    mask[i] = isForeground ? 1 : 0;
  }

  return { mask, width, height };
}

// Clockwise direction cycle in a y-down (screen/canvas) coordinate
// system: right -> down -> left -> up -> right ...
const DIR_ORDER = ["1,0", "0,1", "-1,0", "0,-1"];

function dirIndex(dx, dy) {
  return DIR_ORDER.indexOf(dx + "," + dy);
}

function keyOf(x, y) {
  return x + "," + y;
}

/**
 * Trace the boundary of a binary raster mask into closed polygon loops,
 * in integer pixel-grid coordinates (0..width, 0..height).
 *
 * Handles multiple separate shapes AND holes: an outer boundary and any
 * hole boundary inside it are wound in OPPOSITE directions (their
 * signedArea() has opposite sign), which is what downstream code (e.g.
 * even-odd canvas fill, or Phase 2's THREE.Shape holes) expects.
 *
 * Ambiguity handling: when two foreground pixels touch only diagonally
 * (a "pinch" point), the shared corner has 2 incoming + 2 outgoing
 * edges. This is resolved with the standard raster-tracing convention
 * "always take the sharpest available right turn first", which treats
 * diagonal-only touches as separate shapes (4-connected foreground /
 * 8-connected background). Verified against a dedicated pinch-point
 * test case — see project test notes.
 *
 * @param {Uint8Array} mask
 * @param {number} width
 * @param {number} height
 * @returns {Array<{x:number,y:number}>[]} array of closed loops
 */
export function traceContours(mask, width, height) {
  const edgesFrom = new Map();

  function at(x, y) {
    if (x < 0 || y < 0 || x >= width || y >= height) return 0;
    return mask[y * width + x];
  }

  function addEdge(x1, y1, x2, y2) {
    const k = keyOf(x1, y1);
    if (!edgesFrom.has(k)) edgesFrom.set(k, []);
    edgesFrom.get(k).push({ x: x2, y: y2 });
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!at(x, y)) continue;
      if (!at(x, y - 1)) addEdge(x, y, x + 1, y);         // top edge
      if (!at(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1); // right edge
      if (!at(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1); // bottom edge
      if (!at(x - 1, y)) addEdge(x, y + 1, x, y);         // left edge
    }
  }

  const used = new Set();

  function edgeKey(x1, y1, x2, y2) {
    return x1 + "," + y1 + "->" + x2 + "," + y2;
  }

  function pickNext(x, y, inDx, inDy) {
    const candidates = edgesFrom.get(keyOf(x, y)) || [];
    const avail = candidates.filter(
      (c) => !used.has(edgeKey(x, y, c.x, c.y))
    );
    if (avail.length === 0) return null;
    if (avail.length === 1) return avail[0];

    // Ambiguous fork (pinch point): prefer sharpest right turn first,
    // then straight, then left, then U-turn.
    const inIdx = dirIndex(inDx, inDy);
    const priority = [
      (inIdx + 1) % 4,
      inIdx,
      (inIdx + 3) % 4,
      (inIdx + 2) % 4,
    ];

    for (const p of priority) {
      const [pdx, pdy] = DIR_ORDER[p].split(",").map(Number);
      const found = avail.find(
        (c) => c.x - x === pdx && c.y - y === pdy
      );
      if (found) return found;
    }
    return avail[0];
  }

  const loops = [];
  const maxSteps = width * height * 4 + 8;

  for (const [startKey, list] of edgesFrom) {
    for (const startEdge of list) {
      const [sx, sy] = startKey.split(",").map(Number);
      const startEk = edgeKey(sx, sy, startEdge.x, startEdge.y);
      if (used.has(startEk)) continue;

      const loop = [{ x: sx, y: sy }];
      let ndx = startEdge.x - sx;
      let ndy = startEdge.y - sy;
      let nx = startEdge.x;
      let ny = startEdge.y;
      used.add(startEk);

      let guard = 0;
      let broke = false;

      while (!(nx === sx && ny === sy)) {
        loop.push({ x: nx, y: ny });
        const next = pickNext(nx, ny, ndx, ndy);
        if (!next) {
          broke = true;
          break;
        }
        const ek = edgeKey(nx, ny, next.x, next.y);
        used.add(ek);
        ndx = next.x - nx;
        ndy = next.y - ny;
        nx = next.x;
        ny = next.y;

        guard++;
        if (guard > maxSteps) {
          broke = true;
          break;
        }
      }

      // A broken/unclosed loop should not happen for a well-formed
      // binary mask; skip it defensively rather than emit garbage.
      if (!broke && loop.length >= 3) {
        loops.push(loop);
      }
    }
  }

  return loops;
}

/**
 * Signed area of a pixel-grid loop (shoelace formula). Sign indicates
 * winding direction — outer boundaries and hole boundaries always have
 * opposite signs when produced by traceContours().
 * @param {Array<{x:number,y:number}>} loop
 */
export function signedArea(loop) {
  let sum = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/**
 * Smooth traced loops with a morphological "closing" pass (expand then
 * shrink by the same rounded radius). This removes pixel-staircase
 * jaggedness and rounds sharp corners, while roughly preserving overall
 * silhouette size. Small features/holes can disappear if `smoothing`
 * is large relative to their size — this is an expected trade-off of a
 * single smoothing control, not a bug.
 *
 * Uses its own ClipperLib usage, entirely separate from the die-cut
 * outline code in viewer.js.
 *
 * @param {Array<{x:number,y:number}>[]} loops
 * @param {number} smoothingPixels amount of smoothing, in mask pixels
 * @returns {Array<{x:number,y:number}>[]}
 */
export function smoothLoops(loops, smoothingPixels = 0) {
  if (!smoothingPixels || smoothingPixels <= 0 || loops.length === 0) {
    return loops;
  }

  const scale = CLICKER_CLIPPER_SCALE;
  const arcTolerance = Math.max(1, 0.01 * scale);

  const scaledPaths = loops.map((loop) =>
    loop.map((p) => ({
      X: Math.round(p.x * scale),
      Y: Math.round(p.y * scale),
    }))
  );

  const expandOffsetter = new ClipperLib.ClipperOffset(2, arcTolerance);
  expandOffsetter.AddPaths(
    scaledPaths,
    ClipperLib.JoinType.jtRound,
    ClipperLib.EndType.etClosedPolygon
  );
  const expanded = new ClipperLib.Paths();
  expandOffsetter.Execute(expanded, smoothingPixels * scale);

  if (expanded.length === 0) {
    // Smoothing radius ate the whole shape — fall back to the
    // unsmoothed loops rather than returning nothing.
    return loops;
  }

  const shrinkOffsetter = new ClipperLib.ClipperOffset(2, arcTolerance);
  shrinkOffsetter.AddPaths(
    expanded,
    ClipperLib.JoinType.jtRound,
    ClipperLib.EndType.etClosedPolygon
  );
  const result = new ClipperLib.Paths();
  shrinkOffsetter.Execute(result, -smoothingPixels * scale);

  if (result.length === 0) {
    return loops;
  }

  return result.map((path) =>
    path.map((pt) => ({ x: pt.X / scale, y: pt.Y / scale }))
  );
}

/**
 * Compute a 256-bin luminance histogram, restricted to pixels where
 * `restrictMask` is truthy (or all pixels if restrictMask is null).
 * @param {{data:Uint8ClampedArray}} imageData
 * @param {Uint8Array|null} restrictMask
 */
function computeLuminanceHistogram(imageData, restrictMask) {
  const { data, width, height } = imageData;
  const hist = new Array(256).fill(0);
  let count = 0;

  for (let i = 0; i < width * height; i++) {
    if (restrictMask && !restrictMask[i]) continue;
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    hist[Math.min(255, Math.max(0, gray))]++;
    count++;
  }

  return { hist, count };
}

function histogramStats(hist, count) {
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  const mean = count > 0 ? sum / count : 0;

  let variance = 0;
  for (let t = 0; t < 256; t++) variance += hist[t] * (t - mean) * (t - mean);
  variance = count > 0 ? variance / count : 0;

  return { mean, variance, std: Math.sqrt(variance), sum };
}

/**
 * Otsu's method: find the luminance threshold that maximizes
 * between-class variance of a histogram. Deterministic, no tunable
 * constants to guess per-image.
 * @param {number[]} hist 256-bin histogram
 * @param {number} count total samples in the histogram
 * @returns {{threshold:number, betweenClassVarianceMax:number}|null}
 *   null if count is 0 (nothing to threshold).
 */
export function computeOtsuThreshold(hist, count) {
  if (count === 0) return null;

  const { sum } = histogramStats(hist, count);

  let sumB = 0;
  let weightB = 0;
  let varMax = -1;
  let threshold = 127;

  for (let t = 0; t < 256; t++) {
    weightB += hist[t];
    if (weightB === 0) continue;

    const weightF = count - weightB;
    if (weightF === 0) break;

    sumB += t * hist[t];
    const meanB = sumB / weightB;
    const meanF = (sum - sumB) / weightF;

    const varBetween = weightB * weightF * (meanB - meanF) * (meanB - meanF);
    if (varBetween > varMax) {
      varMax = varBetween;
      threshold = t;
    }
  }

  return { threshold, betweenClassVarianceMax: varMax };
}

/**
 * Build a second, finer mask ("detail mask") from pixels that fall
 * INSIDE an existing base mask — used to extract inner detail
 * (line-art, logos, dark regions) for a two-color IMAGE layer,
 * without ever extending outside the BASE silhouette (the AND with
 * baseMask below is structural, not just a downstream clamp).
 *
 * Threshold source, in priority order:
 *   1. options.detailThresholdOverride, if a finite number is given
 *      (lets a future "Advanced" UI control override the automatic
 *      choice without touching this function).
 *   2. Otherwise, Otsu's method computed only over pixels inside
 *      baseMask.
 *
 * If the luminance inside baseMask is too uniform (std dev below
 * options.minStdDev) to draw a meaningful line through, returns an
 * empty detail mask rather than manufacturing noise from a
 * near-solid-color region — e.g. Phase 1's "รูปดำบนพื้นขาว" test
 * case, where the silhouette is one flat color and there is no real
 * "detail" to extract.
 *
 * @param {{data:Uint8ClampedArray,width:number,height:number}} imageData
 * @param {Uint8Array} baseMask same width*height as imageData
 * @param {{detailThresholdOverride?: number|null, detailInvert?: boolean, minStdDev?: number}} options
 * @returns {{mask:Uint8Array, width:number, height:number, thresholdUsed: number|null}}
 */
export function buildDetailMask(imageData, baseMask, options = {}) {
  const { width, height, data } = imageData;
  const detailThresholdOverride =
    options.detailThresholdOverride === undefined
      ? null
      : options.detailThresholdOverride;
  const detailInvert = !!options.detailInvert;
  const minStdDev = options.minStdDev ?? 4;

  const mask = new Uint8Array(width * height);

  const { hist, count } = computeLuminanceHistogram(imageData, baseMask);
  if (count === 0) {
    return { mask, width, height, thresholdUsed: null };
  }

  let thresholdUsed;

  if (typeof detailThresholdOverride === "number" && Number.isFinite(detailThresholdOverride)) {
    thresholdUsed = detailThresholdOverride;
  } else {
    const stats = histogramStats(hist, count);
    if (stats.std < minStdDev) {
      // Near-uniform region inside BASE — no meaningful detail line
      // to draw. Return the empty mask rather than thresholding noise.
      return { mask, width, height, thresholdUsed: null };
    }
    const otsu = computeOtsuThreshold(hist, count);
    thresholdUsed = otsu ? otsu.threshold : 128;
  }

  for (let i = 0; i < width * height; i++) {
    if (!baseMask[i]) {
      mask[i] = 0; // structural AND with baseMask — detail can never
      continue;    // extend past the BASE silhouette.
    }
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;

    let isDetail = gray < thresholdUsed;
    if (detailInvert) isDetail = !isDetail;

    mask[i] = isDetail ? 1 : 0;
  }

  return { mask, width, height, thresholdUsed };
}

/**
 * Shrink traced loops inward by a fixed distance (pixel-grid units).
 * Used to inset the detail/IMAGE layer slightly away from the BASE
 * edge it sits on top of, so a two-color print never asks for a
 * zero-thickness color boundary. `insetPixels` is caller-supplied on
 * every call (see processImageToPaths' detailInsetPx option) — not a
 * constant buried in this function — specifically so it stays easy to
 * expose as an adjustable control later without touching this code.
 *
 * @param {Array<{x:number,y:number}>[]} loops
 * @param {number} insetPixels
 * @returns {Array<{x:number,y:number}>[]}
 */
export function insetLoops(loops, insetPixels) {
  if (!insetPixels || insetPixels <= 0 || loops.length === 0) {
    return loops;
  }

  const scale = CLICKER_CLIPPER_SCALE;
  const arcTolerance = Math.max(1, 0.01 * scale);

  const scaledPaths = loops.map((loop) =>
    loop.map((p) => ({
      X: Math.round(p.x * scale),
      Y: Math.round(p.y * scale),
    }))
  );

  const offsetter = new ClipperLib.ClipperOffset(2, arcTolerance);
  offsetter.AddPaths(
    scaledPaths,
    ClipperLib.JoinType.jtRound,
    ClipperLib.EndType.etClosedPolygon
  );
  const result = new ClipperLib.Paths();
  offsetter.Execute(result, -insetPixels * scale);

  if (result.length === 0) {
    // Inset ate the whole shape (very thin detail line + large
    // inset) — fall back to uninset loops rather than losing the
    // detail entirely.
    return loops;
  }

  return result.map((path) =>
    path.map((pt) => ({ x: pt.X / scale, y: pt.Y / scale }))
  );
}

/**
 * Full Phase-1 pipeline: ImageData -> mask -> raw contours -> smoothed
 * contours. Pure function, no DOM/rendering.
 *
 * @param {{data:Uint8ClampedArray, width:number, height:number}} imageData
 * @param {{threshold?:number, invert?:boolean, smoothing?:number, includeDetail?:boolean, detailThresholdOverride?:number|null, detailInvert?:boolean, detailInsetPx?:number}} options
 */
export function processImageToPaths(imageData, options = {}) {
  const {
    threshold = 128,
    invert = false,
    smoothing = 0,
    includeDetail = false,
    detailThresholdOverride = null,
    detailInvert = false,
    detailInsetPx = 0.5,
  } = options;

  const pipelineStartedAt = nowMs();
  const maskStartedAt = nowMs();
  const { mask, width, height } = buildMask(imageData, {
    threshold,
    invert,
  });
  const maskMs = nowMs() - maskStartedAt;

  const contourStartedAt = nowMs();
  const rawLoops = traceContours(mask, width, height);
  const contourMs = nowMs() - contourStartedAt;
  const smoothingStartedAt = nowMs();
  const loops = smoothLoops(rawLoops, smoothing);
  const smoothingMs = nowMs() - smoothingStartedAt;

  const result = {
    mask,
    width,
    height,
    rawLoops,
    loops,
    timings: {
      maskMs,
      contourMs,
      smoothingMs,
      totalMs: nowMs() - pipelineStartedAt,
    },
  };

  if (includeDetail) {
    const { mask: detailMask, thresholdUsed } = buildDetailMask(imageData, mask, {
      detailThresholdOverride,
      detailInvert,
    });

    const detailRawLoops = traceContours(detailMask, width, height);
    const detailSmoothed = smoothLoops(detailRawLoops, smoothing);
    const detailLoops = insetLoops(detailSmoothed, detailInsetPx);

    result.detailMask = detailMask;
    result.detailRawLoops = detailRawLoops;
    result.detailLoops = detailLoops;
    result.detailThresholdUsed = thresholdUsed;
  }

  return result;
}


// =====================================================================
// Color regions (K-color quantization for the Clicker TOP layer)
// =====================================================================
//
// buildColorRegions() is intentionally a separate, standalone function
// (not folded into processImageToPaths' `includeDetail` path) — it is
// called directly by clicker-ui.js alongside processImageToPaths(),
// not from within it. See clicker-ui.js for why: the physical-mm
// minAreaPx threshold this function needs depends on an auto-fit scale
// that itself depends on processImageToPaths' own `loops` output, so
// the two are sequenced by the caller rather than nested.
//
// All the actual pixel-clustering math (Lab conversion, deterministic
// K-means, connected-component cleanup) lives in the separate,
// zero-dependency color-quantization.js so it can be unit-tested with
// plain Node with no ClipperLib/DOM involved. This function's only job
// is to bridge that per-pixel cluster-label grid into closed vector
// loops, reusing the SAME traceContours()/smoothLoops() already
// proven above for the base silhouette and (previously) detailMask —
// no new tracing logic here at all.

/**
 * Quantize the image (restricted to `baseMask`) into up to `k` flat
 * printable colors, and trace each non-dominant color's region(s) into
 * closed vector loops. The dominant (largest-area) color is reported
 * separately as `dominantColorHex` — the caller uses it to fill a
 * TOP_BASE layer spanning the FULL outer silhouette (not just the
 * dominant cluster's own pixels), so there is never a gap/hole in the
 * base "canvas" regardless of how the clustering came out; the other
 * colors' regions then sit on top of it.
 *
 * @param {{data:Uint8ClampedArray, width:number, height:number}} imageData
 * @param {Uint8Array} baseMask same width*height as imageData
 * @param {{k?:number, minAreaPx?:number, smoothing?:number}} options
 * @returns {{dominantColorHex:string, accentRegions: Array<{colorHex:string, loops: Array<Array<{x:number,y:number}>>}>}}
 */
export function buildColorRegions(imageData, baseMask, options = {}) {
  const { width, height } = imageData;
  const k = options.k ?? 4;
  const minAreaPx = options.minAreaPx ?? 0;
  const smoothing = options.smoothing ?? 0;

  const quantized = quantizeImageColors(imageData, baseMask, { k, minAreaPx });

  if (quantized.colorHexByCluster.length === 0) {
    return { dominantColorHex: "#cccccc", accentRegions: [] };
  }

  const accentRegions = [];
  const rawRegions = [];

  for (let clusterIdx = 0; clusterIdx < quantized.colorHexByCluster.length; clusterIdx++) {

    const clusterMask = new Uint8Array(width * height);
    let any = false;
    for (let i = 0; i < width * height; i++) {
      if (quantized.labelGrid[i] === clusterIdx) {
        clusterMask[i] = 1;
        any = true;
      }
    }
    if (!any) continue; // this cluster ended up empty after cleanup — nothing to trace

    const rawLoops = traceContours(clusterMask, width, height);
    rawRegions.push({ colorHex: quantized.colorHexByCluster[clusterIdx], loops: rawLoops });
    if (clusterIdx === quantized.dominantIndex) continue;
    const loops = smoothLoops(rawLoops, smoothing);
    if (loops.length === 0) continue;

    accentRegions.push({ colorHex: quantized.colorHexByCluster[clusterIdx], loops });
  }

  return {
    dominantColorHex: quantized.colorHexByCluster[quantized.dominantIndex],
    accentRegions,
    rawRegions,
    rawSilhouetteLoops: traceContours(baseMask, width, height),
  };
}

// Resizing changes fitting tolerances, never quantization or mechanical inputs.
// Fit every color together, including the dominant color, so a shared edge is
// emitted identically on both sides. Exterior contacts remain pinned.
export function fitArtworkColorRegions(regions, mmPerPixel) {
  if (!regions?.rawRegions) return regions;
  const fitted = fitContourNetwork([
    { id: "exterior", loops: regions.rawSilhouetteLoops, locked: true },
    ...regions.rawRegions,
  ], mmPerPixel);
  return {
    ...regions,
    accentRegions: fitted.groups.slice(1).filter((region) => region.colorHex !== regions.dominantColorHex),
    contourDiagnostics: fitted.diagnostics,
  };
}
