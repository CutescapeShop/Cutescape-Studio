// Reversible presentation experiment. Operates only on structural outer loops;
// artwork/color contours and the original physical artwork transform are inputs
// that must never be replaced by this result.
import ClipperLib from "../vendor/clipper-lib-6.4.2.esm.js";
import { signedArea2D } from "./geometry-math.js";

export function smoothBorderPrototype(loops, mmPerPixel) {
  if (!(mmPerPixel > 0)) throw new Error("Border requires a physical scale");
  const scale = 10000;
  const paths = loops.filter(loop => signedArea2D(loop) > 0).map(loop =>
    loop.map(p => ({ X: Math.round(p.x * mmPerPixel * scale), Y: Math.round(p.y * mmPerPixel * scale) })));
  const offset = new ClipperLib.ClipperOffset(2, .005 * scale);
  offset.AddPaths(paths, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
  const expanded = [];
  offset.Execute(expanded, 1.5 * scale);
  return expanded.filter(path => ClipperLib.Clipper.Area(path) > 0).map(path => {
    // Uniform physical sampling removes the pixel-dependent control spacing.
    // Corner cutting fairs the OFFSET, not the artwork; the nominal 1.5 mm
    // envelope changes by less than one sampling step near a sharp corner.
    let points = [];
    for (let i = 0; i < path.length; i++) {
      const a = path[i], b = path[(i + 1) % path.length];
      const count = Math.max(1, Math.ceil(Math.hypot(b.X - a.X, b.Y - a.Y) / (.08 * scale)));
      for (let j = 0; j < count; j++) points.push({ x: (a.X + (b.X - a.X) * j / count) / scale, y: (a.Y + (b.Y - a.Y) * j / count) / scale });
    }
    for (let pass = 0; pass < 3; pass++) points = points.flatMap((a, i) => {
      const b = points[(i + 1) % points.length];
      return [{ x: .75 * a.x + .25 * b.x, y: .75 * a.y + .25 * b.y }, { x: .25 * a.x + .75 * b.x, y: .25 * a.y + .75 * b.y }];
    });
    // Corner cutting inserts many exactly straight intermediate samples.
    // Remove that redundancy before extrusion: almost-collinear triangles
    // otherwise collapse in Float32 STL coordinates. The 0.00001 mm cleanup
    // tolerance is far below the offset's 0.005 mm tessellation tolerance.
    const cleanScale = 1e6;
    const cleaned = ClipperLib.Clipper.CleanPolygon(points.map(p => ({
      X: Math.round(p.x * cleanScale), Y: Math.round(p.y * cleanScale),
    })), .00001 * cleanScale);
    return cleaned.map(p => ({ x: p.X / cleanScale / mmPerPixel, y: p.Y / cleanScale / mmPerPixel }));
  });
}
