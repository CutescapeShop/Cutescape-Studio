import * as THREE from "three";

import { OrbitControls } from
  "https://unpkg.com/three@0.167.1/examples/jsm/controls/OrbitControls.js";

import { FontLoader } from
  "https://unpkg.com/three@0.167.1/examples/jsm/loaders/FontLoader.js";

import { TTFLoader } from
  "https://unpkg.com/three@0.167.1/examples/jsm/loaders/TTFLoader.js";

import { TextGeometry } from
  "https://unpkg.com/three@0.167.1/examples/jsm/geometries/TextGeometry.js";

import { STLExporter } from
  "https://unpkg.com/three@0.167.1/examples/jsm/exporters/STLExporter.js";

import { SVGLoader } from
  "https://unpkg.com/three@0.167.1/examples/jsm/loaders/SVGLoader.js";

import ClipperLib from
  "https://cdn.jsdelivr.net/npm/clipper-lib@6.4.2/+esm";


// =====================================
// เชื่อมกับหน้าเว็บ
// =====================================

const viewer =
  document.getElementById("threeViewer");

const nameInput =
  document.getElementById("nameInput");

const fontSelect =
  document.getElementById("fontSelect");

const nameSizeSlider =
  document.getElementById("nameSizeSlider");

const nameSizeValue =
  document.getElementById("nameSizeValue");

const baseStyleSelect =
  document.getElementById("baseStyleSelect");

const outlineSlider =
  document.getElementById("outlineSlider");

const outlineValue =
  document.getElementById("outlineValue");

if (!viewer) {
  throw new Error("ไม่พบ threeViewer");
}

const oldPreview =
  document.querySelector(".keychain-wrap");

if (oldPreview) {
  oldPreview.style.display = "none";
}


// =====================================
// Viewer
// =====================================

viewer.style.width = "100%";
viewer.style.height = "430px";

const scene = new THREE.Scene();

scene.background =
  new THREE.Color("#f7f7f7");


const camera =
  new THREE.PerspectiveCamera(
    42,
    viewer.clientWidth /
      viewer.clientHeight,
    0.1,
    1000
  );

camera.position.set(0, 3.4, 8.5);


const renderer =
  new THREE.WebGLRenderer({
    antialias: true
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
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewer.appendChild(
  renderer.domElement
);


// =====================================
// กลุ่มสินค้า
// =====================================

const productGroup =
  new THREE.Group();

scene.add(productGroup);


// =====================================
// วัสดุ
// =====================================

const baseMaterial =
  new THREE.MeshStandardMaterial({
    color: "#111111",
    roughness: 0.38,
    metalness: 0.02
  });

const textMaterial =
  new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.3,
    metalness: 0.02
  });


// =====================================
// ค่าโมเดล
// =====================================

const baseDepth = 0.52;
const textDepth = 0.18;

// ลดขนาดวงแหวนลง ~15% จากต้นฉบับ (0.88 / 0.68 / 0.42) โดยคงสัดส่วนผนัง/รูเดิมไว้
const ringOuterWidth = 0.748;
const ringOuterHeight = 0.578;
const ringHoleDiameter = 0.357;
const baseThroughHoleDiameter = 0.62;

let loadedFont = null;


// =====================================
// ฟอนต์ 3D
// =====================================

const fontFiles = {
  "Arial Black":
    "https://unpkg.com/three@0.167.1/examples/fonts/helvetiker_bold.typeface.json",

  "Arial Rounded MT Bold":
    "https://unpkg.com/three@0.167.1/examples/fonts/helvetiker_regular.typeface.json",

  "Comic Sans MS":
    "https://unpkg.com/three@0.167.1/examples/fonts/optimer_bold.typeface.json",

  "Georgia":
    "https://unpkg.com/three@0.167.1/examples/fonts/gentilis_bold.typeface.json",

  "18jindaEclair":
    "./assets/fonts/18jindaEclair.ttf",

  "18jindaEclairBold":
    "./assets/fonts/18jindaEclairBold.ttf",

  "18jindaEclairThin":
    "./assets/fonts/18jindaEclairThin.ttf",

  "33JindaKoko":
    "./assets/fonts/33JindaKoko.ttf",

  "33JindaKokoBold":
    "./assets/fonts/33JindaKokoBold.ttf",

  "33JindaKokoThin":
    "./assets/fonts/33JindaKokoThin.ttf",

  "HappyThursday":
    "./assets/fonts/HappyThursday.ttf",

  "HappyThursdayCute":
    "./assets/fonts/HappyThursdayCute.ttf",

  "HappyThursdayThin":
    "./assets/fonts/HappyThursdayThin.ttf",

  "JindaApollo":
    "./assets/fonts/JindaApollo.ttf",

  "JindaApolloBold":
    "./assets/fonts/JindaApolloBold.ttf",

  "JindaApolloSp":
    "./assets/fonts/JindaApolloSp.ttf",

  "JindaApolloThin":
    "./assets/fonts/JindaApolloThin.ttf",

  "JindaBiscuit":
    "./assets/fonts/JindaBiscuit.ttf",

  "JindaBiscuitBold":
    "./assets/fonts/JindaBiscuitBold.ttf",

  "JindaBiscuitPie":
    "./assets/fonts/JindaBiscuitPie.ttf",

  "JindaBiscuitPieBold":
    "./assets/fonts/JindaBiscuitPieBold.ttf",

  "JindaBiscuitPieThin":
    "./assets/fonts/JindaBiscuitPieThin.ttf",

  "JindaBiscuitThin":
    "./assets/fonts/JindaBiscuitThin.ttf",

  "JindaWhisky":
    "./assets/fonts/JindaWhisky.ttf",

  "JindaWhiskyBold":
    "./assets/fonts/JindaWhiskyBold.ttf",

  "JindaWhiskyPremium":
    "./assets/fonts/JindaWhiskyPremium.ttf",

  "JindaWhiskyThin":
    "./assets/fonts/JindaWhiskyThin.ttf",

  "JindGoody":
    "./assets/fonts/JindGoody.ttf",

  "JindGoodyBold":
    "./assets/fonts/JindGoodyBold.ttf",

  "JindGoodyThin":
    "./assets/fonts/JindGoodyThin.ttf",

  "Lovebird":
    "./assets/fonts/Lovebird.ttf",

  "magic love":
    "./assets/fonts/magic love.ttf",

  "MiMarshmallow":
    "./assets/fonts/MiMarshmallow.ttf",

  "MiMarshmallowBold":
    "./assets/fonts/MiMarshmallowBold.ttf",

  "MiMarshmallowThin":
    "./assets/fonts/MiMarshmallowThin.ttf",

  "MiPie":
    "./assets/fonts/MiPie.ttf",

  "MiPieBold":
    "./assets/fonts/MiPieBold.ttf",

  "MiPieThin":
    "./assets/fonts/MiPieThin.ttf",

  "MN KAOPAT Italic":
    "./assets/fonts/MN KAOPAT Italic.ttf",

  "MN KAOPAT":
    "./assets/fonts/MN KAOPAT.ttf",

  "MN MOCHI Italic":
    "./assets/fonts/MN MOCHI Italic.ttf",

  "MN MOCHI":
    "./assets/fonts/MN MOCHI.ttf",

  "MN Mocktail Italic":
    "./assets/fonts/MN Mocktail Italic.ttf",

  "MN Mocktail":
    "./assets/fonts/MN Mocktail.ttf",

  "MN Saikrok Isan Italic":
    "./assets/fonts/MN Saikrok Isan Italic.ttf",

  "MN Saikrok Isan":
    "./assets/fonts/MN Saikrok Isan.ttf",

  "MN Tomyam Italic":
    "./assets/fonts/MN Tomyam Italic.ttf",

  "MN Tomyam":
    "./assets/fonts/MN Tomyam.ttf",

  "Moji":
    "./assets/fonts/Moji.ttf",

  "Saturn":
    "./assets/fonts/Saturn.ttf",

  "SaturnThin":
    "./assets/fonts/SaturnThin.ttf",

  "Anton":
    "./assets/fonts/Anton.ttf",

  "Berkshire Swash":
    "./assets/fonts/Berkshire Swash.ttf",

  "Bowlby One SC":
    "./assets/fonts/Bowlby One SC.ttf",

  "Chewy":
    "./assets/fonts/Chewy.ttf",

  "Cookie":
    "./assets/fonts/Cookie.ttf",

  "Pirata One":
    "./assets/fonts/Pirata One.ttf",

  "Press Start 2P":
    "./assets/fonts/Press Start 2P.ttf"
};

