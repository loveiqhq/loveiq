/**
 * AP › Mira's "Ratings" card (22 Nov 2026): the thank-you ask in the chat (after a 9 or 10 on
 * the recommend question, or a third thumbs-up in one chat), the ratings and words it brings,
 * and what Mira's pages show of them (features/mira/reviews.ts).
 *
 * What people did comes from the event log (review_prompt_shown, review_prompt_not_now,
 * review_given, review_withdrawn), the team's left out as everywhere on the page. What stands now
 * comes from mira_review: a withdrawn rating leaves the table, so the average and the words are
 * of the ratings that still stand. A rating counts as on Mira's pages: never the team's (address,
 * is_team, a team browser) or an under-18's.
 */
import { counts, publicReviews, REVIEWS_MIN_PEOPLE, type ReviewRow } from "@features/mira/reviews";

import type { Prepared } from "./mira";

export interface MiraReviewRow extends ReviewRow {
  user_id: string;
  created_at: string;
  reviewed_at: string | null;
}

/** The select that reads them (fetchMira). */
export const REVIEW_SELECT =
  "id,user_id,stars,quote_status,published_quote,display_name,age_range,consent_at,from_team,created_at,reviewed_at,mira_user!inner(email,is_team,minor_at)";

export interface Ratings {
  /** False when mira_review could not be read: the figures from it are then empty, not zero. */
  read: boolean;
  /** Asks shown, put off ("Not now"), ratings given and taken back, in the range. */
  asked: number;
  notNow: number;
  given: number;
  withdrawn: number;
  /** The range's ratings that still stand: their average, how many, and how many have words. */
  average: number | null;
  averaged: number;
  words: number;
  /** Quotes approved in the range (still shown), and quotes waiting for the team now. */
  approved: number;
  waiting: number;
  /**
   * What visitors see today: the people counted and approved quotes, the average shown (null:
   * nothing shows yet) and the people needed before anything does.
   */
  live: { people: number; quotes: number; average: number | null; needs: number };
}

export function ratingsOf(
  prep: Prepared,
  reviews: MiraReviewRow[] | null | undefined,
  since: number,
  until: number
): Ratings {
  const within = (at: number) => at >= since && at < until;
  const events = (name: string) => prep.events.filter((e) => e.name === name && within(e.at));
  const accounts = new Set(prep.accounts.map((a) => a.id));
  const all = reviews ?? [];
  const real = all.filter((r) => counts(r) && accounts.has(r.user_id));
  const inRange = real.filter((r) => within(Date.parse(r.created_at)));
  const shown = real.filter((r) => r.quote_status === "approved");
  const visible = publicReviews(all);
  return {
    read: reviews !== null,
    asked: events("review_prompt_shown").length,
    notNow: events("review_prompt_not_now").length,
    given: events("review_given").length,
    withdrawn: events("review_withdrawn").length,
    average: inRange.length ? inRange.reduce((n, r) => n + r.stars, 0) / inRange.length : null,
    averaged: inRange.length,
    words: inRange.filter((r) => r.quote_status !== "none").length,
    approved: shown.filter((r) => r.reviewed_at && within(Date.parse(r.reviewed_at))).length,
    waiting: real.filter((r) => r.quote_status === "pending").length,
    live: {
      people: all.filter(counts).length,
      quotes: all.filter((r) => counts(r) && r.quote_status === "approved").length,
      average: visible?.average ?? null,
      needs: REVIEWS_MIN_PEOPLE,
    },
  };
}
