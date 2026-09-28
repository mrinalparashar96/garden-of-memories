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

vi.mock("../src/voiceCapture.js", () => ({
  createVoiceCapture: ({ onTranscript } = {}) => {
    fakeVoice.onTranscript = onTranscript;
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

  beforeEach(() => {
    persisted.length = 0;
    fakeVoice.recording = false;
    window.MediaRecorder = function MediaRecorder() {};
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn() },
    });
    mount = document.createElement("div");
    document.body.appendChild(mount);
    composer = createAddMemory({ mount, garden: null });
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

    fakeVoice.onTranscript("the harbour at dusk");
    expect(q("[data-body]").value).toBe("the harbour at dusk");

    q("[data-record]").click();
    await flush();
    expect(q("[data-take]").hidden).toBe(false);
    expect(q("[data-record]").textContent).toBe("Record again");
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
  });

  it("hides voice input when recording isn't supported", () => {
    composer.destroy();
    delete window.MediaRecorder;
    composer = createAddMemory({ mount, garden: null });
    composer.open();
    expect(q("[data-record]")).toBeNull();
  });
});
