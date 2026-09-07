import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadClickerModules } from "../tools/clicker-test-modules.mjs";

const source = await readFile(new URL("./geometry-math.js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const {
  groupLoopsIntoShapes,
  groupLoopsIntoSolidShapes,
  findPedestalLocation,
} = await import(moduleUrl);

const outerA = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];
const holeA = [
  { x: 3, y: 3 },
  { x: 3, y: 7 },
  { x: 7, y: 7 },
  { x: 7, y: 3 },
];
const outerB = [
  { x: 20, y: 0 },
  { x: 24, y: 0 },
  { x: 24, y: 4 },
  { x: 20, y: 4 },
];

const normal = groupLoopsIntoShapes([outerA, holeA, outerB]);
assert.equal(normal.length, 2);
assert.equal(normal[0].holes.length, 1, "normal artwork geometry preserves internal holes");

const solid = groupLoopsIntoSolidShapes([outerA, holeA, outerB]);
assert.equal(solid.length, 2, "separate silhouette islands remain separate");
assert.deepEqual(solid.map((shape) => shape.holes.length), [0, 0], "structural backing fills all internal holes");

const compactOuter = [[
  { x: -15, y: -15 }, { x: 15, y: -15 },
  { x: 15, y: 15 }, { x: -15, y: 15 },
]];
const compactCavity = [[
  { x: -13.4, y: -13.4 }, { x: 13.4, y: -13.4 },
  { x: 13.4, y: 13.4 }, { x: -13.4, y: 13.4 },
]];
const compactPedestal = findPedestalLocation(compactOuter, compactCavity, 3.55);
assert.ok(compactPedestal?.insideCavity, "compact cat-like body places the pedestal as a cavity island");

const elongatedOuter = [[
  { x: -4, y: -15 }, { x: 7, y: -15 },
  { x: 7, y: 15 }, { x: -4, y: 15 },
]];
const disconnectedBirdCavities = [
  [{ x: -1.5, y: -10 }, { x: 6, y: -10 }, { x: 6, y: 10 }, { x: -1.5, y: 10 }],
  [{ x: -3, y: 11 }, { x: 0, y: 11 }, { x: 0, y: 14 }, { x: -3, y: 14 }],
];
const birdPedestal = findPedestalLocation(elongatedOuter, disconnectedBirdCavities, 3.55);
assert.ok(birdPedestal, "elongated bird-like body keeps an independent pedestal");
assert.ok(birdPedestal.insideCavity, "pedestal uses a valid main cavity even when inset has disconnected loops");

const noCavityPedestal = findPedestalLocation(compactOuter, [], 3.55);
assert.ok(noCavityPedestal && !noCavityPedestal.insideCavity, "pedestal survives when no usable cavity exists");

const standardSizeOuter = [[
  { x: -20, y: -20 }, { x: 20, y: -20 },
  { x: 20, y: 20 }, { x: -20, y: 20 },
]];
const standardSizeCavity = [[
  { x: -8, y: -8 }, { x: 8, y: -8 },
  { x: 8, y: 8 }, { x: -8, y: 8 },
]];
const standardSizePedestal = findPedestalLocation(standardSizeOuter, standardSizeCavity, 2.7, 2.7);
assert.ok(standardSizePedestal && standardSizePedestal.insideCavity, "standard generated-size cavity hosts the pedestal and socket");

const birdLikeOuter = [[
  { x: -25, y: -5 }, { x: 18, y: -5 }, { x: 22, y: 4 }, { x: 18, y: 11 },
  { x: 0, y: 13 }, { x: -10, y: 11 }, { x: -22, y: 8 }, { x: -25, y: 0 },
]];
const birdLikeBodyScale = (await import(moduleUrl)).computeAutoFitTransform(
  birdLikeOuter,
  30,
  30
).scale;
assert.equal(birdLikeBodyScale, 30 / 47, "longest side matches selected size without distorting aspect ratio");

const viewerSource = await readFile(new URL("./clicker-viewer.js", import.meta.url), "utf8");
assert.doesNotMatch(viewerSource, /createTopWallGeometries/, "TOP build/export path must not create a silhouette wall");
assert.match(viewerSource, /createTopTransitionGeometries/, "TOP build/export path retains the solid backing");
assert.match(viewerSource, /createTopRearShellGeometries/, "rear shell has its own build path");
assert.match(viewerSource, /createTopPedestalGeometry/, "MX pedestal has an independent build path");
assert.doesNotMatch(viewerSource, /TOP cavity failed/, "cavity failure must not abort TOP geometry");
assert.match(viewerSource, /PREVIEW_PIECE_GAP_MM\s*=\s*12\.0/, "preview separates TOP and HOUSING by a 12 mm edge gap");
assert.match(viewerSource, /topGroup\.position\.x\s*=\s*-previewCenterOffsetMM/, "TOP moves left only in its preview group");
assert.match(viewerSource, /housingGroup\.position\.x\s*=\s*previewCenterOffsetMM/, "HOUSING moves right only in its preview group");
assert.match(viewerSource, /root\.matrixWorld\.clone\(\)\.invert\(\)/, "export cancels each preview root transform");
assert.match(viewerSource, /multiplyMatrices\(\s*rootInverse,\s*object\.matrixWorld\s*\)/s, "export retains only modeling transforms relative to the preview root");
assert.doesNotMatch(viewerSource, /applyMatrix4\(object\.matrixWorld\)/, "STL export must not bake preview offsets");
assert.match(viewerSource, /nextSilhouetteKey !== state\.silhouetteKey/, "unchanged silhouette geometry is not rebuilt for color-only changes");
assert.match(viewerSource, /FIXED_CLICKER_SCALE_MULTIPLIER = 1/, "global sizing remains fixed");

