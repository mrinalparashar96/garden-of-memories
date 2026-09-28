const GOLD = "#ffd89a";
const PAPER = "#e2d8ca";

/** One crossing, then a smooth reverse. */
const CROSS_MS = 8000;
/** Trail drops to a few percent after about three seconds. */
const TRAIL_TAU = 1.05;
const ATTACK_S = 0.055;
const RELEASE_S = 0.09;
const VOICE_GAIN = 1.15;
const SILENCE_FLOOR = 0.018 / VOICE_GAIN;
const MAX_SPARKS = 72;

/**
 * Long-exposure oscilloscope. The pen only moves on its own across the page;
 * every rise, reflection and spark comes from the microphone.
 * prefers-reduced-motion draws a static level bar instead.
 * @param {HTMLCanvasElement} canvas
 */
export function createVoiceMeter(canvas) {
  let raf = 0;
  let running = false;
  /** @type {Uint8Array | null} */
  let freqBins = null;
  /** @type {Uint8Array | null} */
  let timeBins = null;
  let loud = 0;
  let lastNow = 0;
  let lastX = 0;
  let lastY = 0;
  let lastMirror = 0;
  let hasLast = false;
  /** @type {{ x: number, y: number, born: number }[]} */
  let sparks = [];

  function reduced() {
    return (
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true
    );
  }

  function sensed(value) {
    return Math.min(1, Math.max(0, value - SILENCE_FLOOR) * VOICE_GAIN);
  }

  function follow(current, target, dt) {
    const tau = target > current ? ATTACK_S : RELEASE_S;
    const k = 1 - Math.exp(-dt / tau);
    return current + (target - current) * k;
  }

  function read(analyser) {
    if (!analyser) return { loud: 0, high: 0 };
    const fft = analyser.fftSize || analyser.frequencyBinCount * 2 || 0;
    const bins = analyser.frequencyBinCount || 0;
    let rms = 0;
    if (analyser.getByteTimeDomainData && fft) {
      if (!timeBins || timeBins.length !== fft) timeBins = new Uint8Array(fft);
      analyser.getByteTimeDomainData(timeBins);
      let sum = 0;
      for (let i = 0; i < timeBins.length; i++) {
        const v = (timeBins[i] - 128) / 128;
        sum += v * v;
      }
      rms = Math.sqrt(sum / timeBins.length) * 3.2;
    }
    let high = 0;
    if (analyser.getByteFrequencyData && bins) {
      if (!freqBins || freqBins.length !== bins) freqBins = new Uint8Array(bins);
      analyser.getByteFrequencyData(freqBins);
      const start = Math.floor(bins * 0.45);
      let sum = 0;
      for (let i = start; i < bins; i++) sum += freqBins[i];
      const count = Math.max(1, bins - start);
      high = sum / count / 255;
    }
    return { loud: sensed(rms), high: sensed(high) };
  }

  function size() {
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth || 320;
    const cssH = canvas.clientHeight || 240;
    const w = Math.max(1, Math.floor(cssW * dpr));
    const h = Math.max(1, Math.floor(cssH * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      hasLast = false;
    }
    return { ctx, dpr, w, h };
  }

  /** 0 at the left edge, 1 at the right, reversing smoothly every 8s. */
  function travel(now, w, pad) {
    const phase = (now / CROSS_MS) * Math.PI;
    const u = (1 - Math.cos(phase)) / 2;
    return pad + u * (w - pad * 2);
  }

  function paintTrace(now, analyser) {
    const box = size();
    if (!box) return;
    const { ctx, dpr, w, h } = box;
    const dt = lastNow ? Math.min(0.05, (now - lastNow) / 1000) : 0.016;
    lastNow = now;
    const { loud: target, high } = read(analyser);
    loud = follow(loud, target, dt);

    const erase = 1 - Math.exp(-dt / TRAIL_TAU);
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = `rgba(0, 0, 0, ${erase})`;
    ctx.fillRect(0, 0, w, h);

    const pad = 3 * dpr;
    const x = travel(now, w, pad);
    const reach = (h * 0.5 - pad) * loud;
    const y = Math.min(h - pad, Math.max(pad, h * 0.5 - reach));
    const mirror = Math.min(h - pad, Math.max(pad, h * 0.5 + reach * 0.92));

    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (hasLast) {
      ctx.beginPath();
      ctx.strokeStyle = hexAlpha(PAPER, 0.4 * (0.35 + loud * 0.65));
      ctx.lineWidth = 1 * dpr;
      ctx.moveTo(lastX, lastMirror);
      ctx.lineTo(x, mirror);
      ctx.stroke();

      ctx.beginPath();
      ctx.strokeStyle = hexAlpha(GOLD, 0.22 + loud * 0.78);
      ctx.lineWidth = (2 + loud) * dpr;
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    if (high > 0.08) {
      const count = 1 + Math.round(high * 3);
      const spread = high * h * 0.16;
      for (let i = 0; i < count && sparks.length < MAX_SPARKS; i++) {
        sparks.push({
          x: Math.min(w - pad, Math.max(pad, x + (Math.random() - 0.5) * spread)),
          y: Math.min(h - pad, Math.max(pad, y + (Math.random() - 0.5) * spread)),
          born: now,
        });
      }
    }

    ctx.fillStyle = GOLD;
    sparks = sparks.filter((spark) => now - spark.born < 800);
    for (const spark of sparks) {
      const age = (now - spark.born) / 800;
      ctx.globalAlpha = (1 - age) * (0.35 + high * 0.65);
      ctx.fillRect(spark.x, spark.y, dpr, dpr);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    lastX = x;
    lastY = y;
    lastMirror = mirror;
    hasLast = true;
  }

  function paintBar(now, analyser) {
    const box = size();
    if (!box) return;
    const { ctx, dpr, w, h } = box;
    const dt = lastNow ? Math.min(0.05, (now - lastNow) / 1000) : 0.016;
    lastNow = now;
    const { loud: target } = read(analyser);
    loud = follow(loud, target, dt);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, w, h);
    const barW = Math.max(8 * dpr, w * 0.42);
    const barH = Math.max(3 * dpr, loud * (h - 16 * dpr));
    ctx.fillStyle = GOLD;
    ctx.globalAlpha = 0.4 + loud * 0.55;
    ctx.fillRect((w - barW) / 2, (h - barH) / 2, barW, barH);
    ctx.globalAlpha = 1;
  }

  function frame(now, analyser) {
    if (reduced()) paintBar(now, analyser);
    else paintTrace(now, analyser);
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
      loud = 0;
      lastNow = 0;
      hasLast = false;
      sparks = [];
      const box = size();
      if (box) box.ctx.clearRect(0, 0, box.w, box.h);
      loop(getAnalyser);
    },
    stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      sparks = [];
    },
  };
}

function hexAlpha(hex, alpha) {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}
