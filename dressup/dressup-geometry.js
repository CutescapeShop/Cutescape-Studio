// =====================================================================
// dressup/dressup-geometry.js
//
// Builds the flat 2.5D base-doll geometry for the Dress-up / Paper Doll
// prototype: one contiguous body silhouette (see
// dressup-body-outline.js) extruded to a flat plaque thickness, plus
// shallow raised face details (eyes + mouth) stacked on its front face
// so they can be printed as a separate multicolor layer — the same
// "extrude a Shape, translate onto the front face" pattern used by
// clicker/image-geometry.js for its accent-color layers.
//
// Printed-in eyes (this prototype): simple filled ovals, no eye socket
// or cabochon attachment mechanism. A future "with eyelashes" face
// variant is left as a TODO — only the plain-eyes variant is built now.
//
// Isolated dress-up prototype — does not affect Keychain/Clicker/Beads.
// =====================================================================

import * as THREE from "three";

import {
  buildBodyOutline,
  buildArmOutline,
  DOLL_HEIGHT_MM,
} from "./dressup-body-outline.js";

export const BODY_THICKNESS_MM = 6;
export const FACE_DETAIL_DEPTH_MM = 1; // shallow raised layer, printed on top

export const FACE = {
  faceVariant: "plain", // future: "plain" | "eyelashes"
  eyeCenterY: 99,
  eyeSpacingX: 11, // half-distance between the two eye centers
  eyeWidth: 12,
  eyeHeight: 14,
  mouthCenterY: 85,
  mouthWidth: 7,
  mouthHeight: 3.5,
};

function pointsToShape(points) {
  const shape = new THREE.Shape();
  points.forEach(({ x, y }, i) => {
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();
  return shape;
}

function ovalShape(cx, cy, width, height) {
  const shape = new THREE.Shape();
  shape.absellipse(cx, cy, width / 2, height / 2, 0, Math.PI * 2, false, 0);
  return shape;
}

function extrudeFlat(shape, depth) {
  return new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 24,
  });
}

/** The contiguous head/torso/legs silhouette, extruded to plaque thickness. */
export function createBodyGeometry(overrides = {}) {
  const outline = buildBodyOutline(overrides);
  const shape = pointsToShape(outline);
  return extrudeFlat(shape, BODY_THICKNESS_MM);
}

/**
 * The two arms, each a separate simple capsule overlapping the torso at
 * the shoulder (see dressup-body-outline.js for why they're independent
 * shapes rather than folded into the single body silhouette).
 */
export function createArmGeometries(overrides = {}) {
  const rightArm = extrudeFlat(
    pointsToShape(buildArmOutline(1, overrides)),
    BODY_THICKNESS_MM
  );
  const leftArm = extrudeFlat(
    pointsToShape(buildArmOutline(-1, overrides)),
    BODY_THICKNESS_MM
  );
  return { leftArm, rightArm };
}

/**
 * Shallow raised eyes + mouth, stacked on the body's front face
 * (z = BODY_THICKNESS_MM), suitable for printing as a second color.
 * Returns separate geometries so the viewer can give them their own
 * material(s).
 */
export function createFaceDetailGeometries(faceOverrides = {}) {
  const f = { ...FACE, ...faceOverrides };

  const leftEye = extrudeFlat(
    ovalShape(-f.eyeSpacingX, f.eyeCenterY, f.eyeWidth, f.eyeHeight),
    FACE_DETAIL_DEPTH_MM
  );
  const rightEye = extrudeFlat(
    ovalShape(f.eyeSpacingX, f.eyeCenterY, f.eyeWidth, f.eyeHeight),
    FACE_DETAIL_DEPTH_MM
  );
  const mouth = extrudeFlat(
    ovalShape(0, f.mouthCenterY, f.mouthWidth, f.mouthHeight),
    FACE_DETAIL_DEPTH_MM
  );

  for (const geometry of [leftEye, rightEye, mouth]) {
    geometry.translate(0, 0, BODY_THICKNESS_MM);
  }

  return { leftEye, rightEye, mouth };
}

export function getDollHeightMM() {
  return DOLL_HEIGHT_MM;
}
