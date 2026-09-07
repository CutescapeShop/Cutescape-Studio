// =====================================================================
// clicker/color-clustering.test.mjs
//
// Regression cover for the TOP colour-clustering stage, against
// procedurally generated fixtures (clicker/fixtures/synthetic-images.mjs)
// that reproduce the four cases that drove the redesign:
//
//   Bird — two large, perceptually adjacent colours ("wing"/"body") that
//          farthest-point seeding collapsed into one cluster, plus a tiny
//          high-contrast eye that must survive alongside them.
//   Cat  — a pale tint and a mid-ramp orange close to the dominant colour
//          in Lab space, which used to be absorbed by it and so never
//          became accent geometry.
//   Fish — heavy boundary dither that must NOT be promoted to its own
//          cluster; requesting more colours than the artwork contains
//          must cap, not invent noise clusters.
//   Dog  — continuous tone with no flat regions: the coherence gate has
//          to stand down instead of starving the clustering.
// =====================================================================

import assert from "node:assert/strict";
import { loadClickerModules } from "../tools/clicker-test-modules.mjs";
import { SYNTHETIC_FIXTURES } from "./fixtures/synthetic-images.mjs";

const modules = await loadClickerModules();
const { processImageToPaths } = modules["image-processing"];
const { computeAutoFitTransform } = modules["geometry-math"];
const { CLICKER_PROFILE } = modules["stem-profile"];
const {
  quantizeImageColors, buildColorBins, selectSeedCandidates, rgbToLab, labDistanceSq,
} = modules["color-quantization"];

/** Run the real pipeline exactly as clicker-ui.js does. */
function quantizeFixture(name, k) {
  const imageData = SYNTHETIC_FIXTURES[name]();
  const path = processImageToPaths(imageData, { threshold: 128, invert: false, smoothing: 1 });
  const autoFit = computeAutoFitTransform(
    path.loops, CLICKER_PROFILE.body.targetSize, CLICKER_PROFILE.body.targetSize);
  const minAreaPx = CLICKER_PROFILE.accent.minRegionAreaMM2 / (autoFit.scale * autoFit.scale);
  const bins = buildColorBins(imageData, path.mask);
  const gate = selectSeedCandidates(bins, minAreaPx);
  const quantized = quantizeImageColors(imageData, path.mask, { k, minAreaPx });

  const areaByCluster = new Array(quantized.colorHexByCluster.length).fill(0);
  for (const label of quantized.labelGrid) {
    if (label >= 0) areaByCluster[label]++;
  }
  return { minAreaPx, gate, quantized, areaByCluster };
}

const toLab = (hex) => {
  const [r, g, b] = hex.replace("#", "").match(/../g).map((v) => parseInt(v, 16));
  return rgbToLab(r, g, b);
};

