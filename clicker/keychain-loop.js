// =====================================================================
// clicker/keychain-loop.js
//
// Optional keychain loop attached to HOUSING's own outer boundary —
// NEVER to TOP. HOUSING is the structural part that stays permanently
// on the keyring; TOP only connects to it via the MX switch's own clip,
// which is built for click-actuation force, not for carrying a
// keychain's pull/swing load. See stem-profile.js's keychainLoop
// section for the full reasoning and every fixed dimension used here.
//
// Modeled the same way Name Keychain's own ring is (viewer.js's
// createRingMesh): an outer ellipse with a circular hole, extruded
// along Z, added as a SEPARATE overlapping solid mesh into the same
// STL group — no CSG boolean. Slicers fuse overlapping solids
// automatically as long as the overlap is generous, the same
// assumption Name Keychain's own ring already relies on.
//
// Does not create materials or add anything to a scene — that's
// clicker-viewer.js's job (same separation as image-geometry.js).
// Never touches TOP geometry, HOUSING's own chamber/pocket/plate
// construction, sizing, or color regions — this file only reads
// HOUSING's already-computed outer boundary and cutout footprints and
// produces one independent, validated mesh.
//
// Coordinate convention unchanged from the rest of /clicker/: X/Y is
// the image plane, Z is thickness, HOUSING's Z=0 is its own floor.
// =====================================================================

import * as THREE from "three";
import {
  signedArea2D,
  pointInPolygon,
  loopCentroid,
  farthestRayPolygonIntersection,
} from "./geometry-math.js";

function largestLoop(loops) {
  if (!loops || loops.length === 0) return null;
  return loops.slice().sort((a, b) => Math.abs(signedArea2D(b)) - Math.abs(signedArea2D(a)))[0];
}

function boundsCenter(loop) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of loop) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

// 0deg = local +Y ("up" as drawn), increasing clockwise (+X = 90deg) —
// fixed in the model's own coordinate frame, never camera/screen space.
function directionForAngle(angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: Math.sin(rad), y: Math.cos(rad) };
}

// Rotates a point so local +Y aligns with directionForAngle(angleDeg),
// then translates it — the exact inverse pairing of directionForAngle
// above (verified: local (0,1) maps to (sin th, cos th)).
function rotateAndTranslate(points, angleDeg, center) {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return points.map((p) => ({
    x: p.x * cos + p.y * sin + center.x,
    y: -p.x * sin + p.y * cos + center.y,
  }));
}

// Local ring outline centered at the origin; local +Y is the
// "pointing outward" axis (outerLengthMM), local +X is tangent to the
// silhouette at the attachment point (outerWidthMM).
function ringLocalPoints(outerWidthMM, outerLengthMM, segments = 48) {
  const rx = outerWidthMM / 2;
  const ry = outerLengthMM / 2;
  const points = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    points.push({ x: rx * Math.sin(t), y: ry * Math.cos(t) });
  }
  return points;
}

function circleLocalPoints(diameterMM, segments = 32) {
  const r = diameterMM / 2;
  const points = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    points.push({ x: r * Math.cos(t), y: r * Math.sin(t) });
  }
  return points;
}

/**
 * Is the ring's embedded (overlap) portion fully on real HOUSING
 * material and clear of the switch pocket/plate cutouts?
 *
 * Deliberately checks only ALONG the inward (attachment) direction, not
 * a tangential "cap" spanning the ring's full width: a photo-traced
 * silhouette boundary is often locally curved or jagged, so assuming
 * it's straight sideways over acrossHalfMM and offsetting by a fixed
 * tangent vector can land a sample point outside the true silhouette
 * even far from any real obstruction (verified against Cat/Fish, where
 * that tangential assumption produced false rejections at points many
 * mm from the switch pocket). Sampling several points along the
 * embedded segment [-0.1mm, -overlapMM] instead directly answers "is
 * there solid material behind this exact spot", independent of local
 * curvature, at the cost of not separately validating the ring's
 * sideways extent — an accepted, honest simplification.
 */
