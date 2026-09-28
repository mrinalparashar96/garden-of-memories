const GOLD = "#ffd89a";
const PAPER = "#e2d8ca";

/** A little slower than the first knot, still fast enough that a sentence draws a loop. */
const RIBBONS = [
  { color: GOLD, phase: 0.3, freq: 0.42, harm: 0.55, spanX: 0.9, spanY: 0.58, band: [1, 6] },
  { color: PAPER, phase: 1.6, freq: 0.58, harm: 0.92, spanX: 0.84, spanY: 0.74, band: [6, 18] },
  { color: GOLD, phase: 2.7, freq: 0.84, harm: 1.25, spanX: 0.8, spanY: 0.7, band: [18, 40] },
  { color: PAPER, phase: 4.05, freq: 0.34, harm: 0.7, spanX: 0.88, spanY: 0.64, band: [3, 14] },
  { color: GOLD, phase: 5.2, freq: 1.05, harm: 0.4, spanX: 0.82, spanY: 0.78, band: [24, 56] },
];
/** Quieter speech still moves the drawing; values stay clamped to 1. */
const VOICE_GAIN = 1.15;
const SILENCE_FLOOR = 0.018 / VOICE_GAIN;

/**
 * Long-exposure ribbons drawn by the microphone.
 * prefers-reduced-motion draws a slowly breathing level meter instead.
 * @param {HTMLCanvasElement} canvas
 */
export function createVoiceMeter(canvas) {
  let raf = 0;
  let running = false;
  /** @type {Uint8Array | null} */
  let freqBins = null;
  /** @type {Uint8Array | null} */
  let timeBins = null;
  const ribbons = RIBBONS.map((ribbon) => ({
    ...ribbon,
    x: 0,
    y: 0,
    ready: false,
    energy: 0,
  }));
  let smoothedLoud = 0;

  function reduced() {
    return (
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true
    );
  }

  function read(analyser) {
    if (!analyser) return { freq: null, loud: 0 };
    const fft = analyser.fftSize || analyser.frequencyBinCount * 2 || 0;
    const bins = analyser.frequencyBinCount || 0;
    let loud = 0;
    if (analyser.getByteTimeDomainData && fft) {
      if (!timeBins || timeBins.length !== fft) timeBins = new Uint8Array(fft);
      analyser.getByteTimeDomainData(timeBins);
      let sum = 0;
      for (let i = 0; i < timeBins.length; i++) {
        const v = (timeBins[i] - 128) / 128;
        sum += v * v;
      }
      loud = Math.sqrt(sum / timeBins.length) * 3.2;
    }
    if (analyser.getByteFrequencyData && bins) {
      if (!freqBins || freqBins.length !== bins) freqBins = new Uint8Array(bins);
      analyser.getByteFrequencyData(freqBins);
    } else {
      freqBins = null;
    }
    return { freq: freqBins, loud };
  }

  function bandEnergy(freq, start, end) {
    if (!freq?.length) return 0;
    const a = Math.min(freq.length - 1, Math.max(0, start));
    const b = Math.min(freq.length, Math.max(a + 1, end));
    let sum = 0;
    for (let i = a; i < b; i++) sum += freq[i];
    return sum / (b - a) / 255;
  }

  function size() {
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth || 280;
    const cssH = canvas.clientHeight || 240;
    const w = Math.max(1, Math.floor(cssW * dpr));
    const h = Math.max(1, Math.floor(cssH * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      ribbons.forEach((ribbon) => {
        ribbon.ready = false;
      });
    }
    return { ctx, dpr, w, h };
  }

  function sensed(value) {
    return Math.min(1, Math.max(0, value - SILENCE_FLOOR) * VOICE_GAIN);
  }

  function paintTrail(now, analyser) {
    const box = size();
    if (!box) return;
    const { ctx, dpr, w, h } = box;
    const { freq, loud } = read(analyser);
    const voice = sensed(loud);
    smoothedLoud += (voice - smoothedLoud) * 0.16;
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0, 0, 0, 0.06)";
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const t = now / 1000;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const pad = 2 * dpr;
    for (const ribbon of ribbons) {
      const energy = sensed(bandEnergy(freq, ribbon.band[0], ribbon.band[1]));
      ribbon.energy += (energy - ribbon.energy) * 0.1;
      const reach = Math.min(1, smoothedLoud * 0.62 + ribbon.energy * 0.62);
      const spanX = ribbon.spanX + (0.98 - ribbon.spanX) * reach;
      const spanY = ribbon.spanY + (0.94 - ribbon.spanY) * reach;
      const halfX = Math.min(w * 0.5 - pad, w * spanX * 0.5);
      const halfY = Math.min(h * 0.5 - pad, h * spanY * 0.5);
      const x = Math.min(
        w - pad,
        Math.max(pad, cx + Math.sin(t * ribbon.freq + ribbon.phase) * halfX)
      );
      const y = Math.min(
        h - pad,
        Math.max(
          pad,
          cy +
            Math.sin(t * ribbon.harm * 1.2 + ribbon.phase * 1.7) * halfY
        )
      );
      const alpha = Math.min(1, 0.72 + smoothedLoud * 0.22 + ribbon.energy * 0.2);
      const width = (1.6 + smoothedLoud * 0.9) * dpr;
      if (ribbon.ready) {
        ctx.beginPath();
        ctx.strokeStyle = hexAlpha(ribbon.color, alpha);
        ctx.lineWidth = width;
        ctx.moveTo(ribbon.x, ribbon.y);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      ribbon.x = x;
      ribbon.y = y;
      ribbon.ready = true;
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function paintMeter(now, analyser) {
    const box = size();
    if (!box) return;
    const { ctx, dpr, w, h } = box;
    const { loud } = read(analyser);
    smoothedLoud += (sensed(loud) - smoothedLoud) * 0.18;
    const breathe = 0.5 + 0.5 * Math.sin(now / 1100);
    const level = Math.max(smoothedLoud, 0.06 + breathe * 0.05);
    ctx.clearRect(0, 0, w, h);
    const n = 24;
    const gap = 4 * dpr;
    const barW = Math.max(dpr, (w - gap * (n - 1)) / n);
    const hgt = Math.max(2 * dpr, level * h * 0.72);
    ctx.fillStyle = GOLD;
    ctx.globalAlpha = 0.35 + level * 0.5;
    for (let i = 0; i < n; i++) {
      const x = i * (barW + gap);
      ctx.fillRect(x, (h - hgt) / 2, barW, hgt);
    }
    ctx.globalAlpha = 1;
  }

  function frame(now, analyser) {
    if (reduced()) paintMeter(now, analyser);
    else paintTrail(now, analyser);
  }

  function loop(getAnalyser) {
    if (!running) return;
    frame(performance.now(), getAnalyser?.() || null);
    raf = requestAnimationFrame(() => loop(getAnalyser));
  }

  return {
    start(getAnalyser) {
      if (running) return;
      running = true;
      smoothedLoud = 0;
      const box = size();
      if (box) box.ctx.clearRect(0, 0, box.w, box.h);
      ribbons.forEach((ribbon) => {
        ribbon.ready = false;
        ribbon.energy = 0;
      });
      loop(getAnalyser);
    },
    stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}

function hexAlpha(hex, alpha) {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
