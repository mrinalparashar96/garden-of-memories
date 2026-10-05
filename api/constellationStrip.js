import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";
import sharp from "sharp";
import { MAX_PASS_NAME } from "../src/pass/passArt.js";
import { ART_CX, ART_CY, STRIP_H, STRIP_W, constellationLayout } from "./constellation.js";

const FONT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "../public/fonts/SpaceMono-Regular.ttf");
const font = opentype.parse(readFileSync(FONT_PATH));

const LABEL = "MEMORY PASS";
const LABEL_PX = 27;

/**
 * @param {{ id: string, art: string, name?: string }} pass
 * @returns {Promise<Buffer>}
 */
export async function renderConstellationStrip(pass) {
  const layout = constellationLayout(pass.id, STRIP_W, STRIP_H);
  const art = await maskedArtwork(pass.art);
  const name = String(pass.name || "")
    .trim()
    .slice(0, MAX_PASS_NAME)
    .toUpperCase();
  return sharp({
    create: {
      width: STRIP_W,
      height: STRIP_H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .composite([
      { input: Buffer.from(glowSvg()), blend: "over" },
      { input: art.buffer, left: art.left, top: art.top, blend: "over" },
      { input: Buffer.from(orbitSvg(layout)), blend: "over" },
      { input: Buffer.from(particleSvg(layout)), blend: "over" },
      { input: Buffer.from(captionSvg(name)), blend: "over" },
    ])
    .png()
    .toBuffer();
}

/** Font size that fits an 18-character name inside 60% of the strip width. */
export function nameFontSize(width = STRIP_W) {
  const advance = font.charToGlyph("M").advanceWidth / font.unitsPerEm;
  return Math.floor((width * 0.6) / (advance * MAX_PASS_NAME));
}

async function maskedArtwork(art) {
  const file = path.join(process.cwd(), "public/assets/pass", `${art}.jpg`);
  const artW = Math.round(STRIP_W * 0.8);
  const artH = Math.round(STRIP_H * 0.9);
  const left = Math.round(STRIP_W * ART_CX - artW / 2);
  const top = Math.round(STRIP_H * ART_CY - artH / 2);
  const photo = await sharp(await readFile(file))
    .resize(artW, artH, { fit: "cover", position: "centre" })
    .ensureAlpha()
    .png()
    .toBuffer();
  const mask = Buffer.from(`<svg width="${artW}" height="${artH}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="m" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color="#fff" stop-opacity="0.95"/>
        <stop offset="0.55" stop-color="#fff" stop-opacity="0.62"/>
        <stop offset="1" stop-color="#fff" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <ellipse cx="${artW / 2}" cy="${artH / 2}" rx="${artW / 2}" ry="${artH / 2}" fill="url(#m)"/>
  </svg>`);
  const buffer = await sharp(photo)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
  return { buffer, left, top };
}

function glowSvg() {
  return wrap(`<defs>
    <radialGradient id="warm" cx="58%" cy="46%" r="46%">
      <stop offset="0" stop-color="#ffd89a" stop-opacity="0.10"/>
      <stop offset="1" stop-color="#ffd89a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#warm)"/>`);
}

function orbitSvg(layout) {
  const rings = [
    { rx: STRIP_W * 0.34, ry: STRIP_H * 0.3, rot: -8, opacity: 0.14 },
    { rx: STRIP_W * 0.4, ry: STRIP_H * 0.34, rot: 6, opacity: 0.18 },
    { rx: STRIP_W * 0.28, ry: STRIP_H * 0.26, rot: 14, opacity: 0.22 },
  ];
  const marks = rings
    .map(
      (ring) =>
        `<ellipse cx="${n(layout.cx)}" cy="${n(layout.cy)}" rx="${n(ring.rx)}" ry="${n(ring.ry)}" fill="none" stroke="#c4a882" stroke-opacity="${ring.opacity}" stroke-width="1" mask="url(#orbitFade)" transform="rotate(${ring.rot} ${n(layout.cx)} ${n(layout.cy)})"/>`
    )
    .join("");
  return wrap(`<defs>
    <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/>
      <stop offset="0.18" stop-color="#fff" stop-opacity="1"/>
      <stop offset="0.82" stop-color="#fff" stop-opacity="1"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <mask id="orbitFade"><rect width="100%" height="100%" fill="url(#fade)"/></mask>
  </defs>${marks}`);
}

function particleSvg(layout) {
  const dots = [...layout.far, ...layout.mid]
    .map(
      (p) =>
        `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(p.r)}" fill="#ffd89a" fill-opacity="${n(p.alpha)}"/>`
    )
    .join("");
  const trail = layout.trail
    .map(
      (p) =>
        `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(p.r)}" fill="#c4a882" fill-opacity="${n(p.alpha)}"/>`
    )
    .join("");
  const orbs = layout.near
    .map(
      (p) =>
        `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(p.r)}" fill="#ffd89a" fill-opacity="${n(p.alpha)}" filter="url(#soft)"/>`
    )
    .join("");
  return wrap(`<defs>
    <filter id="soft" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="3.2"/>
    </filter>
    <linearGradient id="line" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#c4a882" stop-opacity="0"/>
      <stop offset="0.16" stop-color="#c4a882" stop-opacity="0.6"/>
      <stop offset="0.84" stop-color="#c4a882" stop-opacity="0.6"/>
      <stop offset="1" stop-color="#c4a882" stop-opacity="0"/>
    </linearGradient>
  </defs>
  ${dots}
  ${trail}
  ${orbs}
  <rect x="0" y="${n(STRIP_H * 0.07)}" width="${STRIP_W}" height="2" fill="url(#line)"/>
  <rect x="0" y="${n(STRIP_H * 0.72)}" width="${STRIP_W}" height="2" fill="url(#line)"/>`);
}

function captionSvg(name) {
  const size = nameFontSize();
  const padX = 48;
  const nameY = STRIP_H - 40;
  const labelY = nameY - size - 18;
  const label = glyphRun(LABEL, padX, labelY, LABEL_PX, 0.22);
  const title = glyphRun(name, padX, nameY, size, 0);
  return wrap(`<defs>
    <radialGradient id="corner" cx="0" cy="1" r="0.72">
      <stop offset="0" stop-color="#000" stop-opacity="0.82"/>
      <stop offset="0.42" stop-color="#000" stop-opacity="0.4"/>
      <stop offset="1" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#corner)"/>
  <path d="${label}" fill="#c4a882"/>
  <path d="${title}" fill="#f4efe6"/>`);
}

function glyphRun(text, x, y, size, trackingEm) {
  const tracking = trackingEm * size;
  let cursor = x;
  const parts = [];
  for (const ch of text) {
    const glyph = font.charToGlyph(ch);
    const data = glyph.getPath(cursor, y, size).toPathData(2);
    if (data) parts.push(data);
    cursor += (glyph.advanceWidth / font.unitsPerEm) * size + tracking;
  }
  return parts.join(" ");
}

function wrap(inner) {
  return `<svg width="${STRIP_W}" height="${STRIP_H}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
}

function n(value) {
  return Math.round(value * 100) / 100;
}
