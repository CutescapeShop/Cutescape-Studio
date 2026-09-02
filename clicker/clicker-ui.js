// =====================================================================
// clicker/clicker-ui.js
//
// "Clicker from Image" — Phase 1 test UI.
//
// Wires the DOM controls added for this feature to
// clicker/image-processing.js and renders 2D preview canvases only.
//
// Explicitly out of scope for Phase 1 (per plan): no THREE.js scene,
// no 3D preview, no MX stem, no STL export. Those are Phase 2+.
//
// This file does not import, reference, or modify viewer.js / script.js
// in any way, and does not touch any Name Keychain DOM element.
// =====================================================================

import {
  loadImageFile,
  getImageDataFromImage,
  processImageToPaths,
  buildColorRegions,
  signedArea,
} from "./image-processing.js";

import { computeAutoFitTransform } from "./geometry-math.js";
import { CLICKER_PROFILE } from "./stem-profile.js";


// ---------------- DOM references (all new elements) ----------------

const fileInput = document.getElementById("clickerFileInput");
const thresholdSlider = document.getElementById("clickerThresholdSlider");
const thresholdValue = document.getElementById("clickerThresholdValue");
const invertButton = document.getElementById("clickerInvertButton");
const smoothingSlider = document.getElementById("clickerSmoothingSlider");
const smoothingValue = document.getElementById("clickerSmoothingValue");
const debugInfo = document.getElementById("clickerDebugInfo");
const emptyState = document.getElementById("clickerEmptyState");
const canvasRow = document.getElementById("clickerCanvasRow");

const originalCanvas = document.getElementById("clickerOriginalCanvas");
const maskCanvas = document.getElementById("clickerMaskCanvas");
const finalCanvas = document.getElementById("clickerFinalCanvas");

// New for the multi-color TOP pipeline — optional: if this markup
// isn't present, color-region computation just falls back to
// CLICKER_PROFILE.accent.colorCount.default rather than failing.
const colorCountSlider = document.getElementById("clickerColorCountSlider");
const colorCountValue = document.getElementById("clickerColorCountValue");

// If the Clicker markup isn't present (e.g. this file loaded on a page
// without it), do nothing rather than throw — keeps this module inert
// and harmless anywhere else.
if (
  fileInput &&
  thresholdSlider &&
  invertButton &&
  smoothingSlider &&
  originalCanvas &&
  maskCanvas &&
  finalCanvas
) {
  init();
}

function init() {
  const state = {
    imageData: null,
    invert: false,
    imageKey: null,
    silhouetteCache: new Map(),
    colorCache: new Map(),
  };

  let pipelineTimer = null;

  function schedulePipeline() {
    if (pipelineTimer !== null) clearTimeout(pipelineTimer);
    pipelineTimer = setTimeout(() => {
      pipelineTimer = null;
      runPipeline(state);
    }, 140);
  }

  function runPipelineNow() {
    if (pipelineTimer !== null) {
      clearTimeout(pipelineTimer);
      pipelineTimer = null;
    }
    runPipeline(state);
  }

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    try {
      const img = await loadImageFile(file);
      const { imageData } = getImageDataFromImage(img, 512);
      state.imageData = imageData;
      state.imageKey = fingerprintImageData(imageData);

      if (emptyState) emptyState.style.display = "none";
      if (canvasRow) canvasRow.style.display = "flex";

      drawOriginal(imageData);
      runPipelineNow();
    } catch (err) {
      setDebugText("โหลดรูปไม่สำเร็จ: " + (err && err.message ? err.message : err));
    }
  });

  thresholdSlider.addEventListener("input", () => {
    updateThresholdLabel();
    schedulePipeline();
  });

  invertButton.addEventListener("click", () => {
    state.invert = !state.invert;
    invertButton.classList.toggle("active", state.invert);
    invertButton.textContent = state.invert
      ? "Invert: เปิด"
      : "Invert: ปิด";
    runPipelineNow();
  });

  smoothingSlider.addEventListener("input", () => {
    updateSmoothingLabel();
    schedulePipeline();
  });

  if (colorCountSlider) {
    colorCountSlider.min = CLICKER_PROFILE.accent.colorCount.min;
    colorCountSlider.max = CLICKER_PROFILE.accent.colorCount.max;
    colorCountSlider.step = 1;
    colorCountSlider.value = CLICKER_PROFILE.accent.colorCount.default;

    colorCountSlider.addEventListener("input", () => {
      updateColorCountLabel();
      schedulePipeline();
    });
  }

  updateThresholdLabel();
  updateSmoothingLabel();
  updateColorCountLabel();
}

