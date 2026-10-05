import { clearBookmarks } from "./bookmarkStore.js";
import { clearKeysWithPrefix, remove } from "./core/storage.js";
import { clearPass } from "./pass/passStore.js";

/** Older memory saves that would be copied back if only `stillhere.*` were removed. */
const LEGACY_MEMORIES_KEY = "still-here-user-memories-v1";

/**
 * Wipe the pass, visitor memories, bookmarks, voice language, and every other
 * `stillhere.*` key. Walkthrough and ambience settings stay.
 */
export function resetDevice() {
  clearKeysWithPrefix("stillhere.");
  remove(LEGACY_MEMORIES_KEY);
  clearBookmarks();
  clearPass();
}

/**
 * If `search` includes reset=1, clear device data and return the query without it.
 * Returns null when the page should load unchanged.
 * @param {string} search
 * @returns {string | null}
 */
export function consumeFreshStart(search) {
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  if (params.get("reset") !== "1") return null;
  resetDevice();
  params.delete("reset");
  return params.toString();
}

/** @param {ParentNode} [parent] */
export function showFreshStart(parent = document.body) {
  const note = document.createElement("p");
  note.className = "wallet-route-note";
  note.textContent = "Starting fresh";
  parent?.appendChild(note);
  return note;
}
