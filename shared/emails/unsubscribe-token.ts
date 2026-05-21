import { createHmac, timingSafeEqual } from "crypto";

function sign(email: string, secret: string): string {
  return createHmac("sha256", secret).update(email).digest("base64url");
}

export function generateUnsubscribeToken(email: string, secret: string): string {
  const encoded = Buffer.from(email).toString("base64url");
  const sig = sign(email, secret);
  return `${encoded}.${sig}`;
}

export function verifyUnsubscribeToken(token: string, secret: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  try {
    const email = Buffer.from(token.slice(0, dot), "base64url").toString("utf8");
    const expected = Buffer.from(sign(email, secret));
    const actual = Buffer.from(token.slice(dot + 1));
    if (expected.length !== actual.length) return null;
    if (!timingSafeEqual(expected, actual)) return null;
    return email;
  } catch {
    return null;
  }
}

export function buildUnsubscribeUrl(email: string, siteUrl: string, secret: string): string {
  const token = generateUnsubscribeToken(email, secret);
  return `${siteUrl}/api/unsubscribe?token=${encodeURIComponent(token)}`;
}
