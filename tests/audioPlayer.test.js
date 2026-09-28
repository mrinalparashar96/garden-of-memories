import { describe, expect, it } from "vitest";
import { createAudioPlayer } from "../src/audioPlayer.js";

describe("audio player", () => {
  it("mounts custom controls for a data URL without native widgets", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const player = createAudioPlayer(host, {
      src: "data:audio/webm;base64,AAAA",
    });
    const audio = host.querySelector("audio");
    expect(audio).not.toBeNull();
    expect(audio.hasAttribute("controls")).toBe(false);
    expect(host.querySelector("[data-play]")).not.toBeNull();
    expect(host.querySelector("canvas")).not.toBeNull();
    expect(host.querySelector("[data-now]").textContent).toBe("0:00");
    player.destroy();
    expect(host.querySelector("audio")).toBeNull();
    host.remove();
  });
});