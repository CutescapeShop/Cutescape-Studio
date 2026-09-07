import ClipperLib from "https://cdn.jsdelivr.net/npm/clipper-lib@6.4.2/+esm";

const SCALE = 1000;
function path(loop) {
  const points = loop.map((p) => ({ X: Math.round(p.x * SCALE), Y: Math.round(p.y * SCALE) }));
  if (!ClipperLib.Clipper.Orientation(points)) points.reverse();
  return points;
}

// Structural unions fill enclosed image details and retain disconnected islands.
export function unionMechanicalRegions(loops) {
  const clipper = new ClipperLib.Clipper();
  clipper.AddPaths(loops.map(path), ClipperLib.PolyType.ptSubject, true);
  const result = new ClipperLib.Paths();
  clipper.Execute(ClipperLib.ClipType.ctUnion, result,
    ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return ClipperLib.Clipper.CleanPolygons(result, 0.001 * SCALE)
    .filter((p) => ClipperLib.Clipper.Orientation(p))
    .map((p) => p.map((v) => ({ x: v.X / SCALE, y: v.Y / SCALE })));
}

export function containsMechanicalRegion(outers, inner) {
  if (!outers.length) return false;
  const clipper = new ClipperLib.Clipper();
  clipper.AddPath(path(inner), ClipperLib.PolyType.ptSubject, true);
  clipper.AddPaths(outers.map(path), ClipperLib.PolyType.ptClip, true);
  const outside = new ClipperLib.Paths();
  clipper.Execute(ClipperLib.ClipType.ctDifference, outside,
    ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return outside.length === 0;
}