const fontLoader =
  new FontLoader();

const ttfLoader =
  new TTFLoader();

// =====================================
// Thai shaping ด้วย HarfBuzz
// =====================================
// Three.js FontLoader อ่าน outline ได้ แต่ไม่ทำ GPOS/GSUB สำหรับภาษาไทยครบถ้วน
// เราจึงให้ HarfBuzz จัด glyph + ตำแหน่งก่อน แล้วแปลง glyph path กลับเป็น THREE.Shape

const svgLoader = new SVGLoader();
let starSvgShapes = null;
let heartSvgShapesPromise = null;
let flowerSvgShapesPromise = null;
let cloverSvgShapesPromise = null;
let catSvgShapesPromise = null;
const starSvgPathData = "m 103.7119,402.13502 c -5.472323,-2.48602 -10.133823,-8.09708 -11.967773,-14.40564 -1.52356,-5.24089 -1.48796,-5.50263 8.996953,-66.13508 9.339,-54.00591 10.36851,-61.11459 9.12555,-63.01158 -0.77055,-1.17602 -20.800523,-20.9959 -44.511033,-44.04418 -36.13507,-35.12581 -43.3952,-42.64476 -44.87258,-46.47225 -4.38013,-11.34775 0.38852,-23.09776 11.20888,-27.6188 2.20016,-0.91928 30.44865,-5.55485 63.88668,-10.48377 37.929863,-5.59103 60.395093,-9.31833 61.174853,-10.14976 C 157.43119,119.09128 169.79791,94.425 184.23503,65 199.96048,32.949179 211.73443,10.148056 213.60241,8.1278883 222.44533,-1.4354922 236.9127,-1.2046753 245.14683,8.6311573 246.92818,10.759021 260.0755,36.35 274.36309,65.5 c 14.28759,29.15 26.56398,53.59748 27.28086,54.32774 0.82678,0.84219 23.21414,4.55193 61.2196,10.1445 33.6114,4.94597 61.65328,9.54257 63.87291,10.46999 10.76217,4.49672 15.57514,16.34488 11.22147,27.62406 -1.47738,3.82749 -8.7375,11.34644 -44.87257,46.47225 -23.71051,23.04828 -43.74674,42.87772 -44.52495,44.06542 -1.26079,1.9242 -0.32145,8.5505 8.62257,60.82566 5.52063,32.26642 10.02762,60.78215 10.01554,63.3683 -0.0414,8.87333 -6.21625,17.47544 -14.50885,20.21225 -8.33055,2.74933 -9.69448,2.17912 -67.02263,-28.0197 -31.22094,-16.4463 -54.87997,-28.3238 -56.41871,-28.3238 -1.53661,0 -24.04382,11.28117 -53.56937,26.8503 -28.00565,14.76766 -53.07049,27.66766 -55.69965,28.66666 -6.0301,2.29126 -11.15049,2.27596 -16.26741,-0.0486 z M 240.75928,80.383712 c 16.27844,-7.559364 20.79542,-29.192409 9.01042,-43.153325 -11.5702,-13.70646 -34.90243,-11.428414 -44.12465,4.308118 -3.2648,5.570961 -4.39404,15.987404 -2.39259,22.070015 4.14718,12.603712 15.97992,20.115892 29.46802,18.708183 2.75,-0.287009 6.36746,-1.156854 8.0388,-1.932991 z";
const cloudSvgPathData = "m 141.10236,325.67914 c -18.39519,-5.95413 -31.4623,-19.80369 -36.35211,-38.52883 -0.8298,-3.17766 -1.75569,-6.02451 -2.05753,-6.32635 -0.30184,-0.30184 -3.370651,0.72263 -6.819579,2.27661 -16.47881,7.42482 -30.559891,7.28255 -46.270779,-0.46752 -17.535486,-8.65013 -28.5,-26.30179 -28.5,-45.88187 0,-21.07471 10.908725,-37.94779 30.672919,-47.44334 8.827081,-4.24091 8.827081,-4.24091 21.327081,-4.31673 12.5,-0.0758 12.5,-0.0758 13.197809,-6.32685 2.372644,-21.25429 17.061599,-39.16992 37.107379,-45.25864 9.64147,-2.92851 24.18082,-2.26034 34.17707,1.57064 6.54876,2.50976 7.06097,2.56825 8.25,0.94215 0.69725,-0.95355 1.26774,-2.33261 1.26774,-3.06456 0,-0.73196 1.36841,-4.35845 3.04091,-8.05887 5.63615,-12.47001 18.63404,-23.38331 32.89059,-27.615612 6.71203,-1.99259 20.90247,-2.09648 27.15447,-0.19881 12.25271,3.719062 25.20508,13.107772 30.46484,22.082862 1.29719,2.21349 3.53659,7.16979 4.97646,11.01402 1.43986,3.84422 2.98402,7.36575 3.43147,7.82563 0.44744,0.45987 4.12727,-0.62545 8.17739,-2.41183 6.27731,-2.76871 8.84981,-3.31602 17.43449,-3.70923 16.58754,-0.75979 28.70161,4.03004 39.71235,15.70201 8.765,9.29136 13.93153,20.88058 14.97143,33.58291 0.2456,3 0.2456,3 11.7456,3.60817 16.16277,0.85475 25.35673,4.63737 35.59701,14.64548 9.32653,9.11507 14.86269,20.58325 16.03727,33.22123 1.29404,13.92333 -5.00858,30.14081 -15.81587,40.69635 -11.02443,10.76763 -24.31454,15.80628 -40.04288,15.18138 -8.87483,-0.35261 -8.87483,-0.35261 -11.47645,6.14739 -5.30361,13.2508 -13.64731,21.94985 -27.0997,28.25385 -7.81449,3.66199 -9.66259,4.12094 -18.26173,4.53502 -14.49916,0.69818 -24.31936,-2.68224 -36.79036,-12.6644 -7.09318,-5.67759 -7.37854,-5.66926 -13.14729,0.38399 -6.93866,7.28086 -20.70793,12.49884 -32.9315,12.47967 -9.01279,-0.0141 -16.3423,-1.81273 -24.72398,-6.06704 -6.1706,-3.13203 -6.1706,-3.13203 -12.5529,0.01 -3.51027,1.72809 -8.8369,3.79522 -11.83697,4.5936 -7.45892,1.98499 -20.14768,1.79083 -26.95465,-0.41245 z M 74.67509,263.08108 c 4.490133,-1.847 10.117846,-7.13001 13.202839,-12.39415 2.320804,-3.96016 2.70037,-5.72802 2.708027,-12.61285 0.01023,-9.20241 -1.739306,-13.76286 -7.483594,-19.50715 -5.723767,-5.72376 -10.299185,-7.4776 -19.538902,-7.48957 -7.359573,-0.01 -8.505484,0.27235 -13.560224,3.33584 -17.318547,10.49614 -18.034007,34.70984 -1.364479,46.17877 7.102198,4.88644 17.736737,5.90312 26.036333,2.48911 z";
let harfBuzzApi = null;
let harfBuzzModulePromise = null;
let harfBuzzBlob = null;
let harfBuzzFace = null;
let harfBuzzFont = null;
let harfBuzzFontUrl = null;

function isThaiText(text) {
  return /[\u0E00-\u0E7F]/.test(text);
}

// =====================================
// ล้างโมเดลเดิม
// =====================================

function clearProduct() {
  while (productGroup.children.length > 0) {
    const object = productGroup.children[0];
    productGroup.remove(object);

    if (object.geometry) {
      object.geometry.dispose();
    }
  }
}


function initHarfBuzz() {
  if (harfBuzzModulePromise) return harfBuzzModulePromise;

  harfBuzzModulePromise = new Promise((resolve, reject) => {
    if (!window.createHarfBuzz || !window.hbjs) {
      reject(new Error("HarfBuzz scripts are not loaded"));
      return;
    }

    window.createHarfBuzz()
      .then((module) => {
        harfBuzzApi = window.hbjs(module);
        resolve(harfBuzzApi);
      })
      .catch(reject);
  });

  return harfBuzzModulePromise;
}

