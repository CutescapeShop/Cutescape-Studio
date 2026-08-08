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

const ringOuterWidth = 0.88;
const ringOuterHeight = 0.68;
const ringHoleDiameter = 0.42;

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
    "./assets/fonts/SaturnThin.ttf"
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


// =====================================
// สร้างห่วงกลมมีรูทะลุ
// =====================================

function createRingMesh(
  xPosition,
  zPosition = 0
) {
  const ringShape =
    new THREE.Shape();

  ringShape.absellipse(
  0,
  0,
  ringOuterWidth / 2,
  ringOuterHeight / 2,
  0,
  Math.PI * 2,
  false
);

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

  ringShape.holes.push(
    holePath
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
    0,
    zPosition
  );

  return ringMesh;
}


// =====================================
// สร้างฐานตามตัวอักษร
// =====================================

function createOutlineProduct(textValue) {
  // เป้าหมาย: ฐานไดคัทแบบสติกเกอร์ — ขอบวิ่งรอบ silhouette ของชื่อจริง
  // ไม่ใช่การเอาตัวหนังสือชุดใหญ่ซ้อนอยู่ข้างหลังอีกต่อไป

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
  const offsetter = new ClipperLib.ClipperOffset(2, 0.03 * CLIPPER_SCALE);
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

function smoothClosedPath(path) {
  if (path.length < 3) return path;

  const result = [];
  const radius = 0.12;

  for (let i = 0; i < path.length; i++) {
    const prev = path[(i - 1 + path.length) % path.length];
    const curr = path[i];
    const next = path[(i + 1) % path.length];

    const v1x = prev.X - curr.X;
    const v1y = prev.Y - curr.Y;
    const v2x = next.X - curr.X;
    const v2y = next.Y - curr.Y;

    const len1 = Math.hypot(v1x, v1y);
    const len2 = Math.hypot(v2x, v2y);

    if (len1 < 1 || len2 < 1) {
      result.push(curr);
      continue;
    }

    const cut = Math.min(
      radius * CLIPPER_SCALE,
      len1 * 0.22,
      len2 * 0.22
    );

    result.push({
      X: curr.X + (v1x / len1) * cut,
      Y: curr.Y + (v1y / len1) * cut
    });

    result.push({
      X: curr.X + (v2x / len2) * cut,
      Y: curr.Y + (v2y / len2) * cut
    });
  }

  return result;
}

const baseShapes = unitedPaths
  .filter((path) => path.length >= 3)
  .map((path) => {

    // มนเฉพาะมุมของ silhouette
   const smoothPath = smoothClosedPath(path);

    const shape = new THREE.Shape();

    smoothPath.forEach((p, index) => {
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
  frontTextMesh.position.z = 0.37;
  productGroup.add(frontTextMesh);

  // ห่วงแบบฝังชิดฐานเหมือนชิ้นงานตัวอย่าง
  // ให้ขอบขวาของห่วงกินเข้าไปใน silhouette ของฐานโดยตรง
  // จึงไม่ต้องมีก้านยาว/คอเหลี่ยมซึ่งเป็นจุดหักง่าย
  const leftEdge = baseBox.min.x;
  const ringOverlap = 0.16;
  const ringX = leftEdge - ringOuterWidth / 2 + ringOverlap;
  const ringMesh = createRingMesh(ringX, 0);
  productGroup.add(ringMesh);

  return finalBaseWidth + (ringOuterWidth - ringOverlap);
}

function createStickerProduct(textValue) {
  return createOutlineProduct(textValue);
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
      fittedText.width + 2.2,
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
    ringHoleDiameter / 2,
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

  textMesh.position.x = 0.35;

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

function rebuildProduct() {
  if (!loadedFont) {
    return;
  }

  clearProduct();

  let textValue =
    nameInput
      ? nameInput.value.trim()
      : "KIRIN";

  if (textValue === "") {
    textValue = "KIRIN";
  }

  textValue =
    textValue.toUpperCase();

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
controls.enablePan = false;

controls.minDistance = 4;
controls.maxDistance = 20;

productGroup.rotation.x =
  -0.08;

productGroup.rotation.y =
  -0.12;


// =====================================
// Render
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

      const clone = new THREE.Mesh(
        object.geometry.clone(),
        object.material
      );

      clone.applyMatrix4(object.matrixWorld);

      // ฐาน + ห่วง ใช้ baseMaterial
      if (object.material === baseMaterial) {
        baseExportGroup.add(clone);
      }

      // ตัวอักษรใช้ textMaterial
      if (object.material === textMaterial) {
        textExportGroup.add(clone);
      }
    });

    const fileName = (nameInput.value || "Cutescape")
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