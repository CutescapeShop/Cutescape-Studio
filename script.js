const nameInput =
  document.getElementById("nameInput");

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
    name = "KIRIN";
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
  nameModeTabsWrap.style.display = isShopUrl ? "flex" : "none";
}

function setNameMode(mode) {
  const isShop = mode === "shop";

  if (loadDesignFieldEl) {
    loadDesignFieldEl.hidden = !isShop;
  }

  if (stlExportButton) {
    stlExportButton.hidden = !isShop;
  }

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

setNameMode("customer");


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
      name: nameInput.value.trim() || "KIRIN",
      font: fontSelect.value,
      textSize: nameSizeSlider ? nameSizeSlider.value : "100",
      baseStyle: baseStyleSelect ? baseStyleSelect.value : "outline",
      outlineThickness: outlineSlider ? outlineSlider.value : null,
      baseColor: getActiveColor("baseColors"),
      textColor: getActiveColor("textColors"),
      createdAt: new Date().toISOString()
    };

    if (!window.cutescapeSaveDesign) {
      alert("ระบบบันทึกแบบยังไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง");
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
      alert("บันทึกแบบไม่สำเร็จ: " + error.message);
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

  nameInput.value = design.name || "KIRIN";
  fireEvent(nameInput, "input");

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
        loadDesignStatus.textContent = "กรุณาใส่รหัสแบบ";
      }
      return;
    }

    if (!window.cutescapeLoadDesign) {
      if (loadDesignStatus) {
        loadDesignStatus.textContent = "ระบบโหลดแบบยังไม่พร้อมใช้งาน";
      }
      return;
    }

    loadDesignButton.disabled = true;

    if (loadDesignStatus) {
      loadDesignStatus.textContent = "กำลังโหลด...";
    }

    window.cutescapeLoadDesign(designId)
      .then(function (design) {
        if (!design) {
          if (loadDesignStatus) {
            loadDesignStatus.textContent = "ไม่พบแบบรหัสนี้";
          }
          return;
        }

        applyLoadedDesign(design);

        if (loadDesignStatus) {
          loadDesignStatus.textContent = "โหลดแบบ " + designId + " สำเร็จ";
        }
      })
      .catch(function (error) {
        if (loadDesignStatus) {
          loadDesignStatus.textContent =
            "โหลดแบบไม่สำเร็จ: " + error.message;
        }
      })
      .finally(function () {
        loadDesignButton.disabled = false;
      });
  });
}