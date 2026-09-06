// Lightweight custom dropdown for #fontSelect — each option previews itself
// in its own actual font. The native <select> stays in the DOM (hidden) and
// remains the single source of truth: this UI only ever reads/writes its
// .value and dispatches a real "change" event, so script.js, viewer.js, and
// the Load Design flow keep working unmodified.

(function () {
  const nativeSelect = document.getElementById("fontSelect");

  if (!nativeSelect) {
    return;
  }

  const options = Array.from(nativeSelect.options);

  const wrap = document.createElement("div");
  wrap.className = "font-select-wrap";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.id = "fontSelectTrigger";
  trigger.className = "font-select-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");

  const triggerLabel = document.createElement("span");
  trigger.appendChild(triggerLabel);

  const caret = document.createElement("span");
  caret.className = "font-select-caret";
  caret.setAttribute("aria-hidden", "true");
  caret.textContent = "▾";
  trigger.appendChild(caret);

  const panel = document.createElement("div");
  panel.className = "font-select-panel";
  panel.setAttribute("role", "listbox");
  panel.hidden = true;

  const optionEls = [];

  // Lazy-load preview fonts: applying font-family to every row up front makes
  // the browser request every preview TTF the moment this script runs, well
  // before the dropdown is ever opened. Instead each row's font-family is
  // applied only once that row actually scrolls into the (open) panel's
  // viewport, so only the fonts a user actually scrolls past get requested.
  const lazyFontObserver =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          function (entries) {
            entries.forEach(function (entry) {
              if (!entry.isIntersecting) return;
              const row = entry.target;
              row.style.fontFamily = '"' + row.dataset.value + '"';
              lazyFontObserver.unobserve(row);
            });
          },
          { root: panel, rootMargin: "200px 0px" }
        )
      : null;

  options.forEach(function (opt) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "font-select-option";
    row.dataset.value = opt.value;
    row.setAttribute("role", "option");
    row.append(
      opt.textContent.trim() + "  "
    );

    const previewText = document.createElement("span");
    previewText.className = "font-select-option-preview";
    previewText.textContent = "ตัวอย่าง";
    row.appendChild(previewText);

    if (lazyFontObserver) {
      lazyFontObserver.observe(row);
    } else {
      row.style.fontFamily = '"' + opt.value + '"';
    }

    row.addEventListener("click", function () {
      nativeSelect.value = opt.value;
      nativeSelect.dispatchEvent(new Event("change", { bubbles: true }));
      closePanel();
      trigger.focus();
    });

    panel.appendChild(row);
    optionEls.push(row);
  });

  function syncFromNativeSelect() {
    const current = options.find(function (o) {
      return o.value === nativeSelect.value;
    });

    const label = current ? current.textContent.trim() : nativeSelect.value;

    triggerLabel.textContent = label;
    triggerLabel.style.fontFamily = '"' + nativeSelect.value + '"';

    optionEls.forEach(function (row) {
      row.classList.toggle("active", row.dataset.value === nativeSelect.value);
    });
  }

  function openPanel() {
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");

    const activeRow = panel.querySelector(".font-select-option.active");
    if (activeRow) {
      activeRow.scrollIntoView({ block: "nearest" });
    }
  }

  function closePanel() {
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }

  trigger.addEventListener("click", function () {
    if (panel.hidden) {
      openPanel();
    } else {
      closePanel();
    }
  });

  document.addEventListener("click", function (event) {
    if (!wrap.contains(event.target)) {
      closePanel();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !panel.hidden) {
      closePanel();
      trigger.focus();
    }
  });

  nativeSelect.addEventListener("change", syncFromNativeSelect);

  nativeSelect.hidden = true;

  wrap.appendChild(trigger);
  wrap.appendChild(panel);

  nativeSelect.parentNode.insertBefore(wrap, nativeSelect);
  wrap.appendChild(nativeSelect);

  syncFromNativeSelect();
})();
