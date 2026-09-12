// =====================================================================
// dressup/dressup-viewer.js
//
// Dress-up / Paper Doll — base-doll prototype: 3D preview + STL export.
//
// Entirely separate THREE.js scene from viewer.js and
// clicker/clicker-viewer.js — own <canvas> container, own camera/
// renderer/lights/controls/render loop. Does not import, reference, or
// modify anything outside dressup/.
// =====================================================================

import * as THREE from "three";

import { OrbitControls } from
  "https://unpkg.com/three@0.167.1/examples/jsm/controls/OrbitControls.js";

import { STLExporter } from
  "https://unpkg.com/three@0.167.1/examples/jsm/exporters/STLExporter.js";

import {
  createBodyGeometry,
  createArmGeometries,
  createFaceDetailGeometries,
  getDollHeightMM,
} from "./dressup-geometry.js";

const viewerEl = document.getElementById("dressupViewer3D");
const exportButton = document.getElementById("dressupExportButton");
const exportStatus = document.getElementById("dressupExportStatus");
const heightLabel = document.getElementById("dressupHeightLabel");

function init() {
  viewerEl.style.width = "100%";
  viewerEl.style.height = "560px";

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#f7f7f7");

  const dollHeight = getDollHeightMM();

  const camera = new THREE.PerspectiveCamera(
    38,
    viewerEl.clientWidth / viewerEl.clientHeight,
    0.1,
    1000
  );
  camera.position.set(0, dollHeight * 0.55, dollHeight * 1.35);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(viewerEl.clientWidth, viewerEl.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  viewerEl.appendChild(renderer.domElement);

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: "#f6d9c4",
    roughness: 0.55,
    metalness: 0.02,
  });
  const faceMaterial = new THREE.MeshStandardMaterial({
    color: "#3a2c28",
    roughness: 0.45,
    metalness: 0.02,
  });

  const productGroup = new THREE.Group();
  // Center the doll on its own mid-height so orbit controls feel natural.
  productGroup.position.set(0, -dollHeight / 2, 0);
  scene.add(productGroup);

  const bodyGeometry = createBodyGeometry();
  const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);

  const { leftArm, rightArm } = createArmGeometries();
  const leftArmMesh = new THREE.Mesh(leftArm, bodyMaterial);
  const rightArmMesh = new THREE.Mesh(rightArm, bodyMaterial);

  const bodyGroup = new THREE.Group();
  bodyGroup.add(bodyMesh, leftArmMesh, rightArmMesh);
  productGroup.add(bodyGroup);

  const { leftEye, rightEye, mouth } = createFaceDetailGeometries();
  const faceGroup = new THREE.Group();
  faceGroup.add(new THREE.Mesh(leftEye, faceMaterial));
  faceGroup.add(new THREE.Mesh(rightEye, faceMaterial));
  faceGroup.add(new THREE.Mesh(mouth, faceMaterial));
  productGroup.add(faceGroup);

  const mainLight = new THREE.DirectionalLight(0xffffff, 2.4);
  mainLight.position.set(20, 60, 80);
  scene.add(mainLight);

  const fillLight = new THREE.DirectionalLight(0xffffff, 1.0);
  fillLight.position.set(-30, 20, 40);
  scene.add(fillLight);

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.3);
  scene.add(ambientLight);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0, 0);
  controls.minDistance = 40;
  controls.maxDistance = 400;

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
  if ("ResizeObserver" in window) {
    new ResizeObserver(syncRendererSize).observe(viewerEl);
  }

  if (heightLabel) {
    heightLabel.textContent = `Target height: ${dollHeight} mm`;
  }

  // ---------------- Export: DRESSUP_BASE_DOLL.stl + DRESSUP_FACE_DETAILS.stl ----------------

  exportButton?.addEventListener("click", function () {
    const exporter = new STLExporter();

    function downloadSTL(object, filename) {
      const data = exporter.parse(object, { binary: true });
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

    downloadSTL(bodyGroup, "DRESSUP_BASE_DOLL.stl");
    setTimeout(() => downloadSTL(faceGroup, "DRESSUP_FACE_DETAILS.stl"), 250);

    if (exportStatus) exportStatus.textContent = "Exported 2 STL files.";
  });
}

init();
