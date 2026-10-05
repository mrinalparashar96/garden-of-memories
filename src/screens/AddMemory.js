import gsap from "gsap";
import { EMOTIONS } from "../emotions.js";
import {
  autoTitleFromBody,
  LEAVE_PROMPT,
  MAX_BODY_CHARS,
  MIN_BODY_CHARS,
  REGION_LABELS,
  RELATIONSHIP_LABELS,
} from "../memories.js";
import { addMemory as persistMemory } from "../memoryStore.js";
import { getPass } from "../pass/passStore.js";
import { createAudioPlayer } from "../audioPlayer.js";
import { createLanguagePicker } from "../languagePicker.js";
import { createVoiceCapture } from "../voiceCapture.js";
import { createVoiceMeter } from "../voiceMeter.js";
import {
  getPreferredVoiceLanguage,
  setPreferredVoiceLanguage,
  VOICE_LANGUAGES,
} from "../voiceLanguages.js";

const HOLD_MS = 1200;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const REGION_IDS = Object.keys(REGION_LABELS);
const RELATIONSHIP_IDS = Object.keys(RELATIONSHIP_LABELS);
/** Keep recordings small enough for localStorage (~0.5 MB at 60s). */
const MAX_RECORD_MS = 60000;
const VOICE_FALLBACK_BODY = "A voice memory.";

