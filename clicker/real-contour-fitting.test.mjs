import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadClickerModules } from "../tools/clicker-test-modules.mjs";
import { loadRealContourFixtures, mechanicalHash } from "../tools/real-contour-fixtures.mjs";

const m = await loadClickerModules(), fixtures = await loadRealContourFixtures();
const { fitContourNetwork, CONTOUR_LIMITS_MM: limits } = m["contour-fitting"];
const clipperSource = await readFile(new URL("../vendor/clipper-lib-6.4.2.esm.js", import.meta.url), "utf8");
const { default: Clipper } = await import(`data:text/javascript;base64,${Buffer.from(clipperSource).toString("base64")}`);
function topology(loops) {
  const clip = new Clipper.Clipper(), tree = new Clipper.PolyTree();
  clip.AddPaths(loops.map((loop) => loop.map((p) => ({ X: Math.round(p.x * 1e6), Y: Math.round(p.y * 1e6) }))), Clipper.PolyType.ptSubject, true);
  clip.Execute(Clipper.ClipType.ctUnion, tree, Clipper.PolyFillType.pftNonZero, Clipper.PolyFillType.pftNonZero);
  const children = (node) => node.Childs().map((child) => [child.IsHole(), children(child)]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return children(tree);
}
function sharedEdges(groups) {
  const edges = new Map(), key = (p) => `${p.x},${p.y}`;
  groups.forEach((group, owner) => group.loops.forEach((loop) => loop.forEach((a, i) => {
    const b = loop[(i + 1) % loop.length], id = [key(a), key(b)].sort().join("|");
    if (!edges.has(id)) edges.set(id, new Set());
    edges.get(id).add(owner);
  })));
  return edges;
}
const adjacency = (edges) => new Set([...edges.values()].filter((owners) => owners.size > 1).map((owners) => [...owners].join(",")));
function pathDistance(p, path) {
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return best;
}
function deviation(path, reference) {
  let maximum = 0;
  for (let i = 1; i < path.length; i++) for (let j = 0; j <= 8; j++) {
    const a = path[i - 1], b = path[i], t = j / 8;
    maximum = Math.max(maximum, pathDistance({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, reference));
  }
  return maximum;
}
function turningEnergy(path) {
  let energy = 0;
  for (let i = 1; i < path.length - 1; i++) {
    const a = path[i - 1], b = path[i], c = path[i + 1];
    const ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y;
    energy += Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy) ** 2;
  }
  return energy;
}

for (const [name, fixture] of Object.entries(fixtures)) {
  const original = JSON.stringify(fixture.groups), originalEdges = sharedEdges(fixture.groups);
  const originalTopology = fixture.groups.map((group) => topology(group.loops));
  for (const size of [20, 35, 70]) {
    const fit = m["geometry-math"].computeAutoFitTransform(fixture.mechanicalLoops, size, size);
    const result = fitContourNetwork(fixture.groups, fit.scale);
    assert.equal(result.diagnostics.accepted, true, `${name} ${size}: ${result.diagnostics.reason}`);
    assert.equal(JSON.stringify(fixture.groups), original, "source artwork never mutated");
    assert.deepEqual(result.groups[0], fixture.groups[0], "mechanical/exterior contour byte-identical");
    assert.deepEqual(result.groups.map((group) => group.colorHex), fixture.groups.map((group) => group.colorHex), "palette unchanged");
    result.groups.forEach((group, i) => {
      assert.equal(group.loops.length, fixture.groups[i].loops.length, "no lost contour or small feature");
      assert.deepEqual(topology(group.loops), originalTopology[i], `${name} ${size}: islands/holes/nesting unchanged`);
      group.loops.forEach((loop, j) => {
        const source = fixture.groups[i].loops[j], xs = source.map((p) => p.x), ys = source.map((p) => p.y);
        const bounds = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
        const outputBounds = [Math.min(...loop.map(p => p.x)), Math.max(...loop.map(p => p.x)), Math.min(...loop.map(p => p.y)), Math.max(...loop.map(p => p.y))];
        bounds.forEach((value, k) => assert.ok(Math.abs(value - outputBounds[k]) * fit.scale <= limits.displacement + 1e-7, "feature extent stays within the physical bound"));
        const outputPoints = new Set(loop.map((p) => `${p.x},${p.y}`));
        for (const point of source) if (Math.min(bounds[1]-bounds[0],bounds[3]-bounds[2])*fit.scale <= .4 && (point.x === bounds[0] || point.x === bounds[1] || point.y === bounds[2] || point.y === bounds[3]))
          assert.ok(outputPoints.has(`${point.x},${point.y}`), "real feature extrema, eye/mouth endpoints and whisker tips retained exactly");
      });
    });
    const outputEdges = sharedEdges(result.groups);
    assert.deepEqual(adjacency(outputEdges), adjacency(originalEdges), "color adjacency unchanged");
    // This complete segmentation has two owners for EVERY internal edge.
    // Checking exact coordinates, not rounded coordinates, catches seams
    // from separately sampled or independently fitted neighboring regions.
    assert.ok([...outputEdges.values()].every((owners) => owners.size >= 2), "all color boundaries remain exactly shared");
    let maxDisplacement = 0, oldEnergy = 0, newEnergy = 0;
    for (const curve of result.curves) {
      const measured = Math.max(deviation(curve.points, curve.source), deviation(curve.source, curve.points));
      assert.ok(measured <= curve.budget + 1e-8, "bidirectional physical displacement");
      assert.ok(curve.budget <= limits.displacement && curve.budget <= curve.featureWidth / 4);
      if (curve.thin) assert.ok(curve.budget <= limits.thinDetail);
      maxDisplacement = Math.max(maxDisplacement, measured);
      oldEnergy += turningEnergy(curve.source); newEnergy += turningEnergy(curve.points);
    }
    assert.ok(result.curves.length > 0, "all sizes reconstruct real curves, including 70 mm");
    if (size === 35) {
      assert.ok(result.curves.length > 0, "real artwork is reconstructed");
      assert.ok(Math.max(...result.curves.map((curve) => curve.source.length)) >= 16, "reconstruction spans many pixels");
      assert.ok(newEnergy < oldEnergy * 0.25, "staircase turns are removed across runs");
    }
    assert.equal(mechanicalHash(m, fixture.mechanicalLoops, size), fixture.mechanicalHashes[m.three.REVISION][size],
      `${name} ${size}: TOP, backing, boss/socket and HOUSING byte-identical to 296f5c7`);
    const p = m["stem-profile"].CLICKER_PROFILE;
    const parts = m["image-geometry"].createAccentRegionGeometries(result.groups.slice(1).filter((r) => r.colorHex !== fixture.dominant),
      fit, 1, p.topBase.thicknessMM, p.accent.thicknessMM);
    for (const part of parts) {
      const group = new m.three.Group();
      for (const geometry of part.geometries) group.add(new m.three.Mesh(geometry));
      group.updateMatrixWorld(true);
      const stl = new m.STLExporter().parse(group, { binary: true });
      assert.equal(stl.byteLength, 84 + 50 * stl.getUint32(80, true), "same binary STL structure");
      for (const mesh of group.children) mesh.geometry.dispose();
    }
    console.log(`${name} ${size} mm: ${result.diagnostics.fittedSpans} spans / ${result.diagnostics.reconstructedEdges} raster edges; max displacement ${maxDisplacement.toFixed(5)} mm; turn energy ${oldEnergy ? (100 * newEnergy / oldEnergy).toFixed(1) + '%' : 'unchanged'}; topology/shared edges/mechanical hashes/STL passed`);
  }
}
