// =====================================================================
// clicker/image-geometry.js
//
// THREE.js wrapper building CLICKER_ACCENT regions: the K-1
// non-dominant auto-detected colors from image-processing.js's
// buildColorRegions(), each extruded and stacked directly on top of
// TOP_BASE's front face — Z = [topBaseZ, topBaseZ + thicknessMM].
//
// Coordinate convention (fixed — see geometry-math.js header): X/Y is
// the image plane, Z is thickness. Critically, this uses the EXACT
// SAME `autoFit` + `scaleMultiplier` as keycap-geometry.js's
// createBaseBodyGeometries()/createTopBaseGeometries() — that shared
// transform (not a separately-computed one) is what keeps every part
// coordinate-locked in X/Y. No rotation is applied anywhere in this
// file, matching keycap-geometry.js.
//
// Does not create materials or add anything to a scene — that's
// clicker-viewer.js's job. Independent from viewer.js entirely.
// =====================================================================

import * as THREE from "three";

import { groupLoopsIntoShapes, pxPointToMM } from "./geometry-math.js";

function buildShapeFromMMLoops(outer, holes) {
  const shape = new THREE.Shape();
  outer.forEach((p, i) => {
    if (i === 0) shape.moveTo(p.x, p.y);
    else shape.lineTo(p.x, p.y);
  });
  shape.closePath();

  for (const hole of holes) {
    if (hole.length < 3) continue;
    const path = new THREE.Path();
    hole.forEach((p, i) => {
      if (i === 0) path.moveTo(p.x, p.y);
      else path.lineTo(p.x, p.y);
    });
    path.closePath();
    shape.holes.push(path);
  }
  return shape;
}

/**
 * Build every ACCENT color's geometry, grouped by color (a single
 * color can legitimately have several disjoint regions — e.g. eyes on
 * both sides of a face — which all share one exported STL/material).
 *
 * @param {Array<{colorHex:string, loops: Array<Array<{x:number,y:number}>>}>} accentRegions
 *   from image-processing.js's buildColorRegions()
 * @param {{centerPxX:number, centerPxY:number, scale:number}} autoFit
 *   MUST be the same object/values passed to BASE/TOP_BASE builders
 * @param {number} scaleMultiplier MUST match what BASE/TOP_BASE used
 * @param {number} zOffset mm — typically body.height + topBase.thicknessMM
 * @param {number} thicknessMM mm — accent's own thickness
 * @returns {Array<{colorHex:string, geometries: THREE.BufferGeometry[]}>}
 */
export function createAccentRegionGeometries(accentRegions, autoFit, scaleMultiplier, zOffset, thicknessMM) {
  if (!accentRegions || accentRegions.length === 0 || !autoFit) return [];

  const results = [];

  for (const region of accentRegions) {
    const shapes = groupLoopsIntoShapes(region.loops);
    const geometries = [];

    for (const { outer, holes } of shapes) {
      if (outer.length < 3) continue;

      const mmOuter = outer.map((p) => {
        const { mmX, mmY } = pxPointToMM(p, autoFit, scaleMultiplier);
        // Triangulate at the precision used by BufferGeometry and binary STL.
        // Otherwise almost-collinear doubles can form cap triangles that
        // collapse when their vertices are stored as Float32. This produces
        // the same final boundary coordinates, including shared color edges.
        return { x: Math.fround(mmX), y: Math.fround(mmY) };
      });
      const mmHoles = holes.map((hole) =>
        hole.map((p) => {
          const { mmX, mmY } = pxPointToMM(p, autoFit, scaleMultiplier);
          return { x: Math.fround(mmX), y: Math.fround(mmY) };
        })
      );

      const shape = buildShapeFromMMLoops(mmOuter, mmHoles);
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: Math.max(0.05, thicknessMM),
        bevelEnabled: false,
        curveSegments: 1,
      });
      geometry.translate(0, 0, zOffset);
      geometries.push(geometry);
    }

    if (geometries.length > 0) {
      results.push({ colorHex: region.colorHex, geometries });
    }
  }

  return results;
}
