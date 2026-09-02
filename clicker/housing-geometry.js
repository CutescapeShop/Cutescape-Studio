// =====================================================================
// clicker/housing-geometry.js
//
// THREE.js wrapper building CLICKER_HOUSING: a hollow shell sized to
// hold a REAL MX-compatible switch, generated procedurally from the
// SAME outer silhouette (offset outward) as TOP — not hardcoded to
// any specific uploaded image.
//
// Built from direct measurement of a reference STL pair (Cat.stl /
// Cat_Base.stl) — see stem-profile.js's housing.* config for exactly
// which numbers were measured vs. estimated. The measured Z-structure
// (re-verified with a fine-grained scan) is:
//
//   Z 0                → floorThicknessMM   : SOLID floor
//   Z floorThicknessMM → plateZBottom       : SOLID (offset silhouette)
//                                              minus a switchCavity-shaped
//                                              pocket (switch's lower housing)
//   Z plateZBottom     → plateZTop          : SOLID (offset silhouette)
//                                              minus a switchPlateCutout-shaped
//                                              pocket (standard MX plate hole —
//                                              this is the "ledge": a switch's
//                                              upper-housing flange rests on
//                                              its TOP face, Z=plateZTop)
//   Z plateZTop        → heightMM           : HOLLOW shell (thin outer wall
//                                              only) — open chamber where the
//                                              switch's upper housing + stem
//                                              sit, and where TOP's boss
//                                              descends to meet the stem
//
// The four Z regions are emitted as ONE boundary mesh per disconnected
// outer silhouette region. This avoids coplanar internal caps between
// stacked extrusions and makes the exported STL genuinely manifold.
// No boolean/CSG operation is used: the functional pocket, plate, and
// chamber boundaries are connected explicitly at their Z transitions.
//
// A known simplification vs. the reference: small asymmetric relief
// notches found in the reference's switch-cavity walls (likely
// specific to the exact switch model used to build it) are NOT
// reproduced — switchCavity.clearanceMM instead adds uniform extra
// room on all sides, so a variety of real switches fit without
// depending on one exact clip geometry. See stem-profile.js.
//
// Coordinate convention (fixed — see geometry-math.js header): X/Y is
// the image plane, Z is thickness. No rotation anywhere in this file.
// =====================================================================

import * as THREE from "three";

import ClipperLib from
  "https://cdn.jsdelivr.net/npm/clipper-lib@6.4.2/+esm";

import {
  groupLoopsIntoSolidShapes,
  pointInPolygon,
  pxPointToMM,
  roundedRectPolygon,
  signedArea2D,
} from "./geometry-math.js";

// ClipperLib usage scale for this file — operates in PIXEL units,
// same value (100) as image-processing.js's CLICKER_CLIPPER_SCALE and
// the equivalent constant the old keycap-geometry.js used to define,
// kept for consistency across the project (not a shared import — each
// file that needs ClipperLib defines its own copy, same pattern used
// throughout /clicker/).
const PX_CLIPPER_SCALE = 100;
const offsetCacheByLoops = new WeakMap();

/**
 * Offset a set of PIXEL-space loops by a SIGNED distance — positive
 * grows the outer boundary outward (and shrinks any hole), negative
 * shrinks the outer boundary inward (and grows any hole). Operates in
 * pixel space, BEFORE the Y-flipping px->mm conversion, for the same
 * winding-preservation reason as everywhere else this technique is
 * used in this project (an earlier version of the outward-only form
 * of this function, applied AFTER px->mm conversion, was the exact
 * cause of a real bug where BASE silhouettes disappeared entirely —
 * see the project history. Always offset-then-group in pixel space,
 * convert to mm only for the final Shape).
 *
 * @param {Array<Array<{x:number,y:number}>>} pxLoops
 * @param {number} offsetPx signed
 * @returns {Array<Array<{x:number,y:number}>>}
 */
