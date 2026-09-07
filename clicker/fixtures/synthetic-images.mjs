// =====================================================================
// clicker/fixtures/synthetic-images.mjs
//
// Procedurally generated stand-ins for the artwork that exercised the
// colour-clustering failures. Generated rather than shipped as PNGs so
// the fixtures carry no third-party artwork, stay diff-readable, and
// can be regenerated exactly on any machine.
//
// Each builder returns a canvas-shaped {data, width, height} and paints
// an alpha cutout (transparent margin + opaque subject), matching how
// buildMask() derives a silhouette from real uploads.
//
// Every image ends with an anti-aliasing pass that blends colour
// boundaries and sprinkles isolated blend speckles — the "dither" that
// used to steal cluster budget from real design colours.
// =====================================================================

/** Deterministic PRNG (mulberry32) — fixtures must be byte-identical every run. */
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const hex = (h) => {
  const v = h.replace("#", "");
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
};

class Image {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4); // transparent
  }
  set(x, y, rgb) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    this.data[i] = rgb[0]; this.data[i + 1] = rgb[1]; this.data[i + 2] = rgb[2]; this.data[i + 3] = 255;
  }
  get(x, y) {
    const i = (y * this.width + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }
  ellipse(cx, cy, rx, ry, colour) {
    const rgb = hex(colour);
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, rgb);
      }
    }
  }
  rect(x0, y0, x1, y1, colour) {
    const rgb = hex(colour);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) this.set(x, y, rgb);
  }
  /** Repaint opaque pixels inside an ellipse — used to split a silhouette into regions. */
  ellipseOver(cx, cy, rx, ry, colour) {
    const rgb = hex(colour);
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1 && this.get(x, y)[3] === 255) this.set(x, y, rgb);
      }
    }
  }
  /** Thick line, only over already-opaque pixels. */
  line(x0, y0, x1, y1, halfWidth, colour) {
    const rgb = hex(colour);
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) * 2;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t;
      for (let y = Math.floor(cy - halfWidth); y <= cy + halfWidth; y++) {
        for (let x = Math.floor(cx - halfWidth); x <= cx + halfWidth; x++) {
          if (Math.hypot(x - cx, y - cy) <= halfWidth && this.get(x, y)[3] === 255) this.set(x, y, rgb);
        }
      }
    }
  }
}

/**
 * Blend colour boundaries and scatter isolated speckles, reproducing the
 * anti-aliasing noise of exported artwork. Runs off a snapshot so blends
 * never cascade into each other.
 */
function antiAlias(img, seed, speckleRate = 0.35) {
  const rand = rng(seed);
  const snapshot = Uint8ClampedArray.from(img.data);
  const at = (x, y) => {
    const i = (y * img.width + x) * 4;
    return [snapshot[i], snapshot[i + 1], snapshot[i + 2], snapshot[i + 3]];
  };
  for (let y = 1; y < img.height - 1; y++) {
    for (let x = 1; x < img.width - 1; x++) {
      const c = at(x, y);
      if (c[3] !== 255) continue;
      const neighbours = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)];
      const other = neighbours.find((n) => n[3] === 255 && (n[0] !== c[0] || n[1] !== c[1] || n[2] !== c[2]));
      if (!other) continue;
      if (rand() > speckleRate) continue;
      const mix = rand() * 0.6 + 0.2; // never a clean copy of either side
      img.set(x, y, [
        Math.round(c[0] + (other[0] - c[0]) * mix),
        Math.round(c[1] + (other[1] - c[1]) * mix),
        Math.round(c[2] + (other[2] - c[2]) * mix),
      ]);
    }
  }
}

/**
 * BIRD case — two large, perceptually adjacent design colours (dark
 * teal "wing" / bright cyan "body") that farthest-point seeding used to
 * collapse into a single cluster, plus a tiny high-contrast eye and a
 * small beak that must survive alongside them.
 */
