import {
  formatIssuedDate,
  formatPassId,
  MAX_PASS_NAME,
  PASS_ART_IDS,
} from "../src/pass/passArt.js";

const PASS_ID = /^SH-[0-9A-F]{4}-[0-9A-F]{4}$/;
const SERIAL = /^[A-Za-z0-9-]{8,80}$/;

/**
 * @param {unknown} raw
 * @returns {{ id: string, name: string, art: string, issuedAt: number, serial: string } | null}
 */
export function validatePassBody(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").toUpperCase();
  const name = String(raw.name || "")
    .trim()
    .slice(0, MAX_PASS_NAME)
    .toUpperCase();
  const art = String(raw.art || "").toLowerCase();
  const issuedAt = Number(raw.issuedAt);
  if (!PASS_ID.test(id) || !name || !PASS_ART_IDS.has(art)) return null;
  if (!Number.isFinite(issuedAt) || issuedAt <= 0) return null;
  const serial = String(raw.serial || "");
  return {
    id,
    name,
    art,
    issuedAt,
    serial: SERIAL.test(serial) ? serial : "",
  };
}

/**
 * Absolute origin WalletWallet can fetch images from.
 * @param {{ headers?: Record<string, string | string[] | undefined> }} req
 */
export function requestOrigin(req) {
  const header = (name) => {
    const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
    const raw = Array.isArray(value) ? value[0] : value || "";
    return String(raw).split(",")[0].trim();
  };
  const host = header("x-forwarded-host") || header("host");
  const proto = header("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  if (host) return `${proto}://${host}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "";
}

/**
 * WalletWallet pass body. Same id → same barcode, so a later PUT updates the card.
 * @param {{ id: string, name: string, art: string, issuedAt: number }} pass
 * @param {string} origin
 */
export function buildWalletBody(pass, origin) {
  const root = origin.replace(/\/$/, "");
  const passUrl = `${root}/?pass=${encodeURIComponent(pass.id)}`;
  return {
    barcodeValue: passUrl,
    barcodeFormat: "QR",
    barcodeAltText: formatPassId(pass.id),
    logoText: "Garden of Memories",
    description: "Garden of Memories pass",
    organizationName: "Garden of Memories",
    color: "#000000",
    colorPreset: "dark",
    logoURL: `${root}/assets/pass/logo.png`,
    iconURL: `${root}/assets/pass/icon.png`,
    stripURL: `${root}/assets/pass/strip/${pass.art}.jpg`,
    primaryFields: [{ label: "NAME", value: pass.name }],
    secondaryFields: [
      { label: "PASS", value: formatPassId(pass.id) },
      { label: "ISSUED", value: formatIssuedDate(pass.issuedAt) },
    ],
    backFields: [
      {
        label: "ABOUT",
        value:
          "A Memory Pass for the Garden of Memories. The name on the front is the name left with a memory at the Sydney Opera House.",
      },
    ],
    sharingProhibited: true,
  };
}