function destroyHarfBuzzFont() {
  try { if (harfBuzzFont) harfBuzzFont.destroy(); } catch (_) {}
  try { if (harfBuzzFace) harfBuzzFace.destroy(); } catch (_) {}
  try { if (harfBuzzBlob) harfBuzzBlob.destroy(); } catch (_) {}
  harfBuzzFont = null;
  harfBuzzFace = null;
  harfBuzzBlob = null;
  harfBuzzFontUrl = null;
}

async function loadHarfBuzzFont(fontUrl) {
  const hb = await initHarfBuzz();
  const response = await fetch(fontUrl);
  if (!response.ok) {
    throw new Error(`โหลดฟอนต์สำหรับ HarfBuzz ไม่สำเร็จ: ${response.status}`);
  }

  const fontData = new Uint8Array(await response.arrayBuffer());
  destroyHarfBuzzFont();

  harfBuzzBlob = hb.createBlob(fontData);
  harfBuzzFace = hb.createFace(harfBuzzBlob, 0);
  harfBuzzFont = hb.createFont(harfBuzzFace);
  // ใช้ scale 1000 เพื่อให้แปลงกลับเป็นหน่วย Three.js ได้ง่ายและคงสัดส่วน
  harfBuzzFont.setScale(1000, 1000);
  harfBuzzFontUrl = fontUrl;
}

// สำรองไว้สำหรับฟอนต์ JSON/ภาษาอังกฤษเดิม
function patchThaiCombiningMarks(font) {
  if (!font || !font.data || !font.data.glyphs) return;
  const combiningMarks = [
    "\u0E31",
    "\u0E34", "\u0E35", "\u0E36", "\u0E37",
    "\u0E38", "\u0E39", "\u0E3A",
    "\u0E47", "\u0E48", "\u0E49", "\u0E4A",
    "\u0E4B", "\u0E4C", "\u0E4D", "\u0E4E"
  ];
  combiningMarks.forEach((char) => {
    const glyph = font.data.glyphs[char];
    if (glyph) glyph.ha = 0;
  });
}

function transformShape(shape, scale, dx, dy) {
  const data = shape.extractPoints(96);
  const contour = data.shape.map(
    (p) => new THREE.Vector2(p.x * scale + dx, p.y * scale + dy)
  );
  const result = new THREE.Shape(contour);

  data.holes.forEach((holePoints) => {
    const hole = new THREE.Path(
      holePoints.map(
        (p) => new THREE.Vector2(p.x * scale + dx, p.y * scale + dy)
      )
    );
    result.holes.push(hole);
  });

  return result;
}

function glyphSvgPathToShapes(pathData, scale, dx, dy) {
  if (!pathData) return [];
  const safePath = String(pathData).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"><path d="${safePath}"/></svg>`;
  const parsed = svgLoader.parse(svg);
  const result = [];

  parsed.paths.forEach((path) => {
    SVGLoader.createShapes(path).forEach((shape) => {
      result.push(transformShape(shape, scale, dx, dy));
    });
  });

  return result;
}

function loadStarSvgShape() {
  if (!starSvgShapes) {
    const svgText = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 424 405"><path d="${starSvgPathData}"/></svg>`;
    const parsed = svgLoader.parse(svgText);
    const sourceShapes = [];
    parsed.paths.forEach((path) => {
      SVGLoader.createShapes(path).forEach((shape) => sourceShapes.push(shape));
    });

    const points = sourceShapes.flatMap((shape) => shape.getPoints(192));
        const minX = Math.min(...points.map((point) => point.x));
        const maxX = Math.max(...points.map((point) => point.x));
        const minY = Math.min(...points.map((point) => point.y));
        const maxY = Math.max(...points.map((point) => point.y));
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const scale = 1 / Math.max(maxX - minX, maxY - minY);

        starSvgShapes = sourceShapes.map((shape) => {
          const result = new THREE.Shape();
          result.setFromPoints(shape.getPoints(192).map((point) => new THREE.Vector2(
            (point.x - centerX) * scale,
            -(point.y - centerY) * scale
          )));

          shape.holes.forEach((holePath) => {
            const hole = new THREE.Path();
            hole.setFromPoints(holePath.getPoints(96).map((point) => new THREE.Vector2(
              (point.x - centerX) * scale,
              -(point.y - centerY) * scale
            )));
            result.holes.push(hole);
          });

          return result;
        });
  }

  return starSvgShapes;
}

function loadHeartSvgShape() {
  if (!heartSvgShapesPromise) {
    heartSvgShapesPromise = new Promise((resolve, reject) => {
      svgLoader.load(
        "./assets/heart.svg",
        (data) => {
          const shapes = [];
          data.paths.forEach((path) => {
            SVGLoader.createShapes(path).forEach((shape) => shapes.push(shape));
          });
          resolve(shapes);
        },
        undefined,
        reject
      );
    });
  }

  return heartSvgShapesPromise;
}

function loadFlowerSvgShape() {
  if (!flowerSvgShapesPromise) {
    flowerSvgShapesPromise = new Promise((resolve, reject) => {
      svgLoader.load(
        "./assets/flower.svg",
        (data) => {
          const shapes = [];
          data.paths.forEach((path) => {
            SVGLoader.createShapes(path).forEach((shape) => shapes.push(shape));
          });
          resolve(shapes);
        },
        undefined,
        reject
      );
    });
  }

  return flowerSvgShapesPromise;
}

function loadCloverSvgShape() {
  if (!cloverSvgShapesPromise) {
    cloverSvgShapesPromise = new Promise((resolve, reject) => {
      svgLoader.load(
        "./assets/clover.svg",
        (data) => {
          const shapes = [];
          data.paths.forEach((path) => {
            SVGLoader.createShapes(path).forEach((shape) => shapes.push(shape));
          });
          resolve(shapes);
        },
        undefined,
        reject
      );
    });
  }

  return cloverSvgShapesPromise;
}

function loadCatSvgShape() {
  if (!catSvgShapesPromise) {
    catSvgShapesPromise = new Promise((resolve, reject) => {
      svgLoader.load(
        "./assets/cat.svg",
        (data) => {
          const shapes = [];
          data.paths.forEach((path) => {
            SVGLoader.createShapes(path).forEach((shape) => shapes.push(shape));
          });
          resolve(shapes);
        },
        undefined,
        reject
      );
    });
  }

  return catSvgShapesPromise;
}

function scaleShapeWithHoles(shape, scale) {
  const scaledShape = new THREE.Shape();
  scaledShape.setFromPoints(shape.getPoints(192).map((point) => new THREE.Vector2(
    point.x * scale,
    point.y * scale
  )));

  shape.holes.forEach((holePath) => {
    const scaledHole = new THREE.Path();
    scaledHole.setFromPoints(holePath.getPoints(96).map((point) => new THREE.Vector2(
      point.x * scale,
      point.y * scale
    )));
    scaledShape.holes.push(scaledHole);
  });

  return scaledShape;
}

function generateHarfBuzzShapes(textValue, size = 1) {
  if (!harfBuzzApi || !harfBuzzFont) return null;

  const buffer = harfBuzzApi.createBuffer();
  buffer.addText(textValue);
  buffer.guessSegmentProperties();
  harfBuzzApi.shape(harfBuzzFont, buffer);
  const glyphs = buffer.json(harfBuzzFont);
  buffer.destroy();

  const result = [];
  let penX = 0;
  let penY = 0;
  const unitScale = size / 1000;

  glyphs.forEach((glyph) => {
    const pathData = harfBuzzFont.glyphToPath(glyph.g);
    const dx = (penX + (glyph.dx || 0)) * unitScale;
    const dy = (penY + (glyph.dy || 0)) * unitScale;

    glyphSvgPathToShapes(pathData, unitScale, dx, dy)
      .forEach((shape) => result.push(shape));

    penX += glyph.ax || 0;
    penY += glyph.ay || 0;
  });

  return result;
}

function generateProductShapes(textValue, size = 1) {
  if (isThaiText(textValue) && harfBuzzFont) {
    const shaped = generateHarfBuzzShapes(textValue, size);
    if (shaped && shaped.length) return shaped;
  }

  return loadedFont.generateShapes(textValue, size);
}

function createTextGeometry(
  textValue,
  depth,
  bevelSize
) {
  const shapes = generateProductShapes(textValue, 1);

  const geometry = new THREE.ExtrudeGeometry(
    shapes,
    {
      depth: depth,
      curveSegments: 12,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: bevelSize,
      bevelSegments: 3
    }
  );

  geometry.computeBoundingBox();
  return geometry;
}