function voiceSupported() {
  return (
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

function formatClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Four-step Add your memory composer + hold + arrival handoff.
 */
export function createAddMemory({
  mount,
  garden,
  onEnter,
  onExit,
  onCountChange,
  onComplete,
  onOpenPass,
  onArrivalNote,
  onRecordingStart,
  onRecordingEnd,
} = {}) {
  const root = document.createElement("div");
  root.id = "leave-mode";
  root.className = "leave-mode add-memory";
  root.hidden = true;
  mount.appendChild(root);

  let active = false;
  let casting = false;
  let holding = false;
  let holdRaf = 0;
  let holdStart = 0;
  /** @type {{ title: string, body: string, emotion: string, relationship: string, region: string, audioDataUrl: string }} */
  let draft = emptyDraft();
  /** @type {ReturnType<typeof createVoiceCapture> | null} */
  let voice = null;
  let recordTimer = 0;
  let recordStart = 0;
  let recordGen = 0;
  let duckedGen = 0;
  /** @type {ReturnType<typeof createVoiceMeter> | null} */
  let liveMeter = null;
  /** @type {ReturnType<typeof createAudioPlayer> | null} */
  let takePlayer = null;
  /** @type {ReturnType<typeof createAudioPlayer> | null} */
  let reviewPlayer = null;
  /** @type {ReturnType<typeof createLanguagePicker> | null} */
  let langPicker = null;

  function playbackHooks() {
    return {
      onPlay() {
        onRecordingStart?.();
      },
      onPause() {
        onRecordingEnd?.();
      },
    };
  }

  function disposeMedia() {
    liveMeter?.stop();
    liveMeter = null;
    takePlayer?.destroy();
    takePlayer = null;
    reviewPlayer?.destroy();
    reviewPlayer = null;
    langPicker?.destroy();
    langPicker = null;
  }

  function emptyDraft() {
    return {
      title: "",
      body: "",
      emotion: "",
      relationship: "",
      region: "",
      audioDataUrl: "",
      lang: "",
    };
  }

  function isRecording() {
    return Boolean(voice?.isRecording());
  }

  function hasText() {
    return draft.body.trim().length >= MIN_BODY_CHARS;
  }

  function hasAudio() {
    return Boolean(draft.audioDataUrl);
  }

  /** Stop and discard any in-progress recording (close / cancel). */
  function cancelRecording() {
    const shouldUnduck = duckedGen !== 0;
    recordGen += 1;
    duckedGen = 0;
    window.clearInterval(recordTimer);
    recordTimer = 0;
    liveMeter?.stop();
    voice?.cancel();
    voice = null;
    if (shouldUnduck) onRecordingEnd?.();
  }

  function open() {
    if (active || casting) return;
    active = true;
    casting = false;
    draft = emptyDraft();
    draft.region = garden?.suggestRegion?.() || "forecourt";
    draft.lang = getPreferredVoiceLanguage();
    root.hidden = false;
    requestAnimationFrame(() => root.classList.add("is-active"));
    onEnter?.();
    garden?.setComposeMode?.(true);
    showStep(1);
  }

  function showStep(n) {
    if (n === 1) renderWrite();
    else if (n === 2) renderFeel();
    else if (n === 3) renderWhere();
    else renderLeave();
  }

  function authorLine() {
    const pass = getPass();
    if (pass?.name) {
      return `<p class="add-memory-author">Leaving as <strong>${escapeHtml(
        pass.name
      )}</strong></p>`;
    }
    return `<p class="add-memory-author">Leaving as a visitor · <button type="button" class="add-memory-pass-link" data-pass>Make your pass</button></p>`;
  }

  function chrome(stepIndex) {
    return `
      <header class="add-memory-top">
        <p class="add-memory-step">${String(stepIndex).padStart(2, "0")} / 04</p>
        <button type="button" class="leave-top-close" data-close aria-label="Close">Close</button>
      </header>
      ${authorLine()}
    `;
  }

  function wireChrome() {
    root.querySelector("[data-close]")?.addEventListener("click", () =>
      close({ cancel: true })
    );
    root.querySelector("[data-pass]")?.addEventListener("click", () => {
      onOpenPass?.();
    });
  }

  function renderWrite() {
    disposeMedia();
    const canVoice = voiceSupported();
    root.innerHTML = `
      <section class="leave-screen leave-screen--compose add-memory-screen">
        ${chrome(1)}
        <div class="leave-screen-inner">
          <p class="leave-kicker">Add your memory</p>
          <h1 class="leave-hero">${escapeHtml(LEAVE_PROMPT)}</h1>
          <label class="add-memory-field">
            <span class="visually-hidden">Title (optional)</span>
            <input type="text" data-title maxlength="48" placeholder="Title (optional)"
              value="${escapeAttr(draft.title)}" />
          </label>
          <div class="leave-type-wrap">
            <div class="add-memory-body-shell" data-body-shell>
              <textarea data-body rows="5" maxlength="${MAX_BODY_CHARS}"
                placeholder="${
                  canVoice
                    ? "Write a few ordinary words, or speak them."
                    : "A few ordinary words are enough."
                }">${escapeHtml(draft.body)}</textarea>
              <div class="add-memory-body-mirror" data-body-mirror hidden></div>
            </div>
            <p class="leave-type-count" data-count>0/${MAX_BODY_CHARS}</p>
          </div>
          ${
            canVoice
              ? `<div class="add-memory-voice" data-voice>
              <p class="add-memory-lang-line" data-lang-line>
                <span class="add-memory-lang-lead" aria-hidden="true">I'll speak in</span>
                <span data-lang-picker></span>
              </p>
              <p class="add-memory-transcript-note" data-transcript-note hidden></p>
              <div class="add-memory-live" data-live hidden>
                <canvas class="add-memory-live-canvas" data-live-canvas aria-hidden="true"></canvas>
                <p class="add-memory-live-time" data-live-time>0:00 / ${formatClock(MAX_RECORD_MS)}</p>
              </div>
              <div class="add-memory-voice-row">
                <button type="button" class="pill pill--ghost" data-record aria-pressed="false">Speak it instead</button>
              </div>
              <div class="add-memory-voice-take" data-take hidden>
                <div class="add-memory-player" data-take-player></div>
                <button type="button" class="add-memory-voice-remove" data-take-remove>Remove recording</button>
              </div>
            </div>`
              : ""
          }
          <p class="leave-status" data-status aria-live="polite"></p>
          <button type="button" class="pill pill--primary" data-next disabled>Next</button>
        </div>
      </section>
    `;
    wireChrome();
    const body = root.querySelector("[data-body]");
    const title = root.querySelector("[data-title]");
    const count = root.querySelector("[data-count]");
    const next = root.querySelector("[data-next]");
    const status = root.querySelector("[data-status]");
    const recordBtn = root.querySelector("[data-record]");
    const voiceWrap = root.querySelector("[data-voice]");
    const live = root.querySelector("[data-live]");
    const liveTime = root.querySelector("[data-live-time]");
    const liveCanvas = root.querySelector("[data-live-canvas]");
    const take = root.querySelector("[data-take]");
    const takeHost = root.querySelector("[data-take-player]");
    const takeRemove = root.querySelector("[data-take-remove]");
    const langLine = root.querySelector("[data-lang-line]");
    const langSlot = root.querySelector("[data-lang-picker]");
    const mirror = root.querySelector("[data-body-mirror]");
    const shell = root.querySelector("[data-body-shell]");
    const transcriptNote = root.querySelector("[data-transcript-note]");
    liveMeter = liveCanvas ? createVoiceMeter(liveCanvas) : null;

    const paintMirror = (finalText, interimText) => {
      if (!mirror) return;
      const caret = `<span class="add-memory-caret" aria-hidden="true"></span>`;
      const interimHtml = interimText
        ? `<span class="add-memory-interim">${escapeHtml(interimText)}</span>`
        : "";
      mirror.innerHTML = `${escapeHtml(finalText)}${interimHtml}${caret}`;
    };

    const showTranscriptNote = (message) => {
      if (!transcriptNote) return;
      if (!message || !recordingUi) {
        if (!message) {
          pendingIssue = "";
          transcriptNote.hidden = true;
          transcriptNote.textContent = "";
        }
        return;
      }
      transcriptNote.hidden = false;
      transcriptNote.textContent = message;
    };

    let statusNote = "";
    let recordingUi = false;
    let pendingIssue = "";
    const setNote = (text) => {
      statusNote = text;
      sync();
    };

    const sync = () => {
      draft.body = (body?.value || "").slice(0, MAX_BODY_CHARS);
      draft.title = (title?.value || "").slice(0, 48);
      if (count) count.textContent = `${draft.body.length}/${MAX_BODY_CHARS}`;
      const len = draft.body.trim().length;
      const ok = !isRecording() && (hasText() || hasAudio());
      if (next) next.disabled = !ok;
      if (!status) return;
      if (isRecording()) return; // the meter owns the clock while recording
      if (statusNote) status.textContent = statusNote;
      else if (!hasAudio() && len > 0 && len < MIN_BODY_CHARS) {
        status.textContent = `${MIN_BODY_CHARS - len} more characters…`;
      } else status.textContent = "";
    };

    const showTake = () => {
      if (!take) return;
      if (hasAudio()) {
        if (takeHost) {
          if (!takePlayer) takePlayer = createAudioPlayer(takeHost, playbackHooks());
          takePlayer.setSource(draft.audioDataUrl);
        }
        take.hidden = false;
      } else {
        takePlayer?.stop();
        take.hidden = true;
      }
      if (recordBtn && !isRecording()) {
        recordBtn.textContent = hasAudio() ? "Record again" : "Speak it instead";
      }
    };

    const setRecordingUi = (on) => {
      recordingUi = on;
      voiceWrap?.classList.toggle("is-live", on);
      if (live) live.hidden = !on;
      if (recordBtn) {
        recordBtn.classList.toggle("is-recording", on);
        recordBtn.classList.toggle("add-memory-stop", on);
        recordBtn.classList.toggle("pill", !on);
        recordBtn.classList.toggle("pill--ghost", !on);
        recordBtn.setAttribute("aria-pressed", on ? "true" : "false");
        if (on) {
          recordBtn.innerHTML = `<span class="add-memory-stop-ring" aria-hidden="true"></span><span class="add-memory-stop-core" aria-hidden="true"></span><span class="visually-hidden">Stop</span>`;
          recordBtn.setAttribute("aria-label", "Stop");
        } else {
          recordBtn.removeAttribute("aria-label");
          recordBtn.textContent = hasAudio() ? "Record again" : "Speak it instead";
        }
      }
      if (body) body.readOnly = on;
      langLine?.classList.toggle("is-quiet", on);
      langPicker?.setDisabled(on);
      shell?.classList.toggle("is-listening", on);
      if (mirror) {
        mirror.hidden = !on;
        if (on) paintMirror(draft.body.trim(), "");
      }
      if (take && on) {
        takePlayer?.stop();
        take.hidden = true;
      }
      if (on) liveMeter?.start(() => voice?.getAnalyser?.() || null);
      else liveMeter?.stop();
    };

    const tickClock = () => {
      const elapsed = performance.now() - recordStart;
      if (liveTime) {
        liveTime.textContent = `${formatClock(elapsed)} / ${formatClock(MAX_RECORD_MS)}`;
      }
      if (elapsed >= MAX_RECORD_MS) void stopRecording();
    };

    const startRecording = async () => {
      const gen = ++recordGen;
      pendingIssue = "";
      showTranscriptNote("");
      // Text typed before speaking stays; the transcript is appended after it.
      const prefix = draft.body.trim();
      const capture = createVoiceCapture({
        lang: draft.lang,
        onTranscript(payload) {
          if (!body) return;
          const spoken =
            typeof payload === "string" ? payload : payload?.text || "";
          const interimText =
            typeof payload === "string" ? "" : payload?.interim || "";
          const finalSpoken =
            typeof payload === "string"
              ? spoken
              : payload?.finalText || "";
          const combined = (prefix ? `${prefix} ${spoken}` : spoken)
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, MAX_BODY_CHARS);
          body.value = combined;
          const shownFinal = (prefix ? `${prefix} ${finalSpoken}` : finalSpoken)
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, MAX_BODY_CHARS);
          paintMirror(shownFinal, interimText);
          sync();
        },
        onTranscriptIssue(message) {
          if (!recordingUi) {
            pendingIssue = message;
            return;
          }
          showTranscriptNote(message);
        },
      });
      voice = capture;
      try {
        await capture.start();
      } catch (err) {
        if (voice === capture) voice = null;
        if (gen !== recordGen) return;
        const denied =
          err?.name === "NotAllowedError" || err?.name === "SecurityError";
        setNote(
          denied
            ? "Microphone access was blocked. Allow it in your browser to record."
            : "Couldn't start the microphone on this device."
        );
        return;
      }
      if (gen !== recordGen) {
        capture.cancel();
        if (voice === capture) voice = null;
        return;
      }
      statusNote = "";
      if (status) status.textContent = "";
      recordStart = performance.now();
      setRecordingUi(true);
      if (pendingIssue) showTranscriptNote(pendingIssue);
      duckedGen = gen;
      onRecordingStart?.();
      tickClock();
      recordTimer = window.setInterval(tickClock, 250);
      sync();
    };

    const stopRecording = async () => {
      if (!voice) return;
      const stoppingGen = recordGen;
      recordGen += 1;
      window.clearInterval(recordTimer);
      recordTimer = 0;
      const current = voice;
      voice = null;
      setRecordingUi(false);
      let result = { dataUrl: null, durationMs: 0, transcript: "" };
      try {
        result = (await current.stop()) || result;
      } finally {
        if (duckedGen === stoppingGen) {
          duckedGen = 0;
          onRecordingEnd?.();
        }
      }
      if (!result.dataUrl || result.durationMs < 800) {
        setNote("That was too short to keep. Try again.");
        showTake();
        return;
      }
      draft.audioDataUrl = result.dataUrl;
      showTake();
      setNote(
        result.transcript
          ? "Recorded. Edit the words above if anything came out wrong."
          : "Recorded. Add a few words above if you like."
      );
    };

    recordBtn?.addEventListener("click", () => {
      if (isRecording()) void stopRecording();
      else void startRecording();
    });

    const applyLang = () => {
      if (body && draft.lang) body.setAttribute("lang", draft.lang);
      if (mirror && draft.lang) mirror.setAttribute("lang", draft.lang);
    };
    applyLang();
    if (langSlot) {
      langPicker = createLanguagePicker(langSlot, {
        languages: VOICE_LANGUAGES,
        value: draft.lang,
        onChange(code) {
          draft.lang = code;
          setPreferredVoiceLanguage(code);
          applyLang();
        },
      });
    }

    takeRemove?.addEventListener("click", () => {
      draft.audioDataUrl = "";
      showTake();
      setNote("");
    });

    body?.addEventListener("input", () => {
      statusNote = "";
      sync();
    });
    title?.addEventListener("input", sync);
    showTake();
    sync();
    requestAnimationFrame(() => body?.focus());
    next?.addEventListener("click", () => {
      if (next.disabled || isRecording()) return;
      showStep(2);
    });
  }

  function renderFeel() {
    disposeMedia();
    root.innerHTML = `
      <section class="leave-screen leave-screen--compose add-memory-screen">
        ${chrome(2)}
        <div class="leave-screen-inner">
          <p class="leave-kicker">How did it feel?</p>
          <h1 class="leave-hero">Pick a feeling and a relationship.</h1>
          <p class="add-memory-label">Feeling</p>
          <div class="add-memory-chips" data-emotions>
            ${EMOTIONS.map(
              (e) => `
              <button type="button" class="add-memory-chip${
                draft.emotion === e ? " is-selected" : ""
              }" data-emotion="${e}">${e}</button>`
            ).join("")}
          </div>
          <p class="add-memory-label">Relationship</p>
          <div class="add-memory-chips" data-rels>
            ${RELATIONSHIP_IDS.map(
              (id) => `
              <button type="button" class="add-memory-chip${
                draft.relationship === id ? " is-selected" : ""
              }" data-rel="${id}">${RELATIONSHIP_LABELS[id]}</button>`
            ).join("")}
          </div>
          <div class="add-memory-nav">
            <button type="button" class="pill pill--ghost" data-back>Back</button>
            <button type="button" class="pill pill--primary" data-next disabled>Next</button>
          </div>
        </div>
      </section>
    `;
    wireChrome();
    const next = root.querySelector("[data-next]");
    const sync = () => {
      if (next) next.disabled = !(draft.emotion && draft.relationship);
    };
    root.querySelectorAll("[data-emotion]").forEach((btn) => {
      btn.addEventListener("click", () => {
        draft.emotion = btn.getAttribute("data-emotion") || "";
        root.querySelectorAll("[data-emotion]").forEach((b) => {
          b.classList.toggle("is-selected", b === btn);
        });
        sync();
      });
    });
    root.querySelectorAll("[data-rel]").forEach((btn) => {
      btn.addEventListener("click", () => {
        draft.relationship = btn.getAttribute("data-rel") || "";
        root.querySelectorAll("[data-rel]").forEach((b) => {
          b.classList.toggle("is-selected", b === btn);
        });
        sync();
      });
    });
    sync();
    root.querySelector("[data-back]")?.addEventListener("click", () => showStep(1));
    next?.addEventListener("click", () => {
      if (next.disabled) return;
      showStep(3);
    });
  }

  function renderWhere() {
    disposeMedia();
    root.innerHTML = `
      <section class="leave-screen leave-screen--compose add-memory-screen">
        ${chrome(3)}
        <div class="leave-screen-inner">
          <p class="leave-kicker">Where does it live?</p>
          <h1 class="leave-hero">Choose a place on the Opera House.</h1>
          <div class="add-memory-chips" data-regions>
            ${REGION_IDS.map(
              (id) => `
              <button type="button" class="add-memory-chip${
                draft.region === id ? " is-selected" : ""
              }" data-region="${id}">${REGION_LABELS[id]}</button>`
            ).join("")}
          </div>
          <div class="add-memory-nav">
            <button type="button" class="pill pill--ghost" data-back>Back</button>
            <button type="button" class="pill pill--primary" data-next>Next</button>
          </div>
        </div>
      </section>
    `;
    wireChrome();
    garden?.highlightRegion?.(draft.region);
    root.querySelectorAll("[data-region]").forEach((btn) => {
      const id = btn.getAttribute("data-region");
      btn.addEventListener("pointerenter", () => garden?.highlightRegion?.(id));
      btn.addEventListener("pointerleave", () =>
        garden?.highlightRegion?.(draft.region)
      );
      btn.addEventListener("click", () => {
        draft.region = id || draft.region;
        garden?.highlightRegion?.(draft.region);
        root.querySelectorAll("[data-region]").forEach((b) => {
          b.classList.toggle("is-selected", b === btn);
        });
      });
    });
    root.querySelector("[data-back]")?.addEventListener("click", () => {
      garden?.highlightRegion?.(null);
      showStep(2);
    });
    root.querySelector("[data-next]")?.addEventListener("click", () => showStep(4));
  }

  function renderLeave() {
    disposeMedia();
    const text = draft.body.trim();
    const preview = text.length > 160 ? `${text.slice(0, 157)}…` : text;
    root.innerHTML = `
      <section class="leave-screen leave-screen--compose add-memory-screen add-memory-screen--leave">
        ${chrome(4)}
        <div class="leave-screen-inner">
          <p class="leave-kicker">Ready</p>
          <h1 class="leave-hero">Leave it here.</h1>
          ${
            preview
              ? `<blockquote class="add-memory-review">${escapeHtml(preview)}</blockquote>`
              : ""
          }
          ${
            hasAudio()
              ? `<div class="add-memory-review-audio" data-review-audio></div>`
              : ""
          }
          <p class="add-memory-review-meta">
            ${escapeHtml(draft.emotion)} · ${escapeHtml(
              RELATIONSHIP_LABELS[draft.relationship] || ""
            )} · ${escapeHtml(REGION_LABELS[draft.region] || "")}
          </p>
          <p class="leave-status" data-status></p>
          <button type="button" class="make-pass-hold add-memory-hold" data-hold aria-label="Hold to leave">
            <span class="make-pass-hold-ring" data-ring></span>
            <span class="make-pass-hold-label">Hold to leave it here</span>
          </button>
          <button type="button" class="pill pill--ghost" data-back>Back</button>
        </div>
      </section>
    `;
    wireChrome();
    const reviewHost = root.querySelector("[data-review-audio]");
    if (reviewHost && hasAudio()) {
      reviewPlayer = createAudioPlayer(reviewHost, {
        src: draft.audioDataUrl,
        ...playbackHooks(),
      });
    }
    garden?.highlightRegion?.(draft.region);
    root.querySelector("[data-back]")?.addEventListener("click", () => showStep(3));
    wireHold();
  }

  function wireHold() {
    const holdBtn = root.querySelector("[data-hold]");
    const ring = root.querySelector("[data-ring]");
    const status = root.querySelector("[data-status]");

    const setProgress = (p) => {
      if (ring) ring.style.setProperty("--hold", String(Math.max(0, Math.min(1, p))));
    };

    const stopHold = (complete) => {
      holding = false;
      window.cancelAnimationFrame(holdRaf);
      if (complete) {
        setProgress(1);
        void finishLeave(status, holdBtn);
        return;
      }
      gsap.to(
        { v: Number(ring?.style.getPropertyValue("--hold") || 0) },
        {
          v: 0,
          duration: 0.3,
          ease: EASE,
          onUpdate() {
            setProgress(this.targets()[0].v);
          },
        }
      );
    };

    const tick = (now) => {
      if (!holding) return;
      const p = (now - holdStart) / HOLD_MS;
      setProgress(p);
      if (p >= 1) {
        stopHold(true);
        return;
      }
      holdRaf = requestAnimationFrame(tick);
    };

    const startHold = (e) => {
      e.preventDefault();
      if (holding || casting) return;
      holding = true;
      holdStart = performance.now();
      holdRaf = requestAnimationFrame(tick);
    };

    holdBtn?.addEventListener("pointerdown", startHold);
    holdBtn?.addEventListener("pointerup", () => stopHold(false));
    holdBtn?.addEventListener("pointerleave", () => {
      if (holding) stopHold(false);
    });
    holdBtn?.addEventListener("pointercancel", () => stopHold(false));
  }

  async function finishLeave(status, holdBtn) {
    if (casting) return;
    casting = true;
    if (holdBtn) holdBtn.disabled = true;
    if (status) status.textContent = "Leaving…";

    const typed = draft.body.trim().slice(0, MAX_BODY_CHARS);
    const body = typed || VOICE_FALLBACK_BODY;
    const title = (draft.title.trim() || autoTitleFromBody(body)).slice(0, 48);
    const pass = getPass();
    const landing = garden?.resolveLandingPosition?.(draft.region) || null;
    const id = `u${Date.now().toString(36)}`;
    const memory = {
      id,
      title,
      body,
      relationship: draft.relationship,
      region: draft.region,
      place: "Opera House",
      emotion: draft.emotion,
      local: true,
      createdAt: Date.now(),
      author: pass?.name || "",
      authorName: pass?.name || "",
      landingPulseMs: 10000,
    };
    if (landing) memory.position = landing;
    if (hasAudio()) memory.audioDataUrl = draft.audioDataUrl;
    if (draft.lang) memory.lang = draft.lang;

    const { ok, audioDropped, memory: saved } = persistMemory(memory);
    if (audioDropped) {
      console.warn(
        "Storage is full: the memory was saved without its recording."
      );
    }
    if (!ok) {
      casting = false;
      if (holdBtn) holdBtn.disabled = false;
      if (status) {
        status.textContent =
          "Couldn't save on this device — try again.";
      }
      return;
    }

    garden?.highlightRegion?.(null);
    root.classList.remove("is-active");
    root.hidden = true;
    root.innerHTML = "";
    active = false;
    onExit?.();

    const targetPosition = landing || [0, 2, 0];
    try {
      await garden?.runArrival?.({
        text: body,
        emotion: draft.emotion,
        targetPosition,
        onLand: () => {
          try {
            garden?.addMemory?.({
              ...saved,
              position: targetPosition,
              landingPulseMs: 10000,
            });
          } catch (err) {
            console.error(err);
          }
          onCountChange?.();
        },
      });
    } catch (err) {
      console.error(err);
      try {
        garden?.addMemory?.(saved);
      } catch (e) {
        console.error(e);
      }
      onCountChange?.();
    }

    garden?.setComposeMode?.(false);
    casting = false;
    onComplete?.(id);
    onArrivalNote?.(id);
  }

  function close({ cancel = true, castId = null } = {}) {
    if (!active && !casting) return;
    cancelRecording();
    disposeMedia();
    window.cancelAnimationFrame(holdRaf);
    holding = false;
    active = false;
    casting = false;
    garden?.highlightRegion?.(null);
    garden?.setComposeMode?.(false);
    root.classList.remove("is-active");
    root.hidden = true;
    root.innerHTML = "";
    onExit?.();
    if (!cancel && castId) onComplete?.(castId);
  }

  return {
    open,
    close: () => close({ cancel: true }),
    isActive: () => active,
    destroy() {
      close({ cancel: true });
      root.remove();
    },
  };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
