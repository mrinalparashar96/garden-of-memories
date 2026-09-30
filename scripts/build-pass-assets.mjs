/**
 * Rebuild Wallet strip art and the logo wordmark.
 *   node scripts/build-pass-assets.mjs
 */
import { readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const artDir = path.join(root, "public/assets/pass");
const stripDir = path.join(artDir, "strip");
const STRIP_W = 1125;
const STRIP_H = 369;
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromName(name) {
  let h = 2166136261;
  for (const ch of name) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

function hairlineSvg() {
  return Buffer.from(`<svg width="${STRIP_W}" height="${STRIP_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="hair" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#c4a882" stop-opacity="0"/>
      <stop offset="0.14" stop-color="#c4a882" stop-opacity="1"/>
      <stop offset="0.86" stop-color="#c4a882" stop-opacity="1"/>
      <stop offset="1" stop-color="#c4a882" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${STRIP_H - 2}" width="${STRIP_W}" height="2" fill="url(#hair)"/>
</svg>`);
}

async function buildStrip(file) {
  const input = path.join(artDir, file);
  const meta = await sharp(input).metadata();
  const srcW = meta.width || STRIP_W;
  const srcH = meta.height || STRIP_H;
  const targetRatio = STRIP_W / STRIP_H;
  const srcRatio = srcW / srcH;
  const extract =
    srcRatio > targetRatio
      ? {
          left: Math.round((srcW - srcH * targetRatio) / 2),
          top: 0,
          width: Math.round(srcH * targetRatio),
          height: srcH,
        }
      : {
          left: 0,
          top: Math.round((srcH - srcW / targetRatio) / 2),
          width: srcW,
          height: Math.round(srcW / targetRatio),
        };
  const localGrain = await grainOverlayNamed(file);
  const base = await sharp(input)
    .extract(extract)
    .resize(STRIP_W, STRIP_H)
    .png()
    .toBuffer();
  const out = path.join(stripDir, file);
  await sharp(base)
    .composite([
      { input: localGrain, blend: "over" },
      { input: hairlineSvg(), blend: "over" },
    ])
    .jpeg({ quality: 90, mozjpeg: true })
    .toFile(out);
  console.log("strip", path.basename(out));
}

async function grainOverlayNamed(name) {
  const rand = mulberry32(seedFromName(name));
  const rgba = Buffer.alloc(STRIP_W * STRIP_H * 4);
  const alpha = Math.round(255 * 0.06);
  for (let i = 0; i < STRIP_W * STRIP_H; i++) {
    const n = Math.floor(rand() * 256);
    const o = i * 4;
    rgba[o] = n;
    rgba[o + 1] = n;
    rgba[o + 2] = n;
    rgba[o + 3] = alpha;
  }
  return sharp(rgba, {
    raw: { width: STRIP_W, height: STRIP_H, channels: 4 },
  })
    .png()
    .toBuffer();
}

function logoSvg() {
  return Buffer.from(`<svg width="480" height="150" xmlns="http://www.w3.org/2000/svg">
  <rect width="480" height="150" fill="#000000"/>
  <circle cx="34" cy="75" r="11" fill="#c4a882"/>
  <text x="62" y="62" fill="#c4a882" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="20" letter-spacing="5.5">STILL HERE</text>
  <text x="62" y="108" fill="#f4efe6" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="34">Garden of Memories</text>
</svg>`);
}

async function buildLogo() {
  const out = path.join(artDir, "logo.png");
  await sharp(logoSvg()).png().toFile(out);
  console.log("logo", "480x150");
}

const files = (await readdir(artDir)).filter((name) => /^pass-\d+\.jpg$/.test(name)).sort();
for (const file of files) await buildStrip(file);
await buildLogo();