// =====================================
// ปรับตัวอักษรให้สูงพอดี
// =====================================

function fitTextGeometry(
  geometry,
  maximumHeight,
  maximumWidth = 9
) {
  geometry.computeBoundingBox();

  let box =
    geometry.boundingBox;

  let width =
    box.max.x - box.min.x;

  let height =
    box.max.y - box.min.y;

  const heightScale =
    maximumHeight / height;

  const widthScale =
    maximumWidth / width;

  const scale =
    Math.min(
      heightScale,
      widthScale,
      1
    );

  geometry.scale(
    scale,
    scale,
    scale
  );

  geometry.computeBoundingBox();

  box = geometry.boundingBox;

  width =
    box.max.x - box.min.x;

  height =
    box.max.y - box.min.y;

  geometry.translate(
    -box.min.x - width / 2,
    -box.min.y - height / 2,
    0
  );

  return {
    geometry,
    width,
    height
  };
}

function applyNameTextScale(geometry) {
  const scale = nameSizeSlider
    ? parseFloat(nameSizeSlider.value) / 100
    : 1;

  geometry.scale(scale, scale, scale);
}


// =====================================
// สร้างห่วงกลมมีรูทะลุ
// =====================================

function createRingMesh(
  xPosition,
  zPosition = 0,
  yPosition = 0
) {
  const ringOuterPath =
    new THREE.Path();

  ringOuterPath.absellipse(
  0,
  0,
  ringOuterWidth / 2,
  ringOuterHeight / 2,
  0,
  Math.PI * 2,
  false
);

  // เดียวกับรูด้านใน: curveSegments (12) ต่ำเกินไปสำหรับขอบวงแหวนด้านนอกเป็นวงรี
  // ทำให้ดูเป็นเหลี่ยม จึงสุ่มจุดรอบขอบด้วยความละเอียดสูงแยกต่างหาก โดยไม่แตะขนาด/ตำแหน่ง
  const ringShape = new THREE.Shape();
  ringShape.setFromPoints(ringOuterPath.getPoints(128));

  const holePath =
    new THREE.Path();

  holePath.absarc(
  0,
  0,
  ringHoleDiameter / 2,
  0,
  Math.PI * 2,
  true
);

  // ExtrudeGeometry ใช้ curveSegments เดียวกันกับขอบวงแหวนด้านนอก (ต่ำเกินไปสำหรับรูวงกลม
  // ทำให้ดูเป็นเหลี่ยม) จึงสุ่มจุดรอบวงกลมของรูด้วยความละเอียดสูงแยกต่างหาก โดยไม่แตะขนาด/ตำแหน่ง/ขอบนอก
  const smoothHolePath = new THREE.Path();
  smoothHolePath.setFromPoints(holePath.getPoints(128));

  ringShape.holes.push(
    smoothHolePath
  );

const ringGeometry = new THREE.ExtrudeGeometry(ringShape, {
  depth: 0.34,
  curveSegments: 12,
  bevelEnabled: true,
  bevelThickness: 0.035,
  bevelSize: 0.025,
  bevelSegments: 10
});

ringGeometry.computeBoundingBox();

const ringBox = ringGeometry.boundingBox;

const ringCenterX =
  (ringBox.min.x + ringBox.max.x) / 2;

const ringCenterY =
  (ringBox.min.y + ringBox.max.y) / 2;

ringGeometry.translate(
  -ringCenterX,
  -ringCenterY,
  0
);

  const ringMesh =
    new THREE.Mesh(
      ringGeometry,
      baseMaterial
    );

  ringMesh.position.set(
    xPosition,
    yPosition,
    zPosition
  );

  return ringMesh;
}


// =====================================
// สร้างฐานตามตัวอักษร
// =====================================

function createOutlineProduct(textValue) {
  const sourceShapes = generateProductShapes(textValue, 1);
  const sampled = [];

  sourceShapes.forEach((shape) => {
    const points = shape.getPoints(80);
    if (points.length >= 3) sampled.push(points);
  });

  if (sampled.length === 0) return 3;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  sampled.flat().forEach((p) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  });

  const rawWidth = Math.max(maxX - minX, 0.001);
  const rawHeight = Math.max(maxY - minY, 0.001);
  const scale = Math.min(1.24 / rawHeight, 8.5 / rawWidth, 1);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  // Clipper ใช้เลขจำนวนเต็ม จึงขยายพิกัดก่อนคำนวณ offset/union
  const CLIPPER_SCALE = 10000;
  const outlineMargin =
  outlineSlider
    ? parseFloat(outlineSlider.value)
    : 0.18;

  const paths = sampled.map((points) =>
    points.map((p) => ({
      X: Math.round((p.x - centerX) * scale * CLIPPER_SCALE),
      Y: Math.round((p.y - centerY) * scale * CLIPPER_SCALE)
    }))
  );

  // ขยายแต่ละส่วนของตัวอักษรให้เป็นขอบมน แล้ว union ให้กลายเป็น silhouette รวม
  // arcTolerance ต่ำ = Clipper ใส่จุดตามส่วนโค้งมากขึ้น = โค้งมนเนียนขึ้น (ไม่กระทบระยะ offset)
  const offsetter = new ClipperLib.ClipperOffset(2, 0.0006 * CLIPPER_SCALE);
  offsetter.AddPaths(
    paths,
    ClipperLib.JoinType.jtRound,
    ClipperLib.EndType.etClosedPolygon
  );

  const expandedPaths = new ClipperLib.Paths();
  offsetter.Execute(expandedPaths, outlineMargin * CLIPPER_SCALE);

  const clipper = new ClipperLib.Clipper();
  clipper.AddPaths(expandedPaths, ClipperLib.PolyType.ptSubject, true);

  const unitedPaths = new ClipperLib.Paths();
  clipper.Execute(
    ClipperLib.ClipType.ctUnion,
    unitedPaths,
    ClipperLib.PolyFillType.pftNonZero,
    ClipperLib.PolyFillType.pftNonZero
  );

const baseShapes = unitedPaths
  .filter((path) => path.length >= 3)
  .map((path) => {
    const shape = new THREE.Shape();

    path.forEach((p, index) => {
      const x = p.X / CLIPPER_SCALE;
      const y = p.Y / CLIPPER_SCALE;

      if (index === 0) {
        shape.moveTo(x, y);
      } else {
        shape.lineTo(x, y);
      }
    });

    shape.closePath();

    return shape;
  });

  const baseGeometry = new THREE.ExtrudeGeometry(baseShapes, {
    depth: 0.34,
    curveSegments: 12,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.012,
    bevelSegments: 10
  });

  baseGeometry.computeBoundingBox();
  const baseBox = baseGeometry.boundingBox;
  const finalBaseWidth = baseBox.max.x - baseBox.min.x;
  const finalBaseHeight = baseBox.max.y - baseBox.min.y;

  const baseMesh = new THREE.Mesh(baseGeometry, baseMaterial);
  productGroup.add(baseMesh);

  // ตัวอักษรด้านหน้า ใช้ transform ชุดเดียวกับ silhouette จึงตรงกันพอดี
  const frontGeometry = createTextGeometry(textValue, 0.15, 0.012);
  frontGeometry.scale(scale, scale, 1);
  frontGeometry.translate(-centerX * scale, -centerY * scale, 0);

  const frontTextMesh = new THREE.Mesh(frontGeometry, textMaterial);
  applyNameTextScale(frontGeometry);
  frontTextMesh.position.z = 0.37;
  productGroup.add(frontTextMesh);

  // ห่วงแบบฝังชิดฐานเหมือนชิ้นงานตัวอย่าง
  // ให้ขอบขวาของห่วงกินเข้าไปใน silhouette ของฐานโดยตรง
  // จึงไม่ต้องมีก้านยาว/คอเหลี่ยมซึ่งเป็นจุดหักง่าย
  const leftEdge = baseBox.min.x;
  const ringOverlap = 0.16;
  const ringX = leftEdge - ringOuterWidth / 2 + ringOverlap;
  // ตำแหน่งแนวตั้งของห่วง: ~37.5% จากขอบบนของ silhouette (โซนบนซ้ายแบบพวงกุญแจทั่วไป)
  const ringVerticalFraction = 0.375;
  const ringY = baseBox.max.y - ringVerticalFraction * finalBaseHeight;
  const ringMesh = createRingMesh(ringX, 0, ringY);
  productGroup.add(ringMesh);

  return finalBaseWidth + (ringOuterWidth - ringOverlap);
}

