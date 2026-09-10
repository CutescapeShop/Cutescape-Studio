// =====================================================================
// clicker/clicker-viewer.js
//
// "Clicker from Image" — Phase 2: 3D preview + STL export.
//
// Entirely separate THREE.js scene from viewer.js's Name Keychain
// scene: own <canvas> container, own camera/renderer/lights/controls/
// render loop, own materials. Does not import, reference, or modify
// viewer.js / script.js / any Name Keychain DOM element.
//
// Gets the Phase-1 pipeline result (the outer silhouette `loops` AND
// the multi-color `colorRegions`) via a small optional hook,
// window.onClickerPipelineResult, which clicker-ui.js calls after
// every re-run of its pipeline — the same
// expose-on-window-for-cross-module-wiring pattern viewer.js already
// uses (window.set3DBaseColor / window.set3DTextColor for script.js).
//
// -- Real-switch-housing revision note --
// The old flat offset "BASE" backing plate + printed cross-rib stem
// are GONE. Two independently-printed objects now exist:
//   - TOP: TOP_BASE (dominant color, TOP ARTWORK — unchanged) +
//     ACCENT regions (auto-detected colors, unchanged) + a NEW solid
//     boss with a female MX cross-socket on its back face (uses
//     TOP_BASE's own dominant-color material — it's part of the same
//     printed object).
//   - HOUSING: a NEW hollow shell sized to hold a real MX-compatible
//     switch. Uses the color picker that used to be labeled "BASE"
//     (#clickerBaseColors) — same UI, same wiring, just a different
//     printed object underneath it now.
// TOP and HOUSING are exported as separate STL files/groups; a real
// switch (not modeled by us) sits between them when assembled.
//
// Coordinate convention unchanged from the earlier orientation fix:
// X/Y is the image plane, Z is thickness. TOP_BASE/ACCENT/socket and
// HOUSING's outer boundary all share the SAME autoFit + scaleMultiplier
// transform — HOUSING's switch cutouts and the socket boss do NOT
// scale with it (they must always match a real, fixed-size switch —
// see the scale-vs-switch-size caveat in the delivery notes).
// =====================================================================

import * as THREE from "three";

import { OrbitControls } from
  "https://unpkg.com/three@0.167.1/examples/jsm/controls/OrbitControls.js";

import { STLExporter } from
  "https://unpkg.com/three@0.167.1/examples/jsm/exporters/STLExporter.js";

import { CLICKER_PROFILE } from "./stem-profile.js?v=housing-floor-v4";
import { computeAutoFitTransform } from "./geometry-math.js";
import {
  createTopBaseGeometries,
  createTopTransitionGeometries,
  createTopRearShellGeometries,
  createTopPedestalGeometry,
} from "./keycap-geometry.js";
import { createAccentRegionGeometries } from "./image-geometry.js";
import { createHousingGeometries } from "./housing-geometry.js?v=housing-floor-v4";
import { createKeychainLoopGeometry } from "./keychain-loop.js";
import { smoothBorderPrototype } from "./border-prototype.js";
import { createBorderMaterial } from "./border-material.js";
import { CURATED_FILAMENT_PALETTE } from "./color-palette.js";

// Same window.t() TH/EN mechanism as clicker-ui.js / i18n.js — see the
// comment on the identical helper there.
function ct(key, vars, fallback) {
  return window.t ? window.t(key, vars) : fallback;
}


// ---------------- DOM references ----------------

const viewerEl = document.getElementById("clickerViewer3D");

const exportButton = document.getElementById("clickerExportButton");
const exportStatus = document.getElementById("clickerExportStatus");

const housingColorGrid = document.getElementById("clickerHousingColorGrid");

const keychainLoopToggleButton = document.getElementById("clickerKeychainLoopToggle");
const keychainLoopControls = document.getElementById("clickerKeychainLoopControls");
const keychainLoopRotateLeftButton = document.getElementById("clickerKeychainLoopRotateLeft");
const keychainLoopRotateRightButton = document.getElementById("clickerKeychainLoopRotateRight");
const keychainLoopAngleLabel = document.getElementById("clickerKeychainLoopAngle");
const keychainLoopStatus = document.getElementById("clickerKeychainLoopStatus");

const previewModeAssembledButton = document.getElementById("clickerPreviewModeAssembled");
const previewModeExplodedButton = document.getElementById("clickerPreviewModeExploded");

const FIXED_CLICKER_SCALE_MULTIPLIER = 1;

// If the Phase-2 3D markup isn't present, stay inert — mirrors the
// guard clicker-ui.js already uses for Phase-1 markup.
if (viewerEl && exportButton) {
  init();
}

