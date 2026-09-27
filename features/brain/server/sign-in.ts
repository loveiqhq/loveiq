import { createHash, timingSafeEqual } from "node:crypto";
import { Redis } from "@upstash/redis";
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
  { ok: true; caller: Caller } | { ok: false; status: 401 | 403 | 429 | 503; message: string };

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
/**
 * Accounts (a token's `sub`) that Supabase vouched for recently. Their re-checks get a
 * bucket of their own instead of the per-address one, so a flood of forged tokens through
 * Anthropic's shared addresses cannot make a connected member's once-a-minute re-check
 * fail. A forger would need a member's account id, which only appears in that member's
 * own tokens. Kept a day, in Redis as well as here: kept only in memory, every deploy and
 * every new instance forgot them, so a flood right then refused the members it protects.
 */
const VERIFIED_SUB_MS = 24 * 3_600_000;
const verifiedSubs = new Map<string, number>();
let _subRedis: Redis | null | undefined;
function subRedis(): Redis | null {
  if (_subRedis !== undefined) return _subRedis;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  // No retry backoff and a one-second bound per call: this only picks a rate-limit bucket,
  // so an unreachable Redis must cost a sign-in nothing but the address limit. The client's
  // default (five retries with backoff, no timeout) added about 8.6 s to every check while
  // it was down.
  _subRedis =
    url && token
      ? new Redis({ url, token, retry: false, signal: () => AbortSignal.timeout(1_000) })
      : null;
  return _subRedis;
}
const subKey = (sub: string) => `jarvis:verified-sub:${sub}`;

/** Whether Supabase vouched for this account in the last day, here or on any instance. */
async function verifiedRecently(sub: string, now: number): Promise<boolean> {
  if ((verifiedSubs.get(sub) ?? 0) > now) return true;
  try {
    const until = Number(await subRedis()?.get(subKey(sub)));
    if (until > now) {
      remember(verifiedSubs, sub, until);
      return true;
    }
  } catch (err) {
    logger.warn({ err }, "jarvis: could not read verified accounts, using the address limit");
  }
  return false;
}

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
  verifiedSubs.clear();
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

const refused = (status: 401 | 403 | 429 | 503, message: string): Resolution => ({
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
  now = Date.now(),
  /**
   * Asked before each check with Supabase (a token not trusted from the last minute): false
   * refuses it with a 429. The limit sits here, on the one step that costs something,
   * rather than on the door: the door's limit is per address, and claude.ai's calls leave
   * from Anthropic's shared addresses, so strangers sending junk would spend the team's.
   * `knownSub` is set when the token's account verified recently, for a bucket of its own.
   */
  beforeCheck?: (who: { knownSub?: string }) => Promise<boolean>
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

  const sub = typeof claims.sub === "string" ? claims.sub : undefined;
  const knownSub = sub && (await verifiedRecently(sub, now)) ? sub : undefined;
  if (beforeCheck && !(await beforeCheck({ knownSub }))) {
    return refused(429, "Too many sign-in checks from this address. Try again in a minute.");
  }

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
  // An expired token is refused above, before the cache is read. Trusted no longer than the
  // membership answer it rests on, which may itself be most of a minute old: otherwise an
  // offboarded person kept access for up to two minutes, not the one we promise.
  const memberUntil = members.get(member.email)?.until ?? now + TRUST_MS;
  remember(tokens, hash, { caller, until: Math.min(now + TRUST_MS, memberUntil) });
  if (sub) {
    remember(verifiedSubs, sub, now + VERIFIED_SUB_MS);
    try {
      await subRedis()?.set(subKey(sub), now + VERIFIED_SUB_MS, { px: VERIFIED_SUB_MS });
    } catch (err) {
      logger.warn({ err }, "jarvis: could not record a verified account");
    }
  }
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