function embeddedCapIsSafe(point, direction, overlapMM, housingOuterLoop, pocketLoopMM, plateLoopMM) {
  const steps = 5;
  for (let i = 0; i < steps; i++) {
    const depth = -0.1 - (overlapMM - 0.1) * (i / (steps - 1));
    const sample = { x: point.x + direction.x * depth, y: point.y + direction.y * depth };
    if (!pointInPolygon(sample, housingOuterLoop)) return false;
    if (pocketLoopMM && pointInPolygon(sample, pocketLoopMM)) return false;
    if (plateLoopMM && pointInPolygon(sample, plateLoopMM)) return false;
  }
  return true;
}

/**
 * @param {Array<Array<{x:number,y:number}>>} housingOuterMMLoops HOUSING's own outer boundary (mm) — the FINAL one, after any pocket-fit extension
 * @param {Array<{x:number,y:number}>|null} pocketLoopMM switch pocket footprint (mm), if any
 * @param {Array<{x:number,y:number}>|null} plateLoopMM switch plate cutout footprint (mm), if any
 * @param {number} angleDeg 0 = the image's own local +Y ("up" as drawn); NOT camera/screen space
 * @param {object} profile CLICKER_PROFILE.keychainLoop
 * @returns {{geometry: THREE.BufferGeometry|null, angleDeg:number, attachmentPoint:{x:number,y:number}|null, warning:string|null}}
 */
export function createKeychainLoopGeometry(housingOuterMMLoops, pocketLoopMM, plateLoopMM, angleDeg, profile) {
  const outer = largestLoop(housingOuterMMLoops);
  if (!outer) {
    return { geometry: null, angleDeg, attachmentPoint: null, warning: "No HOUSING outer boundary to attach to" };
  }

  // Bounding-box center is the chosen angular reference; a true area
  // centroid is the fallback for a concave/crescent silhouette whose
  // bounding-box center can fall outside the polygon entirely.
  let origin = boundsCenter(outer);
  if (!pointInPolygon(origin, outer)) origin = loopCentroid(outer);

  const direction = directionForAngle(angleDeg);
  const hit = farthestRayPolygonIntersection(outer, origin, direction);
  if (!hit) {
    return { geometry: null, angleDeg, attachmentPoint: null, warning: "Could not find a silhouette edge at this angle" };
  }

  const alongHalf = profile.outerLengthMM / 2;

  // Try the configured overlap, then progressively shallower — never
  // produce a loop whose embedded portion isn't fully validated clear
  // of the pocket/plate cutouts, even on a very tight silhouette.
  const overlapCandidates = [profile.overlapMM, profile.overlapMM * 0.66, profile.overlapMM * 0.33, profile.minOverlapMM]
    .filter((v, i, arr) => v >= profile.minOverlapMM && arr.indexOf(v) === i);

  let chosenOverlap = null;
  for (const overlap of overlapCandidates) {
    if (embeddedCapIsSafe(hit, direction, overlap, outer, pocketLoopMM, plateLoopMM)) {
      chosenOverlap = overlap;
      break;
    }
  }

  if (chosenOverlap === null) {
    return {
      geometry: null,
      angleDeg,
      attachmentPoint: hit,
      warning: "No safe attachment at this angle — too close to the switch pocket/plate, or the silhouette is too narrow here",
    };
  }

  const ringCenter = {
    x: hit.x + direction.x * (alongHalf - chosenOverlap),
    y: hit.y + direction.y * (alongHalf - chosenOverlap),
  };

  const outerPoints = rotateAndTranslate(ringLocalPoints(profile.outerWidthMM, profile.outerLengthMM), angleDeg, ringCenter);
  const holePoints = rotateAndTranslate(circleLocalPoints(profile.holeDiameterMM), angleDeg, ringCenter);

  const shape = new THREE.Shape();
  outerPoints.forEach((p, i) => (i === 0 ? shape.moveTo(p.x, p.y) : shape.lineTo(p.x, p.y)));
  shape.closePath();
  const hole = new THREE.Path();
  holePoints.forEach((p, i) => (i === 0 ? hole.moveTo(p.x, p.y) : hole.lineTo(p.x, p.y)));
  hole.closePath();
  shape.holes.push(hole);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: profile.thicknessMM,
    bevelEnabled: false,
    curveSegments: 1,
  });

  return {
    geometry,
    angleDeg,
    attachmentPoint: hit,
    warning: chosenOverlap < profile.overlapMM
      ? `Reduced overlap to ${chosenOverlap.toFixed(2)}mm to clear the switch cavity`
      : null,
  };
}
