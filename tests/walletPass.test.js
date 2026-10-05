import { beforeEach, describe, expect, it } from "vitest";
import { toggleBookmark } from "../src/bookmarkStore.js";
import { addMemory } from "../src/memoryStore.js";
import {
  canAddToAppleWallet,
  mountWalletOffer,
  passFromWalletSearch,
  walletPageUrl,
  walletRequestBody,
} from "../src/walletPass.js";
import { buildWalletBody, validatePassBody } from "../api/passRequest.js";
import { formatIssuedDate } from "../src/pass/passArt.js";

const pass = {
  id: "SH-AB12-CD34",
  name: "ADA",
  art: "pass-02",
  issuedAt: Date.parse("2026-09-25T00:00:00Z"),
};

describe("Apple Wallet offer", () => {
  beforeEach(() => localStorage.clear());

  it("offers the badge on iPhone and Mac Safari, and a QR elsewhere", () => {
    expect(canAddToAppleWallet("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", 0)).toBe(true);
    expect(
      canAddToAppleWallet(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        0
      )
    ).toBe(true);
    expect(
      canAddToAppleWallet(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        0
      )
    ).toBe(false);

    const mount = document.createElement("div");
    mountWalletOffer(mount, pass);
    expect(mount.querySelector(".wallet-badge")).toBeNull();
    expect(mount.querySelector(".wallet-qr svg")).not.toBeNull();
    expect(mount.textContent).toMatch(/Scan on your iPhone/);
    expect(mount.querySelector("svg").getAttribute("aria-label")).toMatch(/Apple Wallet/);
  });

  it("builds a wallet link from the stored pass id", () => {
    const url = walletPageUrl(pass);
    expect(url.startsWith("/wallet?")).toBe(true);
    expect(url).toContain("pass=SH-AB12-CD34");
    expect(passFromWalletSearch(`?${url.split("?")[1]}`)).toMatchObject({
      id: pass.id,
      name: "ADA",
      art: "pass-02",
    });
    expect(passFromWalletSearch("?pass=nope")).toBeNull();
  });
});

describe("Wallet pass request", () => {
  it("rejects a pass that does not match the store rules", () => {
    expect(validatePassBody({ ...pass, art: "nope" })).toBeNull();
    expect(validatePassBody({ ...pass, id: "SH-zz" })).toBeNull();
    expect(validatePassBody(pass)?.name).toBe("ADA");
  });

  it("mirrors the in-app card fields", () => {
    const body = buildWalletBody(
      { ...pass, memoriesLeft: 2, memoriesKept: 1 },
      "https://garden.example"
    );
    expect(body.logoText).toBe("\u200b");
    expect(body.color).toBe("#000000");
    expect(body.barcodeValue).toBeUndefined();
    expect(body.barcodeFormat).toBeUndefined();
    expect(body.stripURL).toBe(
      "https://garden.example/api/pass-strip?id=SH-AB12-CD34&art=pass-02&name=ADA"
    );
    expect(body.headerFields[0].label).toBe("STILL HERE");
    expect(body.primaryFields).toBeUndefined();
    expect(body.auxiliaryFields).toBeUndefined();
    expect(body.secondaryFields.map((f) => f.label)).toEqual([
      "SYDNEY OPERA HOUSE",
      "PASS NO.",
      "ISSUED",
    ]);
    expect(body.secondaryFields[1].value).toBe("SH-AB12-CD34");
    expect(body.secondaryFields[2].value).toBe(formatIssuedDate(pass.issuedAt));
    expect(body.backFields[0].label).toBe("About this pass");
    expect(body.backFields[0].value).toMatch(/SH-AB12-CD34/);
    expect(body.backFields[0].value).toMatch(/https:\/\/garden\.example\//);
    expect(body.backFields.slice(1)).toEqual([
      { label: "MEMORIES LEFT", value: "2" },
      { label: "MEMORIES KEPT", value: "1" },
    ]);
  });

  it("sends the phone's memory and bookmark counts with the pass", () => {
    addMemory({
      id: "local-1",
      title: "First",
      body: "A visit",
      emotion: "wonder",
      relationship: "firstTime",
      region: "sails",
    });
    toggleBookmark({ id: "seed-1", title: "Kept", body: "A kept memory", emotion: "wonder" });
    expect(walletRequestBody(pass)).toMatchObject({
      id: pass.id,
      memoriesLeft: 1,
      memoriesKept: 1,
    });
    const body = buildWalletBody(
      { ...pass, memoriesLeft: 1, memoriesKept: 1 },
      "https://garden.example"
    );
    expect(body.backFields[1].value).toBe("1");
    expect(body.backFields[2].value).toBe("1");
  });
});
