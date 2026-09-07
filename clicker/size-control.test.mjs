import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadClickerModules } from "../tools/clicker-test-modules.mjs";

const m = await loadClickerModules();
const p = m["stem-profile"].CLICKER_PROFILE;
const k = m["keycap-geometry"];
const fixtures = JSON.parse(await readFile(new URL("./fixtures/top-reference.json", import.meta.url)));
const near = (a, b, message, tolerance = 1e-5) => assert.ok(Math.abs(a - b) < tolerance, `${message}: ${a} vs ${b}`);
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
assert.equal(p.body.minSizeMM, 20);
assert.equal(p.body.maxSizeMM, 70);

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
    diagnostics, boss.location);
  assert.ok(diagnostics.functionalOuterIndex >= 0, "switch pocket always retained");
  assert.equal(diagnostics.chamberLoopsUsed, 1);
  near(diagnostics.pocketBounds.maxX - diagnostics.pocketBounds.minX, 15.8, "fixed pocket width");
  near(diagnostics.pocketBounds.maxY - diagnostics.pocketBounds.minY, 15.7, "fixed pocket depth");
  assert.deepEqual(diagnostics.zRanges, { floor: [0, 1.6], pocket: [1.6, 9.45],
    plate: [9.45, 10.899999999999999], chamber: [10.899999999999999, 17.237] });
  assert.equal(diagnostics.openEdges, 0);
  assert.equal(diagnostics.nonManifoldEdges, 0);
  for (const geometry of housing) closed(geometry);
  assert.equal(diagnostics.functionalBlockExtended, size === 20, "minimum block only when needed");
  assert.equal(shell.diagnostics.structuralExtension, size === 20, "TOP support only when needed");
  console.log(`${name} ${size} mm: exact artwork size/aspect; fixed MX mechanics; closed TOP/HOUSING; extension=${diagnostics.functionalBlockExtended}`);
}
