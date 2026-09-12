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
// Every joint (hip, waist, shoulder, arm corners) is filleted with a
// small rounded corner via roundedPolyline() below, instead of a sharp
// polygon vertex — a paper-doll-style soft, chubby silhouette rather
// than a stiff/angular one.
//
// Coordinate convention: X is left(-)/right(+), Y is up, origin (0,0) is
// the bottom-center of the doll (between the feet, on the ground plane).
// Isolated dress-up prototype — does not affect Keychain/Clicker/Beads.
// =====================================================================

export const DOLL_HEIGHT_MM = 135;

// Named silhouette landmarks (mm). Chibi proportions: oversized head,
// short soft torso, short chubby limbs — modeled after traditional
// paper-doll/embroidered-doll references (not a copy of any specific
// character artwork).
export const PROPORTIONS = {
  footHeight: 8,
  footHalfWidthOuter: 12,
  footHalfWidthInner: 3, // half-gap between feet/legs
  hipY: 42,
  legHalfWidthOuter: 12,
  waistY: 56,
  waistHalfWidth: 17,
  shoulderY: 68,
  shoulderHalfWidth: 23,
  neckHalfWidth: 11,
  neckY: 74, // very short neck — head sits almost directly on the shoulders
  headRadiusX: 28,
  headRadiusY: 32,
  headSegments: 14, // per side, for a smooth-enough printable curve
  cornerRadius: 3.5, // fillet radius applied to torso/leg joints
  cornerSegments: 5,
};

// Simple capsule arm: short and chubby, with its two top corners
// filleted and a fully rounded hand end. One arm half-width throughout
// (no separate wider/narrower hand) to keep it a plainly convex,
// self-intersection-proof shape.
export const ARM_PROPORTIONS = {
  innerX: 16, // overlaps inside the torso outline at the shoulder
  outerX: 34,
  topY: 70, // above shoulderY, so the overlap fully covers the seam
  handBottomY: 52,
  handCornerSegments: 10,
  cornerRadius: 3,
  cornerSegments: 4,
};

function ovalPoint(cx, cy, rx, ry, angleDeg) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
}

function quadraticBezierPoint(p0, p1, p2, t) {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
}

/**
 * Replaces every interior vertex of a straight polyline with a small
 * rounded fillet (a quadratic-bezier corner cut back by `radius` along
 * each adjacent edge, clamped so it never eats more than half of a
 * short edge). Endpoints are kept exact so pieces still join cleanly.
 */
export function roundedPolyline(keyPoints, radius, segments) {
  const out = [keyPoints[0]];
  for (let i = 1; i < keyPoints.length - 1; i++) {
    const prev = keyPoints[i - 1];
    const corner = keyPoints[i];
    const next = keyPoints[i + 1];
    const dPrev = Math.hypot(corner.x - prev.x, corner.y - prev.y);
    const dNext = Math.hypot(next.x - corner.x, next.y - corner.y);
    const r = Math.min(radius, dPrev / 2, dNext / 2);
    const p1 = {
      x: corner.x + ((prev.x - corner.x) / dPrev) * r,
      y: corner.y + ((prev.y - corner.y) / dPrev) * r,
    };
    const p2 = {
      x: corner.x + ((next.x - corner.x) / dNext) * r,
      y: corner.y + ((next.y - corner.y) / dNext) * r,
    };
    out.push(p1);
    for (let s = 1; s < segments; s++) {
      out.push(quadraticBezierPoint(p1, corner, p2, s / segments));
    }
    out.push(p2);
  }
  out.push(keyPoints[keyPoints.length - 1]);
  return out;
}

/**
 * Builds the right-side half of the body silhouette (no arms), from the
 * crotch notch (bottom, on the centerline) up around the outer body,
 * shoulder, and head, ending at the top-center of the head.
 */
function buildRightHalf(p) {
  // Straight key vertices for the crotch/leg/torso run, rounded below.
  const keyPoints = [
    { x: 0, y: p.hipY }, // crotch notch
    { x: p.footHalfWidthInner, y: p.hipY },
    { x: p.footHalfWidthInner, y: p.footHeight },
    { x: p.footHalfWidthInner, y: 0 }, // inner-bottom of foot
    { x: p.footHalfWidthOuter, y: 0 }, // outer-bottom of foot
    { x: p.footHalfWidthOuter, y: p.footHeight },
    { x: p.legHalfWidthOuter, y: p.hipY },
    { x: p.waistHalfWidth, y: p.waistY },
    { x: p.shoulderHalfWidth, y: p.shoulderY },
    { x: p.neckHalfWidth, y: p.neckY },
  ];
  const pts = roundedPolyline(keyPoints, p.cornerRadius, p.cornerSegments);

  // Head: sample a smooth oval from the jaw/neck join up to the crown.
  const headCenterY = DOLL_HEIGHT_MM - p.headRadiusY;
  // Angle (degrees, 0 = +X axis, 90 = top) where the oval meets the neck.
  const jawAngle =
    (Math.asin((p.neckY - headCenterY) / p.headRadiusY) * 180) / Math.PI;
  for (let i = 1; i <= p.headSegments; i++) {
    const angle = jawAngle + ((90 - jawAngle) * i) / p.headSegments;
    const pt = ovalPoint(0, headCenterY, p.headRadiusX, p.headRadiusY, angle);
    pts.push(pt);
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
 * One arm's outline: a short, chubby capsule with its two top (shoulder)
 * corners filleted and a fully rounded hand end. `side` is +1 for the
 * right arm or -1 for the left arm — flips which edge (innerX vs
 * outerX) is which so the rounded hand end is always on the outward
 * side.
 */
export function buildArmOutline(side, overrides = {}) {
  const a = { ...ARM_PROPORTIONS, ...overrides };
  const inner = side * a.innerX;
  const outer = side * a.outerX;

  const keyPoints = [
    { x: inner, y: a.topY },
    { x: outer, y: a.topY },
    { x: outer, y: a.handBottomY },
  ];
  const pts = roundedPolyline(keyPoints, a.cornerRadius, a.cornerSegments);

  // Rounded hand end: a half-oval sampled from the outer edge, under
  // the hand, to the inner edge.
  const cx = (inner + outer) / 2;
  const rx = Math.abs(outer - inner) / 2;
  const cy = a.handBottomY;
  for (let i = 1; i < a.handCornerSegments; i++) {
    // angle 0 = outer edge, sweeping down and across to angle 180 = inner edge.
    const rad = (Math.PI * i) / a.handCornerSegments;
    pts.push({
      x: cx + side * rx * Math.cos(rad),
      y: cy - rx * Math.sin(rad),
    });
  }

  pts.push({ x: inner, y: a.handBottomY });
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
