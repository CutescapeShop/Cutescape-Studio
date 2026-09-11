// =====================================================================
// clicker/mf3-exporter.js
//
// Minimal, dependency-free 3MF writer. Takes already-extracted, already-
// baked triangle geometry (the exact same vertex/triangle data the
// existing STL export already produces — see clicker-viewer.js's
// gatherExportGroups()/collectTriangles()) and serializes it as one .3mf
// file: a plain ZIP (STORE, uncompressed) containing standard 3MF Core
// Spec geometry ([Content_Types].xml, _rels/.rels, 3D/3dmodel.model —
// object structure/ids/triangles/coordinates are 100% unchanged from the
// original standard-3MF-only implementation) PLUS a minimal, additive pair
// of Bambu-specific Metadata/*.config files so Bambu Studio restores the
// intended per-part filament/color assignment on import. Reverse-
// engineered from a real Bambu-Studio-exported reference file — see
// the "Metadata/*.config" section below for exactly what was found there
// and why each piece is included.
//
// This module does no geometry work of its own — it only formats numbers
// as XML/JSON and bytes as a ZIP container. It never touches THREE.js,
// geometry generation, or any locked pipeline code.
// =====================================================================

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatCoord(n) {
  // Millimeters, fixed precision (plenty beyond FDM printer resolution),
  // trimmed of trailing zeros/dot for smaller files.
  let s = n.toFixed(6);
  if (s.indexOf(".") !== -1) {
    s = s.replace(/0+$/, "").replace(/\.$/, "");
  }
  return s === "-0" ? "0" : s;
}

function hexToDisplayColor(hex) {
  // 3MF displaycolor is #RRGGBB or #RRGGBBAA — always emit fully opaque.
  const clean = /^#?[0-9a-fA-F]{6}$/.test(hex) ? hex.replace(/^#/, "") : "cccccc";
  return "#" + clean.toUpperCase() + "FF";
}

// "#rrggbb" (any case, with or without "#") -> "RRGGBB" (bare, uppercase).
// Used as the dedupe key for the filament palette below, and as the value
// Bambu's project_settings.config expects (bare hex, no leading "#").
function normalizeHex(hex) {
  const clean = /^#?[0-9a-fA-F]{6}$/.test(hex) ? hex.replace(/^#/, "") : "CCCCCC";
  return clean.toUpperCase();
}

// The exported triangle groups are triangle "soups" (STLExporter-style —
// each triangle owns 3 fresh vertices, none shared with its neighbors even
// when they sit at the exact same point in space). 3MF core-spec meshes
// are index-based, so leaving them unwelded makes every triangle edge look
// "open" to a slicer's edge-continuity check, even though the underlying
// surface is exactly as closed as it always was. This welds vertices that
// land on the IDENTICAL output coordinate (same key formatCoord() would
// print — i.e. equal to 1e-6 mm, far finer than any FDM resolution) and
// remaps triangle indices accordingly. It never moves, drops, reorders, or
// alters a single coordinate or triangle's shape — only which vertices are
// allowed to point at the same index when two are already bit-for-bit
// coincident at that precision. Genuinely distinct vertices (any component
// differing by more than 1e-6 mm) are never merged.
function weldVertices(vertices, triangles) {
  const keyToIndex = new Map();
  const weldedVertices = [];
  const remap = new Array(vertices.length);

  for (let i = 0; i < vertices.length; i++) {
    const [x, y, z] = vertices[i];
    const key = formatCoord(x) + "|" + formatCoord(y) + "|" + formatCoord(z);
    let weldedIndex = keyToIndex.get(key);
    if (weldedIndex === undefined) {
      weldedIndex = weldedVertices.length;
      weldedVertices.push(vertices[i]);
      keyToIndex.set(key, weldedIndex);
    }
    remap[i] = weldedIndex;
  }

  const weldedTriangles = triangles.map(([a, b, c]) => [remap[a], remap[b], remap[c]]);
  return { vertices: weldedVertices, triangles: weldedTriangles };
}

// Object ids are assigned once, deterministically, from array order — both
// 3D/3dmodel.model and Metadata/model_settings.config below must agree on
// exactly the same id per object, since Bambu Studio's per-part filament
// mapping in model_settings.config references these ids directly.
const BASEMATERIALS_ID = 1;
const FIRST_OBJECT_ID = BASEMATERIALS_ID + 1;

