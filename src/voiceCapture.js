/**
 * Voice-first capture for leave-a-memory.
 * Audio is the memory; transcript is optional and unpolished.
 */

export const TRANSCRIPT_UNAVAILABLE =
  "Live transcript isn't available right now — your recording is still being saved";

const FATAL_SPEECH_ERRORS = new Set([
  "network",
  "not-allowed",
  "service-not-allowed",
]);
/** Chromium builds without a speech backend fail with "network" almost immediately. */
const QUICK_FAIL_MS = 2000;
const BACKEND_KEY = "still-here-speech-backend-dead";

function speechBackendDead() {
  try {
    return sessionStorage.getItem(BACKEND_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberSpeechBackendDead() {
  try {
    sessionStorage.setItem(BACKEND_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function createVoiceCapture({
  onTranscript,
  onTranscriptIssue,
  lang = "en-AU",
} = {}) {
  let mediaRecorder = null;
  let chunks = [];
  let stream = null;
  let recognition = null;
  let transcript = "";
  /** Final text from finished recognition sessions. A restart wipes event.results. */
  let committed = "";
  let sessionFinal = "";
  let interim = "";
  let listening = false;
  let fatalSpeech = false;
  let issueShown = false;
  let sessionOpenedAt = 0;
  let startedAt = 0;
  let audioCtx = null;
  let analyser = null;
  let sourceNode = null;

  const SpeechRecognition =
    typeof window !== "undefined"
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;

  async function start() {
    transcript = "";
    chunks = [];
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    attachAnalyser(stream);
    const mime = pickMimeType();
    mediaRecorder = mime
      ? new MediaRecorder(stream, { mimeType: mime })
      : new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (e) => {
      if (e.data?.size) chunks.push(e.data);
    };

    startedAt = performance.now();
    mediaRecorder.start(200);
    listening = true;
    fatalSpeech = false;
    issueShown = false;
    committed = "";
    sessionFinal = "";
    interim = "";
    // Recognition starts only once the mic stream exists, so it isn't
    // constructed against a contended or still-pending getUserMedia.
    startRecognition();
  }

  function devDebug(eventName, detail) {
    try {
      if (import.meta.env?.DEV) console.debug("[voice]", eventName, detail ?? "");
    } catch {
      /* ignore */
    }
  }

  function reportIssue() {
    if (!listening || !isRecording() || issueShown) return;
    issueShown = true;
    onTranscriptIssue?.(TRANSCRIPT_UNAVAILABLE);
  }

  function joinedFinal() {
    return [committed, sessionFinal].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }

  function emitTranscript() {
    const finalText = joinedFinal();
    transcript = [finalText, interim].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    onTranscript?.({
      text: transcript,
      finalText,
      interim,
    });
  }

  function commitSession() {
    committed = [committed, sessionFinal, interim]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    sessionFinal = "";
    interim = "";
  }

  function startRecognition() {
    if (!isRecording()) return;
    if (!SpeechRecognition || speechBackendDead()) {
      devDebug("speech recognition skipped", speechBackendDead() ? "remembered" : "missing");
      if (!SpeechRecognition) rememberSpeechBackendDead();
      reportIssue();
      return;
    }
    beginSession();
  }

  function beginSession() {
    if (!listening || fatalSpeech || !isRecording()) return;
    let current;
    try {
      current = new SpeechRecognition();
      recognition = current;
      sessionOpenedAt = performance.now();
      current.continuous = true;
      current.interimResults = true;
      current.lang = lang;
      current.onstart = () => devDebug("onstart");
      current.onaudiostart = () => devDebug("onaudiostart");
      current.onspeechstart = () => devDebug("onspeechstart");
      current.onresult = (event) => {
        let finals = "";
        let pending = "";
        for (let i = 0; i < event.results.length; i++) {
          const piece = event.results[i][0]?.transcript || "";
          if (event.results[i].isFinal) finals += piece;
          else pending += piece;
        }
        devDebug("onresult", { final: finals, interim: pending });
        sessionFinal = finals.replace(/\s+/g, " ").trim();
        interim = pending.replace(/\s+/g, " ").trim();
        emitTranscript();
      };
      current.onerror = (event) => {
        const code = event?.error || "unknown";
        devDebug("onerror", code);
        if (code === "no-speech" || code === "aborted") return;
        if (!FATAL_SPEECH_ERRORS.has(code)) return;
        fatalSpeech = true;
        const quick = performance.now() - sessionOpenedAt <= QUICK_FAIL_MS;
        if (code === "network" && quick) rememberSpeechBackendDead();
        reportIssue();
      };
      current.onend = () => {
        devDebug("onend");
        if (recognition === current) recognition = null;
        commitSession();
        emitTranscript();
        if (!listening || fatalSpeech || !isRecording()) return;
        beginSession();
      };
      current.start();
    } catch (err) {
      devDebug("onerror", err?.name || "start-failed");
      if (recognition === current) recognition = null;
      fatalSpeech = true;
      reportIssue();
    }
  }

  function stopRecognition() {
    listening = false;
    const current = recognition;
    recognition = null;
    if (!current) return;
    try {
      current.onstart = null;
      current.onaudiostart = null;
      current.onspeechstart = null;
      current.onresult = null;
      current.onerror = null;
      current.onend = () => devDebug("onend");
      current.stop();
    } catch {
      /* ignore */
    }
  }

  function stop() {
    return new Promise((resolve) => {
      stopRecognition();
      if (!mediaRecorder || mediaRecorder.state === "inactive") {
        cleanupStream();
        resolve({
          blob: null,
          dataUrl: null,
          transcript,
          durationMs: performance.now() - startedAt,
        });
        return;
      }
      mediaRecorder.onstop = async () => {
        const type = mediaRecorder.mimeType || "audio/webm";
        const blob = chunks.length ? new Blob(chunks, { type }) : null;
        cleanupStream();
        mediaRecorder = null;
        const dataUrl = blob ? await blobToDataUrl(blob) : null;
        resolve({
          blob,
          dataUrl,
          transcript,
          durationMs: performance.now() - startedAt,
        });
      };
      mediaRecorder.stop();
    });
  }

  function cancel() {
    stopRecognition();
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      try {
        mediaRecorder.onstop = null;
        mediaRecorder.stop();
      } catch {
        /* ignore */
      }
    }
    mediaRecorder = null;
    chunks = [];
    cleanupStream();
  }

  function attachAnalyser(mediaStream) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    try {
      audioCtx = new AudioCtx();
      sourceNode = audioCtx.createMediaStreamSource(mediaStream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      sourceNode.connect(analyser);
      if (audioCtx.state === "suspended") void audioCtx.resume();
    } catch {
      analyser = null;
      sourceNode = null;
    }
  }

  function releaseAnalyser() {
    try {
      sourceNode?.disconnect();
    } catch {
      /* ignore */
    }
    sourceNode = null;
    analyser = null;
    if (audioCtx) {
      const closing = audioCtx;
      audioCtx = null;
      void closing.close?.();
    }
  }

  function cleanupStream() {
    releaseAnalyser();
    stream?.getTracks?.().forEach((t) => t.stop());
    stream = null;
  }

  function getTranscript() {
    return transcript;
  }

  function getAnalyser() {
    return analyser;
  }

  function getStream() {
    return stream;
  }

  function isRecording() {
    return mediaRecorder?.state === "recording";
  }

  return {
    start,
    stop,
    cancel,
    getTranscript,
    getAnalyser,
    getStream,
    isRecording,
  };
}

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported?.(t)) || "";
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
