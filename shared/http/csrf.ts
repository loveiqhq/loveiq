/**
 * CSRF Protection using Double-Submit Cookie Pattern
 *
 * How it works:
 * 1. Server generates a random token and sets it in a cookie (via proxy.ts)
 * 2. Client reads the cookie and includes it in request headers
 * 3. Server verifies the header matches the cookie
 *
 * This works because:
 * - Attackers can't read cookies from other domains (Same-Origin Policy)
 * - Attackers can't set custom headers in cross-origin requests
 *
 * In production, the cookie uses the __Host- prefix for stronger scoping.
 */

import { cookies } from "next/headers";
import { Redis } from "@upstash/redis";
import logger from "@shared/observability/logger";
import { getClientIp } from "@shared/http/ratelimit";

// Per-IP CSRF-fail counter (15-min bucket, 30-min TTL). The
// security-storm-detector cron scans `csrf:*` keys and pings ops when any
// IP exceeds the threshold. Stored as a process-level singleton so the
// instance is reused across requests on a warm Vercel function.
let _csrfRedis: Redis | null | undefined;
function getCsrfRedis(): Redis | null {
  if (_csrfRedis !== undefined) return _csrfRedis;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  _csrfRedis = url && token ? new Redis({ url, token }) : null;
  return _csrfRedis;
}

const isProduction = process.env.NODE_ENV === "production";
const CSRF_COOKIE_NAME = isProduction ? "__Host-csrf" : "__csrf";
const CSRF_HEADER_NAME = "x-csrf-token";

/**
 * Verify CSRF token in API route.
 * Returns true if valid, false if invalid.
 */
export async function verifyCsrfToken(request: Request): Promise<boolean> {
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(CSRF_COOKIE_NAME)?.value;
  const headerToken = request.headers.get(CSRF_HEADER_NAME);

  // Both must exist and match
  if (!cookieToken || !headerToken) {
    logCsrfFail(request, "missing_token");
    return false;
  }

  // Constant-time comparison to prevent timing attacks
  if (cookieToken.length !== headerToken.length) {
    logCsrfFail(request, "length_mismatch");
    return false;
  }

  let result = 0;
  for (let i = 0; i < cookieToken.length; i++) {
    result |= cookieToken.charCodeAt(i) ^ headerToken.charCodeAt(i);
  }

  if (result !== 0) {
    logCsrfFail(request, "value_mismatch");
    return false;
  }
  return true;
}

// Structured warn log on every CSRF failure. Increments a per-IP counter
// in Upstash KV that the security-storm-detector cron scans on a 15-min
// cadence. Warn-level so the pino → Slack hook (which fires on .error)
// doesn't ping for every legitimate CSRF cookie expiry; the cron is the
// signal that batches and alerts on storms.
function logCsrfFail(request: Request, reason: string) {
  let path = "(unknown)";
  try {
    path = new URL(request.url).pathname;
  } catch {
    // Malformed URL — ignore
  }
  const ip = getClientIp(request);
  logger.warn({ csrf_fail: true, reason, path, ip }, "CSRF token check failed");

  // Fire-and-forget KV bump. Bucket is 15-min wide; TTL 30 min so the
  // current + previous window are queryable. Errors swallowed — we never
  // want logging-of-CSRF-fail to disrupt the request hot path.
  const redis = getCsrfRedis();
  if (!redis) return;
  const bucketMin = Math.floor(Date.now() / 900_000) * 15;
  const key = `csrf:${ip}:${bucketMin}`;
  void redis
    .incr(key)
    .then((n) => (n === 1 ? redis.expire(key, 1800) : null))
    .catch(() => {});
}

/**
 * Verify CSRF token, accepting either the header (preferred) or a body field
 * (sendBeacon fallback). Use this in beacon-friendly endpoints where the body
 * fallback is a legitimate path — a missing header is NOT logged or counted
 * against the per-IP storm threshold. If the header IS present, the full
 * `verifyCsrfToken` log+count behavior applies on mismatch (real attack signal).
 */
export async function verifyCsrfHeaderOrBody(
  request: Request,
  bodyToken: string | undefined
): Promise<boolean> {
  if (request.headers.get(CSRF_HEADER_NAME)) {
    return verifyCsrfToken(request);
  }
  return verifyCsrfTokenFromBody(bodyToken);
}

/**
 * Verify CSRF token from a body field (for sendBeacon which cannot set headers).
 * Compares the provided token against the cookie value using constant-time comparison.
 */
export async function verifyCsrfTokenFromBody(bodyToken: string | undefined): Promise<boolean> {
  if (!bodyToken) return false;

  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(CSRF_COOKIE_NAME)?.value;

  if (!cookieToken) return false;
  if (cookieToken.length !== bodyToken.length) return false;

  let result = 0;
  for (let i = 0; i < cookieToken.length; i++) {
    result |= cookieToken.charCodeAt(i) ^ bodyToken.charCodeAt(i);
  }

  return result === 0;
}
