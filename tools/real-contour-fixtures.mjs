import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

export async function loadRealContourFixtures() {
  const data = JSON.parse(await readFile(new URL("../clicker/fixtures/real-contours.json", import.meta.url)));
  const decode = ([x, y, steps]) => [...steps].map((step) => {
    const point = { x, y };
    if (step === "E") x++; else if (step === "W") x--; else if (step === "S") y++; else y--;
    return point;
  });
  return Object.fromEntries(Object.entries(data.fixtures).map(([name, fixture]) => [name, {
    ...fixture,
    mechanicalLoops: fixture.mechanicalLoops.map((loop) => loop.map(([x, y]) => ({ x, y }))),
    groups: fixture.groups.map((group) => ({ ...group, loops: group.loops.map(decode) })),
  }]));
}

export function mechanicalHash(m, loops, size) {
  const p = m["stem-profile"].CLICKER_PROFILE, k = m["keycap-geometry"];
  const fit = m["geometry-math"].computeAutoFitTransform(loops, size, size);
  const art = k.createTopBaseGeometries(loops, fit, 1, 0, p.topBase.thicknessMM);
  const shell = k.createTopRearShellGeometries(loops, fit, 1, p.topShell.bodyDepthMM,
    p.topShell.transitionThicknessMM, p.topShell, p.topSocket);
  const backing = k.createTopTransitionGeometries(loops, fit, 1, p.topShell.transitionThicknessMM,
    shell.diagnostics.structuralExtension ? shell.outerMMLoops : null);
  const boss = k.createTopPedestalGeometry(shell.outerMMLoops, shell.cavityLoops, p.topSocket,
    p.topShell.bodyDepthMM, p.topShell.transitionThicknessMM, p.topShell.bossKeepOutMM,
    p.topShell.minimumWallMM, shell.pedestalLocation);
  const housing = m["housing-geometry"].createHousingGeometries(loops, fit, 1, p.housing, {}, boss.location, shell.outerMMLoops);
  const hash = createHash("sha256");
  for (const geometry of [...art, ...shell.geometries, ...backing, boss.geometry, ...housing]) {
    hash.update(Buffer.from(geometry.attributes.position.array.buffer)); geometry.dispose();
  }
  return hash.digest("hex");
}