function createStickerProduct(textValue) {
  return createOutlineProduct(textValue);
}

function createRoundedRectangleProduct(textValue) {
  const frontTextGeometry = createTextGeometry(textValue, textDepth, 0.018);
  const fittedText = fitTextGeometry(frontTextGeometry, 1.12, 8.2);
  const paddingX = 1.05;
  const paddingY = 0.48;
  const baseWidth = fittedText.width + paddingX * 2;
  const baseHeight = fittedText.height + paddingY * 2;
  const cornerRadius = Math.min(0.32, baseHeight / 2);
  const leftX = -baseWidth / 2;
  const rightX = baseWidth / 2;
  const topY = baseHeight / 2;
  const bottomY = -baseHeight / 2;

  const shape = new THREE.Shape();
  shape.moveTo(leftX + cornerRadius, topY);
  shape.lineTo(rightX - cornerRadius, topY);
  shape.quadraticCurveTo(rightX, topY, rightX, topY - cornerRadius);
  shape.lineTo(rightX, bottomY + cornerRadius);
  shape.quadraticCurveTo(rightX, bottomY, rightX - cornerRadius, bottomY);
  shape.lineTo(leftX + cornerRadius, bottomY);
  shape.quadraticCurveTo(leftX, bottomY, leftX, bottomY + cornerRadius);
  shape.lineTo(leftX, topY - cornerRadius);
  shape.quadraticCurveTo(leftX, topY, leftX + cornerRadius, topY);

  const holePath = new THREE.Path();
  holePath.absarc(
    leftX + 0.72,
    0,
    baseThroughHoleDiameter / 2,
    0,
    Math.PI * 2,
    true
  );
  shape.holes.push(holePath);

  const baseGeometry = new THREE.ExtrudeGeometry(shape, {
    depth: baseDepth,
    curveSegments: 12,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 10
  });

  baseGeometry.center();

  const baseMesh = new THREE.Mesh(baseGeometry, baseMaterial);
  productGroup.add(baseMesh);

  const textMesh = new THREE.Mesh(fittedText.geometry, textMaterial);
  applyNameTextScale(fittedText.geometry);
  textMesh.position.x = 0.2;
  textMesh.position.z = baseDepth / 2 + textDepth / 2 + 0.035;
  productGroup.add(textMesh);

  return baseWidth;
}

function createOvalProduct(textValue) {
  const frontTextGeometry = createTextGeometry(textValue, textDepth, 0.018);
  const fittedText = fitTextGeometry(frontTextGeometry, 1.12, 8.2);
  const paddingX = 1.35;
  const paddingY = 0.48;
  const baseWidth = fittedText.width + paddingX * 2;
  const baseHeight = fittedText.height + paddingY * 2;
  const leftX = -baseWidth / 2;

  const shape = new THREE.Shape();
  const ellipseSegments = 128;

  for (let index = 0; index < ellipseSegments; index += 1) {
    const angle = (index * Math.PI * 2) / ellipseSegments;
    const x = Math.cos(angle) * (baseWidth / 2);
    const y = Math.sin(angle) * (baseHeight / 2);

    if (index === 0) {
      shape.moveTo(x, y);
    } else {
      shape.lineTo(x, y);
    }
  }

  shape.closePath();

  const holePath = new THREE.Path();
  holePath.absarc(
    leftX + 0.72,
    0,
    baseThroughHoleDiameter / 2,
    0,
    Math.PI * 2,
    true
  );
  shape.holes.push(holePath);

  const baseGeometry = new THREE.ExtrudeGeometry(shape, {
    depth: baseDepth,
    curveSegments: 64,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 10
  });

  baseGeometry.center();

  const baseMesh = new THREE.Mesh(baseGeometry, baseMaterial);
  productGroup.add(baseMesh);

  const textMesh = new THREE.Mesh(fittedText.geometry, textMaterial);
  applyNameTextScale(fittedText.geometry);
  textMesh.position.x = 0.2;
  textMesh.position.z = baseDepth / 2 + textDepth / 2 + 0.035;
  productGroup.add(textMesh);

  return baseWidth;
}

function createSvgCloudProduct(textValue) {
  const sizingTextGeometry = createTextGeometry(textValue, textDepth, 0.018);
  const sizingText = fitTextGeometry(sizingTextGeometry, 1.12, 8.2);
  const frontTextGeometry = createTextGeometry(textValue, textDepth, 0.018);
  const fittedText = fitTextGeometry(frontTextGeometry, 1.02, 7.8);
  const parsed = svgLoader.parse(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 424 405"><path d="${cloudSvgPathData}"/></svg>`
  );
  const sourceShapes = [];

  parsed.paths.forEach((path) => {
    SVGLoader.createShapes(path).forEach((shape) => sourceShapes.push(shape));
  });

  const sourceShape = sourceShapes[0];
  const sourcePoints = sourceShape.getPoints(256);
  const sourceMinX = Math.min(...sourcePoints.map((point) => point.x));
  const sourceMaxX = Math.max(...sourcePoints.map((point) => point.x));
  const sourceMinY = Math.min(...sourcePoints.map((point) => point.y));
  const sourceMaxY = Math.max(...sourcePoints.map((point) => point.y));
  const sourceCenterX = (sourceMinX + sourceMaxX) / 2;
  const sourceCenterY = (sourceMinY + sourceMaxY) / 2;
  const sourceWidth = sourceMaxX - sourceMinX;
  const sourceHeight = sourceMaxY - sourceMinY;
  const targetScale = Math.max(
    2.7 / sourceHeight,
    (sizingText.width + 2.7) / sourceWidth
  );
  const shape = new THREE.Shape();
  shape.setFromPoints(sourcePoints.map((point) => new THREE.Vector2(
    (point.x - sourceCenterX) * targetScale,
    -(point.y - sourceCenterY) * targetScale
  )));

  sourceShape.holes.forEach((holePath) => {
    const hole = new THREE.Path();
    hole.setFromPoints(holePath.getPoints(128).map((point) => new THREE.Vector2(
      (point.x - sourceCenterX) * targetScale,
      -(point.y - sourceCenterY) * targetScale
    )));
    shape.holes.push(hole);
  });

  const cloudPoints = shape.getPoints(256);
  const cloudMinX = Math.min(...cloudPoints.map((point) => point.x));
  const cloudMaxX = Math.max(...cloudPoints.map((point) => point.x));
  const cloudMinY = Math.min(...cloudPoints.map((point) => point.y));
  const cloudMaxY = Math.max(...cloudPoints.map((point) => point.y));
  const holePoints = shape.holes[0]
    ? shape.holes[0].getPoints(128)
    : [];
  const holeMaxX = holePoints.length
    ? Math.max(...holePoints.map((point) => point.x))
    : cloudMinX;
  const usableCenterX = (holeMaxX + cloudMaxX) / 2;
  const usableCenterY = (cloudMinY + cloudMaxY) / 2;

  const baseGeometry = new THREE.ExtrudeGeometry(shape, {
    depth: baseDepth,
    curveSegments: 64,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 10
  });

  baseGeometry.center();

  const baseMesh = new THREE.Mesh(baseGeometry, baseMaterial);
  productGroup.add(baseMesh);

  const textMesh = new THREE.Mesh(fittedText.geometry, textMaterial);
  applyNameTextScale(fittedText.geometry);
  fittedText.geometry.computeBoundingBox();
  const textBounds = fittedText.geometry.boundingBox;
  const textCenterX = (textBounds.min.x + textBounds.max.x) / 2;
  const textCenterY = (textBounds.min.y + textBounds.max.y) / 2;
  textMesh.position.x = usableCenterX - textCenterX;
  textMesh.position.y = usableCenterY - textCenterY - 0.26;
  textMesh.position.z = baseDepth / 2 + textDepth / 2 + 0.035;
  productGroup.add(textMesh);

  return sourceWidth * targetScale;
}

