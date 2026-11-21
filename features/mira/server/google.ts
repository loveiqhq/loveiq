import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { supabaseFetch } from "@features/admin/server/supabase";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";

/**
 * "Continue with Google" for Mira's free account: OAuth 2.0 authorization code flow with PKCE,
 * run on our own server, so no Google script loads on the page and the CSP stays as it is.
 * Google only tells us the person's confirmed email address (scope `openid email`). The account
 * is then the same Supabase user the emailed code makes, so both ways reach one account.
 *
 * Google is trusted for an address only where Google runs it: Gmail, or a Google Workspace
 * account on its own domain (the `hd` claim). A Google account can be opened on any address, and
 * `email_verified` only says Google checked it once; whoever opened it may have lost that inbox
 * since (an ex-partner, a former colleague). Those addresses, and staff addresses (admin_users,
 * whose session would also open the admin panel), sign in by emailed code instead.
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
/**
 * What the sign-up form chose, carried through Google beside the start values: its two optional
 * ticks, and where to go after (raw here: the routes check it with safeNext both ways). `connect`:
 * Settings' "Connect Google" (22 Nov 2026), which signs nobody in: it only records that Google
 * confirmed the signed-in account's own address.
 */
export type SignUpChoices = { useAssessment: boolean; next: string | null; connect?: boolean };

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

export function authorizeUrl(
  clientId: string,
  origin: string,
  s: GoogleStart,
  loginHint?: string
): string {
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
    ...(loginHint ? { login_hint: loginHint } : {}),
  });
  return `${AUTHORIZE}?${q}`;
}

/**
 * The start values and the form's choices ride in one short-lived httpOnly cookie, the choices
 * as base64url JSON (base64url never holds a dot).
 */
export const packStart = (s: GoogleStart, c: SignUpChoices) =>
  [s.state, s.verifier, s.nonce, Buffer.from(JSON.stringify(c)).toString("base64url")].join(".");

export function unpackStart(value: string | undefined): (GoogleStart & SignUpChoices) | null {
  const parts = (value ?? "").split(".");
  if (parts.length !== 4 || parts.slice(0, 3).some((p) => !/^[\w-]{16,}$/.test(p))) return null;
  const [state, verifier, nonce, packed] = parts as [string, string, string, string];
  let c: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(packed, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    c = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  return {
    state,
    verifier,
    nonce,
    useAssessment: c.useAssessment === true,
    next: typeof c.next === "string" ? c.next : null,
    ...(c.connect === true ? { connect: true } : {}),
  };
}

export function sameState(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** True when Google runs this address: Gmail, or Workspace with `hd` naming its own domain. */
export function googleRunsAddress(email: string, hd: unknown): boolean {
  const domain = email.split("@")[1] ?? "";
  if (domain === "gmail.com" || domain === "googlemail.com") return true;
  return typeof hd === "string" && hd.toLowerCase() === domain;
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
): { email: string; googleRuns: boolean } | null {
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
  return { email, googleRuns: googleRunsAddress(email, c.hd) };
}

/** Staff addresses never sign in with Google here. Fails closed: unsure counts as staff. */
export async function isStaffEmail(email: string): Promise<boolean> {
  try {
    const res = await supabaseFetch(
      `/rest/v1/admin_users?email=ilike.${encodeURIComponent(email)}&select=email&limit=1`
    );
    if (!res.ok) return true;
    const rows = (await res.json()) as unknown[];
    return !Array.isArray(rows) || rows.length > 0;
  } catch {
    return true;
  }
}

/** Swaps Google's one-time code for the person's confirmed email, or null. */
export async function exchangeCode(
  client: GoogleClient,
  origin: string,
  code: string,
  s: GoogleStart
): Promise<{ email: string; googleRuns: boolean } | null> {
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

/**
 * Whether Google has confirmed this account's address (a Google sign-in, or Settings' "Connect
 * Google"), as Settings shows it: mira_user.google_connected_at, cleared when the email changes.
 */
export async function googleConnected(userId: string): Promise<boolean> {
  const res = await supabaseFetch(
    `/rest/v1/mira_user?id=eq.${encodeURIComponent(userId)}&google_connected_at=not.is.null&select=id&limit=1`
  );
  if (!res.ok) throw new Error(`mira google connection read failed (${res.status})`);
  return ((await res.json()) as unknown[]).length > 0;
}
