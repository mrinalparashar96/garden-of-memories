/**
 * Languages offered for spoken memories.
 * Codes are BCP-47 tags the Web Speech API understands. Labels are written
 * in the language itself so a speaker can find their own without reading English.
 * Ordered by how commonly each is spoken at home in Sydney, English first.
 */
import { readJson, writeJson } from "./core/storage.js";

const STORAGE_KEY = "stillhere.voice.lang";

export const VOICE_LANGUAGES = [
  { code: "en-AU", label: "English" },
  { code: "zh-CN", label: "中文（普通话）" },
  { code: "ar-SA", label: "العربية" },
  { code: "zh-HK", label: "中文（廣東話）" },
  { code: "vi-VN", label: "Tiếng Việt" },
  { code: "el-GR", label: "Ελληνικά" },
  { code: "hi-IN", label: "हिन्दी" },
  { code: "it-IT", label: "Italiano" },
  { code: "ne-NP", label: "नेपाली" },
  { code: "ko-KR", label: "한국어" },
  { code: "es-ES", label: "Español" },
  { code: "pa-IN", label: "ਪੰਜਾਬੀ" },
  { code: "id-ID", label: "Bahasa Indonesia" },
  { code: "fil-PH", label: "Filipino" },
  { code: "ja-JP", label: "日本語" },
  { code: "fr-FR", label: "Français" },
  { code: "de-DE", label: "Deutsch" },
  { code: "pt-BR", label: "Português" },
  { code: "th-TH", label: "ไทย" },
  { code: "tr-TR", label: "Türkçe" },
];

const CODES = new Set(VOICE_LANGUAGES.map((l) => l.code));

export function isVoiceLanguage(code) {
  return typeof code === "string" && CODES.has(code);
}

export function voiceLanguageLabel(code) {
  return VOICE_LANGUAGES.find((l) => l.code === code)?.label || "";
}

/**
 * Best match for a browser language tag, e.g. "zh" → zh-CN, "en-GB" → en-AU.
 * @param {string} tag
 * @returns {string} a code from VOICE_LANGUAGES
 */
export function matchVoiceLanguage(tag) {
  if (typeof tag !== "string" || !tag) return "en-AU";
  const lower = tag.toLowerCase();
  const exact = VOICE_LANGUAGES.find((l) => l.code.toLowerCase() === lower);
  if (exact) return exact.code;
  const primary = lower.split("-")[0];
  if (primary === "zh") {
    // Traditional-script regions speak Cantonese more often than Mandarin.
    return /-(hk|mo|tw|hant)/.test(lower) ? "zh-HK" : "zh-CN";
  }
  const byPrimary = VOICE_LANGUAGES.find(
    (l) => l.code.toLowerCase().split("-")[0] === primary
  );
  return byPrimary?.code || "en-AU";
}

/** Remembered choice, else the browser's language. */
export function getPreferredVoiceLanguage() {
  const saved = readJson(STORAGE_KEY, null);
  if (isVoiceLanguage(saved)) return saved;
  const nav =
    typeof navigator !== "undefined"
      ? navigator.languages?.[0] || navigator.language
      : "";
  return matchVoiceLanguage(nav);
}

export function setPreferredVoiceLanguage(code) {
  if (!isVoiceLanguage(code)) return false;
  return writeJson(STORAGE_KEY, code).ok;
}