function createCloudProduct(textValue) {
  const frontTextGeometry = createTextGeometry(textValue, textDepth, 0.018);
  const fittedText = fitTextGeometry(frontTextGeometry, 1.12, 8.2);
  const paddingX = 1.35;
  const paddingY = 0.48;
  const baseWidth = fittedText.width + paddingX * 2;
  const baseHeight = Math.max(fittedText.height + paddingY * 2, 2.7);
  const leftX = -baseWidth / 2;
  const rightX = baseWidth / 2;
  const bottomY = -baseHeight / 2;
  const topY = baseHeight / 2;

  const referenceContour = [
    [0.00, 0.61], [0.01, 0.51], [0.05, 0.41], [0.11, 0.35],
    [0.17, 0.36], [0.18, 0.27], [0.22, 0.20], [0.28, 0.17],
    [0.34, 0.22], [0.37, 0.12], [0.41, 0.04], [0.47, 0.00],
    [0.53, 0.00], [0.59, 0.04], [0.63, 0.12], [0.66, 0.22],
    [0.72, 0.17], [0.78, 0.20], [0.82, 0.27], [0.83, 0.36],
    [0.89, 0.35], [0.95, 0.41], [0.99, 0.51], [1.00, 0.61],
    [0.99, 0.70], [0.95, 0.78], [0.89, 0.83], [0.83, 0.86],
    [0.80, 0.92], [0.74, 0.99], [0.68, 1.00], [0.62, 0.97],
    [0.57, 0.91], [0.53, 0.98], [0.47, 1.00], [0.42, 0.97],
    [0.38, 0.91], [0.34, 0.99], [0.28, 1.00], [0.22, 0.97],
    [0.17, 0.91], [0.14, 0.84], [0.08, 0.85], [0.03, 0.78],
    [0.01, 0.70]
  ];
  const centerStretchStart = 0.2;
  const centerStretchEnd = 0.8;
  const leftEndWidth = 1.45;
  const rightEndWidth = 1.35;
  const centerWidth = Math.max(baseWidth - leftEndWidth - rightEndWidth, 2.4);
  const cloudScale = 1.08;
  const rightExtension = 0.18;
  const contourPoints = referenceContour.map(([x, y]) => {
    let stretchedX;

    if (x <= centerStretchStart) {
      stretchedX = (x / centerStretchStart) * leftEndWidth / baseWidth;
    } else if (x >= centerStretchEnd) {
      stretchedX = (leftEndWidth + centerWidth +
        ((x - centerStretchEnd) / (1 - centerStretchEnd)) * rightEndWidth) /
        baseWidth;
      stretchedX += rightExtension / baseWidth;
    } else {
      stretchedX = (leftEndWidth +
        ((x - centerStretchStart) /
          (centerStretchEnd - centerStretchStart)) * centerWidth) /
        baseWidth;
    }

    return new THREE.Vector3(
      (stretchedX - 0.5) * baseWidth * cloudScale,
      (0.5 - y) * baseHeight * cloudScale,
      0
    );
  });
  const cloudCurve = new THREE.CatmullRomCurve3(
    contourPoints,
    true,
    "centripetal",
    0.5
  );
  const shape = new THREE.Shape();
  shape.setFromPoints(cloudCurve.getPoints(192));
  const cloudBounds = cloudCurve.getPoints(192).reduce(
    (bounds, point) => ({
      minY: Math.min(bounds.minY, point.y),
      maxY: Math.max(bounds.maxY, point.y)
    }),
    { minY: Infinity, maxY: -Infinity }
  );

  const holePath = new THREE.Path();
  const holeCenterX = (-baseWidth / 2 + leftEndWidth * 0.55) * cloudScale + 0.13;
  const textCenterX =
    (leftX + leftEndWidth * 0.55 + baseThroughHoleDiameter / 2 + rightX) / 2;
  holePath.absarc(
    holeCenterX,
    -0.12 * cloudScale - 0.13,
    baseThroughHoleDiameter / 2,
    0,
    Math.PI * 2,
    true
  );
  shape.holes.push(holePath);

  const baseGeometry = new THREE.ExtrudeGeometry(shape, {
    depth: baseDepth,
    curveSegments: 64,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 10
  });

  baseGeometry.center();

  const baseMesh = new THREE.Mesh(baseGeometry, baseMaterial);
  productGroup.add(baseMesh);

  const textMesh = new THREE.Mesh(fittedText.geometry, textMaterial);
  textMesh.position.x = textCenterX;
  fittedText.geometry.computeBoundingBox();
  const textBounds = fittedText.geometry.boundingBox;
  const textCenterY = (textBounds.min.y + textBounds.max.y) / 2;
  const cloudCenterY = (cloudBounds.minY + cloudBounds.maxY) / 2;
  textMesh.position.y = cloudCenterY - textCenterY;
  textMesh.position.z = baseDepth / 2 + textDepth / 2 + 0.035;
  productGroup.add(textMesh);

  return baseWidth;
}

function createStarProduct(textValue) {
  const sizingTextGeometry = createTextGeometry(textValue, textDepth, 0.018);
  const sizingText = fitTextGeometry(sizingTextGeometry, 1.12, 8.2);
  const frontTextGeometry = createTextGeometry(textValue, textDepth, 0.018);
  const fittedText = fitTextGeometry(frontTextGeometry, 0.82, 4.8);
  const svgShapes = loadStarSvgShape();
  const shape = scaleShapeWithHoles(svgShapes[0], sizingText.width * 1.1);

  const baseGeometry = new THREE.ExtrudeGeometry(shape, {
    depth: baseDepth,
    curveSegments: 64,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 10
  });

  baseGeometry.center();

  const baseMesh = new THREE.Mesh(baseGeometry, baseMaterial);
  productGroup.add(baseMesh);

  const textMesh = new THREE.Mesh(fittedText.geometry, textMaterial);
  applyNameTextScale(fittedText.geometry);
  textMesh.position.z = baseDepth / 2 + textDepth / 2 + 0.035;
  productGroup.add(textMesh);

  return sizingText.width * 2.2;
}

async function createHeartProduct(textValue) {
  const frontTextGeometry = createTextGeometry(textValue, textDepth, 0.018);
  const fittedText = fitTextGeometry(frontTextGeometry, 1.12, 8.2);
  const sourceShapes = await loadHeartSvgShape();
  const sourceShape = sourceShapes[0];
  const sourcePoints = sourceShape.getPoints(256);
  const sourceMinX = Math.min(...sourcePoints.map((point) => point.x));
  const sourceMaxX = Math.max(...sourcePoints.map((point) => point.x));
  const sourceMinY = Math.min(...sourcePoints.map((point) => point.y));
  const sourceMaxY = Math.max(...sourcePoints.map((point) => point.y));
  const sourceCenterX = (sourceMinX + sourceMaxX) / 2;
  const sourceCenterY = (sourceMinY + sourceMaxY) / 2;
  const sourceWidth = sourceMaxX - sourceMinX;
  const sourceHeight = sourceMaxY - sourceMinY;
  const targetScale = Math.max(
    (fittedText.width + 1.8) / sourceWidth,
    2.7 / sourceHeight
  );
  const shape = new THREE.Shape();
  shape.setFromPoints(sourcePoints.map((point) => new THREE.Vector2(
    (point.x - sourceCenterX) * targetScale,
    -(point.y - sourceCenterY) * targetScale
  )));

  sourceShape.holes.forEach((holePath) => {
    const hole = new THREE.Path();
    hole.setFromPoints(holePath.getPoints(128).map((point) => new THREE.Vector2(
      (point.x - sourceCenterX) * targetScale,
      -(point.y - sourceCenterY) * targetScale
    )));
    shape.holes.push(hole);
  });

  const baseGeometry = new THREE.ExtrudeGeometry(shape, {
    depth: baseDepth,
    curveSegments: 64,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 10
  });

  baseGeometry.center();
  productGroup.add(new THREE.Mesh(baseGeometry, baseMaterial));

  const textMesh = new THREE.Mesh(fittedText.geometry, textMaterial);
  applyNameTextScale(fittedText.geometry);
  textMesh.position.z = baseDepth / 2 + textDepth / 2 + 0.035;
  productGroup.add(textMesh);

  return sourceWidth * targetScale;
}

