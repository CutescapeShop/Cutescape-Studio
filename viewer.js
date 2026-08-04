import * as THREE from "three";

import { OrbitControls } from
  "https://unpkg.com/three@0.167.1/examples/jsm/controls/OrbitControls.js";

import { FontLoader } from
  "https://unpkg.com/three@0.167.1/examples/jsm/loaders/FontLoader.js";

import { TextGeometry } from
  "https://unpkg.com/three@0.167.1/examples/jsm/geometries/TextGeometry.js";


// =====================================
// เชื่อมกับหน้าเว็บ
// =====================================

const viewer =
  document.getElementById("threeViewer");

const nameInput =
  document.getElementById("nameInput");

const fontSelect =
  document.getElementById("fontSelect");

if (!viewer) {
  throw new Error("ไม่พบ threeViewer");
}

const oldPreview =
  document.querySelector(".keychain-wrap");

if (oldPreview) {
  oldPreview.style.display = "none";
}


// =====================================
// ขนาดพื้นที่ Viewer
// =====================================

viewer.style.width = "100%";
viewer.style.height = "430px";


// =====================================
// Scene
// =====================================

const scene = new THREE.Scene();

scene.background =
  new THREE.Color("#f7f7f7");


// =====================================
// Camera
// =====================================

const camera =
  new THREE.PerspectiveCamera(
    42,
    viewer.clientWidth /
      viewer.clientHeight,
    0.1,
    1000
  );

camera.position.set(0, 3.8, 8.5);


// =====================================
// Renderer
// =====================================

const renderer =
  new THREE.WebGLRenderer({
    antialias: true,
    alpha: false
  });

renderer.setSize(
  viewer.clientWidth,
  viewer.clientHeight
);

renderer.setPixelRatio(
  Math.min(
    window.devicePixelRatio,
    2
  )
);

renderer.outputColorSpace =
  THREE.SRGBColorSpace;

viewer.appendChild(
  renderer.domElement
);


// =====================================
// กลุ่มรวมสินค้า
// =====================================

const productGroup =
  new THREE.Group();

scene.add(productGroup);


// =====================================
// วัสดุ
// =====================================

const baseMaterial =
  new THREE.MeshStandardMaterial({
    color: "#a889ff",
    roughness: 0.35,
    metalness: 0.03
  });

const textMaterial =
  new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.3,
    metalness: 0.02
  });


// =====================================
// ตัวแปรโมเดล
// =====================================

let baseMesh = null;
let textMesh = null;
let loadedFont = null;

const baseHeight = 2.25;
const baseDepth = 0.55;

const textDepth = 0.18;

const minimumBaseWidth = 4.8;
const maximumBaseWidth = 10.5;

const leftPadding = 1.65;
const rightPadding = 0.65;

const holeDiameter = 0.42;


// =====================================
// รายชื่อ Font 3D
// =====================================

const fontFiles = {
  "Arial Black":
    "https://unpkg.com/three@0.167.1/examples/fonts/helvetiker_bold.typeface.json",

  "Arial Rounded MT Bold":
    "https://unpkg.com/three@0.167.1/examples/fonts/helvetiker_regular.typeface.json",

  "Comic Sans MS":
    "https://unpkg.com/three@0.167.1/examples/fonts/optimer_bold.typeface.json",

  "Georgia":
    "https://unpkg.com/three@0.167.1/examples/fonts/gentilis_bold.typeface.json"
};

const fontLoader =
  new FontLoader();


// =====================================
// สร้าง Shape ฐานแบบแคปซูล
// พร้อมรูเจาะทะลุ
// =====================================

