/**
 * Short links for the AI influencer pilot (Seedlane, from 2026-10-30).
 *
 * `loveiq.org/<code>` opens the landing page tagged like the pilot's long links, so a DM or a
 * comment can carry seven characters instead of a long tagged address. Seedlane creates the
 * links through `/api/short-links` and keeps its own notes on each one (who a DM went to, the
 * post): those stay in `short_link.meta` and never reach the address. The code itself rides
 * along as `utm_term`, so a finished survey or a payment joins back to its link.
 *
 * Pure: shared by the API route and proxy.ts, which answers the redirect.
 */

export const PLATFORMS = ["tiktok", "instagram", "facebook", "linkedin"] as const;
/** Where the link sits. `ad` is a promoted post, and the only paid one. */
export const PLACEMENTS = ["bio", "dm", "comment", "ad"] as const;
export type Platform = (typeof PLATFORMS)[number];
export type Placement = (typeof PLACEMENTS)[number];

export interface ShortLinkFields {
  /** The influencer's name as the campaign carries it: mila, elena, jonas, nora. */
  influencer: string;
  platform: Platform;
  placement: Placement;
}

/** Letters and digits without the look-alikes l, o, 0 and 1, so a retyped code survives. */
// eslint-disable-next-line no-secrets/no-secrets -- the code alphabet, not a secret
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
const DIGITS = "23456789";
export const CODE_LENGTH = 7;

/**
 * The code a request path names, or null. Seven letters or digits, at least one of them a
 * digit: /imprint and /cookies are seven letters too, and without the digit every request for
 * them would be looked up as a link first. Case-insensitive, because people retype codes.
 */
export function shortCodeOf(pathname: string): string | null {
  const code = /^\/([a-z0-9]{7})$/i.exec(pathname)?.[1];
  return code && /\d/.test(code) ? code.toLowerCase() : null;
}

/**
 * A new random code, always holding a digit (see shortCodeOf). 32 symbols divide 256 evenly,
 * so every byte maps without bias; 32^7 is about 34 billion codes.
 */
export function newShortCode(
  random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))
): string {
  const bytes = Array.from(random(CODE_LENGTH + 1));
  const code = bytes
    .slice(0, CODE_LENGTH)
    .map((b) => ALPHABET.charAt(b % 32))
    .join("");
  return /\d/.test(code) ? code : code.slice(0, -1) + DIGITS.charAt((bytes[CODE_LENGTH] ?? 0) % 8);
}

/** Where a link sends people: the landing page on `base`'s host, tagged. */
export function shortLinkTarget(link: ShortLinkFields, code: string, base: string): URL {
  const url = new URL("/", base);
  url.search = new URLSearchParams({
    utm_source: link.platform,
    utm_medium: link.placement === "ad" ? "paid_social" : "social",
    utm_campaign: `ai_${link.influencer}`,
    utm_content: link.placement,
    utm_term: code,
  }).toString();
  return url;
}

/** The address people are given: the site without "www.", e.g. https://loveiq.org/k3x9p2a. */
export function shortLinkUrl(code: string, site: string): string {
  const { protocol, host } = new URL(site);
  return `${protocol}//${host.replace(/^www\./, "")}/${code}`;
}
