/**
 * Mira's ratings and quotes (22 Nov 2026): what a signed-in person may share after a good moment
 * in the chat, and what her pages may show of it. Pure, so the browser and the server share it
 * (server/reviews.ts reads and writes the table, supabase/migrations/20261122080000).
 *
 * Nothing shows until it is real (Eman, 21 Nov 2026: the first version showed sample figures and
 * went). Invented or unchecked reviews are banned outright in Germany (UWG Annex Nos. 23b, 23c),
 * and pages that show reviews must say whether and how they check them (UWG §5b(3)): the "How we
 * check reviews" note beside every rating says it.
 */
import { isStaffEmail } from "@shared/env/staff-email";

/**
 * Nothing shows until this many different people have rated Mira (one rating per account; the
 * team's and under-18s' never count). Below about 20 an average moves a whole point with one
 * person's rating and "rated by 3 people" reads as sparse or staged; at 20 the one decimal shown
 * means something.
 */
export const REVIEWS_MIN_PEOPLE = 20;

/**
 * The version of the consent to show a person's words (ui/reviews/ReviewAsk.tsx has its text).
 * Bump it whenever that text changes; the table keeps the version each person agreed to.
 */
export const REVIEW_CONSENT_VERSION = "mira-review-2026-11-22";

/** One sentence; a first name or initials. */
export const QUOTE_MAX = 160;
export const NAME_MAX = 24;
/** Letters, spaces, dots, hyphens and apostrophes: a name or initials, never an address or link. */
export const NAME_PATTERN = /^\p{L}[\p{L}\p{M} .'’-]*$/u;

export const AGE_RANGES = ["18-24", "25-34", "35-44", "45-54", "55+"] as const;
export type AgeRange = (typeof AGE_RANGES)[number];

/** A rating as the public figures read it (server/reviews.ts selects exactly these columns). */
export type ReviewRow = {
  id: number;
  stars: number;
  quote_status: "none" | "pending" | "approved" | "rejected";
  /** The words as approved (identifying details taken out, marked […]); null until approved. */
  published_quote: string | null;
  display_name: string | null;
  age_range: string | null;
  /** When the person agreed to show their words; null: no words to show. */
  consent_at: string | null;
  /** Sent from a team browser (shared/http/team-cookie.ts). */
  from_team: boolean;
  mira_user: { email: string; is_team: boolean; minor_at: string | null } | null;
};

export type PublicQuote = { text: string; name: string; age: string | null };
export type PublicReviews = { average: number; people: number; quotes: PublicQuote[] };

/** "25-34" as people read it: "25–34". */
export const ageLabel = (age: string | null): string | null => age?.replace("-", "–") ?? null;

/**
 * A rating that counts: a real person's. Never the team's (a team address, an account marked
 * from a team browser, or one sent from a team browser), never someone who said they are under 18.
 */
export const counts = (r: ReviewRow): boolean =>
  !r.from_team &&
  r.mira_user !== null &&
  !r.mira_user.is_team &&
  !r.mira_user.minor_at &&
  !isStaffEmail(r.mira_user.email);

/**
 * What Mira's pages may show: the average and how many people, and the approved quotes, or
 * null until REVIEWS_MIN_PEOPLE people count and at least one quote is approved.
 */
export function publicReviews(all: ReviewRow[]): PublicReviews | null {
  const rows = all.filter(counts);
  if (rows.length < REVIEWS_MIN_PEOPLE) return null;
  const quotes = rows
    .filter(
      (r) => r.quote_status === "approved" && r.consent_at && r.published_quote && r.display_name
    )
    .map((r) => ({
      text: r.published_quote!,
      name: r.display_name!,
      age: ageLabel(r.age_range),
    }));
  if (quotes.length === 0) return null;
  const average = rows.reduce((sum, r) => sum + r.stars, 0) / rows.length;
  return { average: Math.round(average * 10) / 10, people: rows.length, quotes };
}

/** What a page shows today: the figures, one quote, and initials for the faces. */
export type TodaysReviews = {
  average: number;
  people: number;
  quote: PublicQuote;
  /** Up to three quoted people's initials, today's quote's first: the board's faces, as letters. */
  initials: string[];
};

/** "Lea M." → "LM", "ana" → "A". */
const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/** The mark where the team took out something that could identify someone. */
export const CUT = "[…]";

/**
 * The words the team may publish: the person's own, with any parts that could identify someone
 * replaced by a visible […] ("[...]" typed is the same mark), as the consent allows. Anything
 * else (a word dropped or added, a mark where nothing was taken out) is null: we never edit.
 */
export function redacted(original: string, edited: string): string | null {
  const text = edited.trim().replaceAll("[...]", CUT);
  const parts = text.split(CUT);
  if (parts.length === 1) return text === original ? text : null;
  // Two marks side by side, or nothing of the person's words left.
  if (parts.slice(1, -1).includes("") || !parts.some((p) => p.trim())) return null;
  let at = 0;
  for (const [i, part] of parts.entries()) {
    // Each part is the person's own text, in order, with something taken out before it.
    const found =
      i === 0
        ? original.startsWith(part)
          ? 0
          : -1
        : i === parts.length - 1
          ? original.endsWith(part)
            ? original.length - part.length
            : -1
          : original.indexOf(part, at + 1);
    if (found < 0 || (i > 0 && found <= at)) return null;
    at = found + part.length;
  }
  return text;
}

/** One approved quote a day (UTC), each in turn. */
export function forToday(pub: PublicReviews, now: Date): TodaysReviews {
  const day = Math.floor(now.getTime() / 86_400_000);
  const quote = pub.quotes[day % pub.quotes.length]!;
  const initials = [...new Set([quote, ...pub.quotes].map((q) => initialsOf(q.name)))];
  return { average: pub.average, people: pub.people, quote, initials: initials.slice(0, 3) };
}