function createBaseShape(width) {
  const shape =
    new THREE.Shape();

  const radius =
    baseHeight / 2;

  const leftX =
    -width / 2;

  const rightX =
    width / 2;

  const topY =
    baseHeight / 2;

  const bottomY =
    -baseHeight / 2;


  // เริ่มจากด้านบนซ้าย
  shape.moveTo(
    leftX + radius,
    topY
  );

  // เส้นด้านบน
  shape.lineTo(
    rightX - radius,
    topY
  );

  // โค้งขวา
  shape.absarc(
    rightX - radius,
    0,
    radius,
    Math.PI / 2,
    -Math.PI / 2,
    true
  );

  // เส้นด้านล่าง
  shape.lineTo(
    leftX + radius,
    bottomY
  );

  // โค้งซ้าย
  shape.absarc(
    leftX + radius,
    0,
    radius,
    -Math.PI / 2,
    Math.PI / 2,
    true
  );


  // รูห่วงด้านซ้าย
  const holePath =
    new THREE.Path();

  const holeX =
    leftX + radius;

  holePath.absarc(
    holeX,
    0,
    holeDiameter / 2,
    0,
    Math.PI * 2,
    false
  );

  shape.holes.push(
    holePath
  );

  return shape;
}


// =====================================
// ลบ Mesh เก่า
// =====================================

function removeOldMeshes() {
  if (baseMesh) {
    productGroup.remove(
      baseMesh
    );

    baseMesh.geometry.dispose();

    baseMesh = null;
  }

  if (textMesh) {
    productGroup.remove(
      textMesh
    );

    textMesh.geometry.dispose();

    textMesh = null;
  }
}


// =====================================
// สร้างสินค้าใหม่ทั้งหมด
// =====================================

function rebuildProduct() {
  if (!loadedFont) {
    return;
  }

  removeOldMeshes();

  let textValue =
    nameInput
      ? nameInput.value.trim()
      : "KIRIN";

  if (textValue === "") {
    textValue = "KIRIN";
  }

  textValue =
    textValue.toUpperCase();


  // -----------------------------
  // สร้างตัวหนังสือก่อน
  // เพื่อวัดความกว้าง
  // -----------------------------

  const textGeometry =
    new TextGeometry(
      textValue,
      {
        font: loadedFont,
        size: 1,
        depth: textDepth,
        curveSegments: 12,

        bevelEnabled: true,
        bevelThickness: 0.025,
        bevelSize: 0.018,
        bevelSegments: 3
      }
    );

  textGeometry.computeBoundingBox();

  let textBox =
    textGeometry.boundingBox;

  let textWidth =
    textBox.max.x -
    textBox.min.x;

  let textHeight =
    textBox.max.y -
    textBox.min.y;


  // จำกัดความสูงตัวอักษร
  const maximumTextHeight =
    1.12;

  const heightScale =
    maximumTextHeight /
    textHeight;

  const appliedScale =
    Math.min(
      heightScale,
      1
    );

  textGeometry.scale(
    appliedScale,
    appliedScale,
    appliedScale
  );

  textGeometry.computeBoundingBox();

  textBox =
    textGeometry.boundingBox;

  textWidth =
    textBox.max.x -
    textBox.min.x;

  textHeight =
    textBox.max.y -
    textBox.min.y;


  // -----------------------------
  // คำนวณความกว้างฐาน
  // -----------------------------

  let baseWidth =
    textWidth +
    leftPadding +
    rightPadding;

  baseWidth =
    THREE.MathUtils.clamp(
      baseWidth,
      minimumBaseWidth,
      maximumBaseWidth
    );


  // ถ้าชื่อยาวเกินฐานสูงสุด
  // ให้ย่อตัวอักษรลง
  const usableTextWidth =
    baseWidth -
    leftPadding -
    rightPadding;

  if (textWidth > usableTextWidth) {
    const extraScale =
      usableTextWidth /
      textWidth;

    textGeometry.scale(
      extraScale,
      extraScale,
      extraScale
    );

    textGeometry.computeBoundingBox();

    textBox =
      textGeometry.boundingBox;

    textWidth =
      textBox.max.x -
      textBox.min.x;

    textHeight =
      textBox.max.y -
      textBox.min.y;
  }


  // -----------------------------
  // สร้างฐาน
  // -----------------------------

  const baseShape =
    createBaseShape(
      baseWidth
    );

  const baseGeometry =
    new THREE.ExtrudeGeometry(
      baseShape,
      {
        depth: baseDepth,

        bevelEnabled: true,
        bevelThickness: 0.065,
        bevelSize: 0.055,
        bevelSegments: 4
      }
    );

  baseGeometry.center();

  baseMesh =
    new THREE.Mesh(
      baseGeometry,
      baseMaterial
    );

  productGroup.add(
    baseMesh
  );


  // -----------------------------
  // จัดข้อความให้อยู่กลาง
  // แต่เว้นพื้นที่รูด้านซ้าย
  // -----------------------------

  textGeometry.translate(
    -textBox.min.x -
      textWidth / 2,

    -textBox.min.y -
      textHeight / 2,

    0
  );

  textMesh =
    new THREE.Mesh(
      textGeometry,
      textMaterial
    );

  const textAreaCenterX =
    (leftPadding -
      rightPadding) / 2;

  textMesh.position.x =
    textAreaCenterX;

  textMesh.position.z =
    baseDepth / 2 +
    0.045;

  productGroup.add(
    textMesh
  );


  // -----------------------------
  // จัดกล้องตามความยาวสินค้า
  // -----------------------------

  const cameraDistance =
    Math.max(
      7.5,
      baseWidth * 1.18
    );

  camera.position.z =
    cameraDistance;

  controls.update();
}


