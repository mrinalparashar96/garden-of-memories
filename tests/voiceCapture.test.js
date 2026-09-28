import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TRANSCRIPT_UNAVAILABLE,
  createVoiceCapture,
} from "../src/voiceCapture.js";

describe("voice capture transcription", () => {
  /** @type {object[]} */
  let sessions;

  afterEach(() => {
    delete window.webkitSpeechRecognition;
    delete window.SpeechRecognition;
    delete window.MediaRecorder;
    vi.restoreAllMocks();
  });

  function install({ failStart = false } = {}) {
    sessions = [];
    window.webkitSpeechRecognition = class FakeRecognition {
      constructor() {
        sessions.push(this);
      }
      start() {
        this.starts = (this.starts || 0) + 1;
        if (failStart) throw new Error("nope");
      }
      stop() {
        this.stopped = true;
      }
    };
    window.MediaRecorder = class FakeRecorder {
      constructor() {
        this.state = "inactive";
        this.mimeType = "audio/webm";
      }
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        this.onstop?.();
      }
    };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [{ stop() {} }],
        })),
      },
    });
  }

  it("keeps earlier speech when recognition restarts after a pause", async () => {
    install();
    const seen = [];
    const capture = createVoiceCapture({
      lang: "en-AU",
      onTranscript: (payload) => seen.push(payload),
    });
    await capture.start();
    expect(sessions).toHaveLength(1);

    sessions[0].onresult({
      results: [
        { isFinal: true, 0: { transcript: "hello " } },
        { isFinal: false, 0: { transcript: "there" } },
      ],
    });
    expect(seen.at(-1)).toMatchObject({
      finalText: "hello",
      interim: "there",
      text: "hello there",
    });

    sessions[0].onend();
    expect(sessions).toHaveLength(2);
    expect(seen.at(-1).finalText).toBe("hello there");
    expect(seen.at(-1).interim).toBe("");

    sessions[1].onresult({
      results: [{ isFinal: true, 0: { transcript: "again" } }],
    });
    expect(seen.at(-1).text).toBe("hello there again");
    await capture.stop();
  });

  it("surfaces network errors and does not restart", async () => {
    install();
    const issues = [];
    const capture = createVoiceCapture({
      onTranscript: () => {},
      onTranscriptIssue: (message) => issues.push(message),
    });
    await capture.start();
    sessions[0].onerror({ error: "network" });
    sessions[0].onend();
    expect(issues).toEqual([TRANSCRIPT_UNAVAILABLE]);
    expect(sessions).toHaveLength(1);
    await capture.stop();
  });

  it("explains when the browser has no speech recognition", async () => {
    install();
    delete window.webkitSpeechRecognition;
    delete window.SpeechRecognition;
    const issues = [];
    const capture = createVoiceCapture({
      onTranscriptIssue: (message) => issues.push(message),
    });
    await capture.start();
    expect(issues).toEqual([TRANSCRIPT_UNAVAILABLE]);
    expect(capture.isRecording()).toBe(true);
    await capture.stop();
  });
});