async function createFlowerProduct(textValue) {
  const frontTextGeometry = createTextGeometry(textValue, textDepth, 0.018);
  const fittedText = fitTextGeometry(frontTextGeometry, 1.12, 8.2);
  const sourceShapes = await loadFlowerSvgShape();
  const sourceShape = sourceShapes[0];
  const sourcePoints = sourceShape.getPoints(256);
  const sourceMinX = Math.min(...sourcePoints.map((point) => point.x));
  const sourceMaxX = Math.max(...sourcePoints.map((point) => point.x));
  const sourceMinY = Math.min(...sourcePoints.map((point) => point.y));
  const sourceMaxY = Math.max(...sourcePoints.map((point) => point.y));
  const sourceCenterX = (sourceMinX + sourceMaxX) / 2;
  const sourceCenterY = (sourceMinY + sourceMaxY) / 2;
  const sourceWidth = sourceMaxX - sourceMinX;
  const sourceHeight = sourceMaxY - sourceMinY;
  const targetScale = Math.max(
    (fittedText.width + 1.8) / sourceWidth,
    2.7 / sourceHeight
  );
  const shape = new THREE.Shape();
  shape.setFromPoints(sourcePoints.map((point) => new THREE.Vector2(
    (point.x - sourceCenterX) * targetScale,
    -(point.y - sourceCenterY) * targetScale
  )));

  sourceShape.holes.forEach((holePath) => {
    const hole = new THREE.Path();
    hole.setFromPoints(holePath.getPoints(128).map((point) => new THREE.Vector2(
      (point.x - sourceCenterX) * targetScale,
      -(point.y - sourceCenterY) * targetScale
    )));
    shape.holes.push(hole);
  });

  const baseGeometry = new THREE.ExtrudeGeometry(shape, {
    depth: baseDepth,
    curveSegments: 64,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 10
  });

  baseGeometry.center();
  productGroup.add(new THREE.Mesh(baseGeometry, baseMaterial));

  const textMesh = new THREE.Mesh(fittedText.geometry, textMaterial);
  applyNameTextScale(fittedText.geometry);
  textMesh.position.z = baseDepth / 2 + textDepth / 2 + 0.035;
  productGroup.add(textMesh);

  return sourceWidth * targetScale;
}

async function createCloverProduct(textValue) {
  const frontTextGeometry = createTextGeometry(textValue, textDepth, 0.018);
  const fittedText = fitTextGeometry(frontTextGeometry, 1.12, 8.2);
  const sourceShapes = await loadCloverSvgShape();
  const sourceShape = sourceShapes[0];
  const sourcePoints = sourceShape.getPoints(256);
  const sourceMinX = Math.min(...sourcePoints.map((point) => point.x));
  const sourceMaxX = Math.max(...sourcePoints.map((point) => point.x));
  const sourceMinY = Math.min(...sourcePoints.map((point) => point.y));
  const sourceMaxY = Math.max(...sourcePoints.map((point) => point.y));
  const sourceCenterX = (sourceMinX + sourceMaxX) / 2;
  const sourceCenterY = (sourceMinY + sourceMaxY) / 2;
  const sourceWidth = sourceMaxX - sourceMinX;
  const sourceHeight = sourceMaxY - sourceMinY;
  const targetScale = Math.max(
    (fittedText.width + 1.8) / sourceWidth,
    2.7 / sourceHeight
  );
  const shape = new THREE.Shape();
  shape.setFromPoints(sourcePoints.map((point) => new THREE.Vector2(
    (point.x - sourceCenterX) * targetScale,
    -(point.y - sourceCenterY) * targetScale
  )));

  sourceShape.holes.forEach((holePath) => {
    const hole = new THREE.Path();
    hole.setFromPoints(holePath.getPoints(128).map((point) => new THREE.Vector2(
      (point.x - sourceCenterX) * targetScale,
      -(point.y - sourceCenterY) * targetScale
    )));
    shape.holes.push(hole);
  });

  const baseGeometry = new THREE.ExtrudeGeometry(shape, {
    depth: baseDepth,
    curveSegments: 64,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 10
  });

  baseGeometry.center();
  productGroup.add(new THREE.Mesh(baseGeometry, baseMaterial));

  const textMesh = new THREE.Mesh(fittedText.geometry, textMaterial);
  applyNameTextScale(fittedText.geometry);
  textMesh.position.z = baseDepth / 2 + textDepth / 2 + 0.035;
  productGroup.add(textMesh);

  return sourceWidth * targetScale;
}

async function createCatProduct(textValue) {
  const frontTextGeometry = createTextGeometry(textValue, textDepth, 0.018);
  const fittedText = fitTextGeometry(frontTextGeometry, 1.12, 8.2);
  const sourceShapes = await loadCatSvgShape();
  const sourceShape = sourceShapes[0];
  const sourcePoints = sourceShape.getPoints(256);
  const sourceMinX = Math.min(...sourcePoints.map((point) => point.x));
  const sourceMaxX = Math.max(...sourcePoints.map((point) => point.x));
  const sourceMinY = Math.min(...sourcePoints.map((point) => point.y));
  const sourceMaxY = Math.max(...sourcePoints.map((point) => point.y));
  const sourceCenterX = (sourceMinX + sourceMaxX) / 2;
  const sourceCenterY = (sourceMinY + sourceMaxY) / 2;
  const sourceWidth = sourceMaxX - sourceMinX;
  const sourceHeight = sourceMaxY - sourceMinY;
  const targetScale = Math.max(
    (fittedText.width + 1.8) / sourceWidth,
    2.7 / sourceHeight
  );
  const shape = new THREE.Shape();
  shape.setFromPoints(sourcePoints.map((point) => new THREE.Vector2(
    (point.x - sourceCenterX) * targetScale,
    -(point.y - sourceCenterY) * targetScale
  )));

  sourceShape.holes.forEach((holePath) => {
    const hole = new THREE.Path();
    hole.setFromPoints(holePath.getPoints(128).map((point) => new THREE.Vector2(
      (point.x - sourceCenterX) * targetScale,
      -(point.y - sourceCenterY) * targetScale
    )));
    shape.holes.push(hole);
  });

  const baseGeometry = new THREE.ExtrudeGeometry(shape, {
    depth: baseDepth,
    curveSegments: 64,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 10
  });

  baseGeometry.center();
  productGroup.add(new THREE.Mesh(baseGeometry, baseMaterial));

  const textMesh = new THREE.Mesh(fittedText.geometry, textMaterial);
  applyNameTextScale(fittedText.geometry);
  textMesh.position.z = baseDepth / 2 + textDepth / 2 + 0.035;
  productGroup.add(textMesh);

  return sourceWidth * targetScale;
}

// =====================================
// สร้างฐานแคปซูล
// =====================================

function createCapsuleProduct(
  textValue
) {
  const frontTextGeometry =
    createTextGeometry(
      textValue,
      textDepth,
      0.018
    );

  const fittedText =
    fitTextGeometry(
      frontTextGeometry,
      1.12,
      8.2
    );

  const capsuleHeight = 2.25;

  const capsuleWidth =
    THREE.MathUtils.clamp(
      fittedText.width + 2.7,
      5,
      10.5
    );

  const radius =
    capsuleHeight / 2;

  const shape =
    new THREE.Shape();

  const leftX =
    -capsuleWidth / 2;

  const rightX =
    capsuleWidth / 2;

  shape.moveTo(
    leftX + radius,
    capsuleHeight / 2
  );

  shape.lineTo(
    rightX - radius,
    capsuleHeight / 2
  );

  shape.absarc(
    rightX - radius,
    0,
    radius,
    Math.PI / 2,
    -Math.PI / 2,
    true
  );

  shape.lineTo(
    leftX + radius,
    -capsuleHeight / 2
  );

  shape.absarc(
    leftX + radius,
    0,
    radius,
    -Math.PI / 2,
    Math.PI / 2,
    true
  );


  const holePath =
    new THREE.Path();

  holePath.absarc(
    leftX + radius,
    0,
    baseThroughHoleDiameter / 2,
    0,
    Math.PI * 2,
    true
  );

  shape.holes.push(
    holePath
  );


  const baseGeometry =
    new THREE.ExtrudeGeometry(
      shape,
      {
        depth: baseDepth,
        bevelEnabled: true,
        bevelThickness: 0.06,
        bevelSize: 0.05,
        bevelSegments: 10
      }
    );

  baseGeometry.center();

  const baseMesh =
    new THREE.Mesh(
      baseGeometry,
      baseMaterial
    );

  productGroup.add(
    baseMesh
  );


  const textMesh =
    new THREE.Mesh(
      fittedText.geometry,
      textMaterial
    );

  applyNameTextScale(fittedText.geometry);

  textMesh.position.x = 0.6;

  textMesh.position.z =
    baseDepth / 2 +
    textDepth / 2 +
    0.035;

  productGroup.add(
    textMesh
  );

  return capsuleWidth;
}


