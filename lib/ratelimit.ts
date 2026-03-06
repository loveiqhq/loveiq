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
import logger from "./logger";

// Initialize Redis client from Vercel KV env vars
let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;

  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) return null;

  redis = new Redis({ url, token });
  return redis;
}

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
 * Check if a request should be rate limited using Redis for persistence.
 * Uses a fixed window algorithm with Redis INCR + EXPIRE for atomic,
 * sub-10ms rate limit checks. Falls back to in-memory rate limiting
 * when Redis is not configured.
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
    logger.warn("[ratelimit] Redis not configured, using in-memory fallback");
    return checkMemoryRateLimit(compositeKey, config);
  }

  try {
    // Atomic INCR + EXPIRE: increment counter and set TTL if new key
    const count = await kv.incr(compositeKey);

    // Set expiry only on the first request in the window
    if (count === 1) {
      await kv.expire(compositeKey, windowSec);
    }

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
    logger.error({ err }, "[ratelimit] Redis error, allowing request (fail-open)");
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
    logger.error({ err }, "[ratelimit] Redis cooldown error, allowing request (fail-open)");
    return { allowed: true, retryAfterMs: 0 };
  }
}

/**
 * Get client IP address from request headers.
 * Trusts only x-real-ip which Vercel sets to the actual client IP.
 * X-Forwarded-For is intentionally ignored — it is attacker-controlled and
 * would allow rate limit key spoofing.
 */
export function getClientIp(request: Request): string {
  return request.headers.get("x-real-ip") ?? "unknown";
}
