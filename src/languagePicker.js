/**
 * Accessible language listbox. Native <select> menus can't carry the garden's type.
 * @param {HTMLElement} mount
 * @param {{
 *   languages: { code: string, label: string }[],
 *   value?: string,
 *   onChange?: (code: string) => void,
 * }} opts
 */
export function createLanguagePicker(
  mount,
  { languages = [], value = "", onChange } = {}
) {
  const root = document.createElement("div");
  root.className = "lang-picker";
  const listId = `lang-list-${Math.random().toString(36).slice(2, 8)}`;

  root.innerHTML = `
    <button type="button" class="lang-picker-trigger" data-lang
      aria-haspopup="listbox" aria-expanded="false" aria-controls="${listId}"></button>
    <div class="lang-picker-panel" id="${listId}" role="listbox" tabindex="-1"
      aria-label="Languages" hidden></div>
  `;
  mount.replaceChildren(root);

  const trigger = root.querySelector("[data-lang]");
  const panel = root.querySelector("[role='listbox']");
  let current = languages.some((l) => l.code === value)
    ? value
    : languages[0]?.code || "";
  let active = indexOf(current);
  let open = false;
  let disabled = false;

  function indexOf(code) {
    const i = languages.findIndex((l) => l.code === code);
    return i < 0 ? 0 : i;
  }

  function labelFor(code) {
    return languages.find((l) => l.code === code)?.label || code;
  }

  function paintTrigger() {
    const label = labelFor(current);
    trigger.textContent = label;
    trigger.lang = current;
    trigger.dataset.value = current;
    trigger.setAttribute("aria-label", `I'll speak in ${label}`);
    trigger.setAttribute("aria-expanded", open ? "true" : "false");
    trigger.disabled = disabled;
  }

  function paintOptions() {
    panel.innerHTML = languages
      .map((l, i) => {
        const selected = l.code === current ? "true" : "false";
        const activeClass = i === active ? " is-active" : "";
        return `<div class="lang-picker-option${activeClass}" role="option" id="${listId}-${i}"
          data-code="${escapeAttr(l.code)}" lang="${escapeAttr(l.code)}" aria-selected="${selected}">${escapeHtml(
            l.label
          )}</div>`;
      })
      .join("");
    markActive();
  }

  function markActive() {
    const options = panel.querySelectorAll("[data-code]");
    options.forEach((el, i) => {
      el.classList.toggle("is-active", i === active);
    });
    const activeEl = panel.querySelector(".is-active");
    if (activeEl) panel.setAttribute("aria-activedescendant", activeEl.id);
    else panel.removeAttribute("aria-activedescendant");
  }

  function place() {
    const rect = trigger.getBoundingClientRect();
    const margin = 8;
    panel.style.position = "fixed";
    panel.style.left = `${rect.left + rect.width / 2}px`;
    panel.style.top = `${rect.bottom + margin}px`;
    panel.style.transform = "translateX(-50%)";
    panel.style.zIndex = "80";
    const spaceBelow = window.innerHeight - rect.bottom - margin - 16;
    panel.style.maxHeight = `${Math.max(160, Math.min(280, spaceBelow))}px`;
  }

  function openPanel() {
    if (disabled || open) return;
    open = true;
    active = indexOf(current);
    paintOptions();
    paintTrigger();
    document.body.appendChild(panel);
    panel.hidden = false;
    panel.classList.add("is-open");
    place();
    panel.querySelector(".is-active")?.scrollIntoView?.({ block: "nearest" });
    panel.focus();
  }

  function closePanel({ restoreFocus = false } = {}) {
    if (!open && panel.hidden) return;
    open = false;
    panel.hidden = true;
    panel.classList.remove("is-open");
    if (panel.parentElement === document.body) root.appendChild(panel);
    paintTrigger();
    if (restoreFocus) trigger.focus();
  }

  function choose(code) {
    if (!languages.some((l) => l.code === code) || code === current) {
      closePanel({ restoreFocus: true });
      return;
    }
    current = code;
    active = indexOf(code);
    paintTrigger();
    paintOptions();
    onChange?.(code);
    closePanel({ restoreFocus: true });
  }

  function move(delta) {
    if (!languages.length) return;
    active = (active + delta + languages.length) % languages.length;
    markActive();
    panel.querySelector(".is-active")?.scrollIntoView?.({ block: "nearest" });
  }

  trigger.addEventListener("click", () => {
    if (disabled) return;
    if (open) closePanel();
    else openPanel();
  });

  trigger.addEventListener("keydown", (event) => {
    if (disabled) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) openPanel();
      move(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      closePanel({ restoreFocus: true });
    }
  });

  panel.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else     if (event.key === "Home") {
      event.preventDefault();
      active = 0;
      markActive();
    } else if (event.key === "End") {
      event.preventDefault();
      active = languages.length - 1;
      markActive();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const code = languages[active]?.code;
      if (code) choose(code);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closePanel({ restoreFocus: true });
    }
  });

  panel.addEventListener("click", (event) => {
    const option = event.target.closest?.("[data-code]");
    if (!option) return;
    choose(option.getAttribute("data-code"));
  });

  panel.addEventListener("pointermove", (event) => {
    const option = event.target.closest?.("[data-code]");
    if (!option) return;
    const code = option.getAttribute("data-code");
    const next = indexOf(code);
    if (next === active) return;
    active = next;
    markActive();
  });

  function onDocPointer(event) {
    if (!open) return;
    const path = event.composedPath?.() || [];
    if (path.includes(trigger) || path.includes(panel)) return;
    closePanel();
  }

  function onDocKey(event) {
    if (!open || event.key !== "Escape") return;
    closePanel({ restoreFocus: true });
  }

  document.addEventListener("pointerdown", onDocPointer);
  document.addEventListener("keydown", onDocKey);

  paintOptions();
  paintTrigger();

  return {
    getValue: () => current,
    setValue(code) {
      if (!languages.some((l) => l.code === code)) return;
      current = code;
      active = indexOf(code);
      paintTrigger();
      if (open) paintOptions();
    },
    setDisabled(next) {
      disabled = Boolean(next);
      if (disabled) closePanel();
      paintTrigger();
    },
    open: openPanel,
    close: () => closePanel(),
    destroy() {
      document.removeEventListener("pointerdown", onDocPointer);
      document.removeEventListener("keydown", onDocKey);
      closePanel();
      panel.remove();
      root.remove();
    },
  };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
