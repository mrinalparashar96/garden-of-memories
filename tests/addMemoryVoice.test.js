import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fakeVoice = {
  recording: false,
  onTranscript: null,
  start: vi.fn(async () => {
    fakeVoice.recording = true;
  }),
  stop: vi.fn(async () => {
    fakeVoice.recording = false;
    return {
      blob: {},
      dataUrl: "data:audio/webm;base64,AAAA",
      transcript: "the harbour at dusk",
      durationMs: 4000,
    };
  }),
  cancel: vi.fn(() => {
    fakeVoice.recording = false;
  }),
  isRecording: () => fakeVoice.recording,
};

let lastLang = "";
vi.mock("../src/voiceCapture.js", () => ({
  createVoiceCapture: ({ onTranscript, onTranscriptIssue, lang } = {}) => {
    fakeVoice.onTranscript = onTranscript;
    fakeVoice.onIssue = onTranscriptIssue;
    lastLang = lang;
    return fakeVoice;
  },
}));

const persisted = [];
vi.mock("../src/memoryStore.js", () => ({
  addMemory: (m) => {
    persisted.push(m);
    return { ok: true, audioDropped: false, memory: m, memories: persisted };
  },
}));

const { createAddMemory } = await import("../src/screens/AddMemory.js");

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("Add memory voice input", () => {
  let mount;
  let composer;
  let onRecordingStart;
  let onRecordingEnd;

  beforeEach(() => {
    localStorage.clear();
    persisted.length = 0;
    fakeVoice.recording = false;
    fakeVoice.cancel.mockClear();
    onRecordingStart = vi.fn();
    onRecordingEnd = vi.fn();
    window.MediaRecorder = function MediaRecorder() {};
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn() },
    });
    mount = document.createElement("div");
    document.body.appendChild(mount);
    composer = createAddMemory({
      mount,
      garden: null,
      onRecordingStart,
      onRecordingEnd,
    });
    composer.open();
  });

  afterEach(() => {
    composer.destroy();
    mount.remove();
    delete window.MediaRecorder;
  });

  const q = (sel) => mount.querySelector(sel);

  it("shows a record button when the browser supports recording", () => {
    expect(q("[data-record]")).not.toBeNull();
    expect(q("[data-next]").disabled).toBe(true);
  });

  it("fills the text box with the live transcript and keeps the recording", async () => {
    q("[data-record]").click();
    await flush();
    expect(q("[data-record]").classList.contains("is-recording")).toBe(true);
    expect(q("[data-next]").disabled).toBe(true);
    expect(q("[data-live]").hidden).toBe(false);
    expect(q("[data-live-canvas]")).not.toBeNull();
    expect(q("[data-live-time]").textContent).toMatch(/\/\s*1:00/);
    expect(q("[data-status]").textContent).not.toMatch(/Listening/);
    expect(q("[data-record]").classList.contains("add-memory-stop")).toBe(true);
    expect(onRecordingStart).toHaveBeenCalledTimes(1);

    fakeVoice.onTranscript("the harbour at dusk");
    expect(q("[data-body]").value).toBe("the harbour at dusk");
    expect(q("[data-body-mirror]").hidden).toBe(false);
    expect(q("[data-body-mirror]").textContent).toContain("the harbour at dusk");

    fakeVoice.onTranscript({
      text: "the harbour at dusk tonight",
      finalText: "the harbour at dusk",
      interim: "tonight",
    });
    expect(q("[data-body]").value).toBe("the harbour at dusk tonight");
    expect(q(".add-memory-interim").textContent).toBe("tonight");
    expect(q(".add-memory-caret")).not.toBeNull();

    q("[data-record]").click();
    await flush();
    expect(q("[data-live]").hidden).toBe(true);
    expect(q("[data-take]").hidden).toBe(false);
    expect(q("[data-take] audio[controls]")).toBeNull();
    expect(q("[data-take] [data-play]")).not.toBeNull();
    expect(q("[data-take] canvas")).not.toBeNull();
    expect(q("[data-record]").textContent).toBe("Record again");
    expect(onRecordingEnd).toHaveBeenCalledTimes(1);
    // Audio alone is enough, even under the text minimum
    expect(q("[data-next]").disabled).toBe(false);
  });

  it("removing the recording re-applies the text minimum", async () => {
    q("[data-record]").click();
    await flush();
    q("[data-record]").click();
    await flush();
    q("[data-body]").value = "";
    q("[data-body]").dispatchEvent(new Event("input"));
    expect(q("[data-next]").disabled).toBe(false);
    q("[data-take-remove]").click();
    expect(q("[data-take]").hidden).toBe(true);
    expect(q("[data-next]").disabled).toBe(true);
  });

  it("closing mid-recording cancels the microphone", async () => {
    q("[data-record]").click();
    await flush();
    composer.close();
    expect(fakeVoice.cancel).toHaveBeenCalled();
    expect(onRecordingEnd).toHaveBeenCalledTimes(1);
  });

  it("shows a note when live transcript is unavailable", async () => {
    q("[data-record]").click();
    await flush();
    fakeVoice.onIssue(
      "Live transcript isn't available right now — your recording is still being saved"
    );
    const note = q("[data-transcript-note]");
    expect(note.hidden).toBe(false);
    expect(note.textContent).toMatch(/Live transcript isn't available/);
    expect(q("[data-live]").hidden).toBe(false);
  });

  it("records in the chosen language and remembers it", async () => {
    const trigger = q("[data-lang]");
    expect(trigger).not.toBeNull();
    expect(q(".add-memory-lang-lead").textContent).toBe("I'll speak in");
    expect(trigger.dataset.value).toBe("en-AU");
    expect(trigger.compareDocumentPosition(q("[data-record]")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    trigger.click();
    const option = document.querySelector('[role="option"][data-code="vi-VN"]');
    expect(option).not.toBeNull();
    expect(option.getAttribute("lang")).toBe("vi-VN");
    expect(option.getAttribute("aria-selected")).toBe("false");
    option.click();
    expect(q("[data-body]").getAttribute("lang")).toBe("vi-VN");
    expect(q("[data-lang]").dataset.value).toBe("vi-VN");
    expect(document.querySelector('[role="listbox"]').hidden).toBe(true);

    q("[data-record]").click();
    await flush();
    expect(lastLang).toBe("vi-VN");
    expect(q("[data-lang-line]").classList.contains("is-quiet")).toBe(true);
    expect(q("[data-lang]").disabled).toBe(true);
    q("[data-record]").click();
    await flush();
    expect(q("[data-lang]").disabled).toBe(false);
    expect(q("[data-lang-line]").classList.contains("is-quiet")).toBe(false);

    composer.destroy();
    composer = createAddMemory({ mount, garden: null });
    composer.open();
    expect(q("[data-lang]").dataset.value).toBe("vi-VN");
  });

  it("hides voice input when recording isn't supported", () => {
    composer.destroy();
    delete window.MediaRecorder;
    composer = createAddMemory({ mount, garden: null });
    composer.open();
    expect(q("[data-record]")).toBeNull();
  });
});
