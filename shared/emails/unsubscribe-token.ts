import { createHmac, timingSafeEqual } from "crypto";

// [Audit L5] New tokens embed a base36 creation timestamp and expire after this
// window, so a leaked/archived unsubscribe link can't be replayed forever.
// Long enough that legitimate mail-client one-click unsubscribe still works on
// recent sends; short enough to bound stale-archive replay.
const TOKEN_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 days

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

function safeEqual(expectedB64: string, actualB64: string): boolean {
  const expected = Buffer.from(expectedB64);
  const actual = Buffer.from(actualB64);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export function generateUnsubscribeToken(email: string, secret: string): string {
  const encoded = Buffer.from(email).toString("base64url");
  const ts = Date.now().toString(36);
  const sig = sign(`${email}:${ts}`, secret);
  return `${encoded}.${ts}.${sig}`;
}

export function verifyUnsubscribeToken(token: string, secret: string): string | null {
  // base64url (email), base36 (ts) and base64url (sig) never contain ".", so
  // splitting on "." is unambiguous.
  const parts = token.split(".");
  try {
    if (parts.length === 3) {
      // Current format: encoded.ts.sig — signed over "email:ts" with a TTL.
      const [encoded, ts, sig] = parts;
      if (!encoded || !ts || !sig) return null;
      const email = Buffer.from(encoded, "base64url").toString("utf8");
      if (!safeEqual(sign(`${email}:${ts}`, secret), sig)) return null;
      const issuedAt = parseInt(ts, 36);
      if (!Number.isFinite(issuedAt) || issuedAt <= 0) return null;
      if (Date.now() - issuedAt > TOKEN_TTL_MS) return null;
      return email;
    }
    if (parts.length === 2) {
      // Legacy format: encoded.sig — signed over "email" only, no expiry. Still
      // accepted so one-click unsubscribe links already in recipients' inboxes
      // keep working during the transition. [Audit L5]
      const [encoded, sig] = parts;
      if (!encoded || !sig) return null;
      const email = Buffer.from(encoded, "base64url").toString("utf8");
      if (!safeEqual(sign(email, secret), sig)) return null;
      return email;
    }
    return null;
  } catch {
    return null;
  }
}

export function buildUnsubscribeUrl(email: string, siteUrl: string, secret: string): string {
  const token = generateUnsubscribeToken(email, secret);
  return `${siteUrl}/api/unsubscribe?token=${encodeURIComponent(token)}`;
}
