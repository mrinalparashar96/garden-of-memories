const GOLD = "#ffd89a";
const PAPER = "#e2d8ca";

const RIBBONS = [
  { color: GOLD, phase: 0.2, freq: 0.55, harm: 0.9, band: [1, 8] },
  { color: PAPER, phase: 1.4, freq: 0.8, harm: 1.35, band: [8, 22] },
  { color: GOLD, phase: 2.5, freq: 1.15, harm: 0.7, band: [22, 48] },
  { color: PAPER, phase: 3.7, freq: 0.42, harm: 1.7, band: [4, 16] },
  { color: GOLD, phase: 5.1, freq: 1.45, harm: 1.05, band: [28, 64] },
];

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
    swing: 0.12,
    energy: 0,
  }));
  let smoothedLoud = 0;
  let washDebt = 0;

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
      loud = Math.min(1, Math.sqrt(sum / timeBins.length) * 3.2);
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
    const cssH = canvas.clientHeight || 180;
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

  function paintTrail(now, analyser) {
    const box = size();
    if (!box) return;
    const { ctx, dpr, w, h } = box;
    const { freq, loud } = read(analyser);
    smoothedLoud += (loud - smoothedLoud) * 0.12;
    const dt = 0.016;
    washDebt += dt;
    ctx.globalCompositeOperation = "source-over";
    while (washDebt >= 0.1) {
      washDebt -= 0.1;
      ctx.fillStyle = "rgba(0, 0, 0, 0.07)";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const t = now / 1000;
    const cx = w * 0.5;
    const cy = h * 0.52;
    for (const ribbon of ribbons) {
      const energy = bandEnergy(freq, ribbon.band[0], ribbon.band[1]);
      ribbon.energy += (energy - ribbon.energy) * 0.08;
      const targetSwing = 0.1 + smoothedLoud * 0.55 + ribbon.energy * 0.7;
      ribbon.swing += (targetSwing - ribbon.swing) * 0.06;
      const x =
        cx +
        Math.sin(t * ribbon.freq + ribbon.phase) * ribbon.swing * w * 0.38;
      const y =
        cy +
        Math.sin(t * ribbon.harm * 1.37 + ribbon.phase * 1.6) *
          ribbon.swing *
          h *
          0.32;
      const alpha = 0.12 + smoothedLoud * 0.55 + ribbon.energy * 0.4;
      if (ribbon.ready) {
        ctx.beginPath();
        ctx.strokeStyle = hexAlpha(ribbon.color, Math.min(0.85, alpha));
        ctx.lineWidth = (1 + smoothedLoud * 0.45) * dpr;
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
    smoothedLoud += (loud - smoothedLoud) * 0.18;
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
      washDebt = 0;
      smoothedLoud = 0;
      const box = size();
      if (box) box.ctx.clearRect(0, 0, box.w, box.h);
      ribbons.forEach((ribbon) => {
        ribbon.ready = false;
        ribbon.swing = 0.12;
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
