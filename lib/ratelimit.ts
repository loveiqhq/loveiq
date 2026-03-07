/**
 * Persistent rate limiting using Supabase.
 *
 * This module provides sliding-window rate limiting that persists across
 * server restarts and deployments. When Supabase is configured but unreachable,
 * requests are blocked (fail-closed) to prevent rate limit bypass during outages.
 * When Supabase is not configured at all (local dev), an in-memory fallback is used.
 */

import { fetchWithTimeout } from "./fetch-with-timeout";
import { getBreaker } from "./circuit-breaker";
import logger from "./logger";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Timeout for Supabase rate limit requests (ms) */
const RATELIMIT_TIMEOUT_MS = 3000;

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

interface RateLimitConfig {
  /** Unique identifier for the rate limit bucket (e.g., "waitlist", "contact") */
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
 * Check if a request should be rate limited using Supabase for persistence.
 * Uses a sliding window algorithm. Falls back to in-memory rate limiting
 * when Supabase is unavailable.
 *
 * @param key - The key to rate limit (typically IP address or email)
 * @param config - Rate limit configuration
 * @returns RateLimitResult indicating if request is allowed
 */
export async function checkRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = Date.now();
  const resetAt = new Date(now + config.windowMs);
  const compositeKey = `${config.bucket}:${key}`;

  // If Supabase is not configured, use in-memory fallback
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    logger.warn("[ratelimit] Supabase not configured, using in-memory fallback");
    return checkMemoryRateLimit(compositeKey, config);
  }

  try {
    // Call Supabase RPC function to atomically check and update rate limit
    // Wrapped in circuit breaker: after 3 failures, opens for 30s (fail fast, no timeout wait)
    const response = await getBreaker("supabase").fire(() =>
      fetchWithTimeout(`${SUPABASE_URL}/rest/v1/rpc/check_rate_limit`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          p_key: compositeKey,
          p_limit: config.limit,
          p_window_ms: config.windowMs,
          p_now: now,
        }),
        cache: "no-store",
        timeoutMs: RATELIMIT_TIMEOUT_MS,
      })
    );

    if (!response.ok) {
      logger.error(
        { status: response.status },
        response.status === 404
          ? "[ratelimit] check_rate_limit RPC not found — deploy the SQL function. Blocking request."
          : "[ratelimit] Supabase RPC failed, blocking request (fail-closed)"
      );
      return { allowed: false, remaining: 0, resetAt };
    }

    const result = await response.json();
    return {
      allowed: result.allowed ?? true,
      remaining: result.remaining ?? config.limit,
      resetAt: new Date(result.reset_at ?? resetAt),
    };
  } catch (err) {
    logger.error({ err }, "[ratelimit] Error checking rate limit, blocking request (fail-closed)");
    return { allowed: false, remaining: 0, resetAt };
  }
}

/**
 * Check cooldown for a specific key (e.g., email-based cooldown).
 * Simpler than rate limiting - just checks if enough time has passed.
 */
export async function checkCooldown(
  key: string,
  bucket: string,
  cooldownMs: number
): Promise<{ allowed: boolean; retryAfterMs: number }> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { allowed: true, retryAfterMs: 0 };
  }

  const compositeKey = `cooldown:${bucket}:${key}`;
  const now = Date.now();

  try {
    const getResponse = await getBreaker("supabase").fire(() =>
      fetchWithTimeout(
        `${SUPABASE_URL}/rest/v1/rate_limits?key=eq.${encodeURIComponent(compositeKey)}&select=updated_at`,
        {
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          cache: "no-store",
          timeoutMs: RATELIMIT_TIMEOUT_MS,
        }
      )
    );

    if (!getResponse.ok) {
      logger.error(
        { status: getResponse.status },
        "[ratelimit] Cooldown GET failed, blocking (fail-closed)"
      );
      return { allowed: false, retryAfterMs: cooldownMs };
    }

    const records = (await getResponse.json()) as Array<{ updated_at: string }>;
    const lastHit = records[0]?.updated_at;

    if (lastHit) {
      const lastHitTime = new Date(lastHit).getTime();
      const elapsed = now - lastHitTime;
      if (elapsed < cooldownMs) {
        return { allowed: false, retryAfterMs: cooldownMs - elapsed };
      }
    }

    // Update cooldown timestamp
    await getBreaker("supabase").fire(() =>
      fetchWithTimeout(`${SUPABASE_URL}/rest/v1/rate_limits`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify({
          key: compositeKey,
          hits: [],
          updated_at: new Date(now).toISOString(),
        }),
        cache: "no-store",
        timeoutMs: RATELIMIT_TIMEOUT_MS,
      })
    );

    return { allowed: true, retryAfterMs: 0 };
  } catch (err) {
    logger.error({ err }, "[ratelimit] Cooldown check error, blocking (fail-closed)");
    return { allowed: false, retryAfterMs: cooldownMs };
  }
}

/**
 * Get client IP address from request headers.
 *
 * Trusts ONLY x-real-ip, which Vercel sets to the actual client IP
 * and strips any client-provided x-real-ip header (platform guarantee).
 * X-Forwarded-For is intentionally ignored — it is attacker-controlled
 * and would allow rate-limit key spoofing if used.
 *
 * @see https://vercel.com/docs/edge-network/headers#x-real-ip
 */
export function getClientIp(request: Request): string {
  return request.headers.get("x-real-ip") ?? "unknown";
}
