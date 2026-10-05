import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { STRIP_H, STRIP_W, constellationLayout } from "../api/constellation.js";
import { nameFontSize, renderConstellationStrip } from "../api/constellationStrip.js";

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

  it("keeps the far stars across the strip and pushes the mid ring outward", () => {
    const sky = constellationLayout("SH-AB12-CD34");
    expect(Math.min(...sky.far.map((p) => p.x))).toBeLessThan(STRIP_W * 0.05);
    expect(Math.max(...sky.far.map((p) => p.x))).toBeGreaterThan(STRIP_W * 0.9);
    const reach = sky.mid.map((p) => Math.hypot(p.x - sky.cx, (p.y - sky.cy) * (STRIP_W / STRIP_H)));
    expect(Math.min(...reach)).toBeGreaterThan(STRIP_W * 0.32);
  });
});

describe("constellation strip", () => {
  it("fits the name in the bottom-left of a coupon-sized strip", async () => {
    expect(nameFontSize()).toBeGreaterThan(48);
    const sample = { id: "SH-AB12-CD34", art: "pass-01" };
    const shortPng = await renderConstellationStrip({ ...sample, name: "A" });
    const longPng = await renderConstellationStrip({ ...sample, name: "M".repeat(18) });
    const short = await sharp(shortPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const long = await sharp(longPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(short.info.width).toBe(STRIP_W);
    expect(short.info.height).toBe(STRIP_H);
    let maxX = 0;
    let ink = 0;
    const pad = 48;
    for (let y = 300; y < short.info.height; y++) {
      for (let x = 0; x < short.info.width; x++) {
        const i = (y * short.info.width + x) * 4;
        const delta = Math.abs(long.data[i] - short.data[i]) + Math.abs(long.data[i + 1] - short.data[i + 1]);
        if (delta < 40) continue;
        ink++;
        if (x > maxX) maxX = x;
      }
    }
    expect(ink).toBeGreaterThan(80);
    expect(maxX).toBeLessThanOrEqual(pad + STRIP_W * 0.6);
  });
});