// =====================================================================
// clicker/keycap-geometry.js
//
// THREE.js wrapper building TOP-side geometry:
//   - CLICKER_TOP_BASE: the TOP layer's "canvas" — the FULL outer
//     silhouette, filled with the single auto-detected dominant color.
//     TOP ARTWORK — createTopBaseGeometries() is UNCHANGED from the
//     already-working color pipeline; do not modify its logic.
//   - TOP's simple backside: a solid full-silhouette backing with a
//     centered MX socket boss. No procedural inner wall or shell.
//
// Coordinate convention (fixed — see geometry-math.js header): X/Y is
// the image plane, Z is thickness. Z=0 is topBase's own back face —
// topBase/accent extend forward (positive Z) from there, unchanged;
// the backing + boss extend backward (negative Z)
// from that SAME Z=0 reference. No rotation anywhere in this file.
//
// Does not create materials or add anything to a scene — that's
// clicker-viewer.js's job, keeping geometry generation separate from
// UI/rendering. Independent from viewer.js entirely.
// =====================================================================

import * as THREE from "three";

import ClipperLib from
  "https://cdn.jsdelivr.net/npm/clipper-lib@6.4.2/+esm";

import {
  groupLoopsIntoShapes,
  groupLoopsIntoSolidShapes,
  pxPointToMM,
  findPedestalLocation,
  circlePolygon,
  crossSocketPolygon,
  pointInPolygon,
} from "./geometry-math.js";

const MM_CLIPPER_SCALE = 1000;
const insetCacheByOuterLoop = new WeakMap();

function nowMs() {
  return typeof performance !== "undefined" && performance.now
    ? performance.now()
    : Date.now();
}

function buildShapeFromMMLoops(outer, holes) {
  const shape = new THREE.Shape();
  outer.forEach((p, i) => {
    if (i === 0) shape.moveTo(p.x, p.y);
    else shape.lineTo(p.x, p.y);
  });
  shape.closePath();

  for (const hole of holes) {
    if (hole.length < 3) continue;
    const path = new THREE.Path();
    hole.forEach((p, i) => {
      if (i === 0) path.moveTo(p.x, p.y);
      else path.lineTo(p.x, p.y);
    });
    path.closePath();
    shape.holes.push(path);
  }
  return shape;
}

function loopToMM(loop, autoFit, scaleMultiplier) {
  return loop.map((p) => {
    const { mmX, mmY } = pxPointToMM(p, autoFit, scaleMultiplier);
    return { x: mmX, y: mmY };
  });
}

function signedArea(loop) {
  let sum = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/**
 * Inset one outer silhouette in real millimetres, then clean the
 * result. Narrow appendages naturally collapse during the offset.
 * All substantial surviving loops are returned. Tiny disconnected
 * details are filtered, while narrow appendages remain solid.
 */
function orientation(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(p, q, r) {
  return q.x <= Math.max(p.x, r.x) + 1e-6 && q.x >= Math.min(p.x, r.x) - 1e-6
    && q.y <= Math.max(p.y, r.y) + 1e-6 && q.y >= Math.min(p.y, r.y) - 1e-6;
}

function pointOnBoundary(point, loop, tolerance = 1e-4) {
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq <= 1e-12) continue;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
    const px = a.x + t * dx;
    const py = a.y + t * dy;
    if (Math.hypot(point.x - px, point.y - py) <= tolerance) return true;
  }
  return false;
}

function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);

  const sharedEndpoint =
    (Math.abs(a.x - c.x) < 1e-6 && Math.abs(a.y - c.y) < 1e-6) ||
    (Math.abs(a.x - d.x) < 1e-6 && Math.abs(a.y - d.y) < 1e-6) ||
    (Math.abs(b.x - c.x) < 1e-6 && Math.abs(b.y - c.y) < 1e-6) ||
    (Math.abs(b.x - d.x) < 1e-6 && Math.abs(b.y - d.y) < 1e-6);

  if (sharedEndpoint) return false;
  if (Math.abs(o1) < 1e-6 && onSegment(a, c, b)) return true;
  if (Math.abs(o2) < 1e-6 && onSegment(a, d, b)) return true;
  if (Math.abs(o3) < 1e-6 && onSegment(c, a, d)) return true;
  if (Math.abs(o4) < 1e-6 && onSegment(c, b, d)) return true;

  return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
}

