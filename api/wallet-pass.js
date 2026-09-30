import { buildWalletBody, requestOrigin, validatePassBody } from "./passRequest.js";

const WALLET_API = "https://api.walletwallet.dev";
const QUIET = "Couldn't reach Wallet right now";

/**
 * @param {import("http").IncomingMessage & { method?: string, body?: unknown, query?: Record<string, string> }} req
 * @param {import("http").ServerResponse & { status: (n: number) => typeof res, json?: Function, send?: Function }} res
 */
export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    return sendJson(res, 405, { error: QUIET });
  }

  const raw = req.method === "GET" ? req.query || {} : await readJson(req);
  const pass = validatePassBody(raw);
  if (!pass) return sendJson(res, 400, { error: QUIET });

  const key = process.env.WALLETWALLET_API_KEY;
  if (!key) return sendJson(res, 500, { error: QUIET });

  const fields = buildWalletBody(pass, requestOrigin(req));
  try {
    const issued = pass.serial
      ? await updateOrCreate(pass.serial, fields, key)
      : await createBundle(fields, key);
    if (issued.updatedOnly) {
      return sendJson(res, 200, { updated: true, serial: issued.serial });
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/vnd.apple.pkpass");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="garden-of-memories.pkpass"'
    );
    res.setHeader("X-Wallet-Serial", issued.serial || "");
    res.setHeader("Access-Control-Expose-Headers", "X-Wallet-Serial");
    res.end(issued.bytes);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("Wallet pass failed:", detail);
    const body = { error: QUIET };
    if (process.env.VERCEL_ENV !== "production") body.detail = detail;
    return sendJson(res, 502, body);
  }
}

async function updateOrCreate(serial, fields, key) {
  const put = await fetch(`${WALLET_API}/api/passes/${encodeURIComponent(serial)}`, {
    method: "PUT",
    headers: auth(key),
    body: JSON.stringify(fields),
  });
  if (put.status === 404) return createBundle(fields, key);
  if (!put.ok) {
    const text = await responseText(put);
    console.error("WalletWallet update body:", text);
    throw new Error(`Wallet update ${put.status}: ${text}`);
  }
  const existing = await fetch(`${WALLET_API}/api/passes/${encodeURIComponent(serial)}?format=binary`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/vnd.apple.pkpass" },
  });
  const bundled = await readBundle(existing);
  if (bundled?.bytes) return { ...bundled, serial: bundled.serial || serial };
  const saved = await put.json().catch(() => ({}));
  return { updatedOnly: true, serial: saved.serialNumber || serial };
}

async function createBundle(fields, key) {
  const res = await fetch(`${WALLET_API}/api/passes?format=binary`, {
    method: "POST",
    headers: auth(key),
    body: JSON.stringify(fields),
  });
  const bundled = await readBundle(res);
  if (!bundled?.bytes) {
    const text = bundled?.errorText || "";
    console.error("WalletWallet create body:", text);
    throw new Error(`Wallet create ${res.status}: ${text}`);
  }
  return bundled;
}

function auth(key) {
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.apple.pkpass, application/json",
  };
}

async function responseText(res) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

async function readBundle(res) {
  const type = res.headers.get("content-type") || "";
  if (!res.ok) return { errorText: await responseText(res) };
  if (type.includes("json")) {
    const data = await res.json();
    if (!data?.applePass) return null;
    return {
      bytes: Buffer.from(data.applePass, "base64"),
      serial: data.serialNumber || res.headers.get("x-serial-number") || "",
    };
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.length) return null;
  return {
    bytes,
    serial: res.headers.get("x-serial-number") || "",
  };
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}
