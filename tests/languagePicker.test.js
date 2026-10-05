import { afterEach, describe, expect, it, vi } from "vitest";
import { createLanguagePicker } from "../src/languagePicker.js";

const languages = [
  { code: "en-AU", label: "English" },
  { code: "vi-VN", label: "Tiếng Việt" },
  { code: "ar-SA", label: "العربية" },
];

describe("language picker", () => {
  let mount;
  /** @type {ReturnType<typeof createLanguagePicker>} */
  let picker;

  afterEach(() => {
    picker?.destroy();
    mount?.remove();
  });

  it("opens a listbox, moves with the arrow keys, and commits on Enter", () => {
    mount = document.createElement("div");
    document.body.appendChild(mount);
    const onChange = vi.fn();
    picker = createLanguagePicker(mount, {
      languages,
      value: "en-AU",
      onChange,
    });

    const trigger = mount.querySelector("[data-lang]");
    expect(trigger.dataset.value).toBe("en-AU");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    trigger.click();

    const list = document.querySelector('[role="listbox"]');
    expect(list.hidden).toBe(false);
    const vietnamese = list.querySelector('[data-code="vi-VN"]');
    expect(vietnamese.getAttribute("lang")).toBe("vi-VN");
    expect(vietnamese.getAttribute("aria-selected")).toBe("false");

    list.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    list.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(onChange).toHaveBeenCalledWith("vi-VN");
    expect(trigger.dataset.value).toBe("vi-VN");
    expect(list.hidden).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes on Escape and on an outside click", () => {
    mount = document.createElement("div");
    document.body.appendChild(mount);
    picker = createLanguagePicker(mount, { languages, value: "en-AU" });
    mount.querySelector("[data-lang]").click();
    const list = document.querySelector('[role="listbox"]');
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(list.hidden).toBe(true);

    mount.querySelector("[data-lang]").click();
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(document.querySelector('[role="listbox"]').hidden).toBe(true);
  });
});