function hasSelfIntersection(loop) {
  const count = loop.length;
  for (let i = 0; i < count; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % count];
    for (let j = i + 1; j < count; j++) {
      if (j === i || (j + 1) % count === i) continue;
      const c = loop[j];
      const d = loop[(j + 1) % count];
      if (i === 0 && j === count - 1) continue;
      if (segmentsIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

export function sanitizeInsetLoops(outerLoop, candidateLoops) {
  if (!outerLoop || !candidateLoops || candidateLoops.length === 0) return [];

  const result = [];
  for (const loop of candidateLoops) {
    if (!loop || loop.length < 3) continue;

    const deduped = [];
    for (let i = 0; i < loop.length; i++) {
      const point = loop[i];
      const prev = deduped[deduped.length - 1];
      if (!prev || Math.abs(prev.x - point.x) > 1e-6 || Math.abs(prev.y - point.y) > 1e-6) {
        deduped.push({ x: point.x, y: point.y });
      }
    }
    if (deduped.length >= 3 && deduped[0] && deduped[deduped.length - 1] &&
      Math.abs(deduped[0].x - deduped[deduped.length - 1].x) < 1e-6 &&
      Math.abs(deduped[0].y - deduped[deduped.length - 1].y) < 1e-6) {
      deduped.pop();
    }
    if (deduped.length < 3) continue;
    if (Math.abs(signedArea(deduped)) < 4.0) continue;
    if (hasSelfIntersection(deduped)) continue;

    let inside = true;
    for (const point of deduped) {
      if (!pointInPolygon(point, outerLoop) && !pointOnBoundary(point, outerLoop, 1e-4)) {
        inside = false;
        break;
      }
    }
    if (!inside) continue;

    let boundaryCrossing = false;
    for (let i = 0; i < deduped.length; i++) {
      const a = deduped[i];
      const b = deduped[(i + 1) % deduped.length];
      for (let j = 0; j < outerLoop.length; j++) {
        const c = outerLoop[j];
        const d = outerLoop[(j + 1) % outerLoop.length];
        if (segmentsIntersect(a, b, c, d)) {
          boundaryCrossing = true;
          break;
        }
      }
      if (boundaryCrossing) break;
    }
    if (boundaryCrossing) continue;

    result.push(deduped);
  }

  return result.sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
}

function createSimplifiedInsetCavities(mmOuter, wallThicknessMM) {
  const scale = MM_CLIPPER_SCALE;
  const path = mmOuter.map((point) => ({
    X: Math.round(point.x * scale),
    Y: Math.round(point.y * scale),
  }));
  if (!ClipperLib.Clipper.Orientation(path)) path.reverse();
  const offsetter = new ClipperLib.ClipperOffset(2, 0.05 * scale);
  offsetter.AddPath(path, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);

  const insetPaths = new ClipperLib.Paths();
  const offsetStartedAt = nowMs();
  offsetter.Execute(insetPaths, -wallThicknessMM * scale);
  const offsetMs = nowMs() - offsetStartedAt;
  const cleaningStartedAt = nowMs();
  const cleaned = ClipperLib.Clipper.CleanPolygons(insetPaths, 0.25 * scale);
  const allSimplified = ClipperLib.Clipper.SimplifyPolygons(cleaned, ClipperLib.PolyFillType.pftNonZero)
    .map((loop) => loop.map((point) => ({ x: point.X / scale, y: point.Y / scale })))
    .filter((loop) => loop.length >= 3);
  const loops = sanitizeInsetLoops(mmOuter, allSimplified)
    .filter((loop) => loop.length >= 3 && Math.abs(signedArea(loop)) >= 4.0);
  const cleaningFilteringMs = nowMs() - cleaningStartedAt;

  return {
    loops,
    rawCount: insetPaths.length,
    cleanedCount: cleaned.length,
    simplifiedCount: allSimplified.length,
    offsetMs,
    cleaningFilteringMs,
  };
}

function getCachedInsetCavities(outerLoop, mmOuter, autoFit, scaleMultiplier, wallThicknessMM) {
  const cacheKey = [
    autoFit.centerPxX,
    autoFit.centerPxY,
    autoFit.scale,
    scaleMultiplier,
    wallThicknessMM,
  ].join("|");
  let cache = insetCacheByOuterLoop.get(outerLoop);
  const cached = cache?.get(cacheKey);
  if (cached) {
    return {
      ...cached,
      offsetMs: 0,
      cleaningFilteringMs: 0,
      cacheHit: true,
    };
  }

  const inset = createSimplifiedInsetCavities(mmOuter, wallThicknessMM);
  if (!cache) {
    cache = new Map();
    insetCacheByOuterLoop.set(outerLoop, cache);
  }
  cache.set(cacheKey, inset);
  while (cache.size > 4) cache.delete(cache.keys().next().value);
  return { ...inset, cacheHit: false };
}

/**
 * Build TOP_BASE: the TOP layer's full-silhouette "canvas", sitting at
 * Z = [zOffset, zOffset + thicknessMM].
 *
 * TOP ARTWORK — this function is UNCHANGED from the working color
 * pipeline. Do not modify.
 *
 * Deliberately always the FULL outer silhouette (never trimmed to just
 * the dominant color's own traced shape) so this "canvas" layer is
 * always solid and gap-free — accent regions simply sit on top of it,
 * visually covering it wherever they are, with no risk of a hole/gap
 * in the canvas underneath them.
 *
 * @param {Array<Array<{x:number,y:number}>>} outerLoops Phase-1's `loops`
 * @param {{centerPxX:number, centerPxY:number, scale:number}} autoFit
 * @param {number} scaleMultiplier user zoom
 * @param {number} zOffset mm
 * @param {number} thicknessMM mm
 * @returns {THREE.BufferGeometry[]}
 */
export function createTopBaseGeometries(outerLoops, autoFit, scaleMultiplier, zOffset, thicknessMM) {
  if (!outerLoops || outerLoops.length === 0 || !autoFit) return [];

  const shapes = groupLoopsIntoShapes(outerLoops);
  const geometries = [];

  for (const { outer, holes } of shapes) {
    if (outer.length < 3) continue;

    const mmOuter = outer.map((p) => {
      const { mmX, mmY } = pxPointToMM(p, autoFit, scaleMultiplier);
      return { x: mmX, y: mmY };
    });
    const mmHoles = holes.map((hole) =>
      hole.map((p) => {
        const { mmX, mmY } = pxPointToMM(p, autoFit, scaleMultiplier);
        return { x: mmX, y: mmY };
      })
    );

    const shape = buildShapeFromMMLoops(mmOuter, mmHoles);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.05, thicknessMM),
      bevelEnabled: false,
      curveSegments: 1,
    });
    geometry.translate(0, 0, zOffset);
    geometries.push(geometry);
  }

  return geometries;
}