function offsetLoopsSignedPX(pxLoops, offsetPx, diagnostics = null) {
  if (!offsetPx || pxLoops.length === 0) return pxLoops;

  const cacheKey = offsetPx.toPrecision(15);
  let loopCache = offsetCacheByLoops.get(pxLoops);
  if (loopCache?.has(cacheKey)) {
    if (diagnostics) diagnostics.cacheHit = true;
    return loopCache.get(cacheKey);
  }

  const scale = PX_CLIPPER_SCALE;
  const arcTolerance = Math.max(1, 0.05 * scale);

  const scaledPaths = pxLoops.map((loop) =>
    loop.map((p) => ({ X: Math.round(p.x * scale), Y: Math.round(p.y * scale) }))
  );

  const offsetter = new ClipperLib.ClipperOffset(2, arcTolerance);
  offsetter.AddPaths(scaledPaths, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);

  const result = new ClipperLib.Paths();
  offsetter.Execute(result, offsetPx * scale);

  if (result.length === 0) {
    if (diagnostics) diagnostics.failed = true;
    // An outward-offset failure keeps the original closed footprint as
    // a defensive structural fallback. An inward-offset failure must
    // stay empty so it cannot masquerade as a zero-thickness chamber.
    return offsetPx > 0 ? pxLoops : [];
  }
  const loops = result.map((path) => path.map((pt) => ({ x: pt.X / scale, y: pt.Y / scale })));
  if (!loopCache) {
    loopCache = new Map();
    offsetCacheByLoops.set(pxLoops, loopCache);
  }
  loopCache.set(cacheKey, loops);
  while (loopCache.size > 4) loopCache.delete(loopCache.keys().next().value);
  if (diagnostics) diagnostics.cacheHit = false;
  return loops;
}

/** Convert one px-space loop to mm-space using the shared transform. */
function loopToMM(loop, autoFit, scaleMultiplier) {
  return loop.map((p) => {
    const { mmX, mmY } = pxPointToMM(p, autoFit, scaleMultiplier);
    return { x: mmX, y: mmY };
  });
}

function translateLoop(loop, center) {
  return loop.map((point) => ({
    x: point.x + center.x,
    y: point.y + center.y,
  }));
}

function cleanLoop(loop) {
  const cleaned = [];
  for (const point of loop) {
    const previous = cleaned[cleaned.length - 1];
    if (!previous || point.x !== previous.x || point.y !== previous.y) {
      cleaned.push({ x: point.x, y: point.y });
    }
  }
  if (
    cleaned.length > 1 &&
    cleaned[0].x === cleaned[cleaned.length - 1].x &&
    cleaned[0].y === cleaned[cleaned.length - 1].y
  ) {
    cleaned.pop();
  }
  return cleaned;
}

function loopContainsLoop(container, candidate) {
  return candidate.every((point) => pointInPolygon(point, container));
}

function loopBounds(loop) {
  const xs = loop.map((point) => point.x);
  const ys = loop.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function addTriangle(positions, a, b, c) {
  positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
}

function addPlanarRegion(positions, outerLoop, holeLoops, z, normalZ) {
  const contour = cleanLoop(outerLoop).map((p) => new THREE.Vector2(p.x, p.y));
  const holes = holeLoops.map((loop) => cleanLoop(loop).map((p) => new THREE.Vector2(p.x, p.y)));
  if (contour.length < 3) return;
  const faces = THREE.ShapeUtils.triangulateShape(contour, holes);
  const vertices = contour.concat(...holes);

  for (const face of faces) {
    let a = vertices[face[0]];
    let b = vertices[face[1]];
    let c = vertices[face[2]];
    const crossZ = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (crossZ * normalZ < 0) [b, c] = [c, b];
    addTriangle(
      positions,
      { x: a.x, y: a.y, z },
      { x: b.x, y: b.y, z },
      { x: c.x, y: c.y, z }
    );
  }
}

function addLoopWall(positions, rawLoop, zBottom, zTop, reverse = false) {
  const loop = cleanLoop(rawLoop);
  const flip = (signedArea2D(loop) < 0) !== reverse;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    const a0 = { x: a.x, y: a.y, z: zBottom };
    const b0 = { x: b.x, y: b.y, z: zBottom };
    const a1 = { x: a.x, y: a.y, z: zTop };
    const b1 = { x: b.x, y: b.y, z: zTop };
    if (flip) {
      addTriangle(positions, a0, b1, b0);
      addTriangle(positions, a0, a1, b1);
    } else {
      addTriangle(positions, a0, b0, b1);
      addTriangle(positions, a0, b1, a1);
    }
  }
}

