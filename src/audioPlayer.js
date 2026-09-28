const GOLD = "#ffd89a";
const FAINT = "rgba(196, 168, 130, 0.32)";
const BARS = 72;

const PLAY_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.1 3.8v8.4L12.6 8 6.1 3.8z" fill="currentColor"/></svg>`;
const PAUSE_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.8h2.1v8.4H5zm3.9 0H11v8.4H8.9z" fill="currentColor"/></svg>`;

/**
 * Custom waveform player. Native controls stay hidden.
 * Works with a data: URL or any fetchable src.
 * @param {HTMLElement} host
 * @param {{ src?: string }} [opts]
 */
export function createAudioPlayer(host, { src = "" } = {}) {
  host.classList.add("voice-player");
  host.innerHTML = `
    <button type="button" class="voice-player-btn" data-play aria-label="Play">${PLAY_ICON}</button>
    <div class="voice-player-main">
      <canvas class="voice-player-canvas" data-wave tabindex="0" role="slider"
        aria-label="Playback position" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0"></canvas>
      <div class="voice-player-times">
        <span data-now>0:00</span>
        <span data-dur>0:00</span>
      </div>
    </div>
  `;

  const playBtn = host.querySelector("[data-play]");
  const canvas = host.querySelector("[data-wave]");
  const nowEl = host.querySelector("[data-now]");
  const durEl = host.querySelector("[data-dur]");
  const audio = document.createElement("audio");
  audio.preload = "auto";
  audio.setAttribute("aria-hidden", "true");
  host.appendChild(audio);

  /** @type {number[] | null} */
  let peaks = null;
  let decodedDuration = 0;
  let decodeGen = 0;
  let raf = 0;
  let scrubbing = false;

  function duration() {
    const d = audio.duration;
    if (Number.isFinite(d) && d > 0 && d !== Infinity) return d;
    return decodedDuration || 0;
  }

  function current() {
    const t = audio.currentTime;
    return Number.isFinite(t) ? t : 0;
  }

  function formatTime(sec) {
    const total = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  }

  function setPlaying(on) {
    if (!playBtn) return;
    playBtn.innerHTML = on ? PAUSE_ICON : PLAY_ICON;
    playBtn.setAttribute("aria-label", on ? "Pause" : "Play");
  }

  function paint() {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth || 220;
    const cssH = canvas.clientHeight || 42;
    const w = Math.max(1, Math.floor(cssW * dpr));
    const h = Math.max(1, Math.floor(cssH * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.clearRect(0, 0, w, h);
    const series = peaks && peaks.length ? peaks : emptyPeaks();
    const n = series.length;
    const gap = Math.max(1, 1.5 * dpr);
    const barW = Math.max(dpr, (w - gap * (n - 1)) / n);
    const dur = duration();
    const progress = dur > 0 ? Math.min(1, current() / dur) : 0;
    for (let i = 0; i < n; i++) {
      const amp = Math.max(0.06, series[i] || 0);
      const barH = Math.max(dpr * 2, amp * h * 0.92);
      const x = i * (barW + gap);
      const played = (i + 0.5) / n <= progress;
      ctx.fillStyle = played ? GOLD : FAINT;
      ctx.shadowColor = played ? "rgba(255, 216, 154, 0.45)" : "transparent";
      ctx.shadowBlur = played ? 6 * dpr : 0;
      ctx.fillRect(x, (h - barH) / 2, Math.max(dpr, barW * 0.72), barH);
    }
    ctx.shadowBlur = 0;
    const max = Math.round(dur);
    const now = Math.round(current());
    canvas.setAttribute("aria-valuemax", String(max));
    canvas.setAttribute("aria-valuenow", String(now));
  }

  function emptyPeaks() {
    return Array.from({ length: 48 }, () => 0.16);
  }

  function updateTimes() {
    if (nowEl) nowEl.textContent = formatTime(current());
    if (durEl) durEl.textContent = formatTime(duration());
    paint();
  }

  function tick() {
    updateTimes();
    if (!audio.paused && !audio.ended && !scrubbing) {
      raf = requestAnimationFrame(tick);
    }
  }

  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  async function decode(url, gen) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx || !url) return;
    let ctx = null;
    try {
      const res = await fetch(url);
      const raw = await res.arrayBuffer();
      ctx = new AudioCtx();
      const buffer = await ctx.decodeAudioData(raw.slice(0));
      if (gen !== decodeGen) return;
      peaks = peaksFromBuffer(buffer, BARS);
      decodedDuration = buffer.duration || 0;
      updateTimes();
    } catch {
      if (gen === decodeGen) peaks = null;
    } finally {
      void ctx?.close?.();
    }
  }

  function seekRatio(clientX) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = rect.width
      ? Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      : 0;
    const dur = duration();
    if (dur > 0) {
      try {
        audio.currentTime = ratio * dur;
      } catch {
        /* ignore */
      }
    }
    updateTimes();
  }

  function toggle() {
    if (!audio.src) return;
    if (audio.paused || audio.ended) {
      const pending = audio.play?.();
      pending?.catch?.(() => {});
    } else {
      audio.pause?.();
    }
  }

  playBtn?.addEventListener("click", toggle);

  canvas?.addEventListener("pointerdown", (e) => {
    scrubbing = true;
    canvas.setPointerCapture?.(e.pointerId);
    seekRatio(e.clientX);
  });
  canvas?.addEventListener("pointermove", (e) => {
    if (!scrubbing) return;
    seekRatio(e.clientX);
  });
  const endScrub = () => {
    if (!scrubbing) return;
    scrubbing = false;
    if (!audio.paused && !audio.ended) tick();
  };
  canvas?.addEventListener("pointerup", endScrub);
  canvas?.addEventListener("pointercancel", endScrub);

  canvas?.addEventListener("keydown", (e) => {
    const dur = duration();
    if (!dur) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const step = e.shiftKey ? 5 : 2;
    const dir = e.key === "ArrowRight" ? 1 : -1;
    try {
      audio.currentTime = Math.min(dur, Math.max(0, current() + dir * step));
    } catch {
      /* ignore */
    }
    updateTimes();
  });

  audio.addEventListener("play", () => {
    setPlaying(true);
    stopLoop();
    tick();
  });
  audio.addEventListener("pause", () => {
    setPlaying(false);
    stopLoop();
    updateTimes();
  });
  audio.addEventListener("ended", () => {
    setPlaying(false);
    stopLoop();
    updateTimes();
  });
  audio.addEventListener("loadedmetadata", updateTimes);
  audio.addEventListener("timeupdate", () => {
    if (!raf) updateTimes();
  });

  function setSource(next) {
    stop();
    const url = next || "";
    peaks = null;
    decodedDuration = 0;
    const gen = ++decodeGen;
    try {
      audio.src = url;
    } catch {
      /* ignore */
    }
    updateTimes();
    void decode(url, gen);
  }

  function stop() {
    stopLoop();
    try {
      audio.pause?.();
      audio.currentTime = 0;
    } catch {
      /* ignore */
    }
    setPlaying(false);
    updateTimes();
  }

  function destroy() {
    stop();
    decodeGen += 1;
    try {
      audio.removeAttribute("src");
      audio.load?.();
    } catch {
      /* ignore */
    }
    host.replaceChildren();
    host.classList.remove("voice-player");
  }

  if (src) setSource(src);
  else updateTimes();

  return { setSource, stop, destroy };
}

function peaksFromBuffer(buffer, bars) {
  const raw = buffer.getChannelData(0);
  if (!raw?.length) return [];
  const size = Math.max(1, Math.floor(raw.length / bars));
  const peaks = new Array(bars);
  let max = 0.0001;
  for (let i = 0; i < bars; i++) {
    const start = i * size;
    const end = i === bars - 1 ? raw.length : start + size;
    let peak = 0;
    const stride = Math.max(1, Math.floor((end - start) / 48));
    for (let j = start; j < end; j += stride) {
      const v = Math.abs(raw[j]);
      if (v > peak) peak = v;
    }
    peaks[i] = peak;
    if (peak > max) max = peak;
  }
  return peaks.map((p) => p / max);
}