/**
 * Build the solid backing layer: a solid disc matching TOP_BASE's
 * own (un-offset) footprint exactly, sitting directly BEHIND it —
 * Z = [-transitionThicknessMM, 0]. The socket boss attaches to its back.
 *
 * @param {Array<Array<{x:number,y:number}>>} outerLoops Phase-1's `loops`
 * @param {{centerPxX:number, centerPxY:number, scale:number}} autoFit MUST match TOP_BASE's
 * @param {number} scaleMultiplier MUST match TOP_BASE's
 * @param {number} transitionThicknessMM mm
 * @returns {THREE.BufferGeometry[]}
 */
export function createTopTransitionGeometries(outerLoops, autoFit, scaleMultiplier, transitionThicknessMM) {
  if (!outerLoops || outerLoops.length === 0 || !autoFit) return [];

  const shapes = groupLoopsIntoSolidShapes(outerLoops);
  const geometries = [];

  for (const { outer } of shapes) {
    if (outer.length < 3) continue;

    const mmOuter = loopToMM(outer, autoFit, scaleMultiplier);
    // This is the structural, full-silhouette backing. Do
    // not carry artwork/alpha holes into it: those openings belong to
    // the visible front layer only. Preserving them here would punch
    // through the TOP and expose the socket boss from the front.
    const shape = buildShapeFromMMLoops(mmOuter, []);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.05, transitionThicknessMM),
      bevelEnabled: false,
      curveSegments: 1,
    });
    // Native extrude range [0, transitionThicknessMM]; flip behind Z=0.
    geometry.translate(0, 0, -transitionThicknessMM);
    geometries.push(geometry);
  }

  return geometries;
}

