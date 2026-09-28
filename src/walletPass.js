import qrcode from "qrcode-generator";
import { PASS_ART_IDS, MAX_PASS_NAME } from "./pass/passArt.js";
import { getPass } from "./pass/passStore.js";

const SERIAL_KEY = "stillhere.wallet-serials";
const PASS_ID = /^SH-[0-9A-F]{4}-[0-9A-F]{4}$/;
export const WALLET_ERROR = "Couldn't reach Wallet right now";

/**
 * iPhone, iPad, and Safari on a Mac. Other browsers get a QR instead.
 * @param {string} [ua]
 * @param {number} [touchPoints]
 */
export function canAddToAppleWallet(
  ua = typeof navigator !== "undefined" ? navigator.userAgent : "",
  touchPoints = typeof navigator !== "undefined" ? navigator.maxTouchPoints || 0 : 0
) {
  const ios = /iPhone|iPad|iPod/.test(ua);
  const ipadOs = /Macintosh/.test(ua) && touchPoints > 1;
  const macSafari =
    /Macintosh/.test(ua) &&
    /Safari/.test(ua) &&
    !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/.test(ua) &&
    touchPoints <= 1;
  return ios || ipadOs || macSafari;
}

/**
 * @param {{ id: string, name: string, art: string, issuedAt: number }} pass
 */
export function walletPageUrl(pass) {
  const params = new URLSearchParams({
    pass: pass.id,
    name: pass.name,
    art: pass.art,
    issued: String(pass.issuedAt),
  });
  return `/wallet?${params.toString()}`;
}

export function absoluteWalletUrl(pass) {
  const origin = typeof location !== "undefined" ? location.origin : "";
  return `${origin}${walletPageUrl(pass)}`;
}

/**
 * Rebuild a pass from /wallet?pass=ID plus the fields a scanned phone needs.
 * Falls back to the pass stored on this device when the id matches.
 * @param {string} search
 */
export function passFromWalletSearch(search) {
  const q = new URLSearchParams(search);
  const id = String(q.get("pass") || "").toUpperCase();
  if (!PASS_ID.test(id)) return null;
  const stored = getPass();
  if (stored?.id === id) return stored;
  const name = String(q.get("name") || "")
    .trim()
    .slice(0, MAX_PASS_NAME)
    .toUpperCase();
  const art = String(q.get("art") || "").toLowerCase();
  const issuedAt = Number(q.get("issued"));
  if (!name || !PASS_ART_IDS.has(art) || !Number.isFinite(issuedAt) || issuedAt <= 0) {
    return null;
  }
  return { id, name, art, issuedAt };
}

/**
 * @param {HTMLElement} mount
 * @param {{ id: string, name: string, art: string, issuedAt: number } | null} pass
 */
export function mountWalletOffer(mount, pass) {
  if (!mount) return;
  if (!pass?.id) {
    mount.replaceChildren();
    return;
  }
  if (canAddToAppleWallet()) {
    mount.innerHTML = `
      <button type="button" class="wallet-badge" data-wallet-add>
        <span class="wallet-badge-logo" aria-hidden="true">${APPLE_LOGO}</span>
        <span class="wallet-badge-copy">
          <span class="wallet-badge-kicker">Add to</span>
          <span class="wallet-badge-name">Apple Wallet</span>
        </span>
      </button>
      <p class="wallet-status" data-wallet-status hidden></p>
    `;
    mount.querySelector("[data-wallet-add]")?.addEventListener("click", () => {
      void addPassToWallet(pass, mount.querySelector("[data-wallet-status]"));
    });
    return;
  }
  const url = absoluteWalletUrl(pass);
  mount.innerHTML = `
    <div class="wallet-scan">
      <div class="wallet-qr" data-wallet-qr></div>
      <p class="wallet-scan-caption">Scan on your iPhone to add this pass to Apple Wallet</p>
    </div>
  `;
  const qr = mount.querySelector("[data-wallet-qr]");
  if (qr) qr.innerHTML = qrSvg(url);
}

/**
 * @param {{ id: string, name: string, art: string, issuedAt: number }} pass
 * @param {HTMLElement | null} [statusEl]
 */
export async function addPassToWallet(pass, statusEl) {
  const button = statusEl?.parentElement?.querySelector("[data-wallet-add]");
  if (button) button.setAttribute("disabled", "true");
  setStatus(statusEl, "");
  try {
    const res = await fetch("/api/wallet-pass", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...pass, serial: readSerial(pass.id) }),
    });
    const serial = res.headers.get("X-Wallet-Serial");
    if (serial) writeSerial(pass.id, serial);
    const type = res.headers.get("content-type") || "";
    if (!res.ok) throw new Error(WALLET_ERROR);
    if (type.includes("json")) {
      const data = await res.json();
      if (data?.serial) writeSerial(pass.id, data.serial);
      if (data?.updated) {
        setStatus(statusEl, "Your pass is up to date in Wallet.");
        return;
      }
      throw new Error(WALLET_ERROR);
    }
    const blob = await res.blob();
    const file = new Blob([blob], { type: "application/vnd.apple.pkpass" });
    const url = URL.createObjectURL(file);
    window.location.assign(url);
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    setStatus(statusEl, WALLET_ERROR);
  } finally {
    if (button) button.removeAttribute("disabled");
  }
}

function setStatus(el, text) {
  if (!el) return;
  el.hidden = !text;
  el.textContent = text;
}

function readSerial(passId) {
  try {
    const map = JSON.parse(localStorage.getItem(SERIAL_KEY) || "{}");
    return typeof map[passId] === "string" ? map[passId] : "";
  } catch {
    return "";
  }
}

function writeSerial(passId, serial) {
  if (!serial) return;
  try {
    const map = JSON.parse(localStorage.getItem(SERIAL_KEY) || "{}");
    map[passId] = serial;
    localStorage.setItem(SERIAL_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function qrSvg(text) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const cell = 3;
  const margin = 2;
  const size = (n + margin * 2) * cell;
  let rects = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.isDark(r, c)) continue;
      rects += `<rect x="${(c + margin) * cell}" y="${(r + margin) * cell}" width="${cell}" height="${cell}"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="QR code for Apple Wallet">${rects}</svg>`;
}

const APPLE_LOGO = `<svg viewBox="0 0 16 20" aria-hidden="true"><path fill="currentColor" d="M12.7 10.6c0-2.2 1.8-3.3 1.9-3.4-1-1.5-2.7-1.7-3.2-1.7-1.4-.1-2.7.8-3.4.8s-1.8-.8-2.9-.8c-1.5 0-2.9.9-3.7 2.2-1.6 2.7-.4 6.8 1.1 9 .8 1.1 1.7 2.3 2.9 2.2 1.1 0 1.6-.7 3-.7s1.8.7 3 .7 2-.1 2.9-2.2c.6-.9 1.1-1.8 1.4-2.8-3.6-1.4-3.9-6.2-1-.6zM10.5 4.2c.6-.8 1-1.8.9-2.9-1 .1-2.1.6-2.8 1.4-.6.7-1.1 1.8-.9 2.8 1 .1 2.1-.5 2.8-1.3z"/></svg>`;