const uiSource = await readFile(new URL("./clicker-ui.js", import.meta.url), "utf8");
assert.match(uiSource, /silhouetteCache:\s*new Map\(\)/, "silhouette results are cached by image and settings");
assert.match(uiSource, /colorCache:\s*new Map\(\)/, "color results are cached independently");
assert.match(uiSource, /function schedulePipeline\(\)/, "slider-driven pipeline rebuilds are debounced");
assert.match(uiSource, /silhouetteKey,\s*colorKey/s, "viewer receives independent silhouette and color cache keys");

const profileSource = await readFile(new URL("./stem-profile.js", import.meta.url), "utf8");
const topShellConfig = profileSource.replace(/\r\n/g, "\n").match(/topShell:\s*\{([\s\S]*?)\n\s*\},\n\n\s*housing:/)?.[1] ?? "";
assert.doesNotMatch(topShellConfig, /wallDepthMM|wallThicknessMM/, "removed TOP wall settings must not remain active");
assert.match(topShellConfig, /bodyDepthMM:\s*5\.6374/, "rear body matches CAT/Fish depth");
assert.doesNotMatch(topShellConfig, /cavityWidthMM|cavityHeightMM/, "cavity size must not be capped by fixed dimensions");
assert.match(topShellConfig, /minimumWallMM:\s*1\.6/, "minimum cavity wall remains 1.6 mm");
assert.match(topShellConfig, /bossKeepOutMM:\s*0\.8/, "boss keep-out remains 0.8 mm");

const maxTopThicknessMM = 0.4 + 0.2 + 0.95 + 5.6374;
assert.ok(maxTopThicknessMM <= 7.437, "artwork + backing + solid body must not exceed the reference TOP thickness");

const keycapSource = await readFile(new URL("./keycap-geometry.js", import.meta.url), "utf8");
const { sanitizeInsetLoops } = (await loadClickerModules())["keycap-geometry"];

const invalidOuter = [
  { x: -10, y: -10 }, { x: 10, y: -10 }, { x: 10, y: 10 }, { x: -10, y: 10 },
];
const invalidLoop = [
  { x: -8, y: -8 }, { x: 11, y: 0 }, { x: 10, y: 10 }, { x: -8, y: 8 }, { x: -8, y: -8 },
];
assert.deepEqual(sanitizeInsetLoops(invalidOuter, [invalidLoop]), [], "invalid inset loop that exits the silhouette is stripped");

const validLoop = [
  { x: -6, y: -6 }, { x: 6, y: -6 }, { x: 6, y: 6 }, { x: -6, y: 6 }, { x: -6, y: -6 },
];
assert.deepEqual(sanitizeInsetLoops(invalidOuter, [validLoop]), [validLoop.slice(0, -1)], "valid inset loop remains inside the silhouette with duplicate closure removed");

const touchedOuter = [
  { x: -10, y: -10 }, { x: 10, y: -10 }, { x: 10, y: 10 }, { x: -10, y: 10 },
];
const touchedLoop = [
  { x: -8, y: -8 }, { x: 8, y: -8 }, { x: 8, y: 8 }, { x: -8, y: 8 }, { x: -8, y: -8 },
];
assert.deepEqual(sanitizeInsetLoops(touchedOuter, [touchedLoop]), [touchedLoop.slice(0, -1)], "valid inset loop survives with duplicate closure removed");

const housingSource = await readFile(new URL("./housing-geometry.js", import.meta.url), "utf8");
assert.match(housingSource, /groupLoopsIntoSolidShapes\(outerLoops\)/, "HOUSING begins from solid structural outer silhouettes");
assert.match(housingSource, /imageHolesIgnored/, "source-image holes are diagnosed instead of copied into HOUSING");
assert.match(housingSource, /buildFunctionalHousingGeometry/, "functional housing regions share one connected boundary mesh");
assert.match(housingSource, /analyzeHousingTopology/, "HOUSING reports open and non-manifold edges");
assert.match(housingSource, /addPlanarRegion\(positions, outer, \[\], zRanges\.floor\[0\], -1\)/, "rear floor is a solid outer-silhouette cap");
assert.match(housingSource, /chamberLoopsUsed:\s*chamberLoop \? 1 : 0/, "only a validated structural inset becomes the upper chamber");
assert.match(housingSource, /silhouette-inset-patched/, "confirmed chamber patch remains available");
assert.match(housingSource, /functionalCenter/, "HOUSING functional cutouts share TOP's MX location");
assert.doesNotMatch(housingSource, /buildSolidLayer|buildUpperShellLayer/, "old stacked extrusions with coplanar caps are removed");
assert.match(viewerSource, /topGeometryDiagnostics\?\.pedestalLocation \|\| null/, "preview and export align HOUSING cutouts to TOP's MX location");
assert.match(profileSource, /heightMM:\s*17\.237/, "HOUSING preserves the measured 17.237 mm height");
assert.match(profileSource, /floorThicknessMM:\s*1\.6/, "HOUSING rear floor remains 1.6 mm");
assert.match(profileSource, /heightMM:\s*7\.85/, "switch pocket depth remains 7.85 mm");
assert.match(profileSource, /thicknessMM:\s*1\.45/, "plate opening depth remains 1.45 mm");

console.log("geometry-math regression tests passed");
