// =====================================================================
// clicker/clicker-shop-loader.js
//
// Shop/Admin: load a customer's saved Clicker design by its "CLK" code
// and reconstruct it through the EXISTING Clicker pipeline — same saved-
// design mechanism (window.cutescapeLoadDesign) and the same "enter a
// code, click load, status line reports the result" pattern Name
// Keychain's shop workflow already uses (script.js's loadDesignButton/
// applyLoadedDesign). Only visible when Customer/Shop Mode is toggled to
// Shop (script.js's setClickerMode, gated the same way Name Keychain's
// is — via ?shop=1 — see the "Customer Mode / Shop Mode (Clicker)"
// section there).
//
// Reconstruction never touches geometry/quantization code directly — it
// only drives the exact controls/hooks a customer's own browser already
// uses (clicker-ui.js's window.setClickerSourceImage/setClickerColorOverrides/
// setClickerDisabledColors, clicker-viewer.js's window.setClickerBorderEnabled/
// setClickerKeychainLoopEnabled/setClickerKeychainLoopAngleDeg, and the
// existing #clickerHousingColor / #clickerBorderColor color inputs), so
// the same locked pipeline/geometry code the customer's save went through
// is exactly what re-produces it here. No mesh/geometry is ever loaded
// from the saved record — only the same inputs the pipeline already runs on.
// =====================================================================

function ct(key, vars, fallback) {
  return window.t ? window.t(key, vars) : fallback;
}

const loadButton = document.getElementById("clickerLoadDesignButton");
const codeInput = document.getElementById("clickerLoadDesignInput");
const statusEl = document.getElementById("clickerLoadDesignStatus");
const previewImgEl = document.getElementById("clickerLoadDesignPreviewImage");

if (loadButton) {
  init();
}

function init() {
  loadButton.addEventListener("click", async function () {
    const code = codeInput ? codeInput.value.trim().toUpperCase() : "";

    if (!code) {
      setStatus(ct("clicker.loadDesign.enterCode", null, "กรุณาใส่รหัสแบบ"));
      return;
    }

    if (!window.cutescapeLoadDesign) {
      setStatus(ct("clicker.loadDesign.loadSystemNotReady", null, "ระบบโหลดแบบยังไม่พร้อมใช้งาน"));
      return;
    }

    loadButton.disabled = true;
    hidePreviewImage();
    setStatus(ct("clicker.loadDesign.loading", null, "กำลังโหลด..."));

    try {
      const design = await window.cutescapeLoadDesign(code);

      if (!design) {
        setStatus(ct("clicker.loadDesign.notFound", null, "ไม่พบแบบรหัสนี้"));
        return;
      }

      if (design.product !== "clicker") {
        setStatus(ct("clicker.loadDesign.wrongProduct", null, "รหัสนี้ไม่ใช่แบบ Clicker"));
        return;
      }

      await applyLoadedDesign(design);
      showPreviewImage(design.previewImage);
      setStatus(ct("clicker.loadDesign.loadSuccess", { id: code }, `โหลดแบบ ${code} สำเร็จ`));
    } catch (error) {
      setStatus(ct("clicker.loadDesign.loadFailed", { error: error.message }, "โหลดแบบไม่สำเร็จ: " + error.message));
    } finally {
      loadButton.disabled = false;
    }
  });
}

// Restores every piece of the saved handoff payload (see
// clicker/clicker-design-handoff.js's buildDesignPayload for exactly what
// is stored) by driving the same controls/hooks the customer's own
// browser used — never by loading mesh/geometry, since none is stored.
async function applyLoadedDesign(design) {
  // Pipeline-input sliders. "input" events refresh their visible labels
  // and schedule a (still image-less, so no-op) pipeline run — actually
  // reconstructing happens once the source image loads below, using
  // whatever these are set to at that point.
  setSliderValue("clickerThresholdSlider", design.threshold);
  setSliderValue("clickerSmoothingSlider", design.smoothing);
  setSliderValue("clickerColorCountSlider", design.colorCount);
  setSliderValue("clickerSizeSlider", design.sizeMM);

  const currentInvert = !!window.getClickerPipelineConfig?.()?.invert;
  if (!!design.invert !== currentInvert) {
    document.getElementById("clickerInvertButton")?.click();
  }

  // Re-runs the EXISTING pipeline (same threshold/invert/smoothing/
  // colorCount/size just set above) on the saved source image — the same
  // downscaled image the customer's own upload produced.
  if (design.sourceImage?.dataURL && window.setClickerSourceImage) {
    await window.setClickerSourceImage(design.sourceImage.dataURL);
  }

  // Per-region print-color choices + which accent regions are enabled,
  // restored onto whatever regions that pipeline run just (re)detected.
  // colorOverrides keys were stored without their leading "#" (Realtime
  // Database object keys can't contain it — see clicker-design-handoff.js's
  // stripHashKeys) — add it back before applying.
  window.setClickerColorOverrides?.(addHashKeys(design.colorOverrides));
  window.setClickerDisabledColors?.(design.disabledColors);

  // Base (housing) color.
  setColorInputValue("clickerHousingColor", design.baseColor);

  // Border.
  window.setClickerBorderEnabled?.(design.borderEnabled);
  setColorInputValue("clickerBorderColor", design.borderColor);

  // Keychain loop.
  window.setClickerKeychainLoopEnabled?.(design.keychainLoopEnabled);
  if (design.keychainLoopAngleDeg != null) {
    window.setClickerKeychainLoopAngleDeg?.(design.keychainLoopAngleDeg);
  }
}

function addHashKeys(obj) {
  return Object.fromEntries(
    Object.entries(obj || {}).map(([hex, value]) => [hex.startsWith("#") ? hex : "#" + hex, value])
  );
}

function setSliderValue(elementId, value) {
  const el = document.getElementById(elementId);
  if (!el || value == null) return;
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function setColorInputValue(elementId, hex) {
  const el = document.getElementById(elementId);
  if (!el || typeof hex !== "string") return;
  el.value = hex;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function showPreviewImage(dataURL) {
  if (!previewImgEl) return;
  if (dataURL) {
    previewImgEl.src = dataURL;
    previewImgEl.hidden = false;
  } else {
    hidePreviewImage();
  }
}

function hidePreviewImage() {
  if (!previewImgEl) return;
  previewImgEl.hidden = true;
  previewImgEl.removeAttribute("src");
}

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}
