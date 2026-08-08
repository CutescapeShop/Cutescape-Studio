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

  namePreview.textContent =
    name.toUpperCase();

  const extraLetters =
    Math.max(0, name.length - 6);

  const calculatedPrice =
    90 + (extraLetters * 10);

  if (price) {
  price.textContent =
    "฿" + calculatedPrice;
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