import { describe, expect, it } from "vitest";
import { constellationLayout } from "../api/constellation.js";

describe("constellation seeding", () => {
  it("draws the same sky for the same pass id", () => {
    const first = constellationLayout("SH-AB12-CD34");
    const second = constellationLayout("SH-AB12-CD34");
    expect(first).toEqual(second);
    expect(first.far).toHaveLength(140);
    expect(first.mid).toHaveLength(70);
    expect(first.near).toHaveLength(9);
    expect(first.trail).toHaveLength(34);
  });

  it("draws a different sky for another pass", () => {
    const a = constellationLayout("SH-AB12-CD34");
    const b = constellationLayout("SH-FFFF-0001");
    expect(a.far[0]).not.toEqual(b.far[0]);
    expect(a.mid[3]).not.toEqual(b.mid[3]);
  });
});