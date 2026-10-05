/** Coupon strip at 3× (375×144 pt). WalletWallet still uses store-card layout when a strip URL is set. */
export const STRIP_W = 1125;
export const STRIP_H = 432;
/** Artwork sits slightly right of centre so the name can occupy the bottom-left. */
export const ART_CX = 0.58;
export const ART_CY = 0.46;
const SCALE = 3;

/**
 * Seeded constellation. Same pass id always returns the same points.
 * @param {string} passId
 * @param {number} [width]
 * @param {number} [height]
 */
export function constellationLayout(passId, width = STRIP_W, height = STRIP_H) {
  const rand = mulberry32(hashString(String(passId || "")));
  const cx = width * ART_CX;
  const cy = height * ART_CY;

  const far = [];
  for (let i = 0; i < 140; i++) {
    const x = rand() * width;
    const y = rand() * height;
    const dist = Math.hypot((x - cx) / width, (y - cy) / height);
    const brightness = 1 - Math.min(1, dist * 1.7);
    far.push({
      x,
      y,
      r: ((0.8 + rand() * 0.8) * SCALE) / 2,
      alpha: 0.16 + brightness * 0.62,
    });
  }

  const mid = [];
  for (let i = 0; i < 70; i++) {
    const angle = rand() * Math.PI * 2;
    const jitter = 0.9 + rand() * 0.22;
    mid.push({
      x: cx + Math.cos(angle) * width * 0.42 * jitter,
      y: cy + Math.sin(angle) * height * 0.48 * jitter,
      r: ((1.6 + rand() * 1.2) * SCALE) / 2,
      alpha: 0.4 + rand() * 0.45,
    });
  }

  const near = [];
  for (let i = 0; i < 9; i++) {
    near.push({
      x: cx + (rand() - 0.5) * width * 0.5,
      y: cy + (rand() - 0.5) * height * 0.46,
      r: ((3.5 + rand() * 2.5) * SCALE) / 2,
      alpha: 0.34 + rand() * 0.3,
    });
  }

  const trail = [];
  for (let i = 0; i < 34; i++) {
    const t = i / 33;
    const u = (t - 0.5) * 2;
    const fade = Math.sin(t * Math.PI);
    trail.push({
      x: cx + u * width * 0.34,
      y: cy + height * 0.2 + u * u * height * 0.1,
      r: (1.05 * SCALE) / 2,
      alpha: 0.08 + fade * 0.62,
    });
  }

  return { far, mid, near, trail, cx, cy };
}

function hashString(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

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
