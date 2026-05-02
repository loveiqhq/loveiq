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
    return false;
  }

  // Constant-time comparison to prevent timing attacks
  if (cookieToken.length !== headerToken.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < cookieToken.length; i++) {
    result |= cookieToken.charCodeAt(i) ^ headerToken.charCodeAt(i);
  }

  return result === 0;
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
