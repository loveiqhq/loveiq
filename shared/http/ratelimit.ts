/**
 * Rate limiting using Upstash Redis (Vercel KV).
 *
 * Uses edge-deployed Redis for sub-10ms rate limit checks, replacing the
 * previous Supabase-backed implementation that added 150-400ms RTT for
 * non-US users. Falls back to in-memory rate limiting when Redis is not
 * configured (local dev). Fails open on Redis errors to prevent
 * infrastructure failures from blocking legitimate traffic.
 */

import { Redis } from "@upstash/redis";
import logger from "@shared/observability/logger";

// Initialize Redis client from Vercel KV env vars
let redis: Redis | null = null;

// Once-per-process gate so the "KV missing in prod" log fires once per cold
// start, not once per request (avoid Vercel log flood / alert fatigue).
let missingKvLogged = false;

function getRedis(): Redis | null {
  if (redis) return redis;

  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) return null;

  redis = new Redis({ url, token });
  return redis;
}

function logMissingKvOnce(): void {
  if (missingKvLogged) return;
  missingKvLogged = true;
  if (process.env.NODE_ENV === "production") {
    logger.error(
      "[ratelimit] KV_REST_API_URL / KV_REST_API_TOKEN missing in production — using in-memory fallback. Per-instance state will not coordinate across regions or warm containers, so rate limits may be under-enforced."
    );
  } else {
    logger.warn("[ratelimit] Redis not configured, using in-memory fallback");
  }
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

interface RateLimitConfig {
  /** Unique identifier for the rate limit bucket (e.g., "survey", "contact") */
  bucket: string;
  /** Maximum requests allowed in the window */
  limit: number;
  /** Time window in milliseconds */
  windowMs: number;
}

/**
 * In-memory rate limiter fallback.
 * Only effective per serverless instance but still better than no rate limiting.
 */
const memoryStore = new Map<string, number[]>();

function checkMemoryRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const windowStart = now - config.windowMs;
  const resetAt = new Date(now + config.windowMs);

  const hits = memoryStore.get(key) ?? [];
  const validHits = hits.filter((t) => t > windowStart);

  if (validHits.length >= config.limit) {
    memoryStore.set(key, validHits);
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(Math.min(...validHits) + config.windowMs),
    };
  }

  validHits.push(now);
  memoryStore.set(key, validHits);

  return {
    allowed: true,
    remaining: config.limit - validHits.length,
    resetAt,
  };
}

// Periodically clean up stale entries from memory store (every 5 minutes)
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    memoryStore.forEach((hits, key) => {
      const valid = hits.filter((t) => t > now - 300_000); // Keep last 5 min
      if (valid.length === 0) {
        memoryStore.delete(key);
      } else {
        memoryStore.set(key, valid);
      }
    });
  }, 300_000);
}

/**
 * Atomic fixed-window INCR that always guarantees a TTL.
 *
 * Previously this was two awaited calls (`incr` then a conditional `expire`).
 * If the connection dropped between them, the key was left WITHOUT a TTL: on the
 * next request `incr` returns 2, the `count === 1` guard never re-fires, the key
 * never expires, and that (bucket, ip) is rate-limited forever. This Lua script
 * runs INCR + EXPIRE as one atomic Redis operation and (re)sets the TTL whenever
 * the key has none (`TTL < 0`), which also self-heals any previously-poisoned key.
 */
const INCR_WITH_TTL = `
local count = redis.call('INCR', KEYS[1])
if redis.call('TTL', KEYS[1]) < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`;

/**
 * Check if a request should be rate limited using Redis for persistence.
 * Uses a fixed-window algorithm with an atomic INCR+EXPIRE Lua script for
 * sub-10ms rate limit checks. Falls back to in-memory rate limiting when Redis
 * is not configured.
 */
export async function checkRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowSec = Math.ceil(config.windowMs / 1000);
  const resetAt = new Date(now + config.windowMs);
  const compositeKey = `rl:${config.bucket}:${key}`;

  const kv = getRedis();

  // If Redis is not configured, use in-memory fallback
  if (!kv) {
    logMissingKvOnce();
    return checkMemoryRateLimit(compositeKey, config);
  }

  try {
    // Atomic INCR + EXPIRE in a single Redis round-trip; always (re)sets the TTL
    // when the key has none, so a mid-call failure can never poison a key into a
    // permanent ban (see INCR_WITH_TTL above).
    const count = Number(await kv.eval(INCR_WITH_TTL, [compositeKey], [windowSec]));

    if (count > config.limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt,
      };
    }

    return {
      allowed: true,
      remaining: config.limit - count,
      resetAt,
    };
  } catch (err) {
    // warn-not-error: route fails OPEN here (allows request through). A Redis
    // blip should not fire api_5xx Slack page on every single API request —
    // that's a noise amplifier. Sustained Redis outage will surface via the
    // circuit-breaker pattern on routes that wrap Supabase/Resend, and via
    // the daily tech-digest service-health section.
    logger.warn({ err }, "[ratelimit] Redis error, allowing request (fail-open)");
    return { allowed: true, remaining: config.limit, resetAt };
  }
}

