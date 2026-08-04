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

      namePreview.textContent = name.toUpperCase();

      const extraLetters =
        Math.max(0, name.length - 6);

      const calculatedPrice =
        90 + (extraLetters * 10);

      price.textContent =
        "฿" + calculatedPrice;
    }

    nameInput.addEventListener(
      "input",
      updateName
    );

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

    setupColorButtons(
  "baseColors",
  function (color) {
    keychain.style.background = color;

    if (window.set3DBaseColor) {
      window.set3DBaseColor(color);
    }
  }
);

    setupColorButtons(
      "textColors",
      function (color) {
        namePreview.style.color = color;
      }
    );

    document
      .getElementById("orderButton")
      .addEventListener(
        "click",
        function () {
          alert(
            "บันทึกแบบชื่อ " +
            namePreview.textContent +
            " แล้ว 🎉"
          );
        }
      );

    updateName();