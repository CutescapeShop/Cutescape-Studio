import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadClickerModules } from "../tools/clicker-test-modules.mjs";

const modules = await loadClickerModules();
const { CLICKER_PROFILE: profile } = modules["stem-profile"];
const { createTopRearShellGeometries, createTopPedestalGeometry } = modules["keycap-geometry"];
const { computeAutoFitTransform, signedArea2D, pointInPolygon } = modules["geometry-math"];
const fixtures = JSON.parse(await readFile(new URL("./fixtures/top-reference.json", import.meta.url)));
const near = (actual, expected, tolerance, label) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);

function assertClosedMesh(geometry) {
  const p = geometry.attributes.position;
  const edges = new Map();
  let volume = 0;
  for (let i = 0; i < p.count; i += 3) {
    const v = [0, 1, 2].map((j) => [p.getX(i + j), p.getY(i + j), p.getZ(i + j)]);
    const keys = v.map((p) => p.map((n) => Math.round(n * 1e5)).join(","));
    assert.equal(new Set(keys).size, 3, "no degenerate triangle vertices");
    for (let j = 0; j < 3; j++) {
      const a = keys[j], b = keys[(j + 1) % 3];
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      const edge = edges.get(key) ?? { count: 0, winding: 0 };
      edge.count++; edge.winding += a < b ? 1 : -1; edges.set(key, edge);
    }
    const [a, b, c] = v;
    volume += (a[0] * (b[1] * c[2] - b[2] * c[1])
      + a[1] * (b[2] * c[0] - b[0] * c[2])
      + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  for (const edge of edges.values()) {
    assert.equal(edge.count, 2, "closed manifold edge");
    assert.equal(edge.winding, 0, "opposing edge directions");
  }
  assert.ok(volume > 0, "outward winding encloses positive volume");
}

for (const [name, fixture] of Object.entries(fixtures)) {
  // Exercise the checkpoint geometry at its original fit independently
  // of the new user-facing size rule.
  const fit = fixture.baseline.fit;
  const shell = createTopRearShellGeometries(fixture.loops, fit, 1,
    profile.topShell.bodyDepthMM, profile.topShell.transitionThicknessMM, profile.topShell, profile.topSocket);
  assert.ok(shell.diagnostics.validInsetLoops > 0, `${name}: silhouette cavity recovered`);
  assert.deepEqual(shell.warnings, [], `${name}: no circular relief fallback`);
  const cavityArea = shell.cavityLoops.reduce((sum, loop) => sum + Math.abs(signedArea2D(loop)), 0);
  const outerArea = shell.outerMMLoops.reduce((sum, loop) => sum + Math.abs(signedArea2D(loop)), 0);
  assert.ok(cavityArea / outerArea > 0.55, `${name}: broad rear cavity`);
  const boss = createTopPedestalGeometry(shell.outerMMLoops, shell.cavityLoops, profile.topSocket,
    profile.topShell.bodyDepthMM, profile.topShell.transitionThicknessMM,
    profile.topShell.bossKeepOutMM, profile.topShell.minimumWallMM, shell.pedestalLocation);
  near(boss.location.x, fixture.baseline.location.x, 1e-12, `${name}: switch X preserved`);
  near(boss.location.y, fixture.baseline.location.y, 1e-12, `${name}: switch Y preserved`);
  assertClosedMesh(boss.geometry);
  for (const geometry of shell.geometries) assertClosedMesh(geometry);

  const positions = boss.geometry.attributes.position;
  const vertices = Array.from({ length: positions.count }, (_, i) => ({
    x: positions.getX(i) - boss.location.x,
    y: positions.getY(i) - boss.location.y,
    depth: -positions.getZ(i) - profile.topShell.transitionThicknessMM,
  }));
  for (const [referenceZ, referenceRadius] of fixture.reference.profile) {
    const ring = vertices.filter((p) => Math.abs(p.depth - (referenceZ - 1.8)) < 1e-4);
    assert.ok(ring.length, `${name}: reference section ${referenceZ}`);
    near(Math.max(...ring.map((p) => Math.hypot(p.x, p.y))), referenceRadius, 0.0002,
      `${name}: measured boss radius at reference Z=${referenceZ}`);
  }
  const socket = vertices.filter((p) => Math.hypot(p.x, p.y) < 2.2);
  for (const axis of ["x", "y"]) {
    near(Math.max(...socket.map((p) => p[axis])) - Math.min(...socket.map((p) => p[axis])),
      4.0386, 1e-5, `${name}: socket envelope ${axis}`);
    near(Math.min(...socket.map((p) => Math.abs(p[axis]))) * 2,
      1.1938, 1e-5, `${name}: socket arm ${axis}`);
  }
  near(Math.max(...vertices.map((p) => p.depth)), fixture.reference.topBounds[2] - 1.8,
    1e-5, `${name}: reference rear depth`);
  // Entire flared foot must be inside the recovered cavity, with real relief.
  for (let i = 0; i < 128; i++) {
    const angle = i * Math.PI * 2 / 128;
    const radius = 3.9478 + profile.topShell.bossKeepOutMM;
    const point = { x: boss.location.x + radius * Math.cos(angle), y: boss.location.y + radius * Math.sin(angle) };
    assert.ok(shell.cavityLoops.some((loop) => pointInPolygon(point, loop)), `${name}: flare clearance`);
  }

  const diagnostics = {};
  const housing = modules["housing-geometry"].createHousingGeometries(fixture.loops, fit, 1,
    profile.housing, diagnostics, boss.location, shell.outerMMLoops);
  assert.equal(diagnostics.chamberSource, "moving-top-clearance-union");
  assert.equal(diagnostics.openEdges, 0);
  assert.equal(diagnostics.nonManifoldEdges, 0);
  console.log(`${name}: reference boss/socket/depth matched; cavity ${(100 * cavityArea / outerArea).toFixed(1)}%; HOUSING closed`);
}
console.log(`TOP mechanics passed with Three.js ${modules.three.REVISION}`);