/** Build rear shell from every valid inset cavity loop. */
export function createTopRearShellGeometries(
  outerLoops,
  autoFit,
  scaleMultiplier,
  bodyDepthMM,
  backingThicknessMM,
  cavityProfile
) {
  if (!outerLoops || outerLoops.length === 0 || !autoFit) {
    return { geometries: [], outerMMLoops: [], cavityLoops: [], diagnostics: null, warnings: ["No outer silhouette"] };
  }

  const shapes = groupLoopsIntoSolidShapes(outerLoops);
  const geometries = [];
  const outerMMLoops = [];
  const cavityLoops = [];
  const diagnostics = {
    rawInsetLoops: 0,
    cleanedLoops: 0,
    simplifiedLoops: 0,
    validInsetLoops: 0,
    cavityLoopsUsed: 0,
    insetOffsetMs: 0,
    cavityCleanFilterMs: 0,
    shellExtrusionMs: 0,
    insetCacheHits: 0,
  };

  for (const { outer } of shapes) {
    if (outer.length < 3) continue;
    const mmOuter = loopToMM(outer, autoFit, scaleMultiplier);
    outerMMLoops.push(mmOuter);
    const inset = getCachedInsetCavities(
      outer,
      mmOuter,
      autoFit,
      scaleMultiplier,
      cavityProfile.minimumWallMM
    );
    diagnostics.rawInsetLoops += inset.rawCount;
    diagnostics.cleanedLoops += inset.cleanedCount;
    diagnostics.simplifiedLoops += inset.simplifiedCount;
    diagnostics.validInsetLoops += inset.loops.length;
    diagnostics.insetOffsetMs += inset.offsetMs;
    diagnostics.cavityCleanFilterMs += inset.cleaningFilteringMs;

    const largestCavity = (inset.loops || []).sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)))[0] || null;
    if (largestCavity) {
      cavityLoops.push(largestCavity);
    }

    const shape = buildShapeFromMMLoops(mmOuter, largestCavity ? [largestCavity] : []);
    const extrusionStartedAt = nowMs();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.05, bodyDepthMM),
      bevelEnabled: false,
      curveSegments: 1,
    });
    geometry.translate(0, 0, -bodyDepthMM - backingThicknessMM);
    diagnostics.shellExtrusionMs += nowMs() - extrusionStartedAt;
    diagnostics.cavityLoopsUsed += largestCavity ? 1 : 0;
    if (inset.cacheHit) diagnostics.insetCacheHits += 1;
    geometries.push(geometry);
  }

  const warnings = [];
  if (cavityLoops.length === 0) warnings.push("No usable inset cavity; rear shell remains solid");
  return { geometries, outerMMLoops, cavityLoops, diagnostics, warnings };
}

/** Build the independently-positioned MX pedestal/socket. */
export function createTopPedestalGeometry(
  outerMMLoops,
  cavityLoops,
  topSocketProfile,
  bodyDepthMM,
  backingThicknessMM,
  bossKeepOutMM
) {
  const pedestalRadius = topSocketProfile.bossDiameterMM / 2 + bossKeepOutMM;
  const socketClearRadius = Math.max(
    topSocketProfile.crossWidth + topSocketProfile.socketToleranceMM,
    topSocketProfile.crossArmThickness + topSocketProfile.socketToleranceMM
  ) / 2 + 0.2;

  const location = findPedestalLocation(outerMMLoops, cavityLoops, pedestalRadius, socketClearRadius);
  if (!location) {
    return {
      geometry: null,
      location: null,
      warning: "No valid MX pedestal location in outer silhouette",
    };
  }

  const holeWidth = topSocketProfile.crossWidth + topSocketProfile.socketToleranceMM;
  const holeArm = topSocketProfile.crossArmThickness + topSocketProfile.socketToleranceMM;
  const hole = crossSocketPolygon(holeWidth, holeArm);
  const shape = buildShapeFromMMLoops(circlePolygon(pedestalRadius * 2, 32), [hole]);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.05, bodyDepthMM),
    bevelEnabled: false,
    curveSegments: 1,
  });
  geometry.translate(location.x, location.y, -bodyDepthMM - backingThicknessMM);
  return {
    geometry,
    location,
    warning: null,
  };
}
