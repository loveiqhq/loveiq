import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";

/**
 * "Continue with Google" for Mira's free account: OAuth 2.0 authorization code flow with PKCE,
 * run on our own server, so no Google script loads on the page and the CSP stays as it is.
 * Google only tells us the person's confirmed email address (scope `openid email`). The account
 * is then the same Supabase user the emailed code makes, so both ways reach one account.
 *
 * Needs MIRA_GOOGLE_CLIENT_ID and MIRA_GOOGLE_CLIENT_SECRET: a "Web application" client in the
 * `loveiq-mira` Google Cloud project, with each origin below + CALLBACK as a redirect URI.
 */

export const GOOGLE_COOKIE = "mira-google";
export const GOOGLE_COOKIE_PATH = "/api/mira/auth/google";
const CALLBACK = "/api/mira/auth/google/callback";
const AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

/** Where Google may send people back to. Each is also listed on the Google client. */
const ORIGINS = new Set([
  "https://www.loveiq.org",
  "https://staging.loveiq.org",
  "http://localhost:3000",
]);

export type GoogleClient = { id: string; secret: string };
export type GoogleStart = { state: string; verifier: string; nonce: string };

export function googleClient(): GoogleClient | null {
  const id = process.env.MIRA_GOOGLE_CLIENT_ID?.trim();
  const secret = process.env.MIRA_GOOGLE_CLIENT_SECRET?.trim();
  return id && secret ? { id, secret } : null;
}

/** The origin this request came in on, if Google may send people back there; else null. */
export function returnOrigin(requestUrl: string): string | null {
  const origin = new URL(requestUrl).origin;
  return ORIGINS.has(origin) ? origin : null;
}

export function newGoogleStart(): GoogleStart {
  const r = (n: number) => randomBytes(n).toString("base64url");
  return { state: r(24), verifier: r(48), nonce: r(24) };
}

export function authorizeUrl(clientId: string, origin: string, s: GoogleStart): string {
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: origin + CALLBACK,
    response_type: "code",
    scope: "openid email",
    state: s.state,
    nonce: s.nonce,
    code_challenge: createHash("sha256").update(s.verifier).digest("base64url"),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `${AUTHORIZE}?${q}`;
}

/** The start values ride in one short-lived httpOnly cookie (base64url never holds a dot). */
export const packStart = (s: GoogleStart) => [s.state, s.verifier, s.nonce].join(".");

export function unpackStart(value: string | undefined): GoogleStart | null {
  const parts = (value ?? "").split(".");
  if (parts.length !== 3 || parts.some((p) => !/^[\w-]{16,}$/.test(p))) return null;
  const [state, verifier, nonce] = parts as [string, string, string];
  return { state, verifier, nonce };
}

export function sameState(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Checks the claims of Google's ID token and returns the confirmed email, or null. The token
 * comes straight from Google's token endpoint over TLS, in exchange for our client secret, so
 * OpenID Connect Core 3.1.3.7 lets us skip its signature; every claim is still checked.
 */
export function checkIdToken(
  idToken: string | undefined,
  clientId: string,
  nonce: string,
  now = Date.now()
): { email: string } | null {
  const payload = idToken?.split(".")[1];
  if (!payload) return null;
  let c: Record<string, unknown>;
  try {
    c = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!ISSUERS.has(String(c.iss)) || !aud.includes(clientId)) return null;
  if (typeof c.exp !== "number" || c.exp * 1000 <= now) return null;
  if (typeof c.nonce !== "string" || !sameState(c.nonce, nonce)) return null;
  if (c.email_verified !== true && c.email_verified !== "true") return null;
  const email = typeof c.email === "string" ? c.email.trim().toLowerCase() : "";
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return { email };
}

/** Swaps Google's one-time code for the person's confirmed email, or null. */
export async function exchangeCode(
  client: GoogleClient,
  origin: string,
  code: string,
  s: GoogleStart
): Promise<{ email: string } | null> {
  const res = await fetchWithTimeout(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: client.id,
      client_secret: client.secret,
      redirect_uri: origin + CALLBACK,
      grant_type: "authorization_code",
      code_verifier: s.verifier,
    }).toString(),
    timeoutMs: 8_000,
  }).catch(() => null);
  if (!res?.ok) return null;
  const body = (await res.json().catch(() => ({}))) as { id_token?: string };
  return checkIdToken(body.id_token, client.id, s.nonce);
}
