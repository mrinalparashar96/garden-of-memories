/**
 * Rebuild the Wallet logo wordmark (480×150, 160×50 pt at 3×).
 *   npm run pass-assets
 */
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");

const svg = Buffer.from(`<svg width="480" height="150" xmlns="http://www.w3.org/2000/svg">
  <rect width="480" height="150" fill="#000000"/>
  <circle cx="36" cy="75" r="22" fill="#c4a882" fill-opacity="0.28"/>
  <circle cx="36" cy="75" r="10" fill="#c4a882"/>
  <text x="72" y="86" fill="#f4efe6" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="32">Garden of Memories</text>
</svg>`);

await sharp(svg).png().toFile(path.join(root, "public/assets/pass/logo.png"));
console.log("logo 480x150");