function objectIdFor(index) {
  return FIRST_OBJECT_ID + index;
}

// "Objects using the same print color should share the same filament/
// extruder entry" — build the color palette in first-appearance order
// across `objects`, and a lookup from each object's index to its 1-based
// extruder/filament slot number (matches project_settings.config's
// filament_colour array, which is 0-indexed by extruder-1).
function assignFilamentSlots(objects) {
  const palette = []; // bare "RRGGBB" hex, in first-appearance order
  const slotByColor = new Map(); // "RRGGBB" -> 1-based slot number
  const slotByObjectIndex = objects.map((obj) => {
    const hex = normalizeHex(obj.colorHex);
    let slot = slotByColor.get(hex);
    if (slot === undefined) {
      palette.push(hex);
      slot = palette.length; // 1-based
      slotByColor.set(hex, slot);
    }
    return slot;
  });
  return { palette, slotByObjectIndex };
}

// ---------------- 3D/3dmodel.model XML (unchanged local mesh geometry) ----------------

function planPlateLayout(objects) {
  const top = objects.map((obj, index) => ({ obj, index }))
    .filter(({ obj }) => obj.name === "TOP_BASE" || /^ACCENT_/.test(obj.name));
  const housing = objects.map((obj, index) => ({ obj, index }))
    .filter(({ obj }) => obj.name === "HOUSING");
  if (!top.some(({ obj }) => obj.name === "TOP_BASE") || housing.length !== 1 ||
      top.length + housing.length !== objects.length) {
    throw new Error("3MF plate placement requires TOP_BASE, optional ACCENT parts, and one HOUSING.");
  }
  const bounds = (parts) => {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const { obj } of parts) for (const vertex of obj.vertices) {
      for (let axis = 0; axis < 3; axis++) {
        if (!Number.isFinite(vertex[axis])) throw new Error("Invalid 3MF vertex.");
        min[axis] = Math.min(min[axis], vertex[axis]);
        max[axis] = Math.max(max[axis], vertex[axis]);
      }
    }
    if (!min.every(Number.isFinite)) throw new Error("Empty 3MF printable piece.");
    return { min, max, width: max[0] - min[0], depth: max[1] - min[1] };
  };
  const a = bounds(top), b = bounds(housing), gap = 10, plate = 256, margin = 5;
  const width = a.width + gap + b.width;
  if (width > plate - 2 * margin || Math.max(a.depth, b.depth) > plate - 2 * margin) {
    throw new Error("Clicker pieces do not fit the P2S plate with the required gap and margins.");
  }
  const left = (plate - width) / 2;
  const transform = (box, x) => `1 0 0 0 1 0 0 0 1 ${formatCoord(x - box.min[0])} ${formatCoord(plate / 2 - (box.min[1] + box.max[1]) / 2)} ${formatCoord(-box.min[2])}`;
  return [
    { id: objectIdFor(objects.length), name: "TOP", parts: top, transform: transform(a, left) },
    { id: objectIdFor(housing[0].index), name: "HOUSING", parts: housing, transform: transform(b, left + a.width + gap) },
  ];
}

