// =====================================================================
// clicker/clicker-ui.js
//
// "Clicker from Image" — Phase 1 test UI.
//
// Wires the DOM controls added for this feature to
// clicker/image-processing.js and renders 2D preview canvases only.
//
// Explicitly out of scope for Phase 1 (per plan): no THREE.js scene,
// no 3D preview, no MX stem, no STL export. Those are Phase 2+.
//
// This file does not import, reference, or modify viewer.js / script.js
// in any way, and does not touch any Name Keychain DOM element.
// =====================================================================

import {
  loadImageFile,
  getImageDataFromImage,
  processImageToPaths,
  buildColorRegions,
  fitArtworkColorRegions,
  signedArea,
} from "./image-processing.js";

import { computeAutoFitTransform } from "./geometry-math.js";
import { CLICKER_PROFILE } from "./stem-profile.js";
import { CURATED_FILAMENT_PALETTE } from "./color-palette.js";

// TH/EN strings for the customer-facing UI, via the same window.t()
// mechanism i18n.js already exposes for Name Keychain — same pattern
// script.js uses for its own dynamic status text. `fallback` keeps
// this file working (in Thai) even if i18n.js hasn't loaded yet.
function ct(key, vars, fallback) {
  return window.t ? window.t(key, vars) : fallback;
}


// ---------------- DOM references (all new elements) ----------------

const fileInput = document.getElementById("clickerFileInput");
const fileInputNameEl = document.getElementById("clickerFileInputName");
const thresholdSlider = document.getElementById("clickerThresholdSlider");
const thresholdValue = document.getElementById("clickerThresholdValue");
const invertButton = document.getElementById("clickerInvertButton");
const smoothingSlider = document.getElementById("clickerSmoothingSlider");
const smoothingValue = document.getElementById("clickerSmoothingValue");
const debugInfo = document.getElementById("clickerDebugInfo");
const emptyState = document.getElementById("clickerEmptyState");
const canvasRow = document.getElementById("clickerCanvasRow");

const originalCanvas = document.getElementById("clickerOriginalCanvas");
const maskCanvas = document.getElementById("clickerMaskCanvas");
const finalCanvas = document.getElementById("clickerFinalCanvas");

// New for the multi-color TOP pipeline — optional: if this markup
// isn't present, color-region computation just falls back to
// CLICKER_PROFILE.accent.colorCount.default rather than failing.
const colorCountSlider = document.getElementById("clickerColorCountSlider");
const colorCountValue = document.getElementById("clickerColorCountValue");
const colorCountMinLabel = document.getElementById("clickerColorCountMinLabel");
const colorCountMaxLabel = document.getElementById("clickerColorCountMaxLabel");
const sizeSlider = document.getElementById("clickerSizeSlider");
const sizeValue = document.getElementById("clickerSizeValue");
const sizeMinLabel = document.getElementById("clickerSizeMinLabel");
const sizeMaxLabel = document.getElementById("clickerSizeMaxLabel");

// Editable TOP color regions (detected -> print color). Optional, same
// fallback pattern as colorCountSlider above.
const colorRegionRowsContainer = document.getElementById("clickerColorRegionRows");
const colorPalettePopover = document.getElementById("clickerColorPalettePopover");
const colorPaletteGroups = document.getElementById("clickerColorPaletteGroups");
const colorPaletteCustomInput = document.getElementById("clickerColorPaletteCustom");

function selectedSizeMM() {
  return Math.max(CLICKER_PROFILE.body.minSizeMM, Math.min(CLICKER_PROFILE.body.maxSizeMM,
    Number(sizeSlider?.value) || CLICKER_PROFILE.body.targetSize));
}

// If the Clicker markup isn't present (e.g. this file loaded on a page
// without it), do nothing rather than throw — keeps this module inert
// and harmless anywhere else.
if (
  fileInput &&
  thresholdSlider &&
  invertButton &&
  smoothingSlider &&
  originalCanvas &&
  maskCanvas &&
  finalCanvas
) {
  init();
}

