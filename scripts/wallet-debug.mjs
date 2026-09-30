/**
 * POST the same WalletWallet body api/wallet-pass.js builds, and print the raw reply.
 * Reads WALLETWALLET_API_KEY from the environment, then from .env.
 */
import { readFileSync } from "node:fs";
import { buildWalletBody, validatePassBody } from "../api/passRequest.js";

loadDotEnv(".env");

const key = process.env.WALLETWALLET_API_KEY || "";
if (!key || key === "[SENSITIVE]") {
  console.error("WALLETWALLET_API_KEY is missing from .env");
  process.exit(1);
}

const pass = validatePassBody({
  id: "SH-AB12-CD34",
  name: "Test",
  art: "pass-01",
  issuedAt: 1759219200000,
});
if (!pass) {
  console.error("Sample pass failed validation");
  process.exit(1);
}

const fields = buildWalletBody(pass, "https://garden-of-memories-indol.vercel.app");
const res = await fetch("https://api.walletwallet.dev/api/passes?format=binary", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.apple.pkpass, application/json",
  },
  body: JSON.stringify(fields),
});

const body = Buffer.from(await res.arrayBuffer());
console.log(String(res.status));
process.stdout.write(body);
if (body.length && body[body.length - 1] !== 0x0a) process.stdout.write("\n");

function loadDotEnv(file) {
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const name = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[name]) process.env[name] = value;
  }
}
