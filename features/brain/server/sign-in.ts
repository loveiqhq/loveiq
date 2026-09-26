import { createHash, timingSafeEqual } from "node:crypto";
import { supabaseFetch } from "@features/admin/server/supabase";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";

/**
 * WHO IS CALLING JARVIS: a person who signed in, or the shared credential.
 *
 * Decided 2026-09-26 (decision:2026-09-26-3b76af89e8): each person signs in to Jarvis
 * themselves, so a write has a verified author, one person's access can be removed
 * without touching anyone else's, and usage can be counted per person. It changes who is
 * asking, never what they see.
 *
 * Sign-in is Supabase Auth's OAuth 2.1 server. Claude registers itself, sends the person
 * to /jarvis/connect, and comes back with an access token: a Supabase JWT that carries a
 * `client_id` claim. The shared LOVEIQ_MCP_TOKEN still works, for the jobs that run
 * unattended (the Night Shift, the weekly health report, the test batteries).
 *
 * WHO MAY SIGN IN is the people registry: an @loveiq.org address on an ACTIVE person in
 * `brain_person`. Offboarding is `active = false`, and it takes effect within a minute,
 * on every connected client at once, because membership is checked on every call rather
 * than once at sign-in.
 */

export type Caller =
  | { kind: "shared" }
  | {
      kind: "person";
      /** As the people registry writes it, e.g. "Mark Oldenburg". */
      name: string;
      email: string;
    };

export type Resolution =
  { ok: true; caller: Caller } | { ok: false; status: 401 | 403 | 503; message: string };

export interface Member {
  name: string;
  email: string;
}

const MEMBER_DOMAIN = "@loveiq.org";
/** How long a verified token, or a membership answer, is trusted before it is checked again. */
const TRUST_MS = 60_000;
const MAX_CACHED = 500;

const members = new Map<string, { member: Member | null; until: number }>();
const tokens = new Map<string, { caller: Caller; until: number }>();

/** Drop the oldest entry once a cache is full; Map keeps insertion order. */
function remember<V>(cache: Map<string, V>, key: string, value: V): void {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value as string);
}

/** Test seam: forget every cached token and membership answer. */
export function forgetSignIns(): void {
  members.clear();
  tokens.clear();
}

/**
 * The member an address belongs to, or null. Only an @loveiq.org address on an active
 * PERSON counts: a shared mailbox (teamwork@) is a shared credential by another name, and
 * a personal address on the same person is not one we can vouch for.
 */
