// =====================================================================
// clicker/clicker-design-handoff.js
//
// "ส่งแบบให้ร้าน" for Clicker — NOT checkout. Packages everything needed
// to reopen and reproduce the customer's exact Clicker configuration
// later (Admin/Shop mode), and saves it through the SAME save mechanism
// Name Keychain already uses (firebase-designs.js's window.cutescapeSaveDesign,
// a plain JSON write to Realtime Database — see script.js's sendDesignButton
// handler for the reference pattern this mirrors). No new backend,
// database, or account system is introduced.
//
// Deliberately customer-safe: this module never touches STL export,
// geometry builders, or any internal geometry data — only the small
// read-only config/image hooks clicker-ui.js and clicker-viewer.js expose
// on window for this purpose (window.getClickerSourceImage,
// window.getClickerPipelineConfig, window.getClickerViewerConfig,
// window.getClickerPreviewSnapshot). If those hooks aren't present (the
// Clicker markup/scripts aren't on this page), this file stays inert.
// =====================================================================

function ct(key, vars, fallback) {
  return window.t ? window.t(key, vars) : fallback;
}

const sendButton = document.getElementById("clickerSendDesignButton");
const statusEl = document.getElementById("clickerSendDesignStatus");

if (sendButton) {
  init();
}

function init() {
  const DESIGN_ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  function generateDesignId() {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");

    let suffix = "";
    for (let i = 0; i < 4; i++) {
      suffix += DESIGN_ID_CHARS[Math.floor(Math.random() * DESIGN_ID_CHARS.length)];
    }

    return `CLK${mm}${dd}-${suffix}`;
  }

  async function generateUniqueDesignId() {
    let designId = generateDesignId();
    if (window.cutescapeLoadDesign) {
      while (await window.cutescapeLoadDesign(designId)) {
        designId = generateDesignId();
      }
    }
    return designId;
  }

  // Realtime Database object keys can't contain "#" (or ".", "$", "/",
  // "[", "]") — colorOverrides is keyed by detected hex ("#rrggbb"), so
  // strip the leading "#" for storage. clicker-shop-loader.js adds it
  // back before calling window.setClickerColorOverrides.
  function stripHashKeys(obj) {
    return Object.fromEntries(
      Object.entries(obj || {}).map(([hex, value]) => [hex.replace(/^#/, ""), value])
    );
  }

  // Everything needed to reopen and reproduce this exact Clicker design —
  // NOT the printable STL/geometry itself, just the same inputs the
  // customer's own browser used to build it (source image + pipeline
  // settings + every material/geometry-toggle choice), so a future
  // Admin/Shop mode can hand this back through the identical pipeline.
  function buildDesignPayload() {
    const sourceImage = window.getClickerSourceImage?.();
    const pipelineConfig = window.getClickerPipelineConfig?.() || {};
    const viewerConfig = window.getClickerViewerConfig?.() || {};
    const previewImage = window.getClickerPreviewSnapshot?.() || null;

    if (!sourceImage || !viewerConfig.hasDesign) return null;

    return {
      product: "clicker",
      createdAt: new Date().toISOString(),

      // Source image (downscaled the same way the live pipeline uses it —
      // re-running the pipeline on this reproduces the exact silhouette).
      sourceImage: {
        dataURL: sourceImage.dataURL,
        width: sourceImage.width,
        height: sourceImage.height,
      },

      // Silhouette/color-detection pipeline inputs.
      sizeMM: viewerConfig.sizeMM,
      threshold: pipelineConfig.threshold,
      invert: pipelineConfig.invert,
      smoothing: pipelineConfig.smoothing,
      colorCount: pipelineConfig.colorCount,

      // Per-region print-color choices + which accent regions are enabled.
      // Realtime Database object keys can't contain "#", so detected-hex
      // keys are stored without their leading "#" (values are untouched —
      // only object KEYS hit this restriction). clicker-shop-loader.js
      // reverses this on load.
      colorOverrides: stripHashKeys(viewerConfig.colorOverrides),
      disabledColors: viewerConfig.disabledColors,

      // Base (housing) color.
      baseColor: viewerConfig.baseColor,

      // Border.
      borderEnabled: viewerConfig.borderEnabled,
      borderColor: viewerConfig.borderColor,

      // Keychain loop.
      keychainLoopEnabled: viewerConfig.keychainLoopEnabled,
      keychainLoopAngleDeg: viewerConfig.keychainLoopAngleDeg,

      // Preview-only snapshot for the shop to see at a glance. Not used to
      // reproduce anything — the pipeline is re-run from sourceImage instead.
      previewImage,
    };
  }

  sendButton.addEventListener("click", async function () {
    if (!window.cutescapeSaveDesign) {
      setStatus(ct("clicker.sendDesign.saveSystemNotReady", null, "ระบบบันทึกแบบยังไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง"));
      return;
    }

    const design = buildDesignPayload();
    if (!design) {
      hideDesignIdResult();
      setStatus(ct("clicker.sendDesign.notReady", null, "กรุณาอัปโหลดรูปก่อนส่งแบบให้ร้าน"));
      return;
    }

    sendButton.disabled = true;
    hideDesignIdResult();
    setStatus(ct("clicker.sendDesign.saving", null, "กำลังบันทึก..."));

    try {
      // The SAME generated ID used to save is the one shown to the customer
      // below — no second ID system, matching Name Keychain's designId/
      // designIdValue pattern (script.js's sendDesignButton handler).
      const designId = await generateUniqueDesignId();
      await window.cutescapeSaveDesign(designId, design);
      setStatus("");
      showDesignIdResult(designId);
    } catch (error) {
      setStatus(ct("clicker.sendDesign.error", null, "บันทึกแบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"));
    } finally {
      sendButton.disabled = false;
    }
  });
}

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

const designIdResultEl = document.getElementById("clickerDesignIdResult");
const designIdValueEl = document.getElementById("clickerDesignIdValue");

function showDesignIdResult(designId) {
  if (designIdValueEl) designIdValueEl.textContent = designId;
  if (designIdResultEl) designIdResultEl.hidden = false;
}

function hideDesignIdResult() {
  if (designIdResultEl) designIdResultEl.hidden = true;
}