function geometryFromPositions(positions) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

function buildSolidPrismGeometry(outer, zBottom, zTop) {
  const positions = [];
  addPlanarRegion(positions, outer, [], zBottom, -1);
  addPlanarRegion(positions, outer, [], zTop, 1);
  addLoopWall(positions, outer, zBottom, zTop);
  return geometryFromPositions(positions);
}

/** Build one manifold stepped cavity housing with no internal seam caps. */
function buildFunctionalHousingGeometry(outer, pocket, plate, chamber, zRanges) {
  const positions = [];

  // Exterior: one closed rear cap, continuous perimeter wall, one top rim.
  addPlanarRegion(positions, outer, [], zRanges.floor[0], -1);
  addLoopWall(positions, outer, zRanges.floor[0], zRanges.chamber[1]);
  addPlanarRegion(positions, outer, [chamber], zRanges.chamber[1], 1);

  // Functional interior only. Each horizontal transition fills exactly
  // the material gained/lost as the cutout footprint changes with Z.
  addPlanarRegion(positions, pocket, [], zRanges.floor[1], 1);
  addLoopWall(positions, pocket, zRanges.pocket[0], zRanges.pocket[1], true);
  addPlanarRegion(positions, pocket, [plate], zRanges.plate[0], -1);
  addLoopWall(positions, plate, zRanges.plate[0], zRanges.plate[1], true);
  addPlanarRegion(positions, chamber, [plate], zRanges.chamber[0], 1);
  addLoopWall(positions, chamber, zRanges.chamber[0], zRanges.chamber[1], true);

  return geometryFromPositions(positions);
}

function pointKey(position, index, tolerance) {
  const x = Math.round(position.getX(index) / tolerance);
  const y = Math.round(position.getY(index) / tolerance);
  const z = Math.round(position.getZ(index) / tolerance);
  return `${x},${y},${z}`;
}

function analyzeHousingTopology(geometries, rearZ, expectedRearOuterLoops, tolerance = 1e-5) {
  const edgeCounts = new Map();
  const rearEdgeCounts = new Map();

  function addEdge(map, a, b) {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    map.set(key, (map.get(key) || 0) + 1);
  }

  for (const geometry of geometries) {
    const position = geometry.getAttribute("position");
    for (let i = 0; i < position.count; i += 3) {
      const keys = [0, 1, 2].map((offset) => pointKey(position, i + offset, tolerance));
      addEdge(edgeCounts, keys[0], keys[1]);
      addEdge(edgeCounts, keys[1], keys[2]);
      addEdge(edgeCounts, keys[2], keys[0]);

      const atRear = [0, 1, 2].every(
        (offset) => Math.abs(position.getZ(i + offset) - rearZ) <= tolerance
      );
      if (atRear) {
        addEdge(rearEdgeCounts, keys[0], keys[1]);
        addEdge(rearEdgeCounts, keys[1], keys[2]);
        addEdge(rearEdgeCounts, keys[2], keys[0]);
      }
    }
  }

  const rearBoundaryEdges = [...rearEdgeCounts.entries()]
    .filter(([, count]) => count === 1)
    .map(([key]) => key.split("|"));
  const adjacency = new Map();
  for (const [a, b] of rearBoundaryEdges) {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a).add(b);
    adjacency.get(b).add(a);
  }
  let rearBoundaryLoops = 0;
  const visited = new Set();
  for (const start of adjacency.keys()) {
    if (visited.has(start)) continue;
    rearBoundaryLoops += 1;
    const stack = [start];
    visited.add(start);
    while (stack.length) {
      const current = stack.pop();
      for (const next of adjacency.get(current) || []) {
        if (!visited.has(next)) {
          visited.add(next);
          stack.push(next);
        }
      }
    }
  }

  return {
    openEdges: [...edgeCounts.values()].filter((count) => count === 1).length,
    nonManifoldEdges: [...edgeCounts.values()].filter((count) => count > 2).length,
    rearBoundaryLoops,
    rearInternalBoundaries: Math.max(0, rearBoundaryLoops - expectedRearOuterLoops),
  };
}