export function twoToneWithSmallDetails() {
  const img = new Image(400, 400);
  img.ellipse(200, 200, 185, 150, "#008080");          // whole silhouette = wing teal
  img.ellipseOver(265, 195, 120, 105, "#00ccff");       // body/head in bright cyan
  img.ellipseOver(120, 300, 70, 34, "#2c89a0");         // tail band (mid teal)
  img.ellipseOver(95, 320, 50, 22, "#5fbcd3");          // tail band (light teal)
  img.ellipse(355, 190, 26, 12, "#ffcc00");             // beak
  img.ellipse(300, 165, 7, 7, "#241f1c");               // eye
  antiAlias(img, 0x1234);
  return img;
}

/**
 * CAT case — a pale cream tint and a mid-ramp orange that both sit close
 * to the dominant face colour in Lab space, so area-blind seeding folded
 * them into the dominant cluster and they never became accent geometry.
 */
export function closeTintFeatures() {
  const img = new Image(400, 400);
  img.ellipse(200, 205, 180, 175, "#f6b76d");           // dominant face
  img.ellipseOver(200, 330, 150, 55, "#e69b51");        // stripe / chest band
  img.ellipseOver(90, 150, 42, 30, "#e69b51");          // ear interior
  for (let i = 0; i < 3; i++) {                          // whiskers, both cheeks
    img.line(120, 215 + i * 22, 40, 200 + i * 30, 3.5, "#fdd099");
    img.line(280, 215 + i * 22, 360, 200 + i * 30, 3.5, "#fdd099");
  }
  img.ellipse(160, 165, 11, 13, "#402312");             // eyes
  img.ellipse(240, 165, 11, 13, "#402312");
  img.ellipse(200, 205, 13, 9, "#402312");              // nose
  antiAlias(img, 0x5678);
  return img;
}

/**
 * FISH case — three strongly separated colours plus deliberately heavy
 * boundary dither. The dither must never be promoted to its own cluster,
 * and the small highlight must survive as a real region.
 */
export function highContrastWithDither() {
  const img = new Image(400, 400);
  img.ellipse(200, 200, 190, 130, "#ff7e38");           // orange body
  img.rect(120, 70, 165, 330, "#ffffff");                // white band
  img.rect(240, 70, 285, 330, "#ffffff");
  img.rect(95, 70, 120, 330, "#000000");                 // black outlines
  img.rect(165, 70, 190, 330, "#000000");
  img.rect(215, 70, 240, 330, "#000000");
  img.rect(285, 70, 310, 330, "#000000");
  // restore the silhouette: clear anything the bands painted outside the body
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const dx = (x - 200) / 190, dy = (y - 200) / 130;
      if (dx * dx + dy * dy > 1) {
        const i = (y * img.width + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = img.data[i + 3] = 0;
      }
    }
  }
  img.ellipse(330, 175, 14, 10, "#ff9f6b");             // small highlight
  antiAlias(img, 0x9abc, 0.75);                          // heavy dither
  return img;
}

/**
 * DOG case — continuous-tone, textured subject with no flat regions at
 * all. The coherence gate must stand down here rather than starving the
 * clustering, and tonal separation must survive.
 */
export function continuousTone() {
  const img = new Image(360, 360);
  const rand = rng(0xbeef);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const dx = (x - 180) / 165, dy = (y - 185) / 170;
      if (dx * dx + dy * dy > 1) continue;
      const shade = 1 - 0.45 * Math.sqrt(dx * dx + dy * dy);   // smooth falloff
      const grain = (rand() - 0.5) * 46;                        // fur-like texture
      img.set(x, y, [
        Math.round(232 * shade + grain),
        Math.round(188 * shade + grain),
        Math.round(140 * shade + grain),
      ]);
    }
  }
  // dark facial features + a saturated tongue, so tonal range is real
  img.ellipse(140, 150, 13, 15, "#372a26");
  img.ellipse(220, 150, 13, 15, "#372a26");
  img.ellipse(180, 200, 24, 17, "#2b211d");
  img.ellipse(180, 243, 20, 14, "#d4707f");
  antiAlias(img, 0xfeed, 0.5);
  return img;
}

export const SYNTHETIC_FIXTURES = {
  Bird: twoToneWithSmallDetails,
  Cat: closeTintFeatures,
  Fish: highContrastWithDither,
  Dog: continuousTone,
};