function updateThresholdLabel() {
  if (thresholdValue) thresholdValue.textContent = thresholdSlider.value;
}

function updateSmoothingLabel() {
  if (smoothingValue) smoothingValue.textContent = smoothingSlider.value;
}

function updateColorCountLabel() {
  if (colorCountValue && colorCountSlider) colorCountValue.textContent = colorCountSlider.value;
}

function setDebugText(text) {
  if (debugInfo) debugInfo.textContent = text;
}

function setLimitedCache(cache, key, value, maxEntries = 6) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > maxEntries) {
    cache.delete(cache.keys().next().value);
  }
}

function fingerprintImageData(imageData) {
  let hash = 2166136261;
  for (let i = 0; i < imageData.data.length; i++) {
    hash = Math.imul(hash ^ imageData.data[i], 16777619);
  }
  return `${imageData.width}x${imageData.height}:${hash >>> 0}`;
}

function runPipeline(state) {
  if (!state.imageData) return;

  const threshold = Number(thresholdSlider.value);
  const smoothing = Number(smoothingSlider.value);

  const silhouetteKey = `${state.imageKey}|${threshold}|${state.invert ? 1 : 0}|${smoothing}`;
  const t0 = performance.now();
  let pathResult = state.silhouetteCache.get(silhouetteKey);
  const silhouetteCacheHit = !!pathResult;
  if (!pathResult) {
    pathResult = processImageToPaths(
      state.imageData,
      { threshold, invert: state.invert, smoothing }
    );
    setLimitedCache(state.silhouetteCache, silhouetteKey, pathResult);
  }
  const elapsedMs = performance.now() - t0;
  const { width, height, mask, rawLoops, loops, timings } = pathResult;

  const previewStartedAt = performance.now();
  drawMask(mask, width, height, rawLoops);
  drawFinal(width, height, loops);
  const previewDrawMs = performance.now() - previewStartedAt;

  // Multi-color TOP pipeline: quantize the SAME mask into up to
  // colorCount flat colors. Wrapped defensively — if anything here
  // fails, the Phase-1 2D preview above (already drawn) is unaffected,
  // and we simply pass no color regions through the hook this round.
  let colorRegions = null;
  let colorElapsedMs = 0;
  let colorCacheHit = false;
  let colorKey = `${silhouetteKey}|none`;
  try {
    const autoFit = computeAutoFitTransform(
      loops,
      CLICKER_PROFILE.body.targetSize,
      CLICKER_PROFILE.body.targetSize
    );

    if (autoFit) {
      const colorCount = colorCountSlider
        ? Number(colorCountSlider.value)
        : CLICKER_PROFILE.accent.colorCount.default;

      const minAreaPx = CLICKER_PROFILE.accent.minRegionAreaMM2 / (autoFit.scale * autoFit.scale);
      colorKey = `${silhouetteKey}|${colorCount}|${minAreaPx.toPrecision(12)}`;

      const tColor0 = performance.now();
      colorRegions = state.colorCache.get(colorKey) || null;
      colorCacheHit = !!colorRegions;
      if (!colorRegions) {
        colorRegions = buildColorRegions(state.imageData, mask, {
          k: colorCount,
          minAreaPx,
          smoothing,
        });
        setLimitedCache(state.colorCache, colorKey, colorRegions);
      }
      colorElapsedMs = performance.now() - tColor0;
    }
  } catch (err) {
    colorRegions = null;
    console.error("buildColorRegions failed:", err);
  }

  // Phase 2 hook (optional — only present if clicker-viewer.js is also
  // loaded). Purely additive: Phase-1 2D preview above is unaffected
  // whether or not this is defined.
  window.__clickerPerformance = {
    ...(window.__clickerPerformance || {}),
    pipeline: {
      ...timings,
      silhouetteMeasuredMs: elapsedMs,
      silhouetteCacheHit,
      colorMs: colorElapsedMs,
      colorCacheHit,
      previewDrawMs,
    },
  };

  if (typeof window.onClickerPipelineResult === "function") {
    window.onClickerPipelineResult({
      width,
      height,
      loops,
      colorRegions,
      silhouetteKey,
      colorKey,
    });
  }

  const outerCount = loops.filter((l) => signedArea(l) > 0).length;
  const holeCount = loops.length - outerCount;
  const accentSummary = colorRegions
    ? `TOP: ${colorRegions.dominantColorHex} + ${colorRegions.accentRegions.length} accent สี (${colorElapsedMs.toFixed(0)}ms${colorCacheHit ? ", cache" : ""})`
    : "TOP: (ยังไม่พร้อม)";

  setDebugText(
    `ขนาดที่ประมวลผล: ${width}×${height}px\n` +
      `Threshold: ${threshold}   Invert: ${state.invert ? "เปิด" : "ปิด"}   Smoothing: ${smoothing}px\n` +
      `Contour ก่อน smoothing: ${rawLoops.length}\n` +
      `Contour หลัง smoothing: ${loops.length} (ตัวนอก ${outerCount} / รู ${holeCount})\n` +
      `${accentSummary}\n` +
      `Mask: ${timings.maskMs.toFixed(1)}ms | Contour: ${timings.contourMs.toFixed(1)}ms | Smoothing: ${timings.smoothingMs.toFixed(1)}ms\n` +
      `เวลาประมวลผล silhouette: ${elapsedMs.toFixed(1)} ms${silhouetteCacheHit ? " (cache)" : ""} | Preview draw: ${previewDrawMs.toFixed(1)} ms`
  );
}


