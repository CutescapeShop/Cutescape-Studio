// =====================================================================
// clicker/color-quantization.js
//
// Pure color-quantization math for the Clicker TOP layer: RGB → CIELAB
// → deterministic K-means clustering → connected-component cleanup of
// tiny/unprintable islands. Deliberately has ZERO imports (no THREE,
// no DOM, no ClipperLib) so it can be unit-tested directly with plain
// `node clicker/color-quantization.js`-style scripts, same as
// geometry-math.js.
//
// image-processing.js's buildColorRegions() wraps this together with
// the already-proven traceContours()/smoothLoops() to turn the final
// per-pixel cluster labels into closed vector loops per color.
//
// K-means here is fully DETERMINISTIC (no Math.random anywhere): seeds
// are chosen via farthest-point sampling from the data itself, so the
// same image + same K always produces the same clustering — no
// flicker/inconsistency if the user doesn't touch the color-count
// control.
// =====================================================================

// ---------------------------------------------------------------
// RGB <-> CIELAB (D65)
// ---------------------------------------------------------------

function srgbToLinear(c8) {
  const cs = c8 / 255;
  return cs <= 0.04045 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

function linearToSrgb(cl) {
  const c = cl <= 0.0031308 ? cl * 12.92 : 1.055 * Math.pow(cl, 1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(1, c)) * 255);
}

const D65 = { Xn: 0.95047, Yn: 1.0, Zn: 1.08883 };
const DELTA = 6 / 29;

function labF(t) {
  return t > DELTA * DELTA * DELTA
    ? Math.cbrt(t)
    : t / (3 * DELTA * DELTA) + 4 / 29;
}

function labFInv(t) {
  return t > DELTA ? t * t * t : 3 * DELTA * DELTA * (t - 4 / 29);
}

