// =====================================================================
// dressup/dressup-body-outline.js
//
// Pure math: generates the flat 2.5D base-doll silhouette as ordered
// lists of {x, y} points in millimeters (no THREE.js dependency, so
// this can be unit-tested with plain Node).
//
// The body (head, neck, torso, legs, feet) is one contiguous, simply-
// connected outline with a crotch notch (a non-convex dent, not a
// hole). The arms are each a SEPARATE simple capsule outline that
// overlaps the torso by a couple of millimeters at the shoulder, so
// they read as attached with no visible seam. Keeping arms separate
// avoids a single very non-convex polygon where an outward-and-back
// limb loop can nearly self-touch and confuse triangulation into
// rendering a hollow limb — simple standalone shapes are easy to keep
// correct and match the "no complex sculpting" brief.
//
// Coordinate convention: X is left(-)/right(+), Y is up, origin (0,0) is
// the bottom-center of the doll (between the feet, on the ground plane).
// Isolated dress-up prototype — does not affect Keychain/Clicker/Beads.
// =====================================================================

export const DOLL_HEIGHT_MM = 135;

// Named silhouette landmarks (mm). Chibi proportions: oversized head,
// small simple torso/limbs.
export const PROPORTIONS = {
  footHeight: 8,
  footHalfWidthOuter: 10,
  footHalfWidthInner: 3, // half-gap between feet/legs
  hipY: 50,
  legHalfWidthOuter: 9.5,
  waistY: 65,
  waistHalfWidth: 13,
  shoulderY: 78,
  shoulderHalfWidth: 18,
  neckHalfWidth: 8,
  neckY: 84,
  headRadiusX: 24,
  headRadiusY: 27,
  headSegments: 10, // per side, for a smooth-enough printable curve
};

// Simple capsule arm: a straight-topped band (the part that overlaps
// the torso) with a single rounded end (the hand). One arm half-width
// throughout — no separate wider/narrower hand — to keep it a plainly
// convex, self-intersection-proof shape.
export const ARM_PROPORTIONS = {
  innerX: 14, // overlaps inside the torso outline at the shoulder
  outerX: 30,
  topY: 80, // above shoulderY, so the overlap fully covers the seam
  handBottomY: 54,
  handCornerSegments: 8,
};

function ovalPoint(cx, cy, rx, ry, angleDeg) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
}

/**
 * Builds the right-side half of the body silhouette (no arms), from the
 * crotch notch (bottom, on the centerline) up around the outer body,
 * shoulder, and head, ending at the top-center of the head.
 */
function buildRightHalf(p) {
  const pts = [];
  const push = (x, y) => pts.push({ x, y });

  // Crotch notch (top of the leg gap, at the hip line).
  push(0, p.hipY);
  push(p.footHalfWidthInner, p.hipY);
  // Down the inner edge of the right leg to the foot.
  push(p.footHalfWidthInner, p.footHeight);
  // Foot: flat bottom with rounded corners, approximated with short
  // chamfer segments (kept as straight lines — simple, FDM-friendly).
  push(p.footHalfWidthInner + 1, 1);
  push(p.footHalfWidthOuter - 1, 0);
  push(p.footHalfWidthOuter, 1);
  // Up the outer edge of the leg to the hip, then the torso side.
  push(p.footHalfWidthOuter, p.footHeight);
  push(p.legHalfWidthOuter, p.hipY);
  push(p.waistHalfWidth, p.waistY);
  push(p.shoulderHalfWidth, p.shoulderY);

  // Neck.
  push(p.neckHalfWidth, p.neckY);

  // Head: sample a smooth oval from the jaw/neck join up to the crown.
  const headCenterY = DOLL_HEIGHT_MM - p.headRadiusY;
  // Angle (degrees, 0 = +X axis, 90 = top) where the oval meets the neck.
  const jawAngle =
    (Math.asin((p.neckY - headCenterY) / p.headRadiusY) * 180) / Math.PI;
  for (let i = 1; i <= p.headSegments; i++) {
    const angle = jawAngle + ((90 - jawAngle) * i) / p.headSegments;
    const pt = ovalPoint(0, headCenterY, p.headRadiusX, p.headRadiusY, angle);
    push(pt.x, pt.y);
  }

  return pts;
}

/**
 * Full closed-loop body outline (no arms): right half (bottom-center to
 * top-center), then the mirrored left half (top-center back to
 * bottom-center).
 */
export function buildBodyOutline(overrides = {}) {
  const p = { ...PROPORTIONS, ...overrides };
  const right = buildRightHalf(p);
  const left = right
    .slice(0, -1) // drop the top-center point (shared with the right half)
    .reverse()
    .map(({ x, y }) => ({ x: -x, y }));
  return [...right, ...left];
}

/**
 * One arm's outline: a simple capsule, straight-topped, rounded at the
 * hand. `side` is +1 for the right arm or -1 for the left arm — flips
 * which edge (innerX vs outerX) is which so the rounded hand end is
 * always on the outward side.
 */
export function buildArmOutline(side, overrides = {}) {
  const a = { ...ARM_PROPORTIONS, ...overrides };
  const inner = side * a.innerX;
  const outer = side * a.outerX;
  const pts = [];
  const push = (x, y) => pts.push({ x, y });

  push(inner, a.topY);
  push(outer, a.topY);
  push(outer, a.handBottomY);

  // Rounded hand end: a half-oval sampled from the outer edge, under
  // the hand, to the inner edge.
  const cx = (inner + outer) / 2;
  const rx = Math.abs(outer - inner) / 2;
  const cy = a.handBottomY;
  for (let i = 1; i < a.handCornerSegments; i++) {
    // angle 0 = outer edge (x=outer, y=topY-side of the hand), sweeping
    // down and across to angle 180 = inner edge.
    const rad = (Math.PI * i) / a.handCornerSegments;
    push(cx + side * rx * Math.cos(rad), cy - rx * Math.sin(rad));
  }

  push(inner, a.handBottomY);
  return pts;
}

export function outlineBounds(points) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const { x, y } of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}