// ---------------- Canvas rendering helpers ----------------

function fitCanvas(canvas, width, height) {
  canvas.width = width;
  canvas.height = height;
}

function drawOriginal(imageData) {
  fitCanvas(originalCanvas, imageData.width, imageData.height);
  const ctx = originalCanvas.getContext("2d");
  ctx.clearRect(0, 0, imageData.width, imageData.height);
  ctx.putImageData(imageData, 0, 0);
}

function drawMask(mask, width, height, rawLoops) {
  fitCanvas(maskCanvas, width, height);
  const ctx = maskCanvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);

  // Raw binary mask, pixel by pixel (before smoothing) — useful for
  // sanity-checking threshold/invert/alpha handling directly.
  const out = ctx.createImageData(width, height);
  for (let i = 0; i < width * height; i++) {
    const on = mask[i] === 1;
    out.data[i * 4] = on ? 20 : 255;
    out.data[i * 4 + 1] = on ? 20 : 255;
    out.data[i * 4 + 2] = on ? 20 : 255;
    out.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);

  // Overlay raw traced contour lines in a bright color so contour
  // tracing correctness (incl. holes) can be visually verified even
  // before smoothing is applied.
  ctx.strokeStyle = "#ff2fa0";
  ctx.lineWidth = 1;
  rawLoops.forEach((loop) => strokeLoop(ctx, loop));
}

function drawFinal(width, height, loops) {
  fitCanvas(finalCanvas, width, height);
  const ctx = finalCanvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);

  // checkerboard background so transparent/empty areas are visible
  drawCheckerboard(ctx, width, height);

  // Fill using even-odd rule: holes render correctly regardless of
  // winding-direction bookkeeping, as long as traceContours() produced
  // topologically correct loops (verified separately).
  const path = new Path2D();
  loops.forEach((loop) => {
    if (loop.length === 0) return;
    path.moveTo(loop[0].x, loop[0].y);
    for (let i = 1; i < loop.length; i++) {
      path.lineTo(loop[i].x, loop[i].y);
    }
    path.closePath();
  });

  ctx.fillStyle = "#111111";
  ctx.fill(path, "evenodd");

  ctx.strokeStyle = "#00c2ff";
  ctx.lineWidth = 1;
  loops.forEach((loop) => strokeLoop(ctx, loop));
}

function strokeLoop(ctx, loop) {
  if (loop.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(loop[0].x, loop[0].y);
  for (let i = 1; i < loop.length; i++) {
    ctx.lineTo(loop[i].x, loop[i].y);
  }
  ctx.closePath();
  ctx.stroke();
}

function drawCheckerboard(ctx, width, height) {
  const size = 8;
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      const even = ((x / size) + (y / size)) % 2 === 0;
      ctx.fillStyle = even ? "#f0f0f0" : "#ffffff";
      ctx.fillRect(x, y, size, size);
    }
  }
}