export async function memberByEmail(raw: string, now = Date.now()): Promise<Member | null> {
  const email = raw.trim().toLowerCase();
  // The address goes inside a Postgres array literal below, so anything that could end the
  // element or the array early is refused rather than escaped.
  if (!email.endsWith(MEMBER_DOMAIN) || /[",{}\\\s]/.test(email)) return null;
  const hit = members.get(email);
  if (hit && hit.until > now) return hit.member;

  const res = await supabaseFetch(
    `/rest/v1/brain_person?select=canonical&kind=eq.person&active=is.true` +
      `&aliases=cs.${encodeURIComponent(`{"${email}"}`)}&limit=1`
  );
  // Not cached on failure: a registry that cannot be read must not lock a member out for
  // a minute after it recovers.
  if (!res.ok) throw new Error(`the people registry could not be read (${res.status})`);
  const rows = (await res.json()) as Array<{ canonical?: string }>;
  const member = rows[0]?.canonical ? { name: rows[0].canonical, email } : null;
  remember(members, email, { member, until: now + TRUST_MS });
  return member;
}

/** The claims of a JWT, unverified, or null when the string is not one. */
function claimsOf(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as unknown;
    return claims && typeof claims === "object" ? (claims as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function sameSecret(presented: string, expected: string): boolean {
  // The length check stays FIRST: timingSafeEqual throws on unequal lengths, and a
  // token's length is not a secret worth protecting.
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const refused = (status: 401 | 403 | 503, message: string): Resolution => ({
  ok: false,
  status,
  message,
});

/**
 * Resolve the Authorization header of a Jarvis call to the caller it proves.
 *
 * A signed-in token is checked with Supabase itself (`/auth/v1/user`), which verifies its
 * signature and that its session still exists, so a revoked session stops working. The
 * answer is trusted for a minute; an expired token never reaches it.
 */
export async function resolveCaller(
  authorization: string | null,
  now = Date.now()
): Promise<Resolution> {
  const presented = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!presented) return refused(401, "Sign in to use Jarvis.");

  const shared = process.env.LOVEIQ_MCP_TOKEN;
  if (shared && sameSecret(presented, shared)) return { ok: true, caller: { kind: "shared" } };

  const base = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const claims = claimsOf(presented);
  // Only a token Supabase issued to an OAuth client. An ordinary session token (the admin
  // panel's) carries no client_id, and is not a sign-in to Jarvis.
  if (
    !base ||
    !key ||
    !claims ||
    claims.iss !== `${base}/auth/v1` ||
    typeof claims.client_id !== "string" ||
    typeof claims.exp !== "number" ||
    claims.exp * 1000 <= now
  ) {
    return refused(401, "Sign in to use Jarvis.");
  }

  const hash = createHash("sha256").update(presented).digest("hex");
  const hit = tokens.get(hash);
  if (hit && hit.until > now) return { ok: true, caller: hit.caller };

  let email: string;
  try {
    const res = await fetchWithTimeout(`${base}/auth/v1/user`, {
      headers: { apikey: key, Authorization: `Bearer ${presented}` },
      timeoutMs: 5_000,
    });
    if (!res.ok) return refused(401, "This sign-in has expired or was revoked. Sign in again.");
    const user = (await res.json()) as { email?: string };
    if (!user.email) return refused(401, "Sign in to use Jarvis.");
    email = user.email;
  } catch (err) {
    logger.warn({ err }, "jarvis: could not check a sign-in with Supabase");
    return refused(503, "Jarvis could not check your sign-in just now. Try again in a minute.");
  }

  let member: Member | null;
  try {
    member = await memberByEmail(email, now);
  } catch (err) {
    logger.warn({ err }, "jarvis: could not read the people registry");
    return refused(503, "Jarvis could not check your sign-in just now. Try again in a minute.");
  }
  if (!member) {
    return refused(
      403,
      `${email} is not on the Jarvis member list. Ask Eman to add you, or sign in with your ` +
        `own @loveiq.org address.`
    );
  }

  const caller: Caller = { kind: "person", name: member.name, email: member.email };
  // An expired token is refused above, before the cache is read, so a minute is the only limit.
  remember(tokens, hash, { caller, until: now + TRUST_MS });
  return { ok: true, caller };
}

/** Where a client learns how to sign in to Jarvis (RFC 9728), for the resource at `origin`. */
export function resourceMetadataUrl(origin: string): string {
  return `${origin}/.well-known/oauth-protected-resource/api/mcp`;
}

/**
 * The `WWW-Authenticate` header of a 401. `scope="email"` because Supabase can only issue an
 * OpenID `openid` token with asymmetric signing keys, which this project does not use, and
 * `email` is its default anyway.
 */
export function signInChallenge(origin: string): string {
  return `Bearer resource_metadata="${resourceMetadataUrl(origin)}", scope="email"`;
}

/** The protected-resource metadata document (RFC 9728) for Jarvis at `origin`. */
export function protectedResourceMetadata(origin: string): Record<string, unknown> {
  return {
    resource: `${origin}/api/mcp`,
    authorization_servers: [`${process.env.SUPABASE_URL?.replace(/\/+$/, "")}/auth/v1`],
    bearer_methods_supported: ["header"],
    scopes_supported: ["email"],
    resource_name: "LoveIQ Jarvis",
    resource_documentation: `${origin}/jarvis/connect`,
  };
}

/**
 * Where an approved sign-in may send its code: Claude's own callback, or Claude Code on this
 * machine. Supabase lets any client register itself, so without this a stranger could
 * register "Claude" with their own address and phish a member into approving it.
 */
export function isClaudeRedirect(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.protocol === "https:")
    return url.hostname === "claude.ai" || url.hostname === "claude.com";
  return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
}