// =====================================
// สร้างสินค้าใหม่
// =====================================
let rebuildTimer = null;

function scheduleRebuild() {
  clearTimeout(rebuildTimer);

  rebuildTimer = setTimeout(() => {
    rebuildProduct();
  }, 250);
}

async function rebuildProduct() {
  if (!loadedFont) {
    return;
  }

  clearProduct();

  let textValue =
    nameInput
      ? nameInput.value.trim()
      : "Cute";

  if (textValue === "") {
    textValue = "Cute";
  }

  const selectedStyle =
    baseStyleSelect
      ? baseStyleSelect.value
      : "outline";

  let productWidth;

 if (selectedStyle === "capsule") {
  productWidth = createCapsuleProduct(
    textValue
  );
} else if (selectedStyle === "sticker") {
  productWidth = createStickerProduct(
    textValue
  );
} else if (selectedStyle === "rounded-rectangle") {
  productWidth = createRoundedRectangleProduct(
    textValue
  );
} else if (selectedStyle === "oval") {
  productWidth = createOvalProduct(
    textValue
  );
} else if (selectedStyle === "cloud") {
  productWidth = createSvgCloudProduct(
    textValue
  );
} else if (selectedStyle === "star") {
  productWidth = await createStarProduct(
    textValue
  );
} else if (selectedStyle === "heart") {
  productWidth = await createHeartProduct(
    textValue
  );
} else if (selectedStyle === "flower") {
  productWidth = await createFlowerProduct(
    textValue
  );
} else if (selectedStyle === "clover") {
  productWidth = await createCloverProduct(
    textValue
  );
} else if (selectedStyle === "cat") {
  productWidth = await createCatProduct(
    textValue
  );
} else {
  productWidth = createOutlineProduct(
    textValue
  );
}


  // กล้องถอยตามความยาวชื่อ
  camera.position.z =
    Math.max(
      7,
      productWidth * 1.18
    );

  controls.target.set(
    0,
    0,
    0
  );

  controls.update();
  requestRender();
}


// =====================================
// โหลดฟอนต์
// =====================================

function loadSelectedFont() {
  const selectedFont =
    fontSelect
      ? fontSelect.value
      : "Arial Black";

  const fontUrl =
    fontFiles[selectedFont] ||
    fontFiles["Arial Black"];

  const isTtf = /\.ttf$/i.test(fontUrl);

  if (isTtf) {
    ttfLoader.load(
      fontUrl,

      async function (fontData) {
        loadedFont = fontLoader.parse(fontData);
        patchThaiCombiningMarks(loadedFont);

        try {
          await loadHarfBuzzFont(fontUrl);
        } catch (error) {
          console.error("โหลด HarfBuzz ไม่สำเร็จ — ใช้ระบบ Three.js เดิมแทน", error);
          destroyHarfBuzzFont();
        }

        rebuildProduct();
      },

      undefined,

      function (error) {
        console.error(
          "โหลดฟอนต์ TTF ไม่สำเร็จ",
          error
        );
      }
    );

    return;
  }

  fontLoader.load(
    fontUrl,

    function (font) {
      loadedFont = font;
      patchThaiCombiningMarks(loadedFont);
      destroyHarfBuzzFont();
      rebuildProduct();
    },

    undefined,

    function (error) {
      console.error(
        "โหลดฟอนต์ 3D ไม่สำเร็จ",
        error
      );
    }
  );
}


// =====================================
// Event
// =====================================

if (nameInput) {
  nameInput.addEventListener(
    "input",
    scheduleRebuild
  );
}

if (fontSelect) {
  fontSelect.addEventListener(
    "change",
    loadSelectedFont
  );
}

if (baseStyleSelect) {
  baseStyleSelect.addEventListener(
    "change",
    rebuildProduct
  );
}
if (nameSizeSlider) {
  nameSizeSlider.addEventListener(
    "input",
    function () {
      if (nameSizeValue) {
        nameSizeValue.textContent =
          nameSizeSlider.value + "%";
      }

      scheduleRebuild();
    }
  );
}

if (outlineSlider) {
  outlineSlider.addEventListener(
    "input",
    function () {
      if (outlineValue) {
        outlineValue.textContent =
          outlineSlider.value;
      }

      scheduleRebuild();
    }
  );
}

// =====================================
// สีจาก script.js
// =====================================

window.set3DBaseColor =
  function (color) {
    baseMaterial.color.set(
      color
    );
    requestRender();
  };

window.set3DTextColor =
  function (color) {
    textMaterial.color.set(
      color
    );
    requestRender();
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

scene.add(mainLight);


const fillLight =
  new THREE.DirectionalLight(
    0xffffff,
    1.1
  );

fillLight.position.set(
  -5,
  2,
  5
);

scene.add(fillLight);


const ambientLight =
  new THREE.AmbientLight(
    0xffffff,
    1.35
  );

scene.add(ambientLight);


// =====================================
// Controls
// =====================================

const controls =
  new OrbitControls(
    camera,
    renderer.domElement
  );

controls.enableDamping = true;
controls.enablePan = true;

controls.minDistance = 1.5;
controls.maxDistance = 20;

productGroup.rotation.x =
  -0.08;

productGroup.rotation.y =
  -0.12;


// =====================================
// Render (render-on-demand — pauses while the viewer is offscreen)
// =====================================
// Mobile perf: a plain requestAnimationFrame loop renders forever even when
// the viewer has scrolled out of view or nothing changed. Instead we render
// only when something actually changes (OrbitControls "change" — fired on
// user input and on every damping step, so inertia after a drag still plays
// out — or a product rebuild/resize), and only while the viewer is visible.
// A change while offscreen still marks a render as pending so the viewer
// catches up with one frame as soon as it scrolls back into view.

let isViewerVisible = true;
let renderRequested = false;
let renderPendingWhileHidden = false;

function renderFrame() {
  renderRequested = false;

  if (!isViewerVisible) {
    renderPendingWhileHidden = true;
    return;
  }

  controls.update();

  renderer.render(
    scene,
    camera
  );
}

function requestRender() {
  if (renderRequested) return;
  renderRequested = true;
  requestAnimationFrame(renderFrame);
}

controls.addEventListener("change", requestRender);

if ("IntersectionObserver" in window) {
  const viewerVisibilityObserver = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        isViewerVisible = entry.isIntersecting;

        if (isViewerVisible && renderPendingWhileHidden) {
          renderPendingWhileHidden = false;
          requestRender();
        }
      });
    },
    { threshold: 0 }
  );

  viewerVisibilityObserver.observe(viewer);
} else {
  isViewerVisible = true;
}

requestRender();


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

    requestRender();
  }
);


// เริ่มต้น
loadSelectedFont();
// ================================
// ปุ่มยืนยันแบบ
// ================================
const orderButton = document.getElementById("orderButton");

if (orderButton) {
  orderButton.addEventListener("click", function () {
    const exporter = new STLExporter();

    productGroup.updateMatrixWorld(true);

    const baseExportGroup = new THREE.Group();
    const textExportGroup = new THREE.Group();

    productGroup.traverse(function (object) {
      if (!object.isMesh) return;

      const clonedGeometry = object.geometry.clone();
      clonedGeometry.applyMatrix4(object.matrixWorld);

      const clone = new THREE.Mesh(
        clonedGeometry,
        object.material
      );

      // ฐาน + ห่วง ใช้ baseMaterial
      if (object.material === baseMaterial) {
        baseExportGroup.add(clone);
      }

      // ตัวอักษรใช้ textMaterial
      if (object.material === textMaterial) {
        textExportGroup.add(clone);
      }
    });

    const fileName = (nameInput.value || "Cute")
  .trim()
  .replace(/[^\p{L}\p{N}_-]+/gu, "_");

    function downloadSTL(group, suffix) {
      const data = exporter.parse(group, {
        binary: true
      });

      const blob = new Blob([data], {
        type: "application/octet-stream"
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = `${fileName}_${suffix}.stl`;

      document.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 1000);
    }

    downloadSTL(
      baseExportGroup,
      "BASE"
    );

    setTimeout(function () {
      downloadSTL(
        textExportGroup,
        "TEXT"
      );
    }, 300);
  });
}
