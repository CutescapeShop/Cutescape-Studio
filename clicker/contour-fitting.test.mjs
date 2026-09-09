import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadClickerModules } from "../tools/clicker-test-modules.mjs";
import { SYNTHETIC_FIXTURES, syntheticSquirrel } from "./fixtures/synthetic-images.mjs";

const m = await loadClickerModules();
const { fitContourNetwork, CONTOUR_LIMITS_MM: limits } = m["contour-fitting"];
const processing = m["image-processing"];
const math = m["geometry-math"];
const reference = JSON.parse(await readFile(new URL("./fixtures/top-reference.json", import.meta.url)));
const clipperSource = await readFile(new URL("../vendor/clipper-lib-6.4.2.esm.js", import.meta.url), "utf8");
const { default: Clipper } = await import(`data:text/javascript;base64,${Buffer.from(clipperSource).toString("base64")}`);
const epsilon = 1e-8;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
function pointSegment(p, a, b) {
  const length = dist(a, b) ** 2;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / length));
  return dist(p, lerp(a, b, t));
}
function pathDistance(p, points) {
  return Math.min(...points.slice(1).map((b, i) => pointSegment(p, points[i], b)));
}
function clipTopology(loops) {
  const clip = new Clipper.Clipper(), result = new Clipper.PolyTree();
  clip.AddPaths(loops.map((loop) => loop.map((p) => ({ X: Math.round(p.x * 1e6), Y: Math.round(p.y * 1e6) }))), Clipper.PolyType.ptSubject, true);
  clip.Execute(Clipper.ClipType.ctUnion, result, Clipper.PolyFillType.pftNonZero, Clipper.PolyFillType.pftNonZero);
  const signature = (node) => node.Childs().map((child) => [child.IsHole(), signature(child)]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return signature(result);
}
const pointKey = (p) => `${p.x.toFixed(8)},${p.y.toFixed(8)}`;
function collapsedTriangles(geometries) {
  let count = 0;
  for (const geometry of geometries) {
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i += 3) {
      const a = new m.three.Vector3().fromBufferAttribute(position, i);
      const b = new m.three.Vector3().fromBufferAttribute(position, i + 1);
      const c = new m.three.Vector3().fromBufferAttribute(position, i + 2);
      if (b.sub(a).cross(c.sub(a)).lengthSq() <= 1e-18) count++;
    }
  }
  return count;
}
function adjacency(groups) {
  const edges = new Map();
  groups.forEach((group, owner) => group.loops.forEach((loop) => loop.forEach((a, i) => {
    const b = loop[(i + 1) % loop.length], ka = pointKey(a), kb = pointKey(b);
    const key = [ka, kb].sort().join("|");
    if (!edges.has(key)) edges.set(key, new Set());
    edges.get(key).add(owner);
  })));
  return new Set([...edges.values()].filter((owners) => owners.size > 1).map((owners) => [...owners].join(",")));
}
function inspectCurves(result) {
  assert.equal(result.diagnostics.accepted, true, result.diagnostics.reason);
  assert.ok(result.curves.length > 0, "span reconstruction is exercised");
  for (const curve of result.curves) {
    assert.ok(curve.source.length >= 3, "one curve replaces a run, not one corner");
    assert.ok(curve.budget <= limits.displacement + epsilon);
    assert.ok(curve.budget <= curve.featureWidth / 4 + epsilon);
    if (curve.thin) assert.ok(curve.budget <= limits.thinDetail + epsilon);
    for (let j = 1; j < curve.controls.length; j++) {
      const a = curve.controls[j - 1], b = curve.controls[j];
      assert.equal(a[3], b[0], "spline joins reuse the same point");
      for (const axis of ["x", "y"]) {
        assert.ok(Math.abs((a[3][axis] - a[2][axis]) - (b[1][axis] - b[0][axis])) < epsilon, "continuous spline tangent");
        assert.ok(Math.abs((a[3][axis] - 2 * a[2][axis] + a[1][axis]) - (b[2][axis] - 2 * b[1][axis] + b[0][axis])) < epsilon, "continuous spline curvature");
      }
    }
    for (let j = 1; j < curve.source.length; j++) for (let k = 0; k <= 8; k++) {
      assert.ok(pathDistance(lerp(curve.source[j - 1], curve.source[j], k / 8), curve.points) <= curve.sourceBudgets[j - 1] + epsilon, "local detail bound, not a whole-run maximum");
    }
    for (const c of curve.controls) for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      const q = lerp(lerp(lerp(c[0],c[1],t),lerp(c[1],c[2],t),t),
        lerp(lerp(c[1],c[2],t),lerp(c[2],c[3],t),t),t);
      assert.ok(pathDistance(q, curve.points) <= limits.chordError + epsilon, "cubic chord error");
    }
    for (let i = 1; i < curve.points.length; i++) {
      assert.ok(dist(curve.points[i-1],curve.points[i]) <= limits.curvedSegmentLength + epsilon);
      for (let j = 0; j <= 10; j++) assert.ok(pathDistance(lerp(curve.points[i-1],curve.points[i],j/10),curve.source) <= curve.budget + epsilon, "entire reconstructed boundary stays in source tube");
    }
    for (let i = 1; i < curve.source.length; i++) for (let j = 0; j <= 10; j++)
      assert.ok(pathDistance(lerp(curve.source[i-1],curve.source[i],j/10),curve.points) <= curve.budget + epsilon, "no source detail shortcut");
  }
}

