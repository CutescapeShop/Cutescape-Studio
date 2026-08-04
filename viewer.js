import * as THREE from "three";
import { OrbitControls } from "https://unpkg.com/three@0.167.1/examples/jsm/controls/OrbitControls.js";

// พื้นที่แสดงโมเดล 3D
const viewer = document.getElementById("threeViewer");

// ซ่อนพวงกุญแจจำลองอันเดิมไว้ก่อน
const oldPreview = document.querySelector(".keychain-wrap");

if (oldPreview) {
  oldPreview.style.display = "none";
}

// กำหนดขนาดพื้นที่ 3D
viewer.style.width = "100%";
viewer.style.height = "430px";

// สร้างฉาก
const scene = new THREE.Scene();
scene.background = new THREE.Color("#f7f7f7");

// สร้างกล้อง
const camera = new THREE.PerspectiveCamera(
  45,
  viewer.clientWidth / viewer.clientHeight,
  0.1,
  1000
);

camera.position.set(5, 4, 7);

// สร้างตัวแสดงผล
const renderer = new THREE.WebGLRenderer({
  antialias: true
});

renderer.setSize(
  viewer.clientWidth,
  viewer.clientHeight
);

renderer.setPixelRatio(
  Math.min(window.devicePixelRatio, 2)
);

viewer.appendChild(renderer.domElement);

// สร้างกล่อง 3D สำหรับทดสอบ
// สร้างทรงป้ายพวงกุญแจมุมมน
const shape = new THREE.Shape();

const width = 5.5;
const height = 2.2;
const radius = 0.35;

shape.moveTo(-width / 2 + radius, -height / 2);

shape.lineTo(width / 2 - radius, -height / 2);

shape.quadraticCurveTo(
  width / 2,
  -height / 2,
  width / 2,
  -height / 2 + radius
);

shape.lineTo(width / 2, height / 2 - radius);

shape.quadraticCurveTo(
  width / 2,
  height / 2,
  width / 2 - radius,
  height / 2
);

shape.lineTo(-width / 2 + radius, height / 2);

shape.quadraticCurveTo(
  -width / 2,
  height / 2,
  -width / 2,
  height / 2 - radius
);

shape.lineTo(-width / 2, -height / 2 + radius);

shape.quadraticCurveTo(
  -width / 2,
  -height / 2,
  -width / 2 + radius,
  -height / 2
);

const extrudeSettings = {
  depth: 0.65,
  bevelEnabled: true,
  bevelThickness: 0.08,
  bevelSize: 0.08,
  bevelSegments: 4
};

const geometry = new THREE.ExtrudeGeometry(
  shape,
  extrudeSettings
);

geometry.center();

const material = new THREE.MeshStandardMaterial({
  color: "#a889ff",
  roughness: 0.35,
  metalness: 0.05
});

window.set3DBaseColor = function (color) {
  material.color.set(color);
};

const keychain3D = new THREE.Mesh(
  geometry,
  material
);

scene.add(keychain3D);

// เพิ่มไฟ
const mainLight = new THREE.DirectionalLight(
  0xffffff,
  2.5
);

mainLight.position.set(5, 7, 8);
scene.add(mainLight);

const softLight = new THREE.AmbientLight(
  0xffffff,
  1.5
);

scene.add(softLight);

// ทำให้ลากเมาส์หมุนและซูมได้
const controls = new OrbitControls(
  camera,
  renderer.domElement
);

controls.enableDamping = true;
controls.enablePan = false;

// วาดภาพต่อเนื่อง
function animate() {
  requestAnimationFrame(animate);

  controls.update();
  renderer.render(scene, camera);
}

animate();

// ปรับขนาดเมื่อหน้าจอเปลี่ยน
window.addEventListener("resize", function () {
  const width = viewer.clientWidth;
  const height = viewer.clientHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height);
});