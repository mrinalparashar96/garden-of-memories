import { beforeEach, describe, expect, it } from "vitest";
import { loadBookmarks, toggleBookmark } from "../src/bookmarkStore.js";
import { consumeFreshStart, showFreshStart } from "../src/freshStart.js";
import { addMemory, getMemories } from "../src/memoryStore.js";
import { createPass, getPass } from "../src/pass/passStore.js";
import { setPreferredVoiceLanguage } from "../src/voiceLanguages.js";

beforeEach(() => localStorage.clear());

describe("consumeFreshStart", () => {
  it("clears the pass, memories, bookmarks, and voice language", () => {
    createPass({ name: "Ada", art: "pass-01" });
    addMemory({
      id: "local-1",
      title: "Visit",
      body: "A morning at the house",
      relationship: "firstTime",
      region: "sails",
      emotion: "wonder",
    });
    localStorage.setItem(
      "still-here-user-memories-v1",
      JSON.stringify([{ id: "old", body: "Legacy", relationship: "often", region: "harbour" }])
    );
    toggleBookmark({ id: "kept-1", title: "Kept", body: "A kept line", emotion: "joy" });
    setPreferredVoiceLanguage("ja-JP");
    localStorage.setItem("stillhere.wallet-serials", "{}");
    localStorage.setItem("still-here-walkthrough-v2", "1");

    expect(consumeFreshStart("?reset=1&garden=1")).toBe("garden=1");

    expect(getPass()).toBeNull();
    expect(getMemories()).toEqual([]);
    expect(loadBookmarks()).toEqual([]);
    expect(localStorage.getItem("stillhere.voice.lang")).toBeNull();
    expect(localStorage.getItem("stillhere.wallet-serials")).toBeNull();
    expect(localStorage.getItem("still-here-user-memories-v1")).toBeNull();
    expect(localStorage.getItem("still-here-walkthrough-v2")).toBe("1");
  });

  it("leaves storage alone when reset is not set", () => {
    createPass({ name: "Ada", art: "pass-02" });
    expect(consumeFreshStart("?pass=1")).toBeNull();
    expect(getPass()?.name).toBe("ADA");
  });

  it("shows a short starting-fresh line", () => {
    const parent = document.createElement("div");
    const note = showFreshStart(parent);
    expect(note.textContent).toBe("Starting fresh");
    expect(parent.contains(note)).toBe(true);
  });
});