// =====================================
// โหลด Font ตาม Dropdown
// =====================================

function loadSelectedFont() {
  const selectedFont =
    fontSelect
      ? fontSelect.value
      : "Arial Black";

  const fontUrl =
    fontFiles[selectedFont] ||
    fontFiles["Arial Black"];

  fontLoader.load(
    fontUrl,

    function (font) {
      loadedFont = font;

      rebuildProduct();
    },

    undefined,

    function (error) {
      console.error(
        "โหลด Font 3D ไม่สำเร็จ",
        error
      );
    }
  );
}


// =====================================
// เชื่อมช่องชื่อ
// =====================================

if (nameInput) {
  nameInput.addEventListener(
    "input",
    rebuildProduct
  );
}


// =====================================
// เชื่อม Dropdown Font
// =====================================

if (fontSelect) {
  fontSelect.addEventListener(
    "change",
    loadSelectedFont
  );
}


// =====================================
// เชื่อมปุ่มสีจาก script.js
// =====================================

window.set3DBaseColor =
  function (color) {
    baseMaterial.color.set(
      color
    );
  };

window.set3DTextColor =
  function (color) {
    textMaterial.color.set(
      color
    );
  };


// =====================================
// แสง
// =====================================

const mainLight =
  new THREE.DirectionalLight(
    0xffffff,
    2.6
  );

mainLight.position.set(
  5,
  7,
  8
);

scene.add(
  mainLight
);


const fillLight =
  new THREE.DirectionalLight(
    0xffffff,
    1.15
  );

fillLight.position.set(
  -5,
  2,
  5
);

scene.add(
  fillLight
);


const ambientLight =
  new THREE.AmbientLight(
    0xffffff,
    1.35
  );

scene.add(
  ambientLight
);


// =====================================
// Orbit Controls
// =====================================

const controls =
  new OrbitControls(
    camera,
    renderer.domElement
  );

controls.enableDamping = true;
controls.enablePan = false;

controls.minDistance = 4;
controls.maxDistance = 20;

controls.target.set(
  0,
  0,
  0
);


// เอียงให้เห็นความหนา
productGroup.rotation.x =
  -0.08;

productGroup.rotation.y =
  -0.12;


// =====================================
// Render Loop
// =====================================

function animate() {
  requestAnimationFrame(
    animate
  );

  controls.update();

  renderer.render(
    scene,
    camera
  );
}

animate();


// =====================================
// Responsive
// =====================================

window.addEventListener(
  "resize",
  function () {
    const width =
      viewer.clientWidth;

    const height =
      viewer.clientHeight;

    camera.aspect =
      width / height;

    camera.updateProjectionMatrix();

    renderer.setSize(
      width,
      height
    );
  }
);


// เริ่มโหลด Font
loadSelectedFont();