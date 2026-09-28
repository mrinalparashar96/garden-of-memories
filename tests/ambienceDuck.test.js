import { beforeEach, describe, expect, it } from "vitest";
import { createAmbience } from "../src/ambience.js";

describe("ambience duck", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("does not change the saved mute preference", () => {
    const ambience = createAmbience();
    expect(ambience.isMuted()).toBe(false);
    ambience.duck();
    ambience.unduck();
    expect(ambience.isMuted()).toBe(false);
    expect(localStorage.getItem("still-here-ambience-muted")).toBeNull();

    ambience.setMuted(true);
    ambience.duck();
    ambience.unduck();
    expect(ambience.isMuted()).toBe(true);
  });
});