/** Which cluster would a given source colour be rendered as? */
function clusterOf(hex, colorHexByCluster) {
  const target = toLab(hex);
  let best = 0, bestD = Infinity;
  colorHexByCluster.forEach((h, i) => {
    const d = labDistanceSq(target, toLab(h));
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

const report = [];

// ---------------------------------------------------------------
// Bird — wing/body must separate, eye and beak must survive
// ---------------------------------------------------------------
for (const k of [4, 6]) {
  const r = quantizeFixture("Bird", k);
  const hexes = r.quantized.colorHexByCluster;
  assert.ok(r.gate.gated, `Bird k=${k}: flat art must use the gated candidate pool`);

  const wing = clusterOf("#008080", hexes);
  const body = clusterOf("#00ccff", hexes);
  const eye = clusterOf("#241f1c", hexes);
  const beak = clusterOf("#ffcc00", hexes);

  assert.notEqual(wing, body, `Bird k=${k}: the two large adjacent colours must not collapse into one cluster`);
  assert.notEqual(eye, wing, `Bird k=${k}: eye must not collapse into the wing`);
  assert.notEqual(eye, body, `Bird k=${k}: eye must not collapse into the body`);
  assert.notEqual(beak, wing, `Bird k=${k}: beak must stay its own colour`);
  assert.equal(new Set([wing, body, eye, beak]).size, 4, `Bird k=${k}: all four design colours must be distinct`);

  // both large regions must remain substantial, not degenerate slivers
  for (const [label, cluster] of [["wing", wing], ["body", body]]) {
    assert.ok(r.areaByCluster[cluster] > 20 * r.minAreaPx,
      `Bird k=${k}: ${label} cluster should be a major region, got ${r.areaByCluster[cluster]}px`);
  }
  assert.ok(r.areaByCluster[eye] >= r.minAreaPx,
    `Bird k=${k}: eye must survive cleanup as a printable region`);
  report.push(`Bird k=${k}: wing=${hexes[wing]} body=${hexes[body]} eye=${hexes[eye]} beak=${hexes[beak]}`);
}

// ---------------------------------------------------------------
// Cat — pale tint and mid-ramp orange must both leave the dominant
// ---------------------------------------------------------------
for (const k of [4, 6]) {
  const r = quantizeFixture("Cat", k);
  const hexes = r.quantized.colorHexByCluster;
  assert.ok(r.gate.gated, `Cat k=${k}: flat art must use the gated candidate pool`);

  const face = clusterOf("#f6b76d", hexes);
  const whisker = clusterOf("#fdd099", hexes);
  const stripe = clusterOf("#e69b51", hexes);
  const dark = clusterOf("#402312", hexes);

  assert.notEqual(whisker, face, `Cat k=${k}: pale whisker tint must separate from the dominant face colour`);
  assert.notEqual(stripe, face, `Cat k=${k}: mid-ramp stripe orange must separate from the dominant face colour`);
  assert.notEqual(dark, face, `Cat k=${k}: dark facial features must separate from the face`);
  assert.equal(new Set([face, whisker, stripe, dark]).size, 4, `Cat k=${k}: all four design colours must be distinct`);
  assert.ok(r.areaByCluster[whisker] >= r.minAreaPx, `Cat k=${k}: whiskers must survive as a printable region`);
  report.push(`Cat k=${k}: face=${hexes[face]} whisker=${hexes[whisker]} stripe=${hexes[stripe]} dark=${hexes[dark]}`);
}

// ---------------------------------------------------------------
// Fish — keep the real palette, never promote dither, cap instead of
// inventing colours the artwork does not contain
// ---------------------------------------------------------------
for (const k of [4, 6]) {
  const r = quantizeFixture("Fish", k);
  const hexes = r.quantized.colorHexByCluster;
  assert.ok(r.gate.gated, `Fish k=${k}: flat art must use the gated candidate pool`);

  const orange = clusterOf("#ff7e38", hexes);
  const black = clusterOf("#000000", hexes);
  const white = clusterOf("#ffffff", hexes);
  assert.equal(new Set([orange, black, white]).size, 3,
    `Fish k=${k}: orange, black and white must stay three distinct clusters`);

  assert.ok(hexes.length <= r.gate.indices.length,
    `Fish k=${k}: cluster count (${hexes.length}) must not exceed the detected design palette (${r.gate.indices.length})`);
  for (let c = 0; c < hexes.length; c++) {
    if (r.areaByCluster[c] === 0) continue;
    assert.ok(r.areaByCluster[c] >= r.minAreaPx,
      `Fish k=${k}: cluster ${hexes[c]} covers ${r.areaByCluster[c]}px, below the ${Math.round(r.minAreaPx)}px printable floor — looks like dither`);
  }
  report.push(`Fish k=${k}: ${hexes.length} clusters (palette ${r.gate.indices.length}) ${hexes.join(",")}`);
}

// requesting more colours than exist must cap rather than model noise
{
  const r = quantizeFixture("Fish", 6);
  assert.ok(r.quantized.colorHexByCluster.length < 6,
    "Fish k=6: must cap at the detected palette instead of inventing dither clusters");
}

// ---------------------------------------------------------------
// Dog — continuous tone: gate stands down, tone survives
// ---------------------------------------------------------------
for (const k of [4, 6]) {
  const r = quantizeFixture("Dog", k);
  const hexes = r.quantized.colorHexByCluster;

  assert.equal(r.gate.gated, false,
    `Dog k=${k}: continuous tone has no flat regions, so the coherence gate must stand down`);
  assert.equal(hexes.length, k,
    `Dog k=${k}: ungated images must still get the full requested colour count`);

  const populated = r.areaByCluster.filter((a) => a > 0).length;
  assert.ok(populated >= Math.min(k, 3),
    `Dog k=${k}: expected real tonal separation, only ${populated} clusters hold pixels`);

  const lightness = hexes.map((h) => toLab(h).L);
  const spread = Math.max(...lightness) - Math.min(...lightness);
  assert.ok(spread > 20, `Dog k=${k}: tonal range collapsed (L spread ${spread.toFixed(1)})`);

  const dark = clusterOf("#372a26", hexes);
  const tongue = clusterOf("#d4707f", hexes);
  assert.notEqual(dark, tongue, `Dog k=${k}: dark features and the saturated tongue must stay separable`);
  report.push(`Dog k=${k}: ${populated}/${k} clusters populated, L spread ${spread.toFixed(1)}`);
}

// ---------------------------------------------------------------
// Determinism — same input must always give the same palette
// ---------------------------------------------------------------
for (const name of Object.keys(SYNTHETIC_FIXTURES)) {
  const a = quantizeFixture(name, 4);
  const b = quantizeFixture(name, 4);
  assert.deepEqual(a.quantized.colorHexByCluster, b.quantized.colorHexByCluster,
    `${name}: clustering must be deterministic`);
}

for (const line of report) console.log(line);
console.log("colour-clustering regression tests passed");