/**
 * Build the full 4-layer HOUSING shell.
 *
 * @param {Array<Array<{x:number,y:number}>>} outerLoops Phase-1's `loops`
 * @param {{centerPxX:number, centerPxY:number, scale:number}} autoFit MUST match TOP's
 * @param {number} scaleMultiplier MUST match TOP's
 * @param {object} housingProfile CLICKER_PROFILE.housing
 * @param {object|null} diagnostics populated with timing/topology details
 * @param {{x:number,y:number}|null} functionalCenter MX position shared with TOP
 * @returns {THREE.BufferGeometry[]}
 */
export function createHousingGeometries(
  outerLoops,
  autoFit,
  scaleMultiplier,
  housingProfile,
  diagnostics = null,
  functionalCenter = null
) {
  const totalStartedAt = performance.now();
  if (!outerLoops || outerLoops.length === 0 || !autoFit) return [];

  const currentScale = autoFit.scale * scaleMultiplier;
  if (currentScale <= 0) return [];

  const marginPx = housingProfile.offsetMM / currentScale;
  const wallPx = housingProfile.wallThicknessMM / currentScale;
  const sourceSolidShapes = groupLoopsIntoSolidShapes(outerLoops);
  const structuralSourceLoops = sourceSolidShapes.map(({ outer }) => outer);
  const imageHolesIgnored = outerLoops.filter((loop) => signedArea2D(loop) < 0).length;
  const warnings = [];

  // Only the silhouette's structural outer islands may define the
  // housing. Image/artwork holes are intentionally discarded before
  // the outward offset so they can never reach the rear floor or wall.
  const outerOffsetStartedAt = performance.now();
  const outerOffsetDiagnostics = {};
  const rawHousingOuterPxLoops = offsetLoopsSignedPX(
    structuralSourceLoops,
    marginPx,
    outerOffsetDiagnostics
  );
  const housingOuterShapesPx = groupLoopsIntoSolidShapes(rawHousingOuterPxLoops);
  const housingOuterPxLoops = housingOuterShapesPx.map(({ outer }) => outer);
  const housingOuterMMLoops = housingOuterPxLoops.map((loop) =>
    loopToMM(loop, autoFit, scaleMultiplier)
  );
  const outerOffsetMs = performance.now() - outerOffsetStartedAt;

  const cav = housingProfile.switchCavity;
  const plate = housingProfile.switchPlateCutout;
  const cutoutCenter = functionalCenter
    ? { x: functionalCenter.x, y: functionalCenter.y }
    : { x: 0, y: 0 };

  const plateZBottom = housingProfile.floorThicknessMM + cav.heightMM;
  const plateZTop = plateZBottom + plate.thicknessMM;

  const pocketLoop = translateLoop(
    roundedRectPolygon(
      cav.widthMM + cav.clearanceMM,
      cav.depthMM + cav.clearanceMM,
      cav.cornerRadiusMM,
      6
    ),
    cutoutCenter
  );
  const plateLoop = translateLoop(
    roundedRectPolygon(
      plate.widthMM,
      plate.depthMM,
      plate.cornerRadiusMM,
      6
    ),
    cutoutCenter
  );

  // The upper chamber is an inward offset of structural outer islands
  // only. It may have multiple candidates; exactly the candidate in
  // the same outer region as the centered functional cutouts is used.
  const chamberOffsetStartedAt = performance.now();
  const chamberOffsetDiagnostics = {};
  const rawChamberPxLoops = offsetLoopsSignedPX(
    housingOuterPxLoops,
    -wallPx,
    chamberOffsetDiagnostics
  );
  const chamberShapesPx = groupLoopsIntoSolidShapes(rawChamberPxLoops);
  const chamberCandidatesMM = chamberShapesPx.map(({ outer }) =>
    loopToMM(outer, autoFit, scaleMultiplier)
  );
  const chamberOffsetMs = performance.now() - chamberOffsetStartedAt;

  const functionalOuterIndex = housingOuterMMLoops
    .map((outer, index) => ({ outer, index, area: Math.abs(signedArea2D(outer)) }))
    .filter(({ outer }) => loopContainsLoop(outer, pocketLoop))
    .sort((a, b) => b.area - a.area)[0]?.index ?? -1;
  const functionalFitDiagnostics = housingOuterMMLoops.map((outer, index) => ({
    index,
    outerBounds: loopBounds(outer),
    pocketOutsideVertices: pocketLoop.filter((point) => !pointInPolygon(point, outer)).length,
  }));

  let chamberLoop = null;
  let chamberSource = "none";
  if (functionalOuterIndex >= 0) {
    const functionalOuter = housingOuterMMLoops[functionalOuterIndex];
    chamberLoop = chamberCandidatesMM
      .filter(
        (candidate) =>
          loopContainsLoop(functionalOuter, candidate) &&
          loopContainsLoop(candidate, plateLoop)
      )
      .sort((a, b) => Math.abs(signedArea2D(b)) - Math.abs(signedArea2D(a)))[0] ?? null;
    if (chamberLoop) {
      chamberSource = "silhouette-inset";
    } else {
      // A concave/elongated silhouette can have a valid switch pocket
      // while its uniform wall inset no longer surrounds the plate.
      // Keep the functional architecture by using the already-validated
      // pocket footprint as the upper chamber, rather than silently
      // replacing the whole housing with a solid prism.
      chamberLoop = pocketLoop.map((point) => ({ ...point }));
      chamberSource = "functional-pocket-fallback";
      warnings.push(
        "Uniform upper-chamber inset did not contain the plate opening; used the validated switch-pocket footprint for the chamber."
      );
    }
  }

  if (functionalOuterIndex < 0) {
    warnings.push("No housing outer region can contain the centered switch pocket; emitted a closed solid housing.");
  }

  const zRanges = {
    floor: [0, housingProfile.floorThicknessMM],
    pocket: [housingProfile.floorThicknessMM, plateZBottom],
    plate: [plateZBottom, plateZTop],
    chamber: [plateZTop, housingProfile.heightMM],
  };

  const meshBuildStartedAt = performance.now();
  const geometries = housingOuterMMLoops.map((outer, index) => {
    if (index === functionalOuterIndex && chamberLoop) {
      return buildFunctionalHousingGeometry(
        outer,
        pocketLoop,
        plateLoop,
        chamberLoop,
        zRanges
      );
    }
    return buildSolidPrismGeometry(outer, 0, housingProfile.heightMM);
  });
  const meshBuildMs = performance.now() - meshBuildStartedAt;
  const topology = analyzeHousingTopology(
    geometries,
    zRanges.floor[0],
    housingOuterMMLoops.length
  );

  if (diagnostics) {
    Object.assign(diagnostics, {
      outerOffsetMs,
      outerOffsetCacheHit: !!outerOffsetDiagnostics.cacheHit,
      chamberOffsetMs,
      chamberOffsetCacheHit: !!chamberOffsetDiagnostics.cacheHit,
      meshBuildMs,
      imageHolesIgnored,
      structuralOuterRegions: housingOuterMMLoops.length,
      chamberCandidates: chamberCandidatesMM.length,
      chamberLoopsUsed: chamberLoop ? 1 : 0,
      chamberSource,
      functionalOuterIndex,
      functionalCenter: cutoutCenter,
      pocketBounds: loopBounds(pocketLoop),
      functionalFitDiagnostics,
      zRanges,
      heightMM: housingProfile.heightMM,
      ...topology,
      warnings,
      totalMs: performance.now() - totalStartedAt,
    });
  }

  return geometries;
}