function init() {
  const state = {
    imageData: null,
    invert: false,
    imageKey: null,
    silhouetteCache: new Map(),
    colorCache: new Map(),
    contourCache: new Map(),
    // Detected TOP color hex -> user-chosen print color hex. Keyed by the
    // ORIGINAL detected color, not by region index, so it survives cache
    // hits and slider tweaks that don't change detection. Display-only:
    // never fed back into detection/segmentation/geometry.
    colorOverrides: new Map(),
    disabledColors: new Set(),
    lastColorRegions: null,
  };

  let pipelineTimer = null;
  // Which TOP region (if any) the popover is currently open for, so a
  // re-render (new pipeline run) can reopen it in place. Generic HOUSING
  // use of the same popover (see window.openClickerColorPalette below)
  // never sets this — it has no "region" concept to restore.
  let activePaletteRegionKey = null;
  let activePaletteTargetEl = null;
  let activePaletteOnSelect = null;

  function resolvePrintColor(sourceHex) {
    return state.colorOverrides.get(sourceHex) || sourceHex;
  }

  function notifyColorOverrideChange() {
    if (typeof window.onClickerColorOverrideChange === "function") {
      window.onClickerColorOverrideChange(Object.fromEntries(state.colorOverrides));
    }
  }

  function closeColorPalette() {
    if (colorPalettePopover) colorPalettePopover.hidden = true;
    activePaletteRegionKey = null;
    activePaletteTargetEl = null;
    activePaletteOnSelect = null;
  }

  function applyColorSelection(sourceHex, targetHex) {
    state.colorOverrides.set(sourceHex, targetHex);
    if (activePaletteTargetEl) {
      activePaletteTargetEl.style.background = targetHex;
      activePaletteTargetEl.title = ct("clicker.colorRegion.printColorTitle", { hex: targetHex }, `สีที่ใช้พิมพ์: ${targetHex}`);
    }
    // Preview must update immediately — no pipeline re-run, no geometry
    // change, just the existing material's color on the live scene.
    notifyColorOverrideChange();
  }

  // Generic curated-palette popover, reused by both TOP color regions
  // (below) and HOUSING (clicker-viewer.js, via window.openClickerColorPalette
  // since this popover's DOM/rendering lives here). `onSelect(hex)` is
  // called for every choice — a swatch click closes the popover after,
  // dragging the custom picker does not, matching the original TOP-only
  // behavior exactly. This function itself has no opinion about what a
  // selection MEANS (a region override vs. a direct material color) —
  // that's entirely the caller's `onSelect` implementation.
  function openColorPalette(anchorEl, currentColorHex, onSelect) {
    if (!colorPalettePopover) return;
    activePaletteTargetEl = anchorEl;
    activePaletteOnSelect = onSelect;

    const rect = anchorEl.getBoundingClientRect();
    const popoverWidth = 232;
    colorPalettePopover.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - popoverWidth - 8))}px`;
    colorPalettePopover.style.top = `${rect.bottom + 6}px`;
    colorPalettePopover.hidden = false;

    const currentColor = String(currentColorHex).toLowerCase();
    if (colorPaletteGroups) {
      colorPaletteGroups.innerHTML = "";
      for (const group of CURATED_FILAMENT_PALETTE) {
        const wrap = document.createElement("div");
        wrap.className = "color-palette-family";
        const heading = document.createElement("p");
        heading.className = "color-palette-family-name";
        heading.textContent = group.family;
        wrap.appendChild(heading);

        const row = document.createElement("div");
        row.className = "color-palette-swatches";
        for (const swatch of group.swatches) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "color-palette-swatch";
          btn.style.background = swatch.hex;
          btn.title = swatch.name;
          if (swatch.hex.toLowerCase() === currentColor) btn.classList.add("active");
          btn.addEventListener("click", () => {
            if (activePaletteOnSelect) activePaletteOnSelect(swatch.hex);
            closeColorPalette();
          });
          row.appendChild(btn);
        }
        wrap.appendChild(row);
        colorPaletteGroups.appendChild(wrap);
      }
    }
    if (colorPaletteCustomInput) colorPaletteCustomInput.value = currentColor;
  }
  // Exposed for HOUSING (clicker-viewer.js) — same cross-module
  // window-exposure idiom already used for window.onClickerPipelineResult/
  // window.setupColorButtons elsewhere in this project.
  window.openClickerColorPalette = openColorPalette;

  // TOP-region-specific opener: preserves the exact prior behavior
  // (region-keyed override + reopen-after-rerender) on top of the now-generic openColorPalette.
  function openTopColorPalette(anchorEl, region) {
    activePaletteRegionKey = region.sourceHex;
    openColorPalette(anchorEl, resolvePrintColor(region.sourceHex),
      (newHex) => applyColorSelection(region.sourceHex, newHex));
  }

  if (colorPaletteCustomInput) {
    // Live-update while dragging the native picker, same as a swatch click.
    colorPaletteCustomInput.addEventListener("input", () => {
      if (activePaletteOnSelect) activePaletteOnSelect(colorPaletteCustomInput.value);
    });
  }

  document.addEventListener("click", (ev) => {
    if (!colorPalettePopover || colorPalettePopover.hidden) return;
    if (colorPalettePopover.contains(ev.target)) return;
    if (activePaletteTargetEl && activePaletteTargetEl.contains(ev.target)) return;
    closeColorPalette();
  });

  function renderColorRegionRows() {
    if (!colorRegionRowsContainer) return;
    const wasOpenFor = activePaletteRegionKey;
    closeColorPalette();
    colorRegionRowsContainer.innerHTML = "";

    const colorRegions = state.lastColorRegions;
    if (!colorRegions) {
      const empty = document.createElement("p");
      empty.className = "clicker-color-region-empty";
      empty.textContent = ct("clicker.colorRegion.empty", null, "อัปโหลดรูปเพื่อแก้ไขสี");
      colorRegionRowsContainer.appendChild(empty);
      return;
    }

    const regions = [
      { label: ct("clicker.colorRegion.label", { n: 1 }, "สีที่ 1"), sourceHex: colorRegions.dominantColorHex },
      ...colorRegions.accentRegions.map((r, i) => ({
        label: ct("clicker.colorRegion.label", { n: i + 2 }, `สีที่ ${i + 2}`),
        sourceHex: r.colorHex,
      })),
    ];

    for (const region of regions) {
      const row = document.createElement("div");
      row.className = "color-region-row";

      const label = document.createElement("span");
      label.className = "color-region-label";
      label.textContent = region.label;

      const source = document.createElement("span");
      source.className = "color-region-swatch";
      source.style.background = region.sourceHex;
      source.title = ct("clicker.colorRegion.detectedTitle", { hex: region.sourceHex }, `ตรวจพบ: ${region.sourceHex}`);

      const arrow = document.createElement("span");
      arrow.className = "color-region-arrow";
      arrow.textContent = "→";
      arrow.setAttribute("aria-hidden", "true");

      const printColor = resolvePrintColor(region.sourceHex);
      const target = document.createElement("button");
      target.type = "button";
      target.className = "color-region-target";
      target.style.background = printColor;
      target.title = ct("clicker.colorRegion.printColorTitle", { hex: printColor }, `สีที่ใช้พิมพ์: ${printColor}`);
      target.setAttribute("aria-label", ct("clicker.colorRegion.selectAriaLabel", { label: region.label }, `เลือกสีพิมพ์สำหรับ ${region.label}`));
      target.addEventListener("click", (ev) => {
        ev.stopPropagation();
        openTopColorPalette(target, region);
      });

      if (region.sourceHex !== colorRegions.dominantColorHex) {
        const enabled = document.createElement("input");
        enabled.type = "checkbox";
        enabled.checked = !state.disabledColors.has(region.sourceHex);
        enabled.setAttribute("aria-label", `Enable ${region.label}`);
        enabled.addEventListener("change", () => {
          if (enabled.checked) state.disabledColors.delete(region.sourceHex);
          else state.disabledColors.add(region.sourceHex);
          target.disabled = !enabled.checked;
          closeColorPalette();
          window.onClickerRegionSelectionChange?.([...state.disabledColors]);
        });
        target.disabled = !enabled.checked;
        row.appendChild(enabled);
      }
      row.appendChild(label);
      row.appendChild(source);
      row.appendChild(arrow);
      row.appendChild(target);
      colorRegionRowsContainer.appendChild(row);

      if (wasOpenFor === region.sourceHex) openTopColorPalette(target, region);
    }
  }
  // runPipeline() below is a module-level function (shared shape with the
  // rest of this file); expose the renderer through state rather than
  // duplicating the color-region UI logic outside init()'s closure.
  state.renderColorRegionRows = renderColorRegionRows;

  function schedulePipeline() {
    if (pipelineTimer !== null) clearTimeout(pipelineTimer);
    pipelineTimer = setTimeout(() => {
      pipelineTimer = null;
      runPipeline(state);
    }, 140);
  }

  function runPipelineNow() {
    if (pipelineTimer !== null) {
      clearTimeout(pipelineTimer);
      pipelineTimer = null;
    }
    runPipeline(state);
  }

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    updateFileInputNameLabel();
    if (!file) return;

    try {
      const img = await loadImageFile(file);
      const { imageData } = getImageDataFromImage(img, 512);
      state.imageData = imageData;
      state.imageKey = fingerprintImageData(imageData);

      if (emptyState) emptyState.style.display = "none";
      if (canvasRow) canvasRow.style.display = "flex";

      drawOriginal(imageData);
      runPipelineNow();
    } catch (err) {
      setDebugText("โหลดรูปไม่สำเร็จ: " + (err && err.message ? err.message : err));
    }
  });

  thresholdSlider.addEventListener("input", () => {
    updateThresholdLabel();
    schedulePipeline();
  });

  invertButton.addEventListener("click", () => {
    state.invert = !state.invert;
    invertButton.classList.toggle("active", state.invert);
    invertButton.textContent = state.invert
      ? "Invert: เปิด"
      : "Invert: ปิด";
    runPipelineNow();
  });

  smoothingSlider.addEventListener("input", () => {
    updateSmoothingLabel();
    schedulePipeline();
  });

  if (colorCountSlider) {
    colorCountSlider.min = CLICKER_PROFILE.accent.colorCount.min;
    colorCountSlider.max = CLICKER_PROFILE.accent.colorCount.max;
    colorCountSlider.step = 1;
    colorCountSlider.value = CLICKER_PROFILE.accent.colorCount.default;
    updateColorCountMinMaxLabels();

    colorCountSlider.addEventListener("input", () => {
      updateColorCountLabel();
      schedulePipeline();
    });
  }

  updateThresholdLabel();
  updateSmoothingLabel();
  updateColorCountLabel();
  updateFileInputNameLabel();
  if (sizeSlider) {
    sizeSlider.min = CLICKER_PROFILE.body.minSizeMM;
    sizeSlider.max = CLICKER_PROFILE.body.maxSizeMM;
    sizeSlider.value = CLICKER_PROFILE.body.targetSize;
    updateSizeMinMaxLabels();
    updateSizeLabel();
    sizeSlider.addEventListener("input", () => {
      updateSizeLabel();
      schedulePipeline();
    });
    sizeSlider.addEventListener("change", runPipelineNow);
  }
  // Export the visible size even if a slider's debounce has not fired yet.
  document.getElementById("clickerExportButton")?.addEventListener("click", () => {
    if (pipelineTimer !== null) runPipelineNow();
  }, true);

  // Re-render already-displayed dynamic text (slider labels, color-region
  // rows/tooltips) in the new language on TH/EN toggle — same click i18n.js
  // itself listens for. Only text changes: state (values, overrides,
  // detected regions) is untouched, so this never re-runs the pipeline.
  document.addEventListener("click", (ev) => {
    if (!ev.target.closest("[data-lang-option]")) return;
    closeColorPalette();
    updateSizeMinMaxLabels();
    updateSizeLabel();
    updateColorCountMinMaxLabels();
    updateColorCountLabel();
    renderColorRegionRows();
    updateFileInputNameLabel();
  });

  // Exposed for the "ส่งแบบให้ร้าน" handoff (clicker-design-handoff.js) —
  // same cross-module window-exposure idiom as window.onClickerPipelineResult
  // above. Re-encodes the SAME downscaled ImageData the pipeline already
  // runs on, so reopening this later reproduces the exact silhouette.
  window.getClickerSourceImage = function () {
    if (!state.imageData) return null;
    const canvas = document.createElement("canvas");
    canvas.width = state.imageData.width;
    canvas.height = state.imageData.height;
    canvas.getContext("2d").putImageData(state.imageData, 0, 0);
    return {
      dataURL: canvas.toDataURL("image/png"),
      width: state.imageData.width,
      height: state.imageData.height,
    };
  };

  // The remaining pipeline inputs needed to reproduce the exact silhouette
  // and color regions (size lives with clicker-viewer.js's state instead —
  // see window.getClickerViewerConfig there).
  window.getClickerPipelineConfig = function () {
    return {
      threshold: Number(thresholdSlider.value),
      invert: state.invert,
      smoothing: Number(smoothingSlider.value),
      colorCount: colorCountSlider
        ? Number(colorCountSlider.value)
        : CLICKER_PROFILE.accent.colorCount.default,
    };
  };

  // Exposed for the Shop/Admin design loader (clicker-shop-loader.js) —
  // restores previously-saved per-region choices onto whatever regions the
  // pipeline just (re)detected from the same image/settings. Mirrors
  // exactly what clicking a swatch / unchecking a region's enable checkbox
  // already does (applyColorSelection / the checkbox "change" handler in
  // renderColorRegionRows below), just driven from saved data.
  window.setClickerColorOverrides = function (overrides) {
    state.colorOverrides = new Map(Object.entries(overrides || {}));
    renderColorRegionRows();
    notifyColorOverrideChange();
  };

  window.setClickerDisabledColors = function (disabledColors) {
    state.disabledColors = new Set(disabledColors || []);
    renderColorRegionRows();
    window.onClickerRegionSelectionChange?.([...state.disabledColors]);
  };

  // Loads a previously-saved source image (a data URL, from a Clicker
  // handoff payload) through the EXACT same downscale + pipeline path the
  // customer's own file-input upload uses (see the fileInput "change"
  // handler above) — just driven from a data URL instead of a File.
  // Resolves once this run's pipeline has actually finished, so the caller
  // can safely apply color overrides / disabled regions right after.
  window.setClickerSourceImage = function (dataURL) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const { imageData } = getImageDataFromImage(img, 512);
        state.imageData = imageData;
        state.imageKey = fingerprintImageData(imageData);
        if (emptyState) emptyState.style.display = "none";
        if (canvasRow) canvasRow.style.display = "flex";
        drawOriginal(imageData);
        runPipelineNow();
        resolve();
      };
      img.onerror = reject;
      img.src = dataURL;
    });
  };
}

function updateFileInputNameLabel() {
  if (!fileInputNameEl) return;
  const file = fileInput?.files && fileInput.files[0];
  fileInputNameEl.textContent = file
    ? file.name
    : ct("clicker.fileInput.noFileChosen", null, "ยังไม่ได้อัปโหลดรูป");
}

function updateThresholdLabel() {
  if (thresholdValue) thresholdValue.textContent = thresholdSlider.value;
}

function updateSmoothingLabel() {
  if (smoothingValue) smoothingValue.textContent = smoothingSlider.value;
}

function updateColorCountLabel() {
  if (colorCountValue && colorCountSlider) {
    colorCountValue.textContent = ct("clicker.colorCount.unit", { value: colorCountSlider.value }, `${colorCountSlider.value} สี`);
  }
}

function updateColorCountMinMaxLabels() {
  if (colorCountMinLabel && colorCountSlider) {
    colorCountMinLabel.textContent = ct("clicker.colorCount.unit", { value: colorCountSlider.min }, `${colorCountSlider.min} สี`);
  }
  if (colorCountMaxLabel && colorCountSlider) {
    colorCountMaxLabel.textContent = ct("clicker.colorCount.unit", { value: colorCountSlider.max }, `${colorCountSlider.max} สี`);
  }
}

// Display-only mm->cm conversion (divide by 10). Internal sizing stays in
// mm everywhere else (selectedSizeMM(), CLICKER_PROFILE, geometry, export).
function formatSizeCm(mm) {
  const cm = Number(mm) / 10;
  return Number.isInteger(cm) ? String(cm) : cm.toFixed(1);
}

function updateSizeLabel() {
  const cm = formatSizeCm(selectedSizeMM());
  if (sizeValue) sizeValue.textContent = ct("clicker.size.unit", { value: cm }, `${cm} ซม.`);
}

function updateSizeMinMaxLabels() {
  if (sizeMinLabel && sizeSlider) {
    const cm = formatSizeCm(sizeSlider.min);
    sizeMinLabel.textContent = ct("clicker.size.unit", { value: cm }, `${cm} ซม.`);
  }
  if (sizeMaxLabel && sizeSlider) {
    const cm = formatSizeCm(sizeSlider.max);
    sizeMaxLabel.textContent = ct("clicker.size.unit", { value: cm }, `${cm} ซม.`);
  }
}

function setDebugText(text) {
  if (debugInfo) debugInfo.textContent = text;
}

function setLimitedCache(cache, key, value, maxEntries = 6) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > maxEntries) {
    cache.delete(cache.keys().next().value);
  }
}

function fingerprintImageData(imageData) {
  let hash = 2166136261;
  for (let i = 0; i < imageData.data.length; i++) {
    hash = Math.imul(hash ^ imageData.data[i], 16777619);
  }
  return `${imageData.width}x${imageData.height}:${hash >>> 0}`;
}

function runPipeline(state) {
  if (!state.imageData) return;

  const threshold = Number(thresholdSlider.value);
  const smoothing = Number(smoothingSlider.value);
  const sizeMM = selectedSizeMM();

  const silhouetteKey = `${state.imageKey}|${threshold}|${state.invert ? 1 : 0}|${smoothing}`;
  const t0 = performance.now();
  let pathResult = state.silhouetteCache.get(silhouetteKey);
  const silhouetteCacheHit = !!pathResult;
  if (!pathResult) {
    pathResult = processImageToPaths(
      state.imageData,
      { threshold, invert: state.invert, smoothing }
    );
    setLimitedCache(state.silhouetteCache, silhouetteKey, pathResult);
  }
  const elapsedMs = performance.now() - t0;
  const { width, height, mask, rawLoops, loops, timings } = pathResult;

  const previewStartedAt = performance.now();
  drawMask(mask, width, height, rawLoops);
  drawFinal(width, height, loops);
  const previewDrawMs = performance.now() - previewStartedAt;

  // Multi-color TOP pipeline: quantize the SAME mask into up to
  // colorCount flat colors. Wrapped defensively — if anything here
  // fails, the Phase-1 2D preview above (already drawn) is unaffected,
  // and we simply pass no color regions through the hook this round.
  let colorRegions = null;
  let colorElapsedMs = 0;
  let colorCacheHit = false;
  let colorKey = `${silhouetteKey}|none`;
  try {
    // Keep the same color islands while resizing. Physical-size cleanup
    // uses the default artwork size; the viewer alone scales the artwork.
    const autoFit = computeAutoFitTransform(
      loops,
      CLICKER_PROFILE.body.targetSize,
      CLICKER_PROFILE.body.targetSize
    );

    if (autoFit) {
      const colorCount = colorCountSlider
        ? Number(colorCountSlider.value)
        : CLICKER_PROFILE.accent.colorCount.default;

      const minAreaPx = CLICKER_PROFILE.accent.minRegionAreaMM2 / (autoFit.scale * autoFit.scale);
      colorKey = `${silhouetteKey}|${colorCount}|${minAreaPx.toPrecision(12)}`;

      const tColor0 = performance.now();
      colorRegions = state.colorCache.get(colorKey) || null;
      colorCacheHit = !!colorRegions;
      if (!colorRegions) {
        colorRegions = buildColorRegions(state.imageData, mask, {
          k: colorCount,
          minAreaPx,
          smoothing,
        });
        setLimitedCache(state.colorCache, colorKey, colorRegions);
      }
      const printFit = computeAutoFitTransform(loops, sizeMM, sizeMM);
      const fittedKey = `${colorKey}|curve-mm:${printFit.scale.toPrecision(15)}`;
      let fittedColors = state.contourCache.get(fittedKey);
      if (!fittedColors) {
        fittedColors = fitArtworkColorRegions(colorRegions, printFit.scale);
        setLimitedCache(state.contourCache, fittedKey, fittedColors);
      }
      colorRegions = fittedColors;
      colorKey = fittedKey;
      colorElapsedMs = performance.now() - tColor0;
    }
  } catch (err) {
    colorRegions = null;
    console.error("buildColorRegions failed:", err);
  }

  // Refresh the editable TOP-color rows against whatever regions this run
  // detected. Display only — colorRegions itself (the actual detected
  // segmentation) is untouched by this.
  state.lastColorRegions = colorRegions;
  if (typeof state.renderColorRegionRows === "function") state.renderColorRegionRows();

  // Phase 2 hook (optional — only present if clicker-viewer.js is also
  // loaded). Purely additive: Phase-1 2D preview above is unaffected
  // whether or not this is defined.
  window.__clickerPerformance = {
    ...(window.__clickerPerformance || {}),
    pipeline: {
      ...timings,
      silhouetteMeasuredMs: elapsedMs,
      silhouetteCacheHit,
      colorMs: colorElapsedMs,
      colorCacheHit,
      contours: colorRegions?.contourDiagnostics || null,
      previewDrawMs,
    },
  };

  if (typeof window.onClickerPipelineResult === "function") {
    window.onClickerPipelineResult({
      width,
      height,
      loops,
      colorRegions,
      // User-chosen print colors, keyed by detected hex. The viewer
      // applies these to materials only — never to geometry.
      colorOverrides: Object.fromEntries(state.colorOverrides),
      disabledColors: [...state.disabledColors],
      sizeMM,
      geometryKey: `${silhouetteKey}|size:${sizeMM}`,
      silhouetteKey,
      colorKey,
    });
  }

  const outerCount = loops.filter((l) => signedArea(l) > 0).length;
  const holeCount = loops.length - outerCount;
  const accentSummary = colorRegions
    ? `TOP: ${colorRegions.dominantColorHex} + ${colorRegions.accentRegions.length} accent สี (${colorElapsedMs.toFixed(0)}ms${colorCacheHit ? ", cache" : ""})`
    : "TOP: (ยังไม่พร้อม)";

  setDebugText(
    `ขนาดที่ประมวลผล: ${width}×${height}px\n` +
      `Threshold: ${threshold}   Invert: ${state.invert ? "เปิด" : "ปิด"}   Smoothing: ${smoothing}px\n` +
      `Contour ก่อน smoothing: ${rawLoops.length}\n` +
      `Contour หลัง smoothing: ${loops.length} (ตัวนอก ${outerCount} / รู ${holeCount})\n` +
      `${accentSummary}\n` +
      `Mask: ${timings.maskMs.toFixed(1)}ms | Contour: ${timings.contourMs.toFixed(1)}ms | Smoothing: ${timings.smoothingMs.toFixed(1)}ms\n` +
      `เวลาประมวลผล silhouette: ${elapsedMs.toFixed(1)} ms${silhouetteCacheHit ? " (cache)" : ""} | Preview draw: ${previewDrawMs.toFixed(1)} ms`
  );
}


// ---------------- Canvas rendering helpers ----------------

function fitCanvas(canvas, width, height) {
  canvas.width = width;
  canvas.height = height;
}

function drawOriginal(imageData) {
  fitCanvas(originalCanvas, imageData.width, imageData.height);
  const ctx = originalCanvas.getContext("2d");
  ctx.clearRect(0, 0, imageData.width, imageData.height);
  ctx.putImageData(imageData, 0, 0);
}

function drawMask(mask, width, height, rawLoops) {
  fitCanvas(maskCanvas, width, height);
  const ctx = maskCanvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);

  // Raw binary mask, pixel by pixel (before smoothing) — useful for
  // sanity-checking threshold/invert/alpha handling directly.
  const out = ctx.createImageData(width, height);
  for (let i = 0; i < width * height; i++) {
    const on = mask[i] === 1;
    out.data[i * 4] = on ? 20 : 255;
    out.data[i * 4 + 1] = on ? 20 : 255;
    out.data[i * 4 + 2] = on ? 20 : 255;
    out.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);

  // Overlay raw traced contour lines in a bright color so contour
  // tracing correctness (incl. holes) can be visually verified even
  // before smoothing is applied.
  ctx.strokeStyle = "#ff2fa0";
  ctx.lineWidth = 1;
  rawLoops.forEach((loop) => strokeLoop(ctx, loop));
}

function drawFinal(width, height, loops) {
  fitCanvas(finalCanvas, width, height);
  const ctx = finalCanvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);

  // checkerboard background so transparent/empty areas are visible
  drawCheckerboard(ctx, width, height);

  // Fill using even-odd rule: holes render correctly regardless of
  // winding-direction bookkeeping, as long as traceContours() produced
  // topologically correct loops (verified separately).
  const path = new Path2D();
  loops.forEach((loop) => {
    if (loop.length === 0) return;
    path.moveTo(loop[0].x, loop[0].y);
    for (let i = 1; i < loop.length; i++) {
      path.lineTo(loop[i].x, loop[i].y);
    }
    path.closePath();
  });

  ctx.fillStyle = "#111111";
  ctx.fill(path, "evenodd");

  ctx.strokeStyle = "#00c2ff";
  ctx.lineWidth = 1;
  loops.forEach((loop) => strokeLoop(ctx, loop));
}

function strokeLoop(ctx, loop) {
  if (loop.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(loop[0].x, loop[0].y);
  for (let i = 1; i < loop.length; i++) {
    ctx.lineTo(loop[i].x, loop[i].y);
  }
  ctx.closePath();
  ctx.stroke();
}

function drawCheckerboard(ctx, width, height) {
  const size = 8;
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      const even = ((x / size) + (y / size)) % 2 === 0;
      ctx.fillStyle = even ? "#f0f0f0" : "#ffffff";
      ctx.fillRect(x, y, size, size);
    }
  }
}
