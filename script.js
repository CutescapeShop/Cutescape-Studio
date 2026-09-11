const nameInput =
  document.getElementById("nameInput");

const nameInput2 =
  document.getElementById("nameInput2");

const namePreview =
  document.getElementById("namePreview");

const fontSelect =
  document.getElementById("fontSelect");

const keychain =
  document.getElementById("keychain");

const price =
  document.getElementById("price");


function updateName() {
  let name = nameInput.value.trim();

  if (name === "") {
    name = "Cute";
  }

  if (namePreview) {
    namePreview.textContent =
      name;
  }

  const extraLetters =
    Math.max(0, name.length - 6);

  const calculatedPrice =
    90 + (extraLetters * 10);

  if (price) {
    price.textContent =
      "฿" + calculatedPrice;
  }
}


nameInput.addEventListener(
  "input",
  updateName
);


// เปลี่ยนฟอนต์พรีวิว 2D
// ส่วน 3D จะถูกเปลี่ยนโดย viewer.js
fontSelect.addEventListener(
  "change",
  function () {
    namePreview.style.fontFamily =
      fontSelect.value;
  }
);


function setupColorButtons(
  containerId,
  callback
) {
  const container =
    document.getElementById(containerId);

  const buttons =
    container.querySelectorAll(
      ".color-button"
    );

  buttons.forEach(function (button) {
    button.addEventListener(
      "click",
      function () {
        buttons.forEach(function (item) {
          item.classList.remove("active");
        });

        button.classList.add("active");

        callback(
          button.dataset.color
        );
      }
    );
  });
}


// สีฐาน
setupColorButtons(
  "baseColors",
  function (color) {
    if (keychain) {
      keychain.style.background = color;
    }

    if (window.set3DBaseColor) {
      window.set3DBaseColor(color);
    }
  }
);


// สีตัวอักษร
setupColorButtons(
  "textColors",
  function (color) {
    if (namePreview) {
      namePreview.style.color = color;
    }

    if (window.set3DTextColor) {
      window.set3DTextColor(color);
    }
  }
);



updateName();

const productTabs = document.querySelectorAll("[data-product-tab]");
const nameKeychainPanel = document.getElementById("nameKeychainPanel");
const clickerPanel = document.getElementById("clickerPanel");

function setProductVisibility(target) {
  if (nameKeychainPanel) {
    nameKeychainPanel.hidden = target !== "name";
  }

  if (clickerPanel) {
    clickerPanel.hidden = target !== "clicker";
  }
}

productTabs.forEach(function (tab) {
  tab.addEventListener("click", function () {
    const target = tab.dataset.productTab;

    productTabs.forEach(function (item) {
      item.style.fontWeight = item === tab ? "700" : "400";
    });

    setProductVisibility(target);
  });
});

const defaultTab = document.querySelector('[data-product-tab="name"]');
if (defaultTab) {
  defaultTab.style.fontWeight = "700";
}

setProductVisibility("name");


// =====================================
// Customer Mode / Shop Mode (พวงกุญแจชื่อ)
// =====================================

const nameModeTabs = document.querySelectorAll("[data-name-mode]");
const shopModeTab = document.querySelector('[data-name-mode="shop"]');
const nameModeTabsWrap = document.getElementById("nameModeTabsWrap");
const loadDesignFieldEl = document.getElementById("loadDesignField");
const stlExportButton = document.getElementById("orderButton");
const sendDesignButtonEl = document.getElementById("sendDesignButton");
const designIdResultEl = document.getElementById("designIdResult");

const isShopUrl = new URLSearchParams(window.location.search).get("shop") === "1";

if (shopModeTab) {
  shopModeTab.hidden = !isShopUrl;
}

if (nameModeTabsWrap) {
  nameModeTabsWrap.style.display = "none";
}

function setNameMode(mode) {
  const isShop = mode === "shop";

  if (loadDesignFieldEl) {
    loadDesignFieldEl.hidden = !isShop;
  }

  // STL export button stays hidden in every mode (HTML `hidden` default) —
  // 3MF is now the only visible Name Keychain export control, shop or not.
  const name3MFButton = document.getElementById("nameExport3MFButton");
  if (name3MFButton) name3MFButton.hidden = !isShop;

  if (sendDesignButtonEl) {
    sendDesignButtonEl.hidden = isShop;
  }

  if (designIdResultEl && isShop) {
    designIdResultEl.hidden = true;
  }

  nameModeTabs.forEach(function (tab) {
    tab.style.fontWeight = tab.dataset.nameMode === mode ? "700" : "400";
  });
}

