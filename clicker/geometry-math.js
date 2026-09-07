// =====================================================================
// clicker/geometry-math.js
//
// Pure math helpers for the Clicker custom-shaped body + image-relief
// geometry. Deliberately has ZERO imports (no THREE, no DOM) so it can
// be unit-tested with plain `node` without a browser or network
// access. keycap-geometry.js and image-geometry.js wrap this into
// actual THREE.BufferGeometry.
//
// Coordinate convention used throughout /clicker/ (fixed per explicit
// spec — do not deviate from this without updating every file below):
//   X, Y = the image plane (the silhouette's own width/height)
//   Z    = thickness
// The body is centered on X=0,Y=0 (auto-fit centers on the
// silhouette's own bounding-box center — see computeAutoFitTransform).
// This is a separate, independent convention from the Name Keychain
// scene in viewer.js — nothing here shares state or assumptions with
// it.
//
// -- Real-switch-housing revision note --
// TOP and BASE are no longer one stacked assembly with a printed
// cross-rib stem on BASE's back. Per direct inspection of a reference
// STL pair (Cat.stl / Cat_Base.stl), this project now assumes a REAL
// MX-compatible switch sits between two independently-printed parts:
//   - TOP carries a solid cylindrical boss with a female cross-socket
//     hole (like the underside of a normal keycap) — see
//     keycap-geometry.js's createTopStemSocketGeometry().
//   - HOUSING is a hollow shell sized to hold that real switch (body
//     cavity + plate cutout + open upper chamber) — see the new
//     housing-geometry.js.
// computeStemRibBoxes() (the old printed-rib-stem generator) is
// removed along with it — that whole approach is cancelled.
//
// -- Coordinate/orientation fix note --
// Shapes are built directly in X/Y (matching ExtrudeGeometry's native
// plane) and stacked along Z purely with .translate() — no rotation
// anywhere in this pipeline (an earlier rotateX(-90deg) approach was
// the source of a real BASE/IMAGE misalignment bug once tested live).
//
// -- Phase 2 revision note --
// This file previously modeled a fixed 18x18mm keyboard-keycap box
// (roundedRectRing / buildKeycapShellTriangles / clampImageTransform
// against a keycap top face). That entire approach was a
// misunderstanding of what "Clicker" means for this shop — corrected
// per the pipeline below, where BASE's outer shape IS the uploaded
// image's silhouette (any shape), not a fixed rectangle. Those
// functions are removed rather than left unused, since they encoded
// assumptions (fixed rounded-rect footprint, "don't overflow the
// keycap top") that no longer apply to anything in this file.
// =====================================================================

/**
 * Signed area of a closed 2D loop (shoelace formula). Positive =
 * counter-clockwise (outer boundary from traceContours), negative =
 * clockwise (hole). Mirrors image-processing.js's signedArea() but
 * kept independent here to avoid a cross-import between the two
 * pipelines.
 */
export function signedArea2D(loop) {
  let sum = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

function polygonBounds(loop) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of loop) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
}

/**
 * Point-in-polygon test (ray casting). Works for the pixel-grid loops
 * produced by traceContours() regardless of winding direction.
 */
