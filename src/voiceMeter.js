const GOLD = "#ffd89a";
const COUNT = 42;

/**
 * Horizontal band that rises with the microphone and idles as a faint shimmer.
 * prefers-reduced-motion draws a static level meter instead.
 * @param {HTMLCanvasElement} canvas
 */
export function createVoiceMeter(canvas) {
  let raf = 0;
  let running = false;
  /** @type {Uint8Array | null} */
  let bins = null;
  const particles = Array.from({ length: COUNT }, (_, i) => ({
    phase: (i / COUNT) * Math.PI * 2,
    level: 0,
  }));

  function reduced() {
    return (
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true
    );
  }

  function read(analyser) {
    if (!analyser?.getByteFrequencyData) return null;
    const n = analyser.frequencyBinCount || 0;
    if (!n) return null;
    if (!bins || bins.length !== n) bins = new Uint8Array(n);
    analyser.getByteFrequencyData(bins);
    return bins;
  }

  function loudness(data) {
    if (!data?.length) return 0;
    let sum = 0;
    const limit = Math.max(1, Math.floor(data.length * 0.55));
    for (let i = 0; i < limit; i++) sum += data[i];
    return sum / limit / 255;
  }

  function frame(now, analyser) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth || 280;
    const cssH = canvas.clientHeight || 72;
    const w = Math.max(1, Math.floor(cssW * dpr));
    const h = Math.max(1, Math.floor(cssH * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.clearRect(0, 0, w, h);
    const data = read(analyser);
    const avg = loudness(data);

    if (reduced()) {
      drawLevel(ctx, w, h, dpr, avg);
      return;
    }
    drawParticles(ctx, w, h, dpr, data, avg, now);
  }

  function drawLevel(ctx, w, h, dpr, avg) {
    const n = 28;
    const gap = 3 * dpr;
    const barW = Math.max(dpr, (w - gap * (n - 1)) / n);
    const hgt = Math.max(2 * dpr, avg * h * 0.82);
    ctx.fillStyle = GOLD;
    ctx.globalAlpha = 0.28 + avg * 0.62;
    for (let i = 0; i < n; i++) {
      const x = i * (barW + gap);
      ctx.fillRect(x, (h - hgt) / 2, barW, hgt);
    }
    ctx.globalAlpha = 1;
  }

  function drawParticles(ctx, w, h, dpr, data, avg, now) {
    const voiceBins = data ? Math.max(1, Math.floor(data.length * 0.55)) : 0;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      let target = avg;
      if (data && voiceBins) {
        const idx = Math.min(
          voiceBins - 1,
          Math.floor((i / particles.length) * voiceBins)
        );
        target = data[idx] / 255;
      }
      p.level += (target - p.level) * 0.28;
      const floor = 0.045 + Math.sin(now / 780 + p.phase) * 0.03;
      const amp = Math.max(floor, p.level);
      const x = ((i + 0.5) / particles.length) * w;
      const rise = amp * h * 0.38;
      const y = h * 0.62 - rise;
      const radius = (1.15 + amp * 2.4) * dpr;
      ctx.beginPath();
      ctx.fillStyle = GOLD;
      ctx.globalAlpha = 0.22 + amp * 0.78;
      ctx.shadowColor = "rgba(255, 216, 154, 0.85)";
      ctx.shadowBlur = (4 + amp * 10) * dpr;
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
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
      loop(getAnalyser);
    },
    stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}
