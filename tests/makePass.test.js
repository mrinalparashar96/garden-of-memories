import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addMemory, getMemories } from "../src/memoryStore.js";
import { createPass, getPass } from "../src/pass/passStore.js";
import { createMakePass } from "../src/screens/MakePass.js";

beforeEach(() => localStorage.clear());

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("Remove this pass", () => {
  it("deletes the pass after a completed hold and keeps visitor memories", () => {
    createPass({ name: "Ada", art: "pass-01" });
    addMemory({
      id: "local-1",
      title: "Visit",
      body: "A morning at the house",
      relationship: "firstTime",
      region: "sails",
      emotion: "wonder",
    });
    const onBackToMap = vi.fn();
    const screen = createMakePass({ mount: document.body, onBackToMap });
    screen.open({ mode: "edit" });
    expect(document.body.querySelector("[data-remove]")?.textContent).toMatch(/Remove this pass/);

    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.stubGlobal("requestAnimationFrame", (cb) => {
      now = 2000;
      cb(now);
      return 1;
    });
    document.body.querySelector("[data-remove]").dispatchEvent(
      new Event("pointerdown", { bubbles: true, cancelable: true })
    );

    expect(getPass()).toBeNull();
    expect(getMemories()).toHaveLength(1);
    expect(onBackToMap).toHaveBeenCalledOnce();
    expect(document.body.querySelector("#make-pass")?.hidden).toBe(true);
  });

  it("keeps the pass when the hold is released early", () => {
    createPass({ name: "Ada", art: "pass-03" });
    const screen = createMakePass({ mount: document.body });
    screen.open({ mode: "edit" });
    let now = 0;
    let frames = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.stubGlobal("requestAnimationFrame", (cb) => {
      frames += 1;
      if (frames > 1) return frames;
      now = 80;
      cb(now);
      return frames;
    });
    const button = document.body.querySelector("[data-remove]");
    button.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
    button.dispatchEvent(new Event("pointerup", { bubbles: true }));
    expect(getPass()?.name).toBe("ADA");
    screen.destroy();
  });
});