export function pointInPolygon(point, loop) {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const xi = loop[i].x, yi = loop[i].y;
    const xj = loop[j].x, yj = loop[j].y;
    const intersects =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Group raw loops (as returned by traceContours in
 * image-processing.js, for EITHER the base silhouette or the detail
 * mask — this function doesn't care which) into shapes: each outer
 * (positive-area) loop paired with the hole loops that fall inside
 * it. A hole is assigned to the SMALLEST-area outer loop that
 * contains it (nearest enclosing shape), so multiple disjoint
 * silhouette regions each keep their own holes rather than everything
 * collapsing onto the single largest shape.
 *
 * @param {Array<Array<{x:number,y:number}>>} loops
 * @returns {Array<{outer: Array, holes: Array<Array>}>}
 */
export function groupLoopsIntoShapes(loops) {
  const outers = [];
  const holes = [];

  for (const loop of loops) {
    if (loop.length < 3) continue;
    const area = signedArea2D(loop);
    if (area > 0) {
      outers.push({ loop, area, bounds: polygonBounds(loop) });
    } else if (area < 0) {
      holes.push({ loop, area: Math.abs(area), bounds: polygonBounds(loop) });
    }
  }

  const shapes = outers.map((o) => ({ outer: o.loop, holes: [], _area: o.area }));

  for (const hole of holes) {
    const testPoint = hole.loop[0];
    let bestIdx = -1;
    let bestArea = Infinity;

    for (let i = 0; i < outers.length; i++) {
      const o = outers[i];
      const b = o.bounds;
      if (
        testPoint.x < b.minX ||
        testPoint.x > b.maxX ||
        testPoint.y < b.minY ||
        testPoint.y > b.maxY
      ) {
        continue;
      }
      if (!pointInPolygon(testPoint, o.loop)) continue;
      if (o.area < bestArea) {
        bestArea = o.area;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0) {
      shapes[bestIdx].holes.push(hole.loop);
    }
    // A hole with no containing outer (shouldn't normally happen for
    // well-formed traceContours output) is dropped defensively rather
    // than crashing.
  }

  return shapes.map(({ outer, holes }) => ({ outer, holes }));
}

/**
 * Group loops by their outer islands while deliberately discarding
 * enclosed holes. Structural backing layers use this to close every
 * internal opening without merging separate silhouette islands.
 */
export function groupLoopsIntoSolidShapes(loops) {
  return groupLoopsIntoShapes(loops).map(({ outer }) => ({ outer, holes: [] }));
}

function pointSegmentDistance(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

// True "does a disk of this radius fit entirely inside the loop" test:
// the center must be inside, and the minimum distance from the center
// to every boundary EDGE must be >= radius. (The previous version only
// sampled 32 points on the circle's own rim and inside-tested each one
// individually — on a dense, irregular photo-traced silhouette, a thin
// notch between two sample angles can sit well inside the sampled
// radius without any sample ever landing on it, so it reported "fits"
// even when the true clearance was much smaller. That's what let a
// margin-widened radius requirement still resolve to the same
// too-tight spot instead of rejecting it.)
function circleInsideLoop(center, radius, loop) {
  if (!pointInPolygon(center, loop)) return false;
  for (let i = 0; i < loop.length; i++) {
    if (pointSegmentDistance(center, loop[i], loop[(i + 1) % loop.length]) < radius) return false;
  }
  return true;
}

function loopCentroid(loop) {
  let totalArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    const cross = a.x * b.y - b.x * a.y;
    totalArea += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  if (Math.abs(totalArea) < 1e-6) {
    return {
      x: loop.reduce((sum, p) => sum + p.x, 0) / loop.length,
      y: loop.reduce((sum, p) => sum + p.y, 0) / loop.length,
    };
  }
  return { x: cx / (3 * totalArea), y: cy / (3 * totalArea) };
}

/**
 * Locate the fixed-size MX pedestal independently from cavity topology.
 * When a valid cavity exists at the standard generated size, prefer a
 * pedestal location inside that cavity; otherwise fall back to the largest
 * body region so the socket still exists in solid-body cases.
 */
export function findPedestalLocation(
  outerLoops,
  cavityLoops,
  radius,
  cavityClearRadius = radius,
  marginMM = 0,
  gridStep = 0.5
) {
  if (!outerLoops || outerLoops.length === 0) return null;
  const mainOuter = outerLoops
    .filter((loop) => loop.length >= 3)
    .sort((a, b) => Math.abs(signedArea2D(b)) - Math.abs(signedArea2D(a)))[0];
  if (!mainOuter) return null;

  const validCavities = (cavityLoops || [])
    .filter((loop) => loop.length >= 3)
    .sort((a, b) => Math.abs(signedArea2D(b)) - Math.abs(signedArea2D(a)));

  for (const cavity of validCavities) {
    const cavityCenter = loopCentroid(cavity);
    if (circleInsideLoop(cavityCenter, radius, mainOuter) && circleInsideLoop(cavityCenter, cavityClearRadius, cavity)) {
      return { x: cavityCenter.x, y: cavityCenter.y, insideCavity: true, clearance: Infinity };
    }
  }

  // The point must clear not just the boss itself but the wall/cavity
  // margin around it (marginMM) — otherwise the boss can end up wedged
  // into a spot barely wide enough for its own radius, with nothing
  // left over for the rear-shell wall that's supposed to surround it
  // (see createTopRearShellGeometries / housing chamber). Below this
  // line, "solid" means clears radius + marginMM; "boss-only" means it
  // clears just radius, kept as a fallback tier so a pedestal is never
  // simply omitted on a very tight silhouette.
  const requiredRadius = radius + marginMM;
  const fallbackCenter = loopCentroid(mainOuter);

  // Fast path: the plain centroid already has room for the boss AND
  // its surrounding margin — skip the full-silhouette search below.
  // Keeps already-well-proportioned bodies (switch naturally lands in
  // an open area) exactly as fast as before this fix.
  if (circleInsideLoop(fallbackCenter, requiredRadius, mainOuter)) {
    return { x: fallbackCenter.x, y: fallbackCenter.y, insideCavity: false, clearance: Infinity };
  }

  const xs = mainOuter.map((point) => point.x);
  const ys = mainOuter.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  // Slow path: the centroid doesn't have enough surrounding room (e.g.
  // it falls in a narrow neck/waist on an asymmetric photo silhouette).
  // Search the full interior for the point with the MOST clearance from
  // the boundary — the mechanically safest spot for the boss + wall,
  // similar to how the reference model's switch sits in the widest part
  // of the body (the "belly") rather than wherever the geometric
  // centroid happens to fall. The MX pedestal/socket boss is a
  // required, always-present solid island — it must never simply be
  // omitted because no point cleared the ideal radius, so the best
  // point found is kept even if it falls short, in three tiers.
  let bestSolid = null; // clears radius + marginMM (fully viable)
  let bestBossOnly = null; // clears radius only (boss fits, margin may not)
  let bestAny = null; // best available clearance, whatever it is
  for (let x = minX; x <= maxX + 1e-9; x += gridStep) {
    for (let y = minY; y <= maxY + 1e-9; y += gridStep) {
      const center = { x, y };
      if (!pointInPolygon(center, mainOuter)) continue;
      let clearance = Infinity;
      for (let i = 0; i < mainOuter.length; i++) {
        clearance = Math.min(clearance, pointSegmentDistance(center, mainOuter[i], mainOuter[(i + 1) % mainOuter.length]));
      }
      const score = clearance * 100 - Math.hypot(x, y);
      if (!bestAny || score > bestAny.score) {
        bestAny = { x, y, clearance, score };
      }
      if (clearance >= radius && (!bestBossOnly || score > bestBossOnly.score)) {
        bestBossOnly = { x, y, clearance, score };
      }
      if (clearance >= requiredRadius && (!bestSolid || score > bestSolid.score)) {
        bestSolid = { x, y, clearance, score };
      }
    }
  }

  if (bestSolid) {
    return { x: bestSolid.x, y: bestSolid.y, insideCavity: false, clearance: bestSolid.clearance };
  }

  if (bestBossOnly) {
    return { x: bestBossOnly.x, y: bestBossOnly.y, insideCavity: false, clearance: bestBossOnly.clearance, constrained: true };
  }

  if (bestAny) {
    return { x: bestAny.x, y: bestAny.y, insideCavity: false, clearance: bestAny.clearance, constrained: true };
  }

  // Degenerate silhouette with no interior grid point at all — still
  // return a location (rather than null) so a pedestal mesh is always
  // produced somewhere.
  return { x: fallbackCenter.x, y: fallbackCenter.y, insideCavity: false, clearance: 0, constrained: true };
}

/**
 * Compute the auto-fit scale + centering offset (in the loops' own
 * pixel-grid units) that inscribes the combined bounding box of
 * `loops` within a `targetWidth` x `targetDepth` rectangle, preserving
 * aspect ratio. Used with targetWidth===targetDepth===body.targetSize
 * to implement "longest side of the silhouette maps to targetSize".
 *
 * @param {Array<Array<{x:number,y:number}>>} loops
 * @param {number} targetWidth mm
 * @param {number} targetDepth mm
 * @returns {{scale:number, centerPxX:number, centerPxY:number, rawWidthPx:number, rawHeightPx:number} | null}
 *   null if loops is empty (nothing to fit).
 */
export function computeAutoFitTransform(loops, targetWidth, targetDepth) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let any = false;

  for (const loop of loops) {
    for (const p of loop) {
      any = true;
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }

  if (!any) return null;

  const rawWidthPx = Math.max(1e-6, maxX - minX);
  const rawHeightPx = Math.max(1e-6, maxY - minY);

  const widthScale = targetWidth / rawWidthPx;
  const depthScale = targetDepth / rawHeightPx;
  // Size describes the artwork's longest side. Mechanical builders add
  // fixed-size support where needed instead of enlarging small artwork.
  const scale = Math.min(widthScale, depthScale);

  return {
    scale,
    centerPxX: (minX + maxX) / 2,
    centerPxY: (minY + maxY) / 2,
    rawWidthPx,
    rawHeightPx,
  };
}

/**
 * Convert one pixel-grid point into the shared world XY mm-space
 * (the image plane — see the coordinate convention note at the top of
 * this file), given an autoFit-derived transform and a user scale
 * multiplier. BASE (outer silhouette) and IMAGE (detail loops) both
 * call this with the SAME transform + scaleMultiplier, which is what
 * keeps them coordinate-locked (same center, same scale) regardless
 * of which loop set is being converted.
 *
 * @param {{x:number,y:number}} pt
 * @param {{centerPxX:number, centerPxY:number, scale:number}} autoFit
 * @param {number} scaleMultiplier user zoom, applied on top of autoFit.scale
 * @returns {{mmX:number, mmY:number}}
 */
export function pxPointToMM(pt, autoFit, scaleMultiplier = 1) {
  const finalScale = autoFit.scale * scaleMultiplier;
  const mmX = (pt.x - autoFit.centerPxX) * finalScale;
  // Flip pixel Y (which points down) so "up in the source photo" comes
  // out as "+Y" in world space — purely a display-orientation choice;
  // BASE and IMAGE both go through this same function, so whichever
  // sign is chosen, they stay consistent with each other.
  const mmY = -(pt.y - autoFit.centerPxY) * finalScale;
  return { mmX, mmY };
}

/**
 * Generate a closed rounded-rectangle polygon centered at the origin,
 * in the same style/winding as roundedRectRing used to be (CCW as
 * viewed from +Z looking down — i.e. positive signedArea2D, so this
 * is directly usable as an "outer" loop or, via a caller reversing it
 * if ever needed, a hole). Used for the switch cavity and plate-cutout
 * footprints in housing-geometry.js — NOT for the outer housing
 * boundary itself, which always comes from the uploaded image's own
 * (offset) silhouette.
 *
 * @param {number} width
 * @param {number} depth
 * @param {number} cornerRadius clamped to fit width/depth
 * @param {number} segmentsPerCorner arc subdivisions per corner (visual only)
 * @returns {Array<{x:number,y:number}>}
 */
export function roundedRectPolygon(width, depth, cornerRadius, segmentsPerCorner = 6) {
  const w = width / 2;
  const d = depth / 2;
  const maxRadius = Math.max(0, Math.min(width, depth) / 2 - 1e-6);
  const r = Math.max(0, Math.min(cornerRadius, maxRadius));

  const corners = [
    { cx: w - r, cy: d - r, startAngle: 0 },
    { cx: -w + r, cy: d - r, startAngle: Math.PI / 2 },
    { cx: -w + r, cy: -d + r, startAngle: Math.PI },
    { cx: w - r, cy: -d + r, startAngle: (3 * Math.PI) / 2 },
  ];

  const points = [];
  for (const corner of corners) {
    if (r === 0) {
      points.push({ x: corner.cx, y: corner.cy });
      continue;
    }
    for (let i = 0; i <= segmentsPerCorner; i++) {
      const angle = corner.startAngle + (i / segmentsPerCorner) * (Math.PI / 2);
      points.push({
        x: corner.cx + r * Math.cos(angle),
        y: corner.cy + r * Math.sin(angle),
      });
    }
  }
  return points;
}

/**
 * Generate a closed circle polygon centered at the origin — used for
 * the TOP stem-socket boss's outer boundary.
 *
 * @param {number} diameter
 * @param {number} segments
 * @returns {Array<{x:number,y:number}>}
 */
export function circlePolygon(diameter, segments = 32) {
  const r = diameter / 2;
  const points = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push({ x: r * Math.cos(angle), y: r * Math.sin(angle) });
  }
  return points;
}

/**
 * Generate a closed "+" (cross) polygon centered at the origin — the
 * female socket hole cut into the TOP boss, sized to receive a real
 * MX-compatible switch's own male cross stem.
 *
 * @param {number} crossWidth overall envelope, tip-to-tip (mm)
 * @param {number} armThickness thickness of each arm (mm)
 * @returns {Array<{x:number,y:number}>} 12-point polygon
 */
export function crossSocketPolygon(crossWidth, armThickness) {
  const R = crossWidth / 2;
  const W = armThickness / 2;
  return [
    { x: R, y: -W }, { x: R, y: W }, { x: W, y: W }, { x: W, y: R },
    { x: -W, y: R }, { x: -W, y: W }, { x: -R, y: W }, { x: -R, y: -W },
    { x: -W, y: -W }, { x: -W, y: -R }, { x: W, y: -R }, { x: W, y: -W },
  ];
}
