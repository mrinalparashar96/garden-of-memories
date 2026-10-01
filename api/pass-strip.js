import { MAX_PASS_NAME, PASS_ART_IDS } from "../src/pass/passArt.js";
import { renderConstellationStrip } from "./constellationStrip.js";

const PASS_ID = /^SH-[0-9A-F]{4}-[0-9A-F]{4}$/;

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.statusCode = 405;
    res.end("Method not allowed");
    return;
  }
  const query = queryOf(req);
  const id = String(query.id || "").toUpperCase();
  const art = String(query.art || "").toLowerCase();
  const name = String(query.name || "")
    .trim()
    .slice(0, MAX_PASS_NAME)
    .toUpperCase();
  if (!PASS_ID.test(id) || !PASS_ART_IDS.has(art) || !name) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Unknown pass artwork" }));
    return;
  }
  try {
    const png = await renderConstellationStrip({ id, art, name });
    res.statusCode = 200;
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.end(png);
  } catch (err) {
    console.error("Strip render failed:", err instanceof Error ? err.message : err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Couldn't draw the pass" }));
  }
}

function queryOf(req) {
  if (req.query && (req.query.id || req.query.art)) return req.query;
  try {
    return Object.fromEntries(new URL(req.url || "/", "http://localhost").searchParams);
  } catch {
    return {};
  }
}