function buildModelXML(objects, layout) {
  const baseEntries = objects
    .map((obj) => `<base name="${escapeXml(obj.name)}" displaycolor="${hexToDisplayColor(obj.colorHex)}"/>`)
    .join("");

  const objectBlocks = [];
  const buildItems = [];

  objects.forEach((obj, index) => {
    const objectId = objectIdFor(index);
    const { vertices: weldedVertices, triangles: weldedTriangles } = weldVertices(obj.vertices, obj.triangles);

    const vertexXml = weldedVertices
      .map(([x, y, z]) => `<vertex x="${formatCoord(x)}" y="${formatCoord(y)}" z="${formatCoord(z)}"/>`)
      .join("");

    const triangleXml = weldedTriangles
      .map(([a, b, c]) => `<triangle v1="${a}" v2="${b}" v3="${c}"/>`)
      .join("");

    objectBlocks.push(
      `<object id="${objectId}" type="model" name="${escapeXml(obj.name)}" pid="${BASEMATERIALS_ID}" pindex="${index}">` +
      `<mesh><vertices>${vertexXml}</vertices><triangles>${triangleXml}</triangles></mesh>` +
      `</object>`
    );

  });

  // One component assembly keeps every TOP region rigid, without changing any
  // local mesh coordinates or relative Z heights. Only build items translate.
  objectBlocks.push(`<object id="${layout[0].id}" type="model" name="${escapeXml(layout[0].name)}"><components>` +
    layout[0].parts.map(({ index }) => `<component objectid="${objectIdFor(index)}"/>`).join("") +
    `</components></object>`);
  for (const piece of layout) {
    buildItems.push(`<item objectid="${piece.id}" transform="${piece.transform}"/>`);
  }

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">` +
    // Bambu gates project_settings.config loading on this compatibility marker
    // (the version matches the reference project's metadata dialect). Without
    // it, Bambu skips our palette and opens geometry with its existing colors.
    `<metadata name="Application">BambuStudio-01.07.04.52</metadata>` +
    `<metadata name="Description">Generated by Cutescape Studio; Bambu-compatible project metadata.</metadata>` +
    `<resources>` +
    `<basematerials id="${BASEMATERIALS_ID}">${baseEntries}</basematerials>` +
    objectBlocks.join("") +
    `</resources>` +
    `<build>${buildItems.join("")}</build>` +
    `</model>`
  );
}

const CONTENT_TYPES_XML =
  `<?xml version="1.0" encoding="UTF-8"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>` +
  `</Types>`;

const RELS_XML =
  `<?xml version="1.0" encoding="UTF-8"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>` +
  `</Relationships>`;

// ---------------- Metadata/*.config (minimal, additive Bambu metadata) ----------------
//
// Reverse-engineered from a real Bambu-Studio-exported reference 3MF (see
// the audit this implementation is based on). Confirmed by direct
// inspection of that file: standard 3MF <basematerials>/pid/pindex is
// NEVER used by Bambu Studio for filament assignment — it isn't even
// present in Bambu's own exports. The only thing Bambu Studio reads for
// per-part color/filament is this pair of Metadata/*.config files,
// referencing the SAME object ids already used in 3D/3dmodel.model above
// (see objectIdFor()). Neither file is linked via any .rels relationship
// in the reference file either — Bambu Studio finds them by their fixed
// well-known path inside the zip.
//
// Deliberately NOT included (per the audit): MakerWorld/MakerLab
// provenance metadata, thumbnails, sliced G-code, and the Production
// Extension split-file packaging the reference file used. Our meshes stay
// in one model file; a Core components object groups the TOP for placement.

// project_settings.config is JSON despite its ".config" extension (matches
// the reference file byte-for-byte in that respect). Only the printer/
// process identifiers the reference file itself carried are included —
// enough for Bambu Studio to recognize it as a valid process/printer
// combination; slot arrays are sized to our actual filament count.
function buildProjectSettingsConfigJSON(palette) {
  const n = palette.length;
  const settings = {
    filament_colour: palette.map((hex) => "#" + hex),
    filament_diameter: Array(n).fill("1.75"),
    filament_is_support: Array(n).fill("0"),
    filament_settings_id: Array(n).fill("Bambu PLA Basic @BBL P2S"),
    printer_model: "Bambu Lab P2S",
    printer_settings_id: "Bambu Lab P2S 0.4 nozzle",
    print_settings_id: "0.20mm Standard @BBL P2S",
    nozzle_diameter: ["0.4"],
    printable_area: ["0x0", "256x0", "256x256", "0x256"],
    printable_height: "256",
    curr_bed_type: "Textured PEI Plate",
  };
  return JSON.stringify(settings);
}

