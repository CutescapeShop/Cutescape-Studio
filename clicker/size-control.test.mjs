import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadClickerModules } from "../tools/clicker-test-modules.mjs";
import { SYNTHETIC_FIXTURES, syntheticSquirrel } from "./fixtures/synthetic-images.mjs";

const m = await loadClickerModules();
const p = m["stem-profile"].CLICKER_PROFILE;
const k = m["keycap-geometry"];
const fixtures = JSON.parse(await readFile(new URL("./fixtures/top-reference.json", import.meta.url)));
const topBaseline = JSON.parse(await readFile(new URL("./fixtures/top-xy-baseline.json", import.meta.url)));
for (const [name, build] of [["Bird (synthetic)", SYNTHETIC_FIXTURES.Bird], ["squirrel (synthetic)", syntheticSquirrel]]) {
  fixtures[name] = { loops: m["image-processing"].processImageToPaths(build(), { smoothing: 1 }).loops };
}
const near = (a, b, message, tolerance = 1e-5) => assert.ok(Math.abs(a - b) < tolerance, `${message}: ${a} vs ${b}`);
// Independent segment-distance checks include edge interiors and crossings,
// not only polygon vertices. Offsets use 0.002 mm arcs and 0.001 mm rounding.
const xyTolerance = 0.006;
function pointSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function segmentDistance(a, b, c, d) {
  const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return 0;
  return Math.min(pointSegment(a, c, d), pointSegment(b, c, d), pointSegment(c, a, b), pointSegment(d, a, b));
}
function boundaryDistance(first, second) {
  let distance = Infinity;
  for (const a of first) for (const b of second)
    for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++)
      distance = Math.min(distance, segmentDistance(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length]));
  return distance;
}
function closed(geometry) {
  const a = geometry.attributes.position.array;
  const edges = new Map();
  for (let i = 0; i < a.length; i += 9) {
    const vertices = [0, 3, 6].map((j) => Array.from(a.slice(i + j, i + j + 3), (v) => Math.round(v * 1e5)).join(","));
    assert.equal(new Set(vertices).size, 3, "no collapsed mesh triangles");
    for (let j = 0; j < 3; j++) {
      const a = vertices[j], b = vertices[(j + 1) % 3], key = [a, b].sort().join("|");
      const edge = edges.get(key) ?? [0, 0];
      edge[0]++; edge[1] += a < b ? 1 : -1; edges.set(key, edge);
    }
  }
  for (const edge of edges.values()) assert.deepEqual(edge, [2, 0], "closed consistently oriented mesh");
}
assert.equal(p.body.targetSize, 35);
assert.equal(p.body.minSizeMM, 35);
assert.equal(p.body.maxSizeMM, 100);