/** @returns {{L:number, a:number, b:number}} */
export function rgbToLab(r, g, b) {
  const rl = srgbToLinear(r);
  const gl = srgbToLinear(g);
  const bl = srgbToLinear(b);

  const X = 0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl;
  const Y = 0.2126729 * rl + 0.7151522 * gl + 0.072175 * bl;
  const Z = 0.0193339 * rl + 0.119192 * gl + 0.9503041 * bl;

  const fx = labF(X / D65.Xn);
  const fy = labF(Y / D65.Yn);
  const fz = labF(Z / D65.Zn);

  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

/** @returns {{r:number, g:number, b:number}} — approximate inverse of rgbToLab, clamped to sRGB gamut */
export function labToRgb(L, a, b) {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;

  const X = D65.Xn * labFInv(fx);
  const Y = D65.Yn * labFInv(fy);
  const Z = D65.Zn * labFInv(fz);

  const rl = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
  const gl = -0.969266 * X + 1.8760108 * Y + 0.041556 * Z;
  const bl = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;

  return { r: linearToSrgb(rl), g: linearToSrgb(gl), b: linearToSrgb(bl) };
}

export function labDistanceSq(c1, c2) {
  const dL = c1.L - c2.L;
  const da = c1.a - c2.a;
  const db = c1.b - c2.b;
  return dL * dL + da * da + db * db;
}

export function rgbToHex(r, g, b) {
  const h = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

// ---------------------------------------------------------------
// Colour bins + spatial coherence
// ---------------------------------------------------------------
//
// Flat artwork collapses to a very small palette: the reference images
// reduce to 24-304 occupied bins at 6 bits/channel. Clustering over
// those weighted bins instead of over every pixel is both far cheaper
// and area-weighted by construction (each bin carries its pixel count).
//
// Each bin also records SPATIAL COHERENCE — the mean fraction of a
// pixel's in-mask 4-neighbours that share its bin. Solid design shapes
// score ~0.95-1.0 (measured: teal wing 0.999, cat whiskers 0.944, the
// bird's 664px eye 0.953) while anti-aliasing/dither between two flat
// colours scores ~0.0-0.44. That gap is what lets seeding ignore
// blend noise without also discarding small intentional details.

const COLOR_BIN_SHIFT = 2;          // 6 bits per channel
const COHERENCE_MIN = 0.6;          // measured gap: real >= 0.88, dither <= 0.44
const GATE_COVERAGE_MIN = 0.5;      // below this the image isn't flat art (photo//texture)
const DISTINCTNESS_RESERVE_D2 = 1500; // ~dE 39 — "no design colour left unrepresented"

function binKey(r, g, b) {
  return ((r >> COLOR_BIN_SHIFT) << 12) | ((g >> COLOR_BIN_SHIFT) << 6) | (b >> COLOR_BIN_SHIFT);
}

/**
 * Bucket every masked pixel into a colour bin, recording mean RGB/Lab,
 * pixel weight and spatial coherence per bin, plus a per-pixel bin
 * index so labels can be projected back onto the grid without a second
 * colour pass.
 *
 * @returns {{n:number, L:Float64Array, a:Float64Array, b:Float64Array,
 *   W:Float64Array, R:Float64Array, G:Float64Array, B:Float64Array,
 *   coh:Float64Array, binOfPixel:Int32Array, total:number}}
 */
export function buildColorBins(imageData, baseMask) {
  const { width, height, data } = imageData;
  const pixels = width * height;
  const index = new Map();
  const acc = [];
  const binOfPixel = new Int32Array(pixels).fill(-1);
  let total = 0;

  for (let i = 0; i < pixels; i++) {
    if (!baseMask[i]) continue;
    const key = binKey(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    let slot = index.get(key);
    if (slot === undefined) {
      slot = acc.length;
      index.set(key, slot);
      acc.push({ key, n: 0, r: 0, g: 0, b: 0, cohSum: 0, cohN: 0 });
    }
    const e = acc[slot];
    e.n++; e.r += data[i * 4]; e.g += data[i * 4 + 1]; e.b += data[i * 4 + 2];
    binOfPixel[i] = slot;
    total++;

    // coherence: how much of this pixel's in-mask neighbourhood is the same colour bin
    const x = i % width, y = (i / width) | 0;
    let same = 0, seen = 0;
    if (x > 0 && baseMask[i - 1]) { seen++; if (binKey(data[(i-1)*4], data[(i-1)*4+1], data[(i-1)*4+2]) === key) same++; }
    if (x < width - 1 && baseMask[i + 1]) { seen++; if (binKey(data[(i+1)*4], data[(i+1)*4+1], data[(i+1)*4+2]) === key) same++; }
    if (y > 0 && baseMask[i - width]) { seen++; if (binKey(data[(i-width)*4], data[(i-width)*4+1], data[(i-width)*4+2]) === key) same++; }
    if (y < height - 1 && baseMask[i + width]) { seen++; if (binKey(data[(i+width)*4], data[(i+width)*4+1], data[(i+width)*4+2]) === key) same++; }
    if (seen > 0) { e.cohSum += same / seen; e.cohN++; }
  }

  const n = acc.length;
  const L = new Float64Array(n), A = new Float64Array(n), B = new Float64Array(n);
  const W = new Float64Array(n), R = new Float64Array(n), G = new Float64Array(n), Bl = new Float64Array(n);
  const coh = new Float64Array(n);
  for (let s = 0; s < n; s++) {
    const e = acc[s];
    const r = e.r / e.n, g = e.g / e.n, b = e.b / e.n;
    const lab = rgbToLab(r, g, b);
    L[s] = lab.L; A[s] = lab.a; B[s] = lab.b;
    W[s] = e.n; R[s] = r; G[s] = g; Bl[s] = b;
    coh[s] = e.cohN > 0 ? e.cohSum / e.cohN : 0;
  }
  return { n, L, a: A, b: B, W, R, G, B: Bl, coh, binOfPixel, total };
}

function binDistanceSq(bins, i, centroid) {
  const dL = bins.L[i] - centroid.L;
  const da = bins.a[i] - centroid.a;
  const db = bins.b[i] - centroid.b;
  return dL * dL + da * da + db * db;
}

/**
 * Restrict seeding to bins that look like real design colours:
 * coherent (not blend noise) AND at least one printable region in size
 * (the same physical floor the small-region cleanup uses).
 *
 * Photographs and textured art have no flat regions at all, so the gate
 * would starve them — when the surviving bins cover less than
 * GATE_COVERAGE_MIN of the masked pixels the gate is abandoned and every
 * bin stays eligible. (Measured coverage: bird 99.8%, cat 94.2%,
 * fish 98.6%, dog photo 0.4%.)
 *
 * @returns {{indices:number[], gated:boolean}}
 */
export function selectSeedCandidates(bins, minAreaPx) {
  const indices = [];
  let covered = 0;
  for (let i = 0; i < bins.n; i++) {
    if (bins.coh[i] >= COHERENCE_MIN && bins.W[i] >= minAreaPx) {
      indices.push(i);
      covered += bins.W[i];
    }
  }
  if (indices.length > 0 && covered >= GATE_COVERAGE_MIN * bins.total) {
    return { indices, gated: true };
  }
  const all = [];
  for (let i = 0; i < bins.n; i++) all.push(i);
  return { indices: all, gated: false };
}

/**
 * Deterministic area-weighted seeding: start from the heaviest bin (the
 * dominant design colour), then repeatedly take the bin maximising
 * area x distance² to the seeds so far. Unlike farthest-point seeding
 * this cannot spend the cluster budget on a handful of outlier pixels,
 * which is what previously collapsed the bird's wing and body into one
 * cluster.
 */
export function seedCentroidsAreaWeighted(bins, k, indices) {
  if (indices.length === 0) return [];
  let first = indices[0];
  for (const i of indices) if (bins.W[i] > bins.W[first]) first = i;
  const centroids = [{ L: bins.L[first], a: bins.a[first], b: bins.b[first] }];

  const minDist = new Float64Array(bins.n);
  for (const i of indices) minDist[i] = binDistanceSq(bins, i, centroids[0]);

  while (centroids.length < k) {
    let best = -1, bestScore = -1;
    for (const i of indices) {
      const score = bins.W[i] * minDist[i];
      if (score > bestScore) { bestScore = score; best = i; }
    }
    if (best < 0 || bestScore <= 0) break; // no distinct colour left to represent
    centroids.push({ L: bins.L[best], a: bins.a[best], b: bins.b[best] });
    for (const i of indices) {
      const d = binDistanceSq(bins, i, centroids[centroids.length - 1]);
      if (d < minDist[i]) minDist[i] = d;
    }
  }
  return centroids;
}

/**
 * Area-weighted seeding alone will sacrifice a small but perceptually
 * unique colour (an eye, a beak) in favour of a larger near-duplicate
 * of a colour already represented. If any candidate colour is still
 * further than DISTINCTNESS_RESERVE_D2 from every seed, swap it in for
 * whichever seed sits closest to another seed — the one whose loss
 * costs the least coverage.
 *
 * Only meaningful on a gated pool, where every candidate is already
 * known to be a real design colour rather than blend noise.
 */
export function applyDistinctnessReserve(bins, centroids, indices, tau = DISTINCTNESS_RESERVE_D2) {
  const result = centroids.map((c) => ({ L: c.L, a: c.a, b: c.b }));
  if (result.length < 2) return result;

  for (let pass = 0; pass < 2; pass++) {
    let far = -1, farDist = -1;
    for (const i of indices) {
      let nearest = Infinity;
      for (const c of result) {
        const d = binDistanceSq(bins, i, c);
        if (d < nearest) nearest = d;
      }
      if (nearest > farDist) { farDist = nearest; far = i; }
    }
    if (far < 0 || farDist <= tau) break;

    // never displace the dominant seed (index 0 — the heaviest bin)
    let victim = -1, victimCost = Infinity;
    for (let c = 1; c < result.length; c++) {
      let nearest = Infinity;
      for (let o = 0; o < result.length; o++) {
        if (o === c) continue;
        const dL = result[c].L - result[o].L, da = result[c].a - result[o].a, db = result[c].b - result[o].b;
        const d = dL * dL + da * da + db * db;
        if (d < nearest) nearest = d;
      }
      if (nearest < victimCost) { victimCost = nearest; victim = c; }
    }
    if (victim < 0 || victimCost >= farDist) break;
    result[victim] = { L: bins.L[far], a: bins.a[far], b: bins.b[far] };
  }
  return result;
}

/** Lloyd's algorithm over weighted bins; centroids follow pixel mass. */
export function weightedLloydBins(bins, seeds, indices, maxIterations = 20) {
  let centroids = seeds.map((c) => ({ L: c.L, a: c.a, b: c.b }));
  const K = centroids.length;
  if (K === 0) return centroids;
  const labels = new Int32Array(bins.n).fill(-1);

  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;
    for (const i of indices) {
      let best = 0, bestD = Infinity;
      for (let c = 0; c < K; c++) {
        const d = binDistanceSq(bins, i, centroids[c]);
        if (d < bestD) { bestD = d; best = c; }
      }
      if (labels[i] !== best) { labels[i] = best; changed = true; }
    }
    const sL = new Float64Array(K), sA = new Float64Array(K), sB = new Float64Array(K), sW = new Float64Array(K);
    for (const i of indices) {
      const c = labels[i], w = bins.W[i];
      sL[c] += bins.L[i] * w; sA[c] += bins.a[i] * w; sB[c] += bins.b[i] * w; sW[c] += w;
    }
    for (let c = 0; c < K; c++) {
      if (sW[c] > 0) centroids[c] = { L: sL[c] / sW[c], a: sA[c] / sW[c], b: sB[c] / sW[c] };
    }
    if (!changed) break;
  }
  return centroids;
}

/** Nearest-centroid label for every bin, including ungated blend noise. */
export function assignBinsToCentroids(bins, centroids) {
  const labels = new Int32Array(bins.n);
  for (let i = 0; i < bins.n; i++) {
    let best = 0, bestD = Infinity;
    for (let c = 0; c < centroids.length; c++) {
      const d = binDistanceSq(bins, i, centroids[c]);
      if (d < bestD) { bestD = d; best = c; }
    }
    labels[i] = best;
  }
  return labels;
}

// ---------------------------------------------------------------
// Deterministic K-means (Lab space)
// ---------------------------------------------------------------
//
// Retained as a general-purpose primitive (and for direct unit
// testing). quantizeImageColors no longer seeds this way — see
// seedCentroidsAreaWeighted above for why.

/**
 * Farthest-point deterministic seeding: first centroid is the sample
 * closest to the overall mean; each subsequent centroid is the
 * remaining sample with the largest minimum distance to any centroid
 * chosen so far. No randomness — same input always gives the same
 * seeds.
 *
 * @param {Array<{L,a,b}>} samples
 * @param {number} k
 * @returns {Array<{L,a,b}>}
 */
export function seedCentroidsDeterministic(samples, k) {
  const n = samples.length;
  if (n === 0) return [];
  const K = Math.min(k, n);

  let meanL = 0, meanA = 0, meanB = 0;
  for (const s of samples) {
    meanL += s.L;
    meanA += s.a;
    meanB += s.b;
  }
  meanL /= n;
  meanA /= n;
  meanB /= n;
  const mean = { L: meanL, a: meanA, b: meanB };

  let firstIdx = 0;
  let firstDist = Infinity;
  for (let i = 0; i < n; i++) {
    const d = labDistanceSq(samples[i], mean);
    if (d < firstDist) {
      firstDist = d;
      firstIdx = i;
    }
  }

  const centroids = [samples[firstIdx]];
  const minDist = new Float64Array(n);
  for (let i = 0; i < n; i++) minDist[i] = labDistanceSq(samples[i], centroids[0]);

  while (centroids.length < K) {
    let farIdx = -1;
    let farDist = -1;
    for (let i = 0; i < n; i++) {
      if (minDist[i] > farDist) {
        farDist = minDist[i];
        farIdx = i;
      }
    }
    const next = samples[farIdx];
    centroids.push(next);
    for (let i = 0; i < n; i++) {
      const d = labDistanceSq(samples[i], next);
      if (d < minDist[i]) minDist[i] = d;
    }
  }

  return centroids;
}

/**
 * Lloyd's-algorithm K-means in Lab space, deterministic throughout
 * (deterministic seeding + deterministic empty-cluster reseeding via
 * "farthest sample from its own centroid").
 *
 * @param {Array<{L,a,b}>} samples
 * @param {number} k
 * @param {number} maxIterations
 * @returns {{labels: Int32Array, centroids: Array<{L,a,b}>}}
 */
export function kMeansClusterLab(samples, k, maxIterations = 20) {
  const n = samples.length;
  if (n === 0) return { labels: new Int32Array(0), centroids: [] };

  let centroids = seedCentroidsDeterministic(samples, k).map((c) => ({ L: c.L, a: c.a, b: c.b }));
  const K = centroids.length;
  const labels = new Int32Array(n);

  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;

    for (let i = 0; i < n; i++) {
      let bestC = 0;
      let bestD = Infinity;
      for (let c = 0; c < K; c++) {
        const d = labDistanceSq(samples[i], centroids[c]);
        if (d < bestD) {
          bestD = d;
          bestC = c;
        }
      }
      if (labels[i] !== bestC) {
        changed = true;
        labels[i] = bestC;
      }
    }

    const sumL = new Float64Array(K), sumA = new Float64Array(K), sumB = new Float64Array(K);
    const count = new Int32Array(K);
    for (let i = 0; i < n; i++) {
      const c = labels[i];
      sumL[c] += samples[i].L;
      sumA[c] += samples[i].a;
      sumB[c] += samples[i].b;
      count[c]++;
    }

    for (let c = 0; c < K; c++) {
      if (count[c] === 0) {
        // Reseed deterministically: the sample currently farthest from
        // its own assigned centroid is the "worst fit" point, and a
        // reasonable place to plant a new cluster.
        let worstIdx = 0, worstDist = -1;
        for (let i = 0; i < n; i++) {
          const d = labDistanceSq(samples[i], centroids[labels[i]]);
          if (d > worstDist) {
            worstDist = d;
            worstIdx = i;
          }
        }
        centroids[c] = { L: samples[worstIdx].L, a: samples[worstIdx].a, b: samples[worstIdx].b };
        changed = true;
      } else {
        centroids[c] = { L: sumL[c] / count[c], a: sumA[c] / count[c], b: sumB[c] / count[c] };
      }
    }

    if (!changed) break;
  }

  // Final assignment pass so returned labels exactly match the final centroids.
  for (let i = 0; i < n; i++) {
    let bestC = 0, bestD = Infinity;
    for (let c = 0; c < K; c++) {
      const d = labDistanceSq(samples[i], centroids[c]);
      if (d < bestD) {
        bestD = d;
        bestC = c;
      }
    }
    labels[i] = bestC;
  }

  return { labels, centroids };
}

// ---------------------------------------------------------------
// Connected-component cleanup (merge tiny islands into a neighbor,
// never just delete them)
// ---------------------------------------------------------------

/**
 * 4-connected flood fill over a per-pixel cluster-label grid,
 * restricted to `insideMask`. Two same-label pixels that only touch
 * diagonally are treated as separate components (consistent with
 * traceContours' own 4-connected foreground convention elsewhere in
 * this project).
 *
 * @param {Int32Array} labelGrid length width*height, -1 = outside mask
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array} insideMask length width*height
 * @returns {{componentId: Int32Array, components: Array<{clusterLabel:number, pixels:number[]}>}}
 */
export function connectedComponentLabels(labelGrid, width, height, insideMask) {
  const n = width * height;
  const componentId = new Int32Array(n).fill(-1);
  const components = [];

  for (let start = 0; start < n; start++) {
    if (!insideMask[start] || componentId[start] !== -1) continue;

    const label = labelGrid[start];
    const compIdx = components.length;
    const pixels = [];
    const stack = [start];
    componentId[start] = compIdx;

    while (stack.length > 0) {
      const idx = stack.pop();
      pixels.push(idx);
      const x = idx % width;
      const y = (idx / width) | 0;

      const neighbors = [];
      if (x > 0) neighbors.push(idx - 1);
      if (x < width - 1) neighbors.push(idx + 1);
      if (y > 0) neighbors.push(idx - width);
      if (y < height - 1) neighbors.push(idx + width);

      for (const nb of neighbors) {
        if (insideMask[nb] && componentId[nb] === -1 && labelGrid[nb] === label) {
          componentId[nb] = compIdx;
          stack.push(nb);
        }
      }
    }

    components.push({ clusterLabel: label, pixels });
  }

  return { componentId, components };
}

/**
 * One cleanup pass: any connected component smaller than `minAreaPx`
 * gets RELABELED (never deleted) to whichever different label is most
 * common among its immediate neighbors — i.e. it merges into the
 * biggest adjacent region rather than leaving a gap.
 *
 * @param {Int32Array} labelGrid
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array} insideMask
 * @param {number} minAreaPx
 * @returns {Int32Array} a new, cleaned label grid
 */
export function cleanupSmallRegions(labelGrid, width, height, insideMask, minAreaPx) {
  const { componentId, components } = connectedComponentLabels(labelGrid, width, height, insideMask);
  const cleaned = labelGrid.slice();

  for (let ci = 0; ci < components.length; ci++) {
    const comp = components[ci];
    if (comp.pixels.length >= minAreaPx) continue;

    const neighborCounts = new Map();
    for (const idx of comp.pixels) {
      const x = idx % width;
      const y = (idx / width) | 0;
      const neighbors = [];
      if (x > 0) neighbors.push(idx - 1);
      if (x < width - 1) neighbors.push(idx + 1);
      if (y > 0) neighbors.push(idx - width);
      if (y < height - 1) neighbors.push(idx + width);

      for (const nb of neighbors) {
        if (!insideMask[nb] || componentId[nb] === ci) continue;
        const nbLabel = labelGrid[nb];
        neighborCounts.set(nbLabel, (neighborCounts.get(nbLabel) || 0) + 1);
      }
    }

    if (neighborCounts.size === 0) continue; // isolated with no different neighbor — leave as-is

    const sortedEntries = Array.from(neighborCounts.entries()).sort((e1, e2) => e1[0] - e2[0]);
    let bestLabel = comp.clusterLabel, bestCount = -1;
    for (const [label, count] of sortedEntries) {
      if (count > bestCount) {
        bestCount = count;
        bestLabel = label;
      }
    }

    for (const idx of comp.pixels) cleaned[idx] = bestLabel;
  }

  return cleaned;
}

/**
 * Repeats cleanupSmallRegions until stable (or maxPasses reached) —
 * handles the rare case of two tiny same-size regions of different
 * labels sitting next to each other, which a single pass could merge
 * into EACH OTHER instead of into a larger neighbor.
 */
export function cleanupSmallRegionsIterative(labelGrid, width, height, insideMask, minAreaPx, maxPasses = 3) {
  let current = labelGrid;
  for (let pass = 0; pass < maxPasses; pass++) {
    const next = cleanupSmallRegions(current, width, height, insideMask, minAreaPx);
    let changed = false;
    for (let i = 0; i < next.length; i++) {
      if (next[i] !== current[i]) {
        changed = true;
        break;
      }
    }
    current = next;
    if (!changed) break;
  }
  return current;
}

// ---------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------

/**
 * Full pixel-level quantization: colour bins inside `baseMask` ->
 * gated, area-weighted Lab clustering -> cleaned per-pixel cluster
 * label grid -> per-cluster representative color (mean RGB) + which
 * cluster is dominant (largest area, post-cleanup).
 *
 * Seeding runs on real design colours only (see selectSeedCandidates),
 * so blend noise can no longer consume the cluster budget. On a gated
 * pool the cluster count is capped at the number of design colours
 * actually present — a two-colour logo yields two clusters instead of
 * inventing extra ones out of anti-aliasing.
 *
 * @param {{data:Uint8ClampedArray, width:number, height:number}} imageData
 * @param {Uint8Array} baseMask
 * @param {{k?:number, minAreaPx?:number, maxIterations?:number}} options
 * @returns {{labelGrid:Int32Array, dominantIndex:number, colorHexByCluster:string[], width:number, height:number}}
 */
export function quantizeImageColors(imageData, baseMask, options = {}) {
  const { width, height, data } = imageData;
  const k = Math.max(1, options.k ?? 4);
  const minAreaPx = Math.max(0, options.minAreaPx ?? 0);
  const maxIterations = options.maxIterations ?? 20;

  const bins = buildColorBins(imageData, baseMask);
  if (bins.n === 0) {
    return { labelGrid: new Int32Array(width * height).fill(-1), dominantIndex: 0, colorHexByCluster: [], width, height };
  }

  const { indices, gated } = selectSeedCandidates(bins, minAreaPx);
  const effectiveK = gated ? Math.min(k, indices.length) : k;

  let centroids = seedCentroidsAreaWeighted(bins, effectiveK, indices);
  if (gated) centroids = applyDistinctnessReserve(bins, centroids, indices);
  centroids = weightedLloydBins(bins, centroids, indices, maxIterations);
  const K = centroids.length;

  const binLabels = assignBinsToCentroids(bins, centroids);
  const rawGrid = new Int32Array(width * height).fill(-1);
  for (let i = 0; i < width * height; i++) {
    const bin = bins.binOfPixel[i];
    if (bin >= 0) rawGrid[i] = binLabels[bin];
  }

  const cleanedGrid = cleanupSmallRegionsIterative(rawGrid, width, height, baseMask, minAreaPx, 3);

  const sumR = new Float64Array(K), sumG = new Float64Array(K), sumB = new Float64Array(K);
  const count = new Int32Array(K);
  for (let i = 0; i < width * height; i++) {
    const lbl = cleanedGrid[i];
    if (lbl < 0) continue;
    sumR[lbl] += data[i * 4];
    sumG[lbl] += data[i * 4 + 1];
    sumB[lbl] += data[i * 4 + 2];
    count[lbl]++;
  }

  let dominantIndex = 0, dominantCount = -1;
  const colorHexByCluster = [];
  for (let c = 0; c < K; c++) {
    if (count[c] > dominantCount) {
      dominantCount = count[c];
      dominantIndex = c;
    }
    const r = count[c] > 0 ? sumR[c] / count[c] : 128;
    const g = count[c] > 0 ? sumG[c] / count[c] : 128;
    const b = count[c] > 0 ? sumB[c] / count[c] : 128;
    colorHexByCluster.push(rgbToHex(r, g, b));
  }

  return { labelGrid: cleanedGrid, dominantIndex, colorHexByCluster, width, height };
}