// Raster facial details, in mm: two eyes (one with a pupil hole), thin
// whiskers, mouth endpoints and a 0.04 mm exterior channel in a C shape.
function detailLoops(center) {
  const pitch = 0.02, width = 180, height = 100, mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const leftEye = (x - 35) ** 2 + (y - 25) ** 2 < 12 ** 2;
    const pupil = (x - 35) ** 2 + (y - 25) ** 2 < 4 ** 2;
    const rightEye = (x - 110) ** 2 + (y - 25) ** 2 < 12 ** 2;
    const whisker = x >= 10 && x <= 65 && Math.abs(y - (50 + Math.floor(x / 4))) <= 1;
    const mouth = x >= 90 && x <= 140 && y >= 60 && y <= 63;
    const ring = x >= 150 && x <= 175 && y >= 45 && y <= 85 && !(x > 154 && x < 171 && y > 49 && y < 81);
    const channel = x >= 169 && y >= 63 && y <= 64;
    mask[y * width + x] = +((leftEye && !pupil) || rightEye || whisker || mouth || (ring && !channel));
  }
  return processing.traceContours(mask, width, height).map((loop) => loop.map((p) => ({
    x: center.x + (p.x - width / 2) * pitch,
    y: center.y + (p.y - height / 2) * pitch,
  })));
}
function interiorCenter(loops) {
  const points = loops.flat(), xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys), maxX = Math.max(...xs), maxY = Math.max(...ys);
  let best = null, bestDistance = 0;
  for (let x = 1; x < 15; x++) for (let y = 1; y < 15; y++) {
    const p = { x: minX + (maxX - minX) * x / 15, y: minY + (maxY - minY) * y / 15 };
    if (!loops.some((loop) => math.signedArea2D(loop) > 0 && math.pointInPolygon(p, loop))) continue;
    const gap = Math.min(...loops.map((loop) => pathDistance(p, [...loop, loop[0]])));
    if (gap > bestDistance) { best = p; bestDistance = gap; }
  }
  assert.ok(bestDistance > 2, "facial detail fixture fits inside silhouette");
  return best;
}
const fixtures = { Cat: reference.Cat.loops, Fish: reference.Fish.loops };
for (const [name, build] of [["Bird (synthetic)", SYNTHETIC_FIXTURES.Bird], ["squirrel (synthetic)", syntheticSquirrel]])
  fixtures[name] = processing.processImageToPaths(build(), { smoothing: 1 }).loops;

for (const [name, source] of Object.entries(fixtures)) for (const size of [20, 35, 70]) {
  const fit = math.computeAutoFitTransform(source, size, size);
  const exterior = source.map((loop) => loop.map((p) => ({ x: p.x * fit.scale, y: p.y * fit.scale })));
  const center = interiorCenter(exterior), features = detailLoops(center);
  const groups = [
    { id: "mechanical-exterior", loops: exterior, locked: true },
    { id: "background", loops: [...exterior, ...features.map((loop) => [...loop].reverse())] },
    { id: "face", loops: features },
  ];
  const original = JSON.stringify(groups);
  const fitted = fitContourNetwork(groups, 1);
  inspectCurves(fitted);
  assert.equal(JSON.stringify(groups), original, "input contours never mutated");
  assert.deepEqual(fitted.groups[0], groups[0], "mechanical silhouette byte-identical");
  assert.deepEqual(adjacency(fitted.groups), adjacency(groups), "shared color adjacency unchanged");
  groups.forEach((group, i) => {
    assert.equal(fitted.groups[i].loops.length, group.loops.length, "no lost loops");
    assert.deepEqual(clipTopology(fitted.groups[i].loops), clipTopology(group.loops), "islands, holes and nesting unchanged");
  });
  // Sample the open C-channel from its interior to the exterior. Closing
  // or repairing this notch would cover one of these points.
  for (let x = 160; x <= 179; x++) {
    const point = { x: center.x + (x - 90) * 0.02, y: center.y + (63.5 - 50) * 0.02 };
    assert.ok(!fitted.groups[2].loops.some((loop) => math.pointInPolygon(point, loop)), "exterior channel stays open");
  }
  for (const loop of features) {
    const xs = loop.map((p) => p.x), ys = loop.map((p) => p.y);
    const extrema = loop.filter((p) => p.x === Math.min(...xs) || p.x === Math.max(...xs) || p.y === Math.min(...ys) || p.y === Math.max(...ys));
    for (const point of Math.min(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)) <= .4 ? extrema : []) assert.ok(fitted.groups[2].loops.some((result) => result.some((p) => dist(p, point) < epsilon)), "whisker tips and mouth endpoints pinned");
  }
  console.log(`${name} ${size} mm: ${fitted.diagnostics.fittedSpans} fitted spans; facial holes, tips, shared edges and 0.04 mm channel preserved`);
}