for (const [name, fixture] of Object.entries(fixtures)) for (const size of [20, 35, 70]) {
  const fit = m["geometry-math"].computeAutoFitTransform(fixture.loops, size, size);
  const art = k.createTopBaseGeometries(fixture.loops, fit, 1, 0, p.topBase.thicknessMM);
  const bounds = new m.three.Box3();
  for (const geometry of art) { geometry.computeBoundingBox(); bounds.union(geometry.boundingBox); }
  const dimensions = bounds.getSize(new m.three.Vector3());
  near(Math.max(dimensions.x, dimensions.y), size, `${name} artwork longest side`);
  near(dimensions.x / dimensions.y, fit.rawWidthPx / fit.rawHeightPx, `${name} aspect ratio`);
  const shell = k.createTopRearShellGeometries(fixture.loops, fit, 1, p.topShell.bodyDepthMM,
    p.topShell.transitionThicknessMM, p.topShell, p.topSocket);
  const backing = k.createTopTransitionGeometries(fixture.loops, fit, 1, p.topShell.transitionThicknessMM,
    shell.diagnostics.structuralExtension ? shell.outerMMLoops : null);
  const boss = k.createTopPedestalGeometry(shell.outerMMLoops, shell.cavityLoops, p.topSocket,
    p.topShell.bodyDepthMM, p.topShell.transitionThicknessMM, p.topShell.bossKeepOutMM,
    p.topShell.minimumWallMM, shell.pedestalLocation);
  const topHash = createHash("sha256");
  for (const geometry of [...art, ...shell.geometries, ...backing, boss.geometry])
    topHash.update(Buffer.from(geometry.attributes.position.array.buffer));
  assert.equal(topHash.digest("hex"), topBaseline.hashesByThreeRevision[m.three.REVISION][`${name} ${size}`],
    "TOP mesh byte-identical to 555325d on the same Three.js version");
  for (const geometry of [...shell.geometries, ...backing, boss.geometry]) closed(geometry);
  const positions = boss.geometry.attributes.position;
  const vertices = Array.from({ length: positions.count }, (_, i) => ({
    x: positions.getX(i) - boss.location.x, y: positions.getY(i) - boss.location.y,
    depth: -positions.getZ(i) - p.topShell.transitionThicknessMM,
  }));
  near(Math.max(...vertices.map((v) => Math.hypot(v.x, v.y))) * 2, 7.8956, "fixed boss foot diameter");
  near(Math.max(...vertices.map((v) => v.depth)), 5.6374, "fixed rear depth");
  const tip = vertices.filter((v) => v.depth > 5.63);
  near(Math.max(...tip.map((v) => Math.hypot(v.x, v.y))) * 2, 5.5118, "fixed boss tip diameter");
  const socket = tip.filter((v) => Math.hypot(v.x, v.y) < 2.2);
  for (const axis of ["x", "y"]) {
    near(Math.max(...socket.map((v) => v[axis])) - Math.min(...socket.map((v) => v[axis])), 4.0386, "fixed socket envelope");
    near(Math.min(...socket.map((v) => Math.abs(v[axis]))) * 2, 1.1938, "fixed socket arm");
  }
  assert.equal(shell.warnings.length, 0, "no lost cavity");
  const diagnostics = {};
  const housing = m["housing-geometry"].createHousingGeometries(fixture.loops, fit, 1, p.housing,
    diagnostics, boss.location, shell.outerMMLoops);
  assert.ok(diagnostics.functionalOuterIndex >= 0, "switch pocket always retained");
  assert.equal(diagnostics.chamberLoopsUsed, 1);
  const chambers = diagnostics.chamberLoopsMM;
  const inside = (point, loops) => loops.some((loop) => m["geometry-math"].pointInPolygon(point, loop));
  for (const loop of shell.outerMMLoops) for (const point of loop)
    assert.ok(inside(point, chambers), `${name} ${size}: complete structural TOP inside chamber`);
  for (const geometry of [...art, ...shell.geometries, ...backing, boss.geometry]) {
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++)
      assert.ok(inside({ x: position.getX(i), y: position.getY(i) }, chambers), "full moving mesh projection inside chamber");
  }
  const clearance = boundaryDistance(shell.outerMMLoops, chambers);
  assert.ok(clearance >= 0.4 - xyTolerance, `${name} ${size}: XY clearance ${clearance}`);
  near(clearance, 0.4, "fixed 0.4 mm per-side clearance", xyTolerance);
  const wall = boundaryDistance(chambers, diagnostics.housingOuterMMLoops);
  assert.ok(wall >= 3.2 - xyTolerance, `${name} ${size}: wall ${wall}`);
  near(wall, 3.2, "3.2 mm chamber-derived wall", xyTolerance);
  for (const loop of chambers) for (const point of loop)
    assert.ok(inside(point, diagnostics.housingOuterMMLoops), "chamber contained in outer wall");
  // The old functional opening may share edges with the new union. Its
  // vertices must lie inside or on that union, never outside it.
  for (const point of diagnostics.functionalChamberLoopMM) {
    assert.ok(inside(point, chambers) || chambers.some((loop) => loop.some((a, i) =>
      pointSegment(point, a, loop[(i + 1) % loop.length]) <= 0.002)), "functional clearance retained");
  }
  near(diagnostics.pocketBounds.maxX - diagnostics.pocketBounds.minX, 15.8, "fixed pocket width");
  near(diagnostics.pocketBounds.maxY - diagnostics.pocketBounds.minY, 15.7, "fixed pocket depth");
  assert.deepEqual(diagnostics.zRanges, { floor: [0, 1.6], pocket: [1.6, 9.45],
    plate: [9.45, 10.899999999999999], chamber: [10.899999999999999, 17.237] });
  assert.equal(diagnostics.openEdges, 0);
  assert.equal(diagnostics.nonManifoldEdges, 0);
  for (const geometry of housing) closed(geometry);
  const exportGroup = new m.three.Group();
  for (const geometry of housing) exportGroup.add(new m.three.Mesh(geometry));
  exportGroup.updateMatrixWorld(true);
  const stl = new m.STLExporter().parse(exportGroup, { binary: true });
  const triangleCount = housing.reduce((sum, geometry) => sum + geometry.attributes.position.count / 3, 0);
  assert.equal(stl.getUint32(80, true), triangleCount, "all housing triangles exported");
  assert.equal(stl.byteLength, 84 + 50 * triangleCount, "valid binary STL length");
  let triangle = 0;
  for (const geometry of housing) {
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i += 3, triangle++) for (let j = 0; j < 3; j++) {
      const offset = 84 + triangle * 50 + 12 + j * 12;
      assert.ok(stl.getFloat32(offset, true) === position.getX(i + j), "STL X preserved");
      assert.ok(stl.getFloat32(offset + 4, true) === position.getY(i + j), "STL Y preserved");
      assert.ok(stl.getFloat32(offset + 8, true) === position.getZ(i + j), "STL Z preserved");
    }
  }
  if (fixture.baseline) {
    assert.equal(diagnostics.functionalBlockExtended, size === 20, "minimum block only when needed");
    assert.equal(shell.diagnostics.structuralExtension, size === 20, "TOP support only when needed");
  }
  console.log(`${name} ${size} mm: clearance=${clearance.toFixed(4)} mm; wall=${wall.toFixed(4)} mm; fixed MX mechanics; closed TOP/HOUSING`);
}
