/**
 * Minimal PostgREST client for the test harness.
 *
 * Credentials are read from .env.local at RUNTIME — never embedded in a script
 * or fixture, so nothing secret can be committed or pasted into a transcript.
 */
import { readFileSync } from "node:fs";

function env() {
  const raw = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
  const pick = (k) =>
    raw
      .match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]
      ?.trim()
      .replace(/^["']|["']$/g, "");
  const url = process.env.SUPABASE_URL || pick("SUPABASE_URL");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || pick("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key)
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not found in .env.local");
  return { url, key };
}

const { url, key } = env();
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

export async function sget(path) {
  const r = await fetch(`${url}/rest/v1/${path}`, { headers, cache: "no-store" });
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status} ${await r.text()}`);
  return r.json();
}

export async function spatch(path, body) {
  const r = await fetch(`${url}/rest/v1/${path}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PATCH ${path} -> ${r.status} ${await r.text()}`);
  return r.json();
}