// Real UI entry point: quantize once, fit separately for each physical size.
for (const name of ["Cat", "Fish", "Bird"]) {
  const image = SYNTHETIC_FIXTURES[name](), path = processing.processImageToPaths(image, { smoothing: 1 });
  const fit35 = math.computeAutoFitTransform(path.loops, 35, 35);
  const colors = processing.buildColorRegions(image, path.mask, { k: 4,
    minAreaPx: m["stem-profile"].CLICKER_PROFILE.accent.minRegionAreaMM2 / fit35.scale ** 2, smoothing: 1 });
  for (const size of [20, 35, 70]) {
    const scale = math.computeAutoFitTransform(path.loops, size, size).scale;
    const result = processing.fitArtworkColorRegions(colors, scale);
    assert.equal(result.contourDiagnostics.accepted, true);
    // Straight or sub-tolerance runs legitimately remain original. Positive
    // staircase-removal acceptance is asserted on the real 35 mm fixtures.
    assert.equal(result.dominantColorHex, colors.dominantColorHex);
    assert.deepEqual(result.accentRegions.map((r) => r.colorHex), colors.accentRegions.map((r) => r.colorHex), "palette and color order unchanged");
    for (const region of result.accentRegions) {
      const raw = colors.rawRegions.find((r) => r.colorHex === region.colorHex);
      assert.deepEqual(clipTopology(region.loops), clipTopology(raw.loops), "UI artwork topology preserved");
    }
    const p = m["stem-profile"].CLICKER_PROFILE;
    const parts = m["image-geometry"].createAccentRegionGeometries(result.accentRegions,
      math.computeAutoFitTransform(path.loops, size, size), 1, p.topBase.thicknessMM, p.accent.thicknessMM);
    const rawParts = m["image-geometry"].createAccentRegionGeometries(colors.rawRegions.filter((r) => r.colorHex !== colors.dominantColorHex),
      math.computeAutoFitTransform(path.loops, size, size), 1, p.topBase.thicknessMM, p.accent.thicknessMM);
    assert.deepEqual(parts.map((part) => part.colorHex), result.accentRegions.map((r) => r.colorHex), "export color grouping unchanged");
    for (const part of parts) {
      // Existing Earcut/ExtrudeGeometry caps include collinear triangles even
      // before fitting. Guard against increasing them; changing extrusion or
      // repairing these source contours is outside this task.
      assert.ok(collapsedTriangles(part.geometries) <= collapsedTriangles(rawParts.find((r) => r.colorHex === part.colorHex).geometries),
        `${name} ${size} ${part.colorHex}: collapsed triangles ${collapsedTriangles(part.geometries)} vs raw ${collapsedTriangles(rawParts.find((r) => r.colorHex === part.colorHex).geometries)}`);
      const group = new m.three.Group();
      for (const geometry of part.geometries) {
        group.add(new m.three.Mesh(geometry));
        geometry.computeBoundingBox();
        assert.ok(Math.abs(geometry.boundingBox.min.z - p.topBase.thicknessMM) < 1e-6, "accent Z unchanged");
        assert.ok(Math.abs(geometry.boundingBox.max.z - p.topBase.thicknessMM - p.accent.thicknessMM) < 1e-6, "accent thickness unchanged");
      }
      group.updateMatrixWorld(true);
      const stl = new m.STLExporter().parse(group, { binary: true });
      assert.equal(stl.byteLength, 84 + 50 * stl.getUint32(80, true), "valid fitted artwork STL");
    }
  }
}

const bowTie = [{ id: "invalid", loops: [[{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }, { x: 2, y: 0 }]] }];
const rejected = fitContourNetwork(bowTie, 1);
assert.equal(rejected.diagnostics.accepted, false);
assert.equal(rejected.diagnostics.reason, "source-intersection");
assert.equal(rejected.groups, bowTie, "invalid source is not repaired");
assert.throws(() => fitContourNetwork([], 0), /physical scale/);
console.log("contour-fitting regression tests passed");
