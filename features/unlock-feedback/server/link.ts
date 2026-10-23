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

/**
 * The cookie that carries the token from the email's link to the /why page's posts. The link
 * (`/api/unlock-feedback/open`) sets it and redirects to `/why?r=<reason>`, so the token is in
 * no page URL, referrer or analytics payload. httpOnly, scoped to the two routes that read it,
 * and short: the page posts its answer as it loads.
 */
export const LINK_COOKIE = "uf_t";
export const LINK_COOKIE_PATH = "/api/unlock-feedback";
export const LINK_COOKIE_MAX_AGE_S = 60 * 60;

/** What a link's `t` must look like before it is worth a lookup: 43 base64url characters. */
export function isLinkTokenShape(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}