function init() {
  // ---------------- Scene setup (independent from viewer.js) ----------------

  viewerEl.style.width = "100%";
  viewerEl.style.height = "360px";

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#f7f7f7");

  const camera = new THREE.PerspectiveCamera(
    42,
    viewerEl.clientWidth / viewerEl.clientHeight,
    0.1,
    1000
  );
  // Framed wider/further back than before — HOUSING is now up to
  // ~17mm tall on its own (vs. the old flat 6mm backing plate), so
  // the whole preview spans a notably taller Z range.
  camera.position.set(0, 34, 72);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(viewerEl.clientWidth, viewerEl.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  viewerEl.appendChild(renderer.domElement);

  const productGroup = new THREE.Group();
  scene.add(productGroup);

  // Auto-detected dominant color from the image, applied to the whole
  // TOP_BASE fill (see onClickerPipelineResult below). Also used for
  // the socket boss (it's part of the same printed TOP object as
  // TOP_BASE). Falls back to this neutral gray before any image is
  // loaded or if detection didn't produce a usable color.
  const TOP_BASE_FALLBACK_COLOR = "#cccccc";
  const topBaseMaterial = new THREE.MeshStandardMaterial({
    color: TOP_BASE_FALLBACK_COLOR,
    roughness: 0.35,
    metalness: 0.02,
  });

  // User-controlled (via #clickerBaseColors, same UI as before) —
  // now colors the HOUSING instead of the old flat BASE plate.
  const housingMaterial = new THREE.MeshStandardMaterial({
    color: "#f0f0f0",
    roughness: 0.4,
    metalness: 0.02,
  });
  const borderSurface = createBorderMaterial(topBaseMaterial);

  const mainLight = new THREE.DirectionalLight(0xffffff, 2.6);
  mainLight.position.set(20, 35, 55);
  scene.add(mainLight);

  const fillLight = new THREE.DirectionalLight(0xffffff, 1.1);
  fillLight.position.set(-20, 15, 35);
  scene.add(fillLight);

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.35);
  scene.add(ambientLight);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0, 0);
  controls.minDistance = 10;
  controls.maxDistance = 160;

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  function syncRendererSize() {
    const width = viewerEl.clientWidth;
    const height = viewerEl.clientHeight;
    if (width === 0 || height === 0) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  window.addEventListener("resize", syncRendererSize);

  // init() runs at page load, while the Clicker panel is still hidden
  // (display:none collapses viewerEl to 0x0 no matter what size it's
  // told to be), so the very first setSize() above is stuck at 0x0.
  // Switching the product tab later doesn't fire a window "resize"
  // event, so nothing re-measures it — ResizeObserver does, since a
  // hidden-to-visible transition is itself an observed size change.
  if ("ResizeObserver" in window) {
    new ResizeObserver(syncRendererSize).observe(viewerEl);
  }


  // ---------------- Groups ----------------

  const topGroup = new THREE.Group();     // TOP_BASE + socket boss (dominant color)
  const accentGroup = new THREE.Group();  // ACCENT regions (per-color)
  const housingGroup = new THREE.Group(); // HOUSING (user-picked color)
  productGroup.add(topGroup);
  productGroup.add(accentGroup);
  productGroup.add(housingGroup);

  // PREVIEW-ONLY exploded view. The requested gap is measured between
  // the nominal TOP and HOUSING edges, not between their centers.
  // Export explicitly removes these root-group transforms below.
  const PREVIEW_PIECE_GAP_MM = 12.0;

  // PREVIEW-ONLY zero-gap contact: HOUSING rim Z=17.237 minus TOP rear
  // local Z=-6.5874. This is geometric seating, not switch-rest height.
  // TOP/ACCENT share HOUSING's X/Y center. Export cancels this transform
  // (see traverseExportRoot below), same as the exploded offset.
  const ASSEMBLED_Z_LIFT_MM = 23.8244;

  let previewMode = "assembled";

  function disposeGroupChildren(group) {
    group.children.forEach((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else if (child.material !== topBaseMaterial && child.material !== housingMaterial && child.material !== borderSurface.material) {
          // Only dispose materials WE created dynamically per-rebuild
          // (accent materials). The reused materials above must
          // never be disposed here.
          child.material.dispose();
        }
      }
    });
    group.clear();
  }


  // ---------------- State + rebuild ----------------

  const state = {
    outerLoops: null,
    colorRegions: null, // { dominantColorHex, accentRegions: [{colorHex, loops}] }
    silhouetteKey: null,
    colorKey: null,
    sizeMM: CLICKER_PROFILE.body.targetSize,
    // User-chosen print color per DETECTED hex (from clicker-ui.js's color
    // rows). Display/material only — never affects which regions exist,
    // their shape, or the dominant-color selection itself.
    colorOverrides: {},
    disabledColors: new Set(),
    // Optional keychain loop — attaches to HOUSING only (see
    // stem-profile.js's keychainLoop section for why). Populated after
    // every rebuildHousing() with the exact final boundary/cutout loops
    // it computed, so the loop always attaches to what actually printed.
    keychainLoopEnabled: CLICKER_PROFILE.keychainLoop.enabledDefault,
    keychainLoopAngleDeg: CLICKER_PROFILE.keychainLoop.angleDefaultDeg,
    housingLoopDiagnostics: null, // { outerMMLoops, pocketLoopMM, plateLoopMM }
  };

  // Detected accent hex -> its live material, so a color-only override can
  // recolor the existing mesh without rebuilding any geometry.
  const accentMaterialsBySourceHex = new Map();

  function resolvePrintColor(sourceHex) {
    return (state.colorOverrides && state.colorOverrides[sourceHex]) || sourceHex;
  }

  // Re-applies current overrides to already-built materials. Called both
  // when overrides change live and right after any rebuild, so a rebuild
  // triggered by something unrelated (size, threshold) never reverts a
  // color the user already picked.
  function applyColorOverrides() {
    if (state.colorRegions && typeof state.colorRegions.dominantColorHex === "string") {
      topBaseMaterial.color.set(resolvePrintColor(state.colorRegions.dominantColorHex));
    }
    for (const [sourceHex, material] of accentMaterialsBySourceHex) {
      material.color.set(resolvePrintColor(sourceHex));
    }
    borderSurface.material.color.copy(topBaseMaterial.color);
  }

  // The shared transform TOP/ACCENT/HOUSING's outer boundary all use —
  // computed once from the outer silhouette whenever it (or the scale
  // slider) changes.
  let currentAutoFit = null;
  let structuralLoops = null;
  const borderPrototype = document.getElementById("clickerBorderPrototype");
  const borderColorControls = document.getElementById("clickerBorderColorControls");
  const borderColorInput = document.getElementById("clickerBorderColor");
  const syncBorderControl = () => {
    if (borderColorControls) borderColorControls.hidden = borderPrototype?.value !== "border";
  };
  borderColorInput?.addEventListener("input", () => borderSurface.color.set(borderColorInput.value));
  borderPrototype?.addEventListener("change", () => {
    syncBorderControl();
    rebuildAll();
  });
  syncBorderControl();
  let topGeometryWarning = null;
  let topGeometryDiagnostics = null;
  let movingTopMMLoops = null;
  let lastViewerTimings = null;

  function modelingBounds(groups) {
    const bounds = new THREE.Box3();
    for (const group of groups) for (const child of group.children) {
      if (!child.geometry) continue;
      child.geometry.computeBoundingBox();
      bounds.union(child.geometry.boundingBox);
    }
    return bounds;
  }

  function updatePreviewLayout(fitView = false) {
    const topPreviewWidthMM = currentAutoFit
      ? currentAutoFit.rawWidthPx * currentAutoFit.scale * FIXED_CLICKER_SCALE_MULTIPLIER
      : CLICKER_PROFILE.body.targetSize;
    const housingPreviewWidthMM = topPreviewWidthMM + CLICKER_PROFILE.housing.offsetMM * 2;
    const topBounds = modelingBounds([topGroup, accentGroup]);
    const housingBounds = modelingBounds([housingGroup]);
    if (previewMode === "exploded") {
      const previewCenterOffsetMM = fitView && !topBounds.isEmpty() && !housingBounds.isEmpty()
        ? (topBounds.max.x + PREVIEW_PIECE_GAP_MM - housingBounds.min.x) / 2
        : (topPreviewWidthMM / 2 + PREVIEW_PIECE_GAP_MM + housingPreviewWidthMM / 2) / 2;
      topGroup.position.set(-previewCenterOffsetMM, 0, 0);
      accentGroup.position.set(-previewCenterOffsetMM, 0, 0);
      housingGroup.position.set(previewCenterOffsetMM, 0, 0);
    } else {
      topGroup.position.set(0, 0, ASSEMBLED_Z_LIFT_MM);
      accentGroup.position.set(0, 0, ASSEMBLED_Z_LIFT_MM);
      housingGroup.position.set(0, 0, 0);
    }
    if (fitView && !topBounds.isEmpty() && !housingBounds.isEmpty()) {
      const bounds = topBounds.translate(topGroup.position).union(housingBounds.translate(housingGroup.position));
      const center = bounds.getCenter(new THREE.Vector3());
      const direction = camera.position.clone().sub(controls.target).normalize();
      const right = new THREE.Vector3().crossVectors(camera.up, direction).normalize();
      const up = new THREE.Vector3().crossVectors(direction, right).normalize();
      const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const tanX = tanY * Math.max(0.1, camera.aspect);
      let distance = 0;
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          const corner = new THREE.Vector3(x, y, z).sub(center);
          distance = Math.max(distance, corner.dot(direction) + Math.max(
            Math.abs(corner.dot(right)) / tanX, Math.abs(corner.dot(up)) / tanY));
        }
      }
      distance *= 1.12;
      controls.target.copy(center);
      camera.position.copy(center).addScaledVector(direction, distance);
      controls.maxDistance = Math.max(160, distance * 3);
      controls.update();
    }
    console.info("Clicker preview layout", JSON.stringify({
      previewOnly: true,
      mode: previewMode,
      gapMM: PREVIEW_PIECE_GAP_MM,
      topPosition: topGroup.position.toArray(),
      housingPosition: housingGroup.position.toArray(),
    }));
  }

  function setPreviewMode(mode) {
    if (mode !== "assembled" && mode !== "exploded") return;
    if (previewMode === mode) return;
    previewMode = mode;
    // Preserve the user's current camera/orbit — only the groups move.
    updatePreviewLayout(false);
    if (previewModeAssembledButton) previewModeAssembledButton.classList.toggle("active", mode === "assembled");
    if (previewModeExplodedButton) previewModeExplodedButton.classList.toggle("active", mode === "exploded");
  }

  if (previewModeAssembledButton) {
    previewModeAssembledButton.addEventListener("click", () => setPreviewMode("assembled"));
  }
  if (previewModeExplodedButton) {
    previewModeExplodedButton.addEventListener("click", () => setPreviewMode("exploded"));
  }

  function recomputeAutoFit() {
    if (!state.outerLoops || state.outerLoops.length === 0) {
      currentAutoFit = null;
      updatePreviewLayout();
      return;
    }
    currentAutoFit = computeAutoFitTransform(
      state.outerLoops,
      state.sizeMM,
      state.sizeMM
    );
    structuralLoops = borderPrototype?.value === "border"
      ? smoothBorderPrototype(state.outerLoops, currentAutoFit.scale) : state.outerLoops;
    updatePreviewLayout();
  }

  function rebuildTopBaseAndSocket() {
    const rebuildStartedAt = performance.now();
    const timings = {
      artworkExtrusionMs: 0,
      backingExtrusionMs: 0,
      insetOffsetMs: 0,
      cavityCleanFilterMs: 0,
      shellExtrusionMs: 0,
      pedestalExtrusionMs: 0,
      totalMs: 0,
    };
    disposeGroupChildren(topGroup);
    topGeometryWarning = null;
    topGeometryDiagnostics = null;
    movingTopMMLoops = null;
    if (!currentAutoFit || !state.outerLoops || state.outerLoops.length === 0) return timings;

    // TOP ARTWORK — unchanged call, unchanged position/scale.
    const artworkStartedAt = performance.now();
    const topBaseGeometries = createTopBaseGeometries(
      structuralLoops,
      currentAutoFit,
      FIXED_CLICKER_SCALE_MULTIPLIER,
      0,
      CLICKER_PROFILE.topBase.thicknessMM,
      structuralLoops !== state.outerLoops
    );
    for (const geom of topBaseGeometries) {
      topGroup.add(new THREE.Mesh(geom, borderPrototype?.value === "border" ? borderSurface.material : topBaseMaterial));
    }
    timings.artworkExtrusionMs = performance.now() - artworkStartedAt;

    // Rear shell uses every substantial inset loop. Cavity topology
    // never controls whether the shell itself is returned.
    // Keep the existing switch/boss XY placement in both presentation modes.
    let prototypePlacement = null;
    if (structuralLoops !== state.outerLoops) {
      const original = createTopRearShellGeometries(state.outerLoops, currentAutoFit,
        FIXED_CLICKER_SCALE_MULTIPLIER, CLICKER_PROFILE.topShell.bodyDepthMM,
        CLICKER_PROFILE.topShell.transitionThicknessMM, CLICKER_PROFILE.topShell,
        CLICKER_PROFILE.topSocket);
      prototypePlacement = original.pedestalLocation;
      original.geometries.forEach(geometry => geometry.dispose());
    }
    const shellResult = createTopRearShellGeometries(
      structuralLoops,
      currentAutoFit,
      FIXED_CLICKER_SCALE_MULTIPLIER,
      CLICKER_PROFILE.topShell.bodyDepthMM,
      CLICKER_PROFILE.topShell.transitionThicknessMM,
      {
        minimumWallMM: CLICKER_PROFILE.topShell.minimumWallMM,
        bossKeepOutMM: CLICKER_PROFILE.topShell.bossKeepOutMM,
        switchPlacement: CLICKER_PROFILE.topShell.switchPlacement,
      },
      CLICKER_PROFILE.topSocket,
      prototypePlacement,
      structuralLoops !== state.outerLoops
    );
    const backingStartedAt = performance.now();
    const transitionGeometries = createTopTransitionGeometries(
      structuralLoops, currentAutoFit, FIXED_CLICKER_SCALE_MULTIPLIER,
      CLICKER_PROFILE.topShell.transitionThicknessMM,
      shellResult.diagnostics?.structuralExtension ? shellResult.outerMMLoops : null,
      structuralLoops !== state.outerLoops
    );
    for (const geom of transitionGeometries) topGroup.add(new THREE.Mesh(geom, topBaseMaterial));
    timings.backingExtrusionMs = performance.now() - backingStartedAt;
    for (const geom of shellResult.geometries) {
      topGroup.add(new THREE.Mesh(geom, topBaseMaterial));
    }
    timings.insetOffsetMs = shellResult.diagnostics?.insetOffsetMs || 0;
    timings.cavityCleanFilterMs = shellResult.diagnostics?.cavityCleanFilterMs || 0;
    timings.shellExtrusionMs = shellResult.diagnostics?.shellExtrusionMs || 0;

    // MX pedestal is independent from inset success/topology.
    const pedestalStartedAt = performance.now();
    const pedestalResult = createTopPedestalGeometry(
      shellResult.outerMMLoops,
      shellResult.cavityLoops,
      CLICKER_PROFILE.topSocket,
      CLICKER_PROFILE.topShell.bodyDepthMM,
      CLICKER_PROFILE.topShell.transitionThicknessMM,
      CLICKER_PROFILE.topShell.bossKeepOutMM,
      CLICKER_PROFILE.topShell.minimumWallMM,
      shellResult.pedestalLocation
    );
    if (pedestalResult.geometry) {
      topGroup.add(new THREE.Mesh(pedestalResult.geometry, topBaseMaterial));
    }
    timings.pedestalExtrusionMs = performance.now() - pedestalStartedAt;

    const warnings = [...shellResult.warnings];
    if (pedestalResult.warning) warnings.push(pedestalResult.warning);
    topGeometryWarning = warnings.length > 0 ? warnings.join("; ") : null;
    movingTopMMLoops = shellResult.outerMMLoops;
    topGeometryDiagnostics = {
      ...shellResult.diagnostics,
      pedestalLocation: pedestalResult.location
        ? { x: pedestalResult.location.x, y: pedestalResult.location.y, insideCavity: pedestalResult.location.insideCavity }
        : null,
    };
    console.info("TOP geometry diagnostics", JSON.stringify(topGeometryDiagnostics));
    if (topGeometryWarning) console.warn("TOP geometry warning", topGeometryWarning);
    if (exportStatus) {
      const d = topGeometryDiagnostics;
      const p = d.pedestalLocation;
      exportStatus.textContent = topGeometryWarning ||
        `TOP geometry: inset ${d.rawInsetLoops} raw / ${d.validInsetLoops} valid / ${d.cavityLoopsUsed} cavity; ` +
        `MX (${p.x.toFixed(2)}, ${p.y.toFixed(2)}) mm`;
    }
    timings.totalMs = performance.now() - rebuildStartedAt;
    return timings;
  }

  function rebuildAccent() {
    const startedAt = performance.now();
    disposeGroupChildren(accentGroup);
    accentMaterialsBySourceHex.clear();
    if (!currentAutoFit || !state.colorRegions || state.colorRegions.accentRegions.length === 0) {
      return performance.now() - startedAt;
    }

    const accentByColor = createAccentRegionGeometries(
      state.colorRegions.accentRegions,
      currentAutoFit,
      FIXED_CLICKER_SCALE_MULTIPLIER,
      CLICKER_PROFILE.topBase.thicknessMM,
      CLICKER_PROFILE.accent.thicknessMM
    );

    for (const { colorHex, geometries } of accentByColor) {
      // colorHex here is the DETECTED region color; resolvePrintColor
      // substitutes the user's chosen print color if one was picked for it.
      const material = new THREE.MeshStandardMaterial({
        color: resolvePrintColor(colorHex),
        roughness: 0.35,
        metalness: 0.02,
      });
      accentMaterialsBySourceHex.set(colorHex, material);
      for (const geom of geometries) {
        const mesh = new THREE.Mesh(geom, material);
        mesh.userData.sourceHex = colorHex;
        mesh.visible = !state.disabledColors.has(colorHex);
        accentGroup.add(mesh);
      }
    }
    return performance.now() - startedAt;
  }

  function rebuildHousing() {
    const startedAt = performance.now();
    disposeGroupChildren(housingGroup);
    keychainLoopMesh = null; // disposeGroupChildren above already freed it
    if (!currentAutoFit || !state.outerLoops || state.outerLoops.length === 0) {
      state.housingLoopDiagnostics = null;
      updateKeychainLoopStatus();
      return { totalMs: performance.now() - startedAt };
    }

    const housingStageTimings = {};
    const housingGeometries = createHousingGeometries(
      structuralLoops,
      currentAutoFit,
      FIXED_CLICKER_SCALE_MULTIPLIER,
      CLICKER_PROFILE.housing,
      housingStageTimings,
      topGeometryDiagnostics?.pedestalLocation || null,
      movingTopMMLoops,
      structuralLoops !== state.outerLoops
    );
    for (const geom of housingGeometries) {
      housingGroup.add(new THREE.Mesh(geom, housingMaterial));
    }

    // Attach to HOUSING's own FINAL outer boundary (post pocket-fit
    // extension, if any) and the exact cutout footprints it just built —
    // never a stale or pre-extension shape.
    state.housingLoopDiagnostics = {
      outerMMLoops: housingStageTimings.housingOuterMMLoops || [],
      pocketLoopMM: housingStageTimings.pocketLoopMM || null,
      plateLoopMM: housingStageTimings.plateLoopMM || null,
    };
    rebuildKeychainLoop();

    return {
      totalMs: performance.now() - startedAt,
      ...housingStageTimings,
    };
  }

  // Optional keychain loop — independent of the main HOUSING rebuild
  // above so toggling it on/off or rotating never re-runs the
  // (expensive) chamber/pocket/plate construction. Never touches
  // housingGeometries or any other child already in housingGroup.
  let keychainLoopMesh = null;
  function rebuildKeychainLoop() {
    if (keychainLoopMesh) {
      housingGroup.remove(keychainLoopMesh);
      keychainLoopMesh.geometry.dispose();
      keychainLoopMesh = null;
    }
    let warning = null;
    if (state.keychainLoopEnabled && state.housingLoopDiagnostics) {
      const { outerMMLoops, pocketLoopMM, plateLoopMM } = state.housingLoopDiagnostics;
      const result = createKeychainLoopGeometry(
        outerMMLoops, pocketLoopMM, plateLoopMM,
        state.keychainLoopAngleDeg, CLICKER_PROFILE.keychainLoop
      );
      warning = result.warning;
      if (result.geometry) {
        keychainLoopMesh = new THREE.Mesh(result.geometry, housingMaterial);
        housingGroup.add(keychainLoopMesh);
      }
    }
    updateKeychainLoopStatus(warning);
  }

  let lastKeychainLoopWarning = null;
  function updateKeychainLoopStatus(warning) {
    if (warning !== undefined) lastKeychainLoopWarning = warning;
    if (keychainLoopAngleLabel) keychainLoopAngleLabel.textContent = `${state.keychainLoopAngleDeg}°`;
    if (keychainLoopStatus) {
      keychainLoopStatus.textContent = state.keychainLoopEnabled
        ? (lastKeychainLoopWarning || (keychainLoopMesh ? "" : ct("clicker.keychainLoop.noImageYet", null, "ยังไม่มีรูปให้ยึดห่วง")))
        : "";
    }
  }

  function rebuildAll() {
    const startedAt = performance.now();
    recomputeAutoFit();
    if (currentAutoFit && borderPrototype?.value === "border") {
      borderSurface.update(state.outerLoops, currentAutoFit, FIXED_CLICKER_SCALE_MULTIPLIER);
    }
    borderSurface.material.color.copy(topBaseMaterial.color);
    const top = rebuildTopBaseAndSocket();
    const accentExtrusionMs = rebuildAccent();
    const housing = rebuildHousing();
    updatePreviewLayout(true);
    lastViewerTimings = {
      ...top,
      accentExtrusionMs,
      housingExtrusionMs: housing.totalMs,
      housingStages: housing,
      totalRebuildMs: performance.now() - startedAt,
    };
    window.__clickerPerformance = {
      ...(window.__clickerPerformance || {}),
      viewer: lastViewerTimings,
    };
    console.info("Clicker 3D timing", JSON.stringify(lastViewerTimings));
  }

  function rebuildColorsOnly() {
    const startedAt = performance.now();
    const accentExtrusionMs = rebuildAccent();
    lastViewerTimings = {
      rebuildMode: "color-only",
      accentExtrusionMs,
      totalRebuildMs: performance.now() - startedAt,
    };
    window.__clickerPerformance = {
      ...(window.__clickerPerformance || {}),
      viewer: lastViewerTimings,
    };
    console.info("Clicker 3D timing", JSON.stringify(lastViewerTimings));
  }

  // Hook Phase-1 (clicker-ui.js) calls into after every pipeline run.
  // Additive-only wiring — clicker-ui.js's own Phase-1 2D preview
  // behavior is unchanged whether or not this hook exists.
  window.onClickerPipelineResult = function (result) {
    const nextLoops = result && result.loops ? result.loops : null;
    const nextColors = result && result.colorRegions ? result.colorRegions : null;
    const nextSilhouetteKey = result?.geometryKey || result?.silhouetteKey || Symbol("uncached-silhouette");
    const nextColorKey = result?.colorKey || Symbol("uncached-colors");
    const silhouetteChanged = nextSilhouetteKey !== state.silhouetteKey;
    const colorChanged = nextColorKey !== state.colorKey;

    state.outerLoops = nextLoops;
    state.colorRegions = nextColors;
    state.colorOverrides = (result && result.colorOverrides) || {};
    state.disabledColors = new Set(result?.disabledColors || []);
    state.sizeMM = Math.max(CLICKER_PROFILE.body.minSizeMM, Math.min(CLICKER_PROFILE.body.maxSizeMM,
      Number(result?.sizeMM) || CLICKER_PROFILE.body.targetSize));
    state.silhouetteKey = nextSilhouetteKey;
    state.colorKey = nextColorKey;

    // TOP_BASE is a material-only recolor — the auto-detected dominant
    // color (or the user's chosen print color for it), not a geometry
    // change. Falls back to the original neutral gray whenever there's no
    // valid detected color to show.
    topBaseMaterial.color.set(
      nextColors && typeof nextColors.dominantColorHex === "string"
        ? resolvePrintColor(nextColors.dominantColorHex)
        : TOP_BASE_FALLBACK_COLOR
    );

    if (silhouetteChanged) rebuildAll();
    else if (colorChanged) rebuildColorsOnly();
    // A rebuild above already applies current overrides when it (re)creates
    // materials; this covers the case where neither ran (e.g. only the
    // export-size number changed) but overrides did.
    else applyColorOverrides();
    borderSurface.material.color.copy(topBaseMaterial.color);
  };

  // Hook clicker-ui.js's color-row picker calls on every selection —
  // material-only, immediate, no pipeline re-run and no geometry rebuild.
  window.onClickerColorOverrideChange = function (overrides) {
    state.colorOverrides = overrides || {};
    applyColorOverrides();
  };

  // Keep the already-built regions intact so enabling restores the exact mesh.
  // Only accents participate; the dominant TOP_BASE and mechanics stay present.
  window.onClickerRegionSelectionChange = function (disabledColors) {
    state.disabledColors = new Set(disabledColors || []);
    for (const mesh of accentGroup.children) {
      mesh.visible = !state.disabledColors.has(mesh.userData.sourceHex);
    }
  };


  // Only artwork uses the selected size; all mechanical builders use mm.

  // ---------------- Controls: HOUSING color (always-visible inline palette) ----------------
  // Same curated color list as TOP (imported directly, not duplicated),
  // rendered as an always-visible swatch grid instead of TOP's popover.
  // Setting housingMaterial.color directly keeps the keychain loop mesh
  // in sync automatically, since it shares this exact material object.

  if (housingColorGrid) {
    const housingSwatchButtons = [];
    let housingCustomInput = null;

    const syncHousingColorGridState = () => {
      const currentHex = ("#" + housingMaterial.color.getHexString()).toLowerCase();
      for (const btn of housingSwatchButtons) {
        btn.classList.toggle("active", btn.dataset.hex === currentHex);
      }
      if (housingCustomInput && document.activeElement !== housingCustomInput) {
        housingCustomInput.value = currentHex;
      }
    };

    const applyHousingColor = (hex) => {
      housingMaterial.color.set(hex);
      syncHousingColorGridState();
    };

    for (const group of CURATED_FILAMENT_PALETTE) {
      for (const swatch of group.swatches) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "color-palette-swatch";
        btn.style.background = swatch.hex;
        btn.title = swatch.name;
        btn.dataset.hex = swatch.hex.toLowerCase();
        btn.setAttribute("aria-label", swatch.name);
        btn.addEventListener("click", () => applyHousingColor(swatch.hex));
        housingSwatchButtons.push(btn);
        housingColorGrid.appendChild(btn);
      }
    }

    housingCustomInput = document.createElement("input");
    housingCustomInput.type = "color";
    housingCustomInput.className = "color-palette-swatch housing-color-custom-input";
    housingCustomInput.title = ct("clicker.customColor", null, "กำหนดเอง");
    housingCustomInput.setAttribute("aria-label", ct("clicker.baseColor.customAriaLabel", null, "กำหนดสีฐานเอง"));
    housingCustomInput.addEventListener("input", () => applyHousingColor(housingCustomInput.value));
    housingColorGrid.appendChild(housingCustomInput);

    syncHousingColorGridState();

    document.addEventListener("click", (ev) => {
      if (!ev.target.closest("[data-lang-option]")) return;
      housingCustomInput.title = ct("clicker.customColor", null, "กำหนดเอง");
      housingCustomInput.setAttribute("aria-label", ct("clicker.baseColor.customAriaLabel", null, "กำหนดสีฐานเอง"));
    });
  }


  // ---------------- Controls: optional keychain loop (HOUSING only) ----------------
  // Material-only-equivalent for geometry: toggling/rotating calls
  // rebuildKeychainLoop() alone, never the full HOUSING chamber/pocket/
  // plate rebuild above, and never touches TOP at all.

  function updateKeychainLoopToggleText() {
    if (!keychainLoopToggleButton) return;
    keychainLoopToggleButton.textContent = state.keychainLoopEnabled
      ? ct("clicker.keychainLoop.on", null, "เปิด")
      : ct("clicker.keychainLoop.off", null, "ปิด");
  }

  if (keychainLoopToggleButton) {
    updateKeychainLoopToggleText();
    keychainLoopToggleButton.addEventListener("click", function () {
      state.keychainLoopEnabled = !state.keychainLoopEnabled;
      keychainLoopToggleButton.classList.toggle("active", state.keychainLoopEnabled);
      updateKeychainLoopToggleText();
      if (keychainLoopControls) keychainLoopControls.hidden = !state.keychainLoopEnabled;
      rebuildKeychainLoop();
    });
  }

  function rotateKeychainLoop(directionSign) {
    const step = CLICKER_PROFILE.keychainLoop.angleStepDeg * directionSign;
    state.keychainLoopAngleDeg = ((state.keychainLoopAngleDeg + step) % 360 + 360) % 360;
    rebuildKeychainLoop();
  }

  if (keychainLoopRotateLeftButton) {
    keychainLoopRotateLeftButton.addEventListener("click", () => rotateKeychainLoop(-1));
  }
  if (keychainLoopRotateRightButton) {
    keychainLoopRotateRightButton.addEventListener("click", () => rotateKeychainLoop(1));
  }

  function updateKeychainLoopRotateAriaLabels() {
    if (keychainLoopRotateLeftButton) {
      keychainLoopRotateLeftButton.setAttribute("aria-label", ct("clicker.keychainLoop.rotateLeftAriaLabel", null, "หมุนห่วงทวนเข็มนาฬิกา 25 องศา"));
    }
    if (keychainLoopRotateRightButton) {
      keychainLoopRotateRightButton.setAttribute("aria-label", ct("clicker.keychainLoop.rotateRightAriaLabel", null, "หมุนห่วงตามเข็มนาฬิกา 25 องศา"));
    }
  }
  updateKeychainLoopRotateAriaLabels();

  document.addEventListener("click", (ev) => {
    if (!ev.target.closest("[data-lang-option]")) return;
    updateKeychainLoopToggleText();
    updateKeychainLoopRotateAriaLabels();
    updateKeychainLoopStatus();
  });


  // ---------------- Export: CLICKER_TOP_BASE.stl + CLICKER_ACCENT_N.stl + CLICKER_HOUSING.stl ----------------

  exportButton.addEventListener("click", function () {
    if (!state.outerLoops || state.outerLoops.length === 0) {
      if (exportStatus) exportStatus.textContent = "กรุณาอัปโหลดรูปก่อน export";
      return;
    }

    const exporter = new STLExporter();
    productGroup.updateMatrixWorld(true);

    const topExportGroup = new THREE.Group();
    const housingExportGroup = new THREE.Group();
    const accentExportGroupsByColor = new Map(); // colorHex -> THREE.Group

    function traverseExportRoot(root, kind) {
      root.updateMatrixWorld(true);
      const rootInverse = root.matrixWorld.clone().invert();

      root.traverse(function (object) {
        if (!object.isMesh) return;
        // Disabled raised regions must be absent from the printable STL too.
        if (kind === "accent" && !object.visible) return;

        // Keep child-local modeling transforms, but cancel the logical
        // root transform used only for the exploded preview. This makes
        // STL coordinates identical whether preview separation is on or off.
        const exportMatrix = new THREE.Matrix4().multiplyMatrices(
          rootInverse,
          object.matrixWorld
        );
        const clonedGeometry = object.geometry.clone();
        clonedGeometry.applyMatrix4(exportMatrix);
        const clone = new THREE.Mesh(clonedGeometry, object.material);

        if (kind === "top") {
          topExportGroup.add(clone);
        } else if (kind === "housing") {
          housingExportGroup.add(clone);
        } else {
          const hex = "#" + object.material.color.getHexString();
          if (!accentExportGroupsByColor.has(hex)) {
            accentExportGroupsByColor.set(hex, new THREE.Group());
          }
          accentExportGroupsByColor.get(hex).add(clone);
        }
      });
    }

    traverseExportRoot(topGroup, "top");
    traverseExportRoot(accentGroup, "accent");
    traverseExportRoot(housingGroup, "housing");

    function downloadSTL(group, filename) {
      const data = exporter.parse(group, { binary: true });
      const blob = new Blob([data], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    const STEP_MS = 250; // stagger downloads so the browser doesn't block simultaneous ones
    let delay = 0;

    setTimeout(() => downloadSTL(topExportGroup, "CLICKER_TOP_BASE.stl"), delay);
    delay += STEP_MS;

    let accentIndex = 1;
    for (const [, group] of accentExportGroupsByColor) {
      const filename = `CLICKER_ACCENT_${accentIndex}.stl`;
      const thisDelay = delay;
      setTimeout(() => downloadSTL(group, filename), thisDelay);
      delay += STEP_MS;
      accentIndex++;
    }

    setTimeout(() => downloadSTL(housingExportGroup, "CLICKER_HOUSING.stl"), delay);

    if (exportStatus) {
      const colorList = Array.from(accentExportGroupsByColor.keys()).join(", ");
      const accentNote = accentExportGroupsByColor.size > 0
        ? ` + ${accentExportGroupsByColor.size} ACCENT (${colorList})`
        : "";
      exportStatus.textContent = `Export แล้ว: CLICKER_TOP_BASE.stl${accentNote} + CLICKER_HOUSING.stl`;
    }
  });
}
