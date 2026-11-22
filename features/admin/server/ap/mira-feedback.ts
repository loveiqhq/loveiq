/**
 * AP-Analytics, Mira (beta): "Beta feedback" (decision 11, 22 Nov 2026). /mira/feedback promises
 * "Every answer is read by our team", so the answers are listed here for the team: newest first,
 * with the day (Berlin, as everywhere in AP) and the person's own words (the challenges they
 * ticked, their wish, their other ideas), and their address only where they ticked "You may email
 * me". The team's own are left out by the page's rules (Prepared.personOf). Read from mira_event
 * (`feedback`), where an answer stays 12 months and goes with the person's account.
 */
import { reportingDay } from "@shared/time/reporting-day";

import { fetchAllRows } from "../supabase";
import type { Prepared } from "./mira";

export interface MiraFeedbackRow {
  anon_id: string | null;
  user_id: string | null;
  created_at: string;
  props: Record<string, unknown> | null;
}

export interface FeedbackItem {
  day: string;
  challenges: string[];
  wish: string | null;
  other: string | null;
  /** Only when the person said we may email them about their feedback. */
  email: string | null;
}

/**
 * Every feedback, newest first; null when it could not be read, which the card says.
 * ponytail: every answer, read whole; page it by the range in SQL if the beta's answers ever
 * number in the thousands.
 */
export function fetchFeedback(): Promise<MiraFeedbackRow[] | null> {
  return fetchAllRows<MiraFeedbackRow>(
    "/rest/v1/mira_event?name=eq.feedback&select=anon_id,user_id,created_at,props&order=id.desc"
  ).catch(() => null);
}

const words = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

/** The answers sent in the range (`since` to `until`, ms), newest first; null: not readable. */
export function feedbackOf(
  rows: MiraFeedbackRow[] | null | undefined,
  prep: Prepared,
  since: number,
  until: number
): FeedbackItem[] | null {
  if (rows === null) return null;
  return (rows ?? [])
    .map((r) => ({ r, at: Date.parse(r.created_at), p: r.props ?? {} }))
    .filter(({ r, at, p }) => {
      if (!(at >= since && at < until)) return false;
      const team = p.team === true ? { team: true as const } : {};
      return prep.personOf({ anon_id: r.anon_id, user_id: r.user_id, ...team }) !== null;
    })
    .sort((a, b) => b.at - a.at)
    .map(({ at, p }) => ({
      day: reportingDay(new Date(at)),
      challenges: Array.isArray(p.challenges)
        ? p.challenges.filter((c): c is string => typeof c === "string")
        : [],
      wish: words(p.wish),
      other: words(p.other),
      email: p.mayEmail === true ? words(p.email) : null,
    }));
}
