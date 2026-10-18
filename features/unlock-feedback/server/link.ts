import { createHash, randomBytes } from "node:crypto";

/**
 * The token in an unlock-feedback email's links (`/why?r=<reason>&t=<token>`): 32 random bytes,
 * base64url. It is the reader's key to their /why page, so the database keeps only its sha256
 * (`unlock_feedback.link_hash`) and a leaked table opens nothing.
 */
export function newLinkToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashLinkToken(token) };
}

export function hashLinkToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** What a link's `t` must look like before it is worth a lookup: 43 base64url characters. */
export function isLinkTokenShape(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}
