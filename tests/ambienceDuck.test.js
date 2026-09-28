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

  it("stays ducked until every holder has released", () => {
    const ambience = createAmbience();
    ambience.duck();
    ambience.duck();
    ambience.unduck();
    expect(ambience.isDucked()).toBe(true);
    ambience.unduck();
    expect(ambience.isDucked()).toBe(false);
    ambience.unduck();
    expect(ambience.isDucked()).toBe(false);
    expect(ambience.isMuted()).toBe(false);
  });
});
