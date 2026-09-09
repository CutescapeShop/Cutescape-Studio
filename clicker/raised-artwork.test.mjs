import assert from "node:assert/strict";
import { loadClickerModules } from "../tools/clicker-test-modules.mjs";
import { loadRealContourFixtures, mechanicalHash } from "../tools/real-contour-fixtures.mjs";

// Focused production-direction checks: real Cat and squirrel, 35 mm only.
const m = await loadClickerModules(), fixtures = await loadRealContourFixtures();
const p = m["stem-profile"].CLICKER_PROFILE, math = m["geometry-math"];
const pointKey = (x, y) => `${x},${y}`;
const edgeKey = (a, b) => [a, b].sort().join("|");

for (const name of ["Cat", "squirrel"]) {
  const f = fixtures[name], original = JSON.stringify(f);
  const fit = math.computeAutoFitTransform(f.mechanicalLoops, 35, 35);
  const fitted = m["contour-fitting"].fitContourNetwork(f.groups, fit.scale);
  assert.equal(fitted.diagnostics.accepted, true);
  const regions = fitted.groups.slice(1).filter(r => r.colorHex !== f.dominant);
  const parts = m["image-geometry"].createAccentRegionGeometries(regions, fit, 1,
    p.topBase.thicknessMM, p.accent.thicknessMM);
  assert.deepEqual(parts.map(r => r.colorHex), regions.map(r => r.colorHex));
  let triangles = 0;
  for (let i = 0; i < parts.length; i++) {
    const loops = regions[i].loops.map(loop => loop.map(q => {
      const { mmX, mmY } = math.pxPointToMM(q, fit, 1);
      return { x: Math.fround(mmX), y: Math.fround(mmY) };
    }));
    const expectedEdges = new Set(loops.flatMap(loop => loop.map((a, j) => {
      const b = loop[(j + 1) % loop.length];
      return edgeKey(pointKey(a.x, a.y), pointKey(b.x, b.y));
    })));
    const actualEdges = new Set(), actualPoints = new Set();
    const expectedPoints = new Set(loops.flat().map(q => pointKey(q.x, q.y)));
    const group = new m.three.Group();
    let capArea = 0;
    for (const geometry of parts[i].geometries) {
      const a = geometry.attributes.position.array;
      for (let j = 0; j < a.length; j += 3) actualPoints.add(pointKey(a[j], a[j + 1]));
      for (let j = 0; j < a.length; j += 9) {
        const v = Array.from(a.slice(j, j + 9));
        assert.ok(v.every(Number.isFinite));
        const xy = [0, 3, 6].map(k => pointKey(v[k], v[k + 1]));
        if (v[2] === v[5] && v[5] === v[8]) {
          capArea += Math.abs((v[3] - v[0]) * (v[7] - v[1]) - (v[4] - v[1]) * (v[6] - v[0])) / 2;
        } else {
          const ends = [...new Set(xy)];
          assert.equal(ends.length, 2, "vertical wall follows one reconstructed contour edge");
          actualEdges.add(edgeKey(...ends));
        }
      }
      group.add(new m.three.Mesh(geometry));
    }
    assert.deepEqual(actualPoints, expectedPoints, "extrusion never retraces, simplifies or moves the fitted boundary");
    assert.deepEqual(actualEdges, expectedEdges, "every smooth shared edge reaches the vertical walls unchanged");
    const expectedArea = Math.abs(loops.reduce((sum, loop) => sum + math.signedArea2D(loop), 0));
    assert.ok(Math.abs(capArea / 2 - expectedArea) < 1e-5, "cap coverage retains holes and small details");
    group.updateMatrixWorld(true);
    const stl = new m.STLExporter().parse(group, { binary: true });
    const count = stl.getUint32(80, true);
    const meshEdges = new Map();
    assert.equal(stl.byteLength, 84 + count * 50);
    for (let j = 0; j < count; j++) {
      const offset = 84 + j * 50;
      const values = Array.from({ length: 12 }, (_, k) => stl.getFloat32(offset + k * 4, true));
      assert.ok(values.every(Number.isFinite), "STL coordinates and normals are finite");
      const v = values.slice(3), u = v.slice(3, 6).map((x, k) => x - v[k]);
      const w = v.slice(6, 9).map((x, k) => x - v[k]);
      assert.ok(Math.hypot(u[1]*w[2]-u[2]*w[1], u[2]*w[0]-u[0]*w[2], u[0]*w[1]-u[1]*w[0]) > 0,
        "no cap triangle may collapse at the final binary STL precision");
      const keys = [0, 3, 6].map(k => v.slice(k, k + 3).join(","));
      for (let k = 0; k < 3; k++) {
        const a = keys[k], b = keys[(k + 1) % 3], id = edgeKey(a, b);
        const edge = meshEdges.get(id) || [0, 0];
        edge[0]++; edge[1] += a < b ? 1 : -1;
        meshEdges.set(id, edge);
      }
    }
    assert.ok([...meshEdges.values()].every(([count, winding]) => count === 2 && winding === 0),
      "raised STL is closed and consistently oriented, including holes");
    triangles += count;
    for (const child of group.children) child.geometry.dispose();
  }
  assert.equal(JSON.stringify(f), original, "source artwork unchanged");
  assert.equal(mechanicalHash(m, f.mechanicalLoops, 35), f.mechanicalHashes[m.three.REVISION][35]);
  console.log(`${name} 35 mm / Three ${m.three.REVISION}: raised walls exactly match fitted contours; cap coverage, ${triangles} valid STL triangles, mechanics baseline passed`);
}
