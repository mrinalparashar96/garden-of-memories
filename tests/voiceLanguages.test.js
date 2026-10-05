import { beforeEach, describe, expect, it } from "vitest";
import {
  getPreferredVoiceLanguage,
  isVoiceLanguage,
  matchVoiceLanguage,
  setPreferredVoiceLanguage,
  VOICE_LANGUAGES,
} from "../src/voiceLanguages.js";

describe("voice languages", () => {
  beforeEach(() => localStorage.clear());

  it("has unique valid BCP-47 codes", () => {
    const codes = VOICE_LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of codes) expect(c).toMatch(/^[a-z]{2,3}-[A-Z]{2}$/);
  });

  it("matches browser tags to an offered language", () => {
    expect(matchVoiceLanguage("en-GB")).toBe("en-AU");
    expect(matchVoiceLanguage("zh")).toBe("zh-CN");
    expect(matchVoiceLanguage("zh-Hant-TW")).toBe("zh-HK");
    expect(matchVoiceLanguage("vi")).toBe("vi-VN");
    expect(matchVoiceLanguage("xx-YY")).toBe("en-AU");
    expect(matchVoiceLanguage("")).toBe("en-AU");
  });

  it("remembers a valid choice and ignores an invalid one", () => {
    expect(setPreferredVoiceLanguage("el-GR")).toBe(true);
    expect(getPreferredVoiceLanguage()).toBe("el-GR");
    expect(setPreferredVoiceLanguage("klingon")).toBe(false);
    expect(getPreferredVoiceLanguage()).toBe("el-GR");
    expect(isVoiceLanguage("ar-SA")).toBe(true);
    expect(isVoiceLanguage("ar")).toBe(false);
  });
});