// Keep the original mesh IDs and filament slots on each part, grouping TOP
// parts under their rigid assembly. HOUSING remains a single-mesh object.
function buildModelSettingsConfigXML(layout, slotByObjectIndex, filamentCount) {
  const objectBlocks = layout.map((piece) => {
    const parts = piece.parts.map(({ obj, index }) => {
      const id = objectIdFor(index), slot = slotByObjectIndex[index], name = escapeXml(obj.name);
      return (
      `<part id="${id}" subtype="normal_part">` +
      `<metadata key="name" value="${name}"/>` +
      `<metadata key="extruder" value="${slot}"/>` +
      `<mesh_stat edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>` +
      `</part>`);
    }).join("");
    return `<object id="${piece.id}">` +
      `<metadata key="name" value="${piece.name}"/>` +
      `<metadata key="extruder" value="${slotByObjectIndex[piece.parts[0].index]}"/>` + parts + `</object>`;
  });

  const modelInstances = layout
    .map(({ id }) => `<model_instance><metadata key="object_id" value="${id}"/><metadata key="instance_id" value="0"/></model_instance>`)
    .join("");

  const assembleItems = layout
    .map(({ id, transform }) => `<assemble_item object_id="${id}" instance_id="0" transform="${transform}" offset="0 0 0"/>`)
    .join("");

  // One "1" per FILAMENT slot (which physical AMS unit it maps to — "1" is
  // the reference file's own default for every slot), not per object.
  const filamentMaps = Array(filamentCount).fill("1").join(" ");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<config>` +
    objectBlocks.join("") +
    `<plate>` +
    `<metadata key="plater_id" value="1"/>` +
    `<metadata key="plater_name" value="plate-1"/>` +
    modelInstances +
    `<metadata key="filament_maps" value="${filamentMaps}"/>` +
    `</plate>` +
    `<assemble>${assembleItems}</assemble>` +
    `</config>`
  );
}

// ---------------- Minimal ZIP (STORE only) writer ----------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function utf8Bytes(str) {
  return new TextEncoder().encode(str);
}

// Builds an uncompressed ("STORE") ZIP archive from {name, data} entries.
// data may be a string (UTF-8 encoded) or a Uint8Array.
function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = utf8Bytes(entry.name);
    const data = typeof entry.data === "string" ? utf8Bytes(entry.data) : entry.data;
    const crc = crc32(data);
    const size = data.length;

    const localHeader = new DataView(new ArrayBuffer(30));
    localHeader.setUint32(0, 0x04034b50, true);
    localHeader.setUint16(4, 20, true); // version needed
    localHeader.setUint16(6, 0, true); // flags
    localHeader.setUint16(8, 0, true); // method: store
    localHeader.setUint16(10, 0, true); // mod time
    localHeader.setUint16(12, 0, true); // mod date
    localHeader.setUint32(14, crc, true);
    localHeader.setUint32(18, size, true); // compressed size
    localHeader.setUint32(22, size, true); // uncompressed size
    localHeader.setUint16(26, nameBytes.length, true);
    localHeader.setUint16(28, 0, true); // extra field length

    localParts.push(new Uint8Array(localHeader.buffer), nameBytes, data);

    const centralHeader = new DataView(new ArrayBuffer(46));
    centralHeader.setUint32(0, 0x02014b50, true);
    centralHeader.setUint16(4, 20, true); // version made by
    centralHeader.setUint16(6, 20, true); // version needed
    centralHeader.setUint16(8, 0, true); // flags
    centralHeader.setUint16(10, 0, true); // method: store
    centralHeader.setUint16(12, 0, true); // mod time
    centralHeader.setUint16(14, 0, true); // mod date
    centralHeader.setUint32(16, crc, true);
    centralHeader.setUint32(20, size, true); // compressed size
    centralHeader.setUint32(24, size, true); // uncompressed size
    centralHeader.setUint16(28, nameBytes.length, true);
    centralHeader.setUint16(30, 0, true); // extra field length
    centralHeader.setUint16(32, 0, true); // comment length
    centralHeader.setUint16(34, 0, true); // disk number start
    centralHeader.setUint16(36, 0, true); // internal attributes
    centralHeader.setUint32(38, 0, true); // external attributes
    centralHeader.setUint32(42, offset, true); // local header offset

    centralParts.push(new Uint8Array(centralHeader.buffer), nameBytes);

    offset += localHeader.byteLength + nameBytes.length + size;
  }

  const centralDirSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const centralDirOffset = offset;

  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(4, 0, true); // disk number
  eocd.setUint16(6, 0, true); // disk with central dir
  eocd.setUint16(8, entries.length, true); // entries on this disk
  eocd.setUint16(10, entries.length, true); // total entries
  eocd.setUint32(12, centralDirSize, true);
  eocd.setUint32(16, centralDirOffset, true);
  eocd.setUint16(20, 0, true); // comment length

  const allParts = [...localParts, ...centralParts, new Uint8Array(eocd.buffer)];
  const totalLength = allParts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(totalLength);
  let pos = 0;
  for (const part of allParts) {
    out.set(part, pos);
    pos += part.length;
  }
  return out;
}

/**
 * Builds a 3MF file (standard Core Spec geometry + minimal additive Bambu
 * filament/color metadata) from already-extracted, already-baked triangle
 * geometry.
 *
 * @param {Array<{name: string, colorHex: string, vertices: number[][], triangles: number[][]}>} objects
 *   One entry per printable part. `vertices` are [x, y, z] in millimeters,
 *   already in final baked/exported coordinates (same as the STL export
 *   uses). `triangles` are [i, j, k] indices into that object's own
 *   `vertices` array (object-local, NOT a global index). Objects sharing
 *   the same `colorHex` are assigned the same Bambu filament/extruder slot.
 * @returns {Uint8Array} the .3mf file bytes
 */
export function build3MF(objects) {
  const layout = planPlateLayout(objects);
  const modelXml = buildModelXML(objects, layout);

  const { palette, slotByObjectIndex } = assignFilamentSlots(objects);
  const projectSettingsJson = buildProjectSettingsConfigJSON(palette);
  const modelSettingsXml = buildModelSettingsConfigXML(layout, slotByObjectIndex, palette.length);

  return buildZip([
    { name: "[Content_Types].xml", data: CONTENT_TYPES_XML },
    { name: "_rels/.rels", data: RELS_XML },
    { name: "3D/3dmodel.model", data: modelXml },
    { name: "Metadata/model_settings.config", data: modelSettingsXml },
    { name: "Metadata/project_settings.config", data: projectSettingsJson },
  ]);
}

// Coordinates remain STL-baked. Only the assembly reverses the presentation
// rotation and moves the complete keychain onto the configured P2S plate.
export function buildNameKeychain3MF(objects, inverseRotation) {
  if (objects.length !== 2 || objects[0].name !== "BASE" || objects[1].name !== "TEXT") {
    throw new Error("Name Keychain requires BASE and TEXT parts.");
  }
  if (inverseRotation.length !== 9 || !inverseRotation.every(Number.isFinite)) {
    throw new Error("Invalid keychain placement rotation.");
  }
  const r = inverseRotation, min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const obj of objects) {
    if (!obj.vertices.length || !obj.triangles.length) throw new Error("Empty keychain part.");
    for (const v of obj.vertices) {
      for (let axis = 0; axis < 3; axis++) {
        const value = r[axis] * v[0] + r[3 + axis] * v[1] + r[6 + axis] * v[2];
        if (!Number.isFinite(value)) throw new Error("Invalid keychain vertex.");
        min[axis] = Math.min(min[axis], value);
        max[axis] = Math.max(max[axis], value);
      }
    }
  }
  if (max[0] - min[0] > 246 || max[1] - min[1] > 246) {
    throw new Error("Keychain does not fit the P2S plate with 5 mm margins.");
  }
  const transform = [...r, 128 - (min[0] + max[0]) / 2,
    128 - (min[1] + max[1]) / 2, -min[2]].join(" ");
  const layout = [{ id: objectIdFor(objects.length), name: "NAME_KEYCHAIN",
    parts: objects.map((obj, index) => ({ obj, index })), transform }];
  const { palette, slotByObjectIndex } = assignFilamentSlots(objects);
  return buildZip([
    { name: "[Content_Types].xml", data: CONTENT_TYPES_XML },
    { name: "_rels/.rels", data: RELS_XML },
    { name: "3D/3dmodel.model", data: buildModelXML(objects, layout) },
    { name: "Metadata/model_settings.config", data: buildModelSettingsConfigXML(layout, slotByObjectIndex, palette.length) },
    { name: "Metadata/project_settings.config", data: buildProjectSettingsConfigJSON(palette) },
  ]);
}
