import { createHmac, timingSafeEqual } from "crypto";

/**
 * Stateless email-verification layer for shared reports.
 *
 * Recipients prove their identity by typing the email the owner invited.
 * On match we issue a long-lived HMAC-signed cookie keyed to (shareId, email).
 * Subsequent loads of /api/report?token=rpts_... validate the cookie before
 * returning report data. No DB session table — revocation works by setting
 * report_share.revoked_at, which the share resolver already enforces.
 */

const isProduction = process.env.NODE_ENV === "production";

/** `__Host-` prefix forces HTTPS + Path=/ + no Domain — strongest cookie scope. */
export const SHARE_VERIFY_COOKIE_PREFIX = isProduction ? "__Host-rsv_" : "rsv_";

/** Cookie lifetime: 1 year. Owner revoke is the kill switch. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function getSecret(): string {
  const dedicated = process.env.SHARE_VERIFY_SECRET;
  if (dedicated && dedicated.length >= 16) return dedicated;
  // Fallback so the feature still works before SHARE_VERIFY_SECRET is wired.
  // Service role key rotation invalidates all gates — acceptable for rare event.
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (fallback && fallback.length >= 16) return `share-verify:${fallback}`;
  throw new Error("share_verify_secret_missing");
}

export function cookieNameForShare(shareId: number): string {
  return `${SHARE_VERIFY_COOKIE_PREFIX}${shareId}`;
}

/**
 * Mask an email for display: keeps first char + domain.
 * Example: "marie@loveiq.org" → "m***@loveiq.org".
 */
export function maskEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.indexOf("@");
  if (at < 1) return "***";
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at);
  const head = local.slice(0, 1);
  return `${head}***${domain}`;
}

export function signVerifyToken(shareId: number, email: string): string {
  const secret = getSecret();
  const payload = `${shareId}:${email.trim().toLowerCase()}`;
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Compare a candidate cookie value against the expected HMAC.
 * Uses constant-time comparison to prevent timing attacks.
 */
export function isVerifyTokenValid(
  cookieValue: string | undefined | null,
  shareId: number,
  expectedEmail: string
): boolean {
  if (!cookieValue || cookieValue.length === 0) return false;
  const expected = signVerifyToken(shareId, expectedEmail);
  if (cookieValue.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(cookieValue, "utf8"), Buffer.from(expected, "utf8"));
  } catch {
    return false;
  }
}

/**
 * Read the verify cookie from the incoming Request and validate it.
 * Returns true if and only if the cookie matches the expected (shareId, email).
 */
export function verifyCookieForShare(
  request: Request,
  shareId: number,
  expectedEmail: string
): boolean {
  const header = request.headers.get("cookie");
  if (!header) return false;

  const name = cookieNameForShare(shareId);
  const candidate = parseCookieValue(header, name);
  return isVerifyTokenValid(candidate, shareId, expectedEmail);
}

/**
 * Build a Set-Cookie header value to grant verified access for one share.
 * Use with `headers.append("Set-Cookie", value)` on the response.
 */
export function buildVerifyCookieHeader(shareId: number, email: string): string {
  const token = signVerifyToken(shareId, email);
  const parts = [
    `${cookieNameForShare(shareId)}=${token}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${COOKIE_MAX_AGE}`,
  ];
  if (isProduction) parts.push("Secure");
  return parts.join("; ");
}

function parseCookieValue(cookieHeader: string, name: string): string | undefined {
  // Tiny inline parser — no dependency, no regex backtracking.
  const segments = cookieHeader.split(";");
  for (const seg of segments) {
    const eq = seg.indexOf("=");
    if (eq < 0) continue;
    const key = seg.slice(0, eq).trim();
    if (key === name) return seg.slice(eq + 1).trim();
  }
  return undefined;
}