/**
 * Check cooldown for a specific key (e.g., email-based cooldown).
 * Uses Redis SET with NX + EX for atomic check-and-set in a single command.
 * If the key exists (SET NX returns null), the cooldown hasn't elapsed.
 */
export async function checkCooldown(
  key: string,
  bucket: string,
  cooldownMs: number
): Promise<{ allowed: boolean; retryAfterMs: number }> {
  const kv = getRedis();
  if (!kv) {
    return { allowed: true, retryAfterMs: 0 };
  }

  const compositeKey = `cd:${bucket}:${key}`;
  const cooldownSec = Math.ceil(cooldownMs / 1000);

  try {
    // SET NX: only sets the key if it doesn't exist, with TTL.
    // Returns "OK" if set (cooldown passed), null if key exists (still cooling down).
    const result = await kv.set(compositeKey, Date.now(), { nx: true, ex: cooldownSec });

    if (result === null) {
      // Key exists — check remaining TTL for retry-after
      const ttl = await kv.ttl(compositeKey);
      return {
        allowed: false,
        retryAfterMs: ttl > 0 ? ttl * 1000 : cooldownMs,
      };
    }

    return { allowed: true, retryAfterMs: 0 };
  } catch (err) {
    // warn-not-error: same fail-open posture as checkRateLimit above.
    logger.warn({ err }, "[ratelimit] Redis cooldown error, allowing request (fail-open)");
    return { allowed: true, retryAfterMs: 0 };
  }
}

/**
 * Collapse an IPv6 address to a stable /64-prefix bucket key.
 *
 * R-08 correctness fix: a naive `addr.split(":").slice(0,4)` is WRONG for
 * RFC-5952 canonical addresses (the form Vercel emits) because `::`
 * zero-compression means the first four colon-separated groups are NOT the
 * first four hextets. e.g. `2001:db8::dead:beef` and `2001:db8::cafe:1` share
 * a /64, but the naive slice yields different keys — so the collapse silently
 * fails and a /64 rotation still evades the limit (defeating the whole point).
 * We expand `::` to the full 8-hextet form first, then take the first four and
 * normalise each (strip leading zeros). IPv4-mapped forms (`::ffff:1.2.3.4`)
 * key on the embedded dotted-quad so they don't all collapse into one bucket.
 */
function ipv6Slash64Key(addr: string): string {
  const lower = addr.toLowerCase();
  // IPv4-mapped / embedded IPv4 (e.g. ::ffff:203.0.113.5). Vercel normally
  // sends plain IPv4 for v4 clients, so this is a safety net — bucket on the
  // dotted-quad tail rather than collapsing every mapped client to one key.
  if (lower.includes(".")) {
    return lower.slice(lower.lastIndexOf(":") + 1);
  }
  let groups: string[];
  if (lower.includes("::")) {
    const [head, tail] = lower.split("::");
    const headGroups = head ? head.split(":") : [];
    const tailGroups = tail ? tail.split(":") : [];
    const fill = Math.max(0, 8 - headGroups.length - tailGroups.length);
    groups = [...headGroups, ...new Array<string>(fill).fill("0"), ...tailGroups];
  } else {
    groups = lower.split(":");
  }
  const prefix: string[] = [];
  for (let i = 0; i < 4; i++) {
    const n = parseInt(groups[i] ?? "0", 16);
    prefix.push(Number.isNaN(n) ? "0" : n.toString(16));
  }
  return prefix.join(":") + "::/64";
}

/**
 * Get client IP for rate-limit fingerprinting.
 *
 * Trusts ONLY x-real-ip, which Vercel sets to the actual client IP and
 * strips any client-provided x-real-ip header (platform guarantee).
 * X-Forwarded-For is intentionally ignored — it is attacker-controlled
 * and would allow rate-limit key spoofing if used.
 *
 * R-08: IPv6 is collapsed to its /64 prefix (every consumer IPv6 allocation IS
 * a /64, so per-/128 keying lets an attacker rotate low-order bits to evade
 * limits). IPv4 is keyed on the full /32 (the cost boundary there).
 *
 * @see https://vercel.com/docs/edge-network/headers#x-real-ip
 */
export function getClientIp(request: Request): string {
  const raw = request.headers.get("x-real-ip");
  if (!raw) return "unknown";
  const addr = raw.trim();
  return addr.includes(":") ? ipv6Slash64Key(addr) : addr;
}