nameModeTabs.forEach(function (tab) {
  tab.addEventListener("click", function () {
    setNameMode(tab.dataset.nameMode);
  });
});

setNameMode(isShopUrl ? "shop" : "customer");


// =====================================
// Customer Mode / Shop Mode (Clicker) — same isShopUrl gate and
// customer/shop toggle pattern as Name Keychain above, applied to
// Clicker's own controls (clicker/clicker-shop-loader.js owns the actual
// saved-design loading/reconstruction logic).
// =====================================

const clickerModeTabs = document.querySelectorAll("[data-clicker-mode]");
const clickerShopModeTab = document.querySelector('[data-clicker-mode="shop"]');
const clickerModeTabsWrap = document.getElementById("clickerModeTabsWrap");
const clickerLoadDesignFieldEl = document.getElementById("clickerLoadDesignField");
const clickerStlExportButton = document.getElementById("clickerExportButton");
const clicker3MFExportButton = document.getElementById("clickerExport3MFButton");
const clickerSendDesignButtonEl = document.getElementById("clickerSendDesignButton");
const clickerDesignIdResultEl = document.getElementById("clickerDesignIdResult");

if (clickerShopModeTab) {
  clickerShopModeTab.hidden = !isShopUrl;
}

if (clickerModeTabsWrap) {
  clickerModeTabsWrap.style.display = "none";
}

function setClickerMode(mode) {
  const isShop = mode === "shop";

  if (clickerLoadDesignFieldEl) {
    clickerLoadDesignFieldEl.hidden = !isShop;
  }

  // STL export button stays hidden in every mode (HTML `hidden` default) —
  // 3MF is now the only visible Clicker export control, shop or not.

  if (clicker3MFExportButton) {
    clicker3MFExportButton.hidden = !isShop;
  }

  if (clickerSendDesignButtonEl) {
    clickerSendDesignButtonEl.hidden = isShop;
  }

  if (clickerDesignIdResultEl && isShop) {
    clickerDesignIdResultEl.hidden = true;
  }

  clickerModeTabs.forEach(function (tab) {
    tab.style.fontWeight = tab.dataset.clickerMode === mode ? "700" : "400";
  });
}

clickerModeTabs.forEach(function (tab) {
  tab.addEventListener("click", function () {
    setClickerMode(tab.dataset.clickerMode);
  });
});

setClickerMode(isShopUrl ? "shop" : "customer");


// =====================================
// ส่งแบบให้ร้าน (บันทึกการออกแบบ - พวงกุญแจชื่อเท่านั้น)
// =====================================

const sendDesignButton = document.getElementById("sendDesignButton");
const designIdResult = document.getElementById("designIdResult");
const designIdValue = document.getElementById("designIdValue");

function getActiveColor(containerId) {
  const container = document.getElementById(containerId);
  const active = container
    ? container.querySelector(".color-button.active")
    : null;

  return active ? active.dataset.color : null;
}

