// =====================================
// TH/EN localization — Name Keychain UI, shared header, and the
// customer-facing Clicker from Image UI.
// Plain script (not a module) so script.js, font-select-ui.js, and the
// Clicker modules can call window.t()/window.applyLanguage() without
// import wiring.
// =====================================

(function () {
  const LANG_STORAGE_KEY = "cutescapeLang";
  const DEFAULT_LANG = "th";

  const STRINGS = {
    th: {
      "header.tagline": "ออกแบบพวงกุญแจชื่อของคุณเอง",
      "tab.nameKeychain": "พวงกุญแจชื่อ",
      "tab.clicker": "Clicker จากรูป",

      "panel.title": "ออกแบบสินค้า",
      "field.name": "ชื่อ",
      "field.line2": "บรรทัดที่ 2 (ไม่บังคับ)",
      "field.font": "เลือกฟอนต์",
      "field.size": "ขนาดตัวอักษร",
      "field.baseShape": "รูปทรงฐาน",
      "field.outlineThickness": "ความหนาขอบไดคัท",
      "field.baseColor": "สีฐาน",
      "field.textColor": "สีตัวอักษร",
      "field.loadDesign": "โหลดแบบด้วยรหัส (สำหรับร้าน)",

      "shape.outline": "ไดคัทตามชื่อ",
      "shape.capsule": "แคปซูล",
      "shape.roundedRectangle": "สี่เหลี่ยมมุมมน",
      "shape.oval": "วงรี",
      "shape.cloud": "ก้อนเมฆ",
      "shape.star": "ดาว",
      "shape.heart": "หัวใจ",
      "shape.flower": "ดอกไม้",
      "shape.clover": "โคลเวอร์",
      "shape.cat": "แมว",

      "slider.thin": "บาง",
      "slider.thick": "หนา",

      "color.black": "ดำ",
      "color.white": "ขาว",
      "color.gray": "เทา",
      "color.hotPink": "ชมพูเข้ม",
      "color.lightPink": "ชมพูอ่อน",
      "color.red": "แดง",
      "color.orange": "ส้ม",
      "color.yellow": "เหลือง",
      "color.cream": "ครีม",
      "color.mint": "เขียวมิ้นต์",
      "color.green": "เขียว",
      "color.skyBlue": "ฟ้า",
      "color.blue": "น้ำเงิน",
      "color.purple": "ม่วง",
      "color.lightPurple": "ม่วงอ่อน",
      "color.peach": "พีช",
      "color.brown": "น้ำตาล",

      "button.confirmOrder": "ยืนยันแบบนี้",
      "button.sendToShop": "ส่งแบบให้ร้าน",

      "placeholder.designCode": "เช่น KC-XXXXXXXX",
      "placeholder.line2": "เว้นว่างไว้ถ้าไม่ต้องการบรรทัดที่ 2",

      "result.savedPrefix": "บันทึกแบบเรียบร้อย! รหัสแบบของคุณคือ",

      "helper.livePreview": "พิมพ์ชื่อหรือเลือกสี แล้วตัวอย่างจะเปลี่ยนทันที",
      "panel.previewTitle": "ตัวอย่างสินค้า",

      "font.preview": "ตัวอย่าง",

      "status.enterCode": "กรุณาใส่รหัสแบบ",
      "status.loadSystemNotReady": "ระบบโหลดแบบยังไม่พร้อมใช้งาน",
      "status.loading": "กำลังโหลด...",
      "status.notFound": "ไม่พบแบบรหัสนี้",
      "status.loadSuccess": "โหลดแบบ {id} สำเร็จ",
      "status.loadFailed": "โหลดแบบไม่สำเร็จ: {error}",

      "alert.saveSystemNotReady": "ระบบบันทึกแบบยังไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง",
      "alert.saveFailed": "บันทึกแบบไม่สำเร็จ: {error}",

      "clicker.heading": "สร้าง Clicker จากรูปของคุณ",
      "clicker.step1.selectImage": "1. อัปโหลดรูป",
      "clicker.step2.selectSize": "2. เลือกขนาด",
      "clicker.step3.selectColorCount": "3. เลือกจำนวนสี",
      "clicker.step4.selectArtworkColor": "4. เลือกสีชิ้นงาน",
      "clicker.step5.selectBaseColor": "5. เลือกสีฐาน",
      "clicker.step6.addKeychainLoop": "6. เพิ่มห่วงพวงกุญแจ",
      "clicker.size.unit": "{value} ซม.",
      "clicker.colorCount.unit": "{value} สี",
      "clicker.fileInput.chooseButton": "อัปโหลดรูป",
      "clicker.fileInput.noFileChosen": "ยังไม่ได้อัปโหลดรูป",
      "clicker.colorRegion.empty": "อัปโหลดรูปเพื่อแก้ไขสี",
      "clicker.colorRegion.label": "สีที่ {n}",
      "clicker.colorRegion.detectedTitle": "ตรวจพบ: {hex}",
      "clicker.colorRegion.printColorTitle": "สีที่ใช้พิมพ์: {hex}",
      "clicker.colorRegion.selectAriaLabel": "เลือกสีพิมพ์สำหรับ {label}",
      "clicker.customColor": "กำหนดเอง",
      "clicker.baseColor.customAriaLabel": "กำหนดสีฐานเอง",
      "clicker.keychainLoop.on": "เปิด",
      "clicker.keychainLoop.off": "ปิด",
      "clicker.keychainLoop.positionLabel": "ตำแหน่งห่วง (หมุนทีละ 25°)",
      "clicker.keychainLoop.rotateLeftAriaLabel": "หมุนห่วงทวนเข็มนาฬิกา 25 องศา",
      "clicker.keychainLoop.rotateRightAriaLabel": "หมุนห่วงตามเข็มนาฬิกา 25 องศา",
      "clicker.keychainLoop.noImageYet": "ยังไม่มีรูปให้ยึดห่วง",
      "clicker.preview.result": "ตัวอย่างชิ้นงาน",
      "clicker.preview.original": "รูปต้นฉบับ",
      "clicker.preview.originalCanvasLabel": "ต้นฉบับ",
      "clicker.preview.emptyState": "อัปโหลดรูปเพื่อดูผลลัพธ์",
      "clicker.previewMode.assembled": "ประกอบ",
      "clicker.previewMode.exploded": "แยกชิ้น"
    },

    en: {
      "header.tagline": "Design your own name keychain",
      "tab.nameKeychain": "Name Keychain",
      "tab.clicker": "Clicker from Photo",

      "panel.title": "Design Your Keychain",
      "field.name": "Name",
      "field.line2": "Second Line (Optional)",
      "field.font": "Font",
      "field.size": "Text Size",
      "field.baseShape": "Base Shape",
      "field.outlineThickness": "Outline Thickness",
      "field.baseColor": "Base Color",
      "field.textColor": "Text Color",
      "field.loadDesign": "Load Design (Shop)",

      "shape.outline": "Die-cut Outline",
      "shape.capsule": "Capsule",
      "shape.roundedRectangle": "Rounded Rectangle",
      "shape.oval": "Oval",
      "shape.cloud": "Cloud",
      "shape.star": "Star",
      "shape.heart": "Heart",
      "shape.flower": "Flower",
      "shape.clover": "Clover",
      "shape.cat": "Cat",

      "slider.thin": "Thin",
      "slider.thick": "Thick",

      "color.black": "Black",
      "color.white": "White",
      "color.gray": "Gray",
      "color.hotPink": "Hot Pink",
      "color.lightPink": "Light Pink",
      "color.red": "Red",
      "color.orange": "Orange",
      "color.yellow": "Yellow",
      "color.cream": "Cream",
      "color.mint": "Mint",
      "color.green": "Green",
      "color.skyBlue": "Sky Blue",
      "color.blue": "Blue",
      "color.purple": "Purple",
      "color.lightPurple": "Light Purple",
      "color.peach": "Peach",
      "color.brown": "Brown",

      "button.confirmOrder": "Confirm This Design",
      "button.sendToShop": "Send to Shop",

      "placeholder.designCode": "e.g. KC-XXXXXXXX",
      "placeholder.line2": "Leave blank for a single-line design",

      "result.savedPrefix": "Design saved! Your design code is",

      "helper.livePreview": "Type a name or pick a color — the preview updates instantly",
      "panel.previewTitle": "Keychain Preview",

      "font.preview": "Preview",

      "status.enterCode": "Please enter a design code",
      "status.loadSystemNotReady": "Load system is not ready yet",
      "status.loading": "Loading...",
      "status.notFound": "Design not found",
      "status.loadSuccess": "Design {id} loaded successfully",
      "status.loadFailed": "Failed to load design: {error}",

      "alert.saveSystemNotReady": "Save system is not ready yet. Please try again.",
      "alert.saveFailed": "Failed to save design: {error}",

      "clicker.heading": "Create a Clicker from Your Photo",
      "clicker.step1.selectImage": "1. Upload a Photo",
      "clicker.step2.selectSize": "2. Choose a Size",
      "clicker.step3.selectColorCount": "3. Choose Number of Colors",
      "clicker.step4.selectArtworkColor": "4. Choose Artwork Colors",
      "clicker.step5.selectBaseColor": "5. Choose a Base Color",
      "clicker.step6.addKeychainLoop": "6. Add a Keychain Loop",
      "clicker.size.unit": "{value} cm",
      "clicker.colorCount.unit": "{value} colors",
      "clicker.fileInput.chooseButton": "Upload Photo",
      "clicker.fileInput.noFileChosen": "No photo uploaded",
      "clicker.colorRegion.empty": "Upload a photo to edit colors",
      "clicker.colorRegion.label": "Color {n}",
      "clicker.colorRegion.detectedTitle": "Detected: {hex}",
      "clicker.colorRegion.printColorTitle": "Print color: {hex}",
      "clicker.colorRegion.selectAriaLabel": "Choose print color for {label}",
      "clicker.customColor": "Custom",
      "clicker.baseColor.customAriaLabel": "Choose a custom base color",
      "clicker.keychainLoop.on": "On",
      "clicker.keychainLoop.off": "Off",
      "clicker.keychainLoop.positionLabel": "Loop Position (rotate 25° at a time)",
      "clicker.keychainLoop.rotateLeftAriaLabel": "Rotate loop counter-clockwise 25°",
      "clicker.keychainLoop.rotateRightAriaLabel": "Rotate loop clockwise 25°",
      "clicker.keychainLoop.noImageYet": "Upload a photo first to attach a loop",
      "clicker.preview.result": "Product Preview",
      "clicker.preview.original": "Original Photo",
      "clicker.preview.originalCanvasLabel": "Original",
      "clicker.preview.emptyState": "Upload a photo to see the result",
      "clicker.previewMode.assembled": "Assembled",
      "clicker.previewMode.exploded": "Exploded"
    }
  };

  function getLang() {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    return stored === "en" || stored === "th" ? stored : DEFAULT_LANG;
  }

  // key -> localized string, with {token} interpolation, e.g. t("status.loadSuccess", { id: "KC-1234" })
  function t(key, vars) {
    const lang = getLang();
    const dict = STRINGS[lang] || STRINGS[DEFAULT_LANG];
    let value = dict[key];
    if (value == null) value = STRINGS[DEFAULT_LANG][key];
    if (value == null) return key;

    if (vars) {
      Object.keys(vars).forEach(function (varKey) {
        value = value.replace("{" + varKey + "}", vars[varKey]);
      });
    }

    return value;
  }

  function updateToggleUI(lang) {
    const buttons = document.querySelectorAll("[data-lang-option]");
    buttons.forEach(function (button) {
      button.classList.toggle("active", button.dataset.langOption === lang);
    });
  }

  function applyLanguage(lang) {
    if (lang !== "en" && lang !== "th") lang = DEFAULT_LANG;
    const dict = STRINGS[lang];

    document.documentElement.lang = lang;

    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      const value = dict[el.dataset.i18n];
      if (value != null) el.textContent = value;
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      const value = dict[el.dataset.i18nPlaceholder];
      if (value != null) el.placeholder = value;
    });

    document.querySelectorAll("[data-i18n-title]").forEach(function (el) {
      const value = dict[el.dataset.i18nTitle];
      if (value != null) el.title = value;
    });

    localStorage.setItem(LANG_STORAGE_KEY, lang);
    updateToggleUI(lang);
  }

  window.t = t;
  window.getLang = getLang;
  window.applyLanguage = applyLanguage;

  document.addEventListener("click", function (event) {
    const button = event.target.closest("[data-lang-option]");
    if (!button) return;
    applyLanguage(button.dataset.langOption);
  });

  applyLanguage(getLang());
})();