const DESIGN_ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function generateDesignId() {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");

  let suffix = "";
  for (let i = 0; i < 3; i++) {
    suffix += DESIGN_ID_CHARS[
      Math.floor(Math.random() * DESIGN_ID_CHARS.length)
    ];
  }

  return `${mm}${dd}-${suffix}`;
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

if (sendDesignButton) {
  sendDesignButton.addEventListener("click", async function () {
    const nameSizeSlider = document.getElementById("nameSizeSlider");
    const baseStyleSelect = document.getElementById("baseStyleSelect");
    const outlineSlider = document.getElementById("outlineSlider");

    const design = {
      name: nameInput.value.trim() || "Cute",
      line2: nameInput2 ? nameInput2.value.trim() : "",
      font: fontSelect.value,
      textSize: nameSizeSlider ? nameSizeSlider.value : "100",
      baseStyle: baseStyleSelect ? baseStyleSelect.value : "outline",
      outlineThickness: outlineSlider ? outlineSlider.value : null,
      baseColor: getActiveColor("baseColors"),
      textColor: getActiveColor("textColors"),
      createdAt: new Date().toISOString()
    };

    if (!window.cutescapeSaveDesign) {
      alert(window.t ? window.t("alert.saveSystemNotReady") : "ระบบบันทึกแบบยังไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง");
      return;
    }

    sendDesignButton.disabled = true;

    try {
      const designId = await generateUniqueDesignId();

      await window.cutescapeSaveDesign(designId, design);

      if (designIdValue) {
        designIdValue.textContent = designId;
      }

      if (designIdResult) {
        designIdResult.hidden = false;
      }
    } catch (error) {
      alert(window.t ? window.t("alert.saveFailed", { error: error.message }) : "บันทึกแบบไม่สำเร็จ: " + error.message);
    } finally {
      sendDesignButton.disabled = false;
    }
  });
}


// =====================================
// โหลดแบบด้วยรหัส (สำหรับร้าน - เปิดจากอุปกรณ์ไหนก็ได้)
// =====================================

const loadDesignInput = document.getElementById("loadDesignInput");
const loadDesignButton = document.getElementById("loadDesignButton");
const loadDesignStatus = document.getElementById("loadDesignStatus");

function fireEvent(el, type) {
  if (el) {
    el.dispatchEvent(new Event(type, { bubbles: true }));
  }
}

function setActiveColorButton(containerId, color) {
  const container = document.getElementById(containerId);
  if (!container || !color) return;

  const button = container.querySelector(
    '.color-button[data-color="' + color + '"]'
  );

  if (button) {
    button.click();
  }
}

function applyLoadedDesign(design) {
  const nameSizeSliderEl = document.getElementById("nameSizeSlider");
  const baseStyleSelectEl = document.getElementById("baseStyleSelect");
  const outlineSliderEl = document.getElementById("outlineSlider");

  nameInput.value = design.name || "Cute";
  fireEvent(nameInput, "input");

  if (nameInput2) {
    // เข้ากันได้กับแบบเก่าที่ไม่มี line2: จะได้ค่าว่าง = เส้นทางบรรทัดเดียวเดิม
    nameInput2.value = design.line2 || "";
    fireEvent(nameInput2, "input");
  }

  if (design.font) {
    fontSelect.value = design.font;
    fireEvent(fontSelect, "change");
  }

  if (nameSizeSliderEl && design.textSize != null) {
    nameSizeSliderEl.value = design.textSize;
    fireEvent(nameSizeSliderEl, "input");
  }

  if (baseStyleSelectEl && design.baseStyle) {
    baseStyleSelectEl.value = design.baseStyle;
    fireEvent(baseStyleSelectEl, "change");
  }

  if (outlineSliderEl && design.outlineThickness != null) {
    outlineSliderEl.value = design.outlineThickness;
    fireEvent(outlineSliderEl, "input");
  }

  setActiveColorButton("baseColors", design.baseColor);
  setActiveColorButton("textColors", design.textColor);
}

if (loadDesignButton) {
  loadDesignButton.addEventListener("click", function () {
    const designId = loadDesignInput
      ? loadDesignInput.value.trim()
      : "";

    if (!designId) {
      if (loadDesignStatus) {
        loadDesignStatus.textContent = window.t ? window.t("status.enterCode") : "กรุณาใส่รหัสแบบ";
      }
      return;
    }

    if (!window.cutescapeLoadDesign) {
      if (loadDesignStatus) {
        loadDesignStatus.textContent = window.t ? window.t("status.loadSystemNotReady") : "ระบบโหลดแบบยังไม่พร้อมใช้งาน";
      }
      return;
    }

    loadDesignButton.disabled = true;

    if (loadDesignStatus) {
      loadDesignStatus.textContent = window.t ? window.t("status.loading") : "กำลังโหลด...";
    }

    window.cutescapeLoadDesign(designId)
      .then(function (design) {
        if (!design) {
          if (loadDesignStatus) {
            loadDesignStatus.textContent = window.t ? window.t("status.notFound") : "ไม่พบแบบรหัสนี้";
          }
          return;
        }

        applyLoadedDesign(design);

        if (loadDesignStatus) {
          loadDesignStatus.textContent = window.t
            ? window.t("status.loadSuccess", { id: designId })
            : "โหลดแบบ " + designId + " สำเร็จ";
        }
      })
      .catch(function (error) {
        if (loadDesignStatus) {
          loadDesignStatus.textContent = window.t
            ? window.t("status.loadFailed", { error: error.message })
            : "โหลดแบบไม่สำเร็จ: " + error.message;
        }
      })
      .finally(function () {
        loadDesignButton.disabled = false;
      });
  });
}
