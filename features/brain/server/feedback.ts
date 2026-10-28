import { teamUserIds } from "@features/admin/server/ap/team";
import { readAll } from "@features/brain/server/read-all";
import { isStaffEmail } from "@shared/env/staff-email";

/**
 * WHAT CUSTOMERS TELL US, in one call.
 *
 * The per-chapter report feedback was always reachable through query_product_data, but no
 * tool text named it, so "what do customers say" searched the written record and found
 * Trustpilot's first four reviews, which the team says came from friends.
 *
 * Read here: the thumbs up or down a reader gives a report chapter, with an optional
 * comment and issue (`report_section_feedback`), and the Trustpilot review emails the index
 * holds. Not read, and named in every answer so their absence is never taken for silence:
 * what customers write to hello@ (kept out of the brain by decision, ingest/gmail.ts),
 * Trustpilot's own review list (its API key is not set), and a satisfaction score (never
 * collected; `report_section_rating` was built for one and is empty).
 */

interface Vote {
  section_id: string;
  feedback: string;
  issue: string | null;
  comment: string | null;
  created_at: string;
  user_id?: number | null;
  app_user?: { email: string | null } | null;
}

export interface Feedback {
  votes: Vote[];
  /** The Trustpilot review emails' titles: stars, date and opening words. */
  reviews: string[];
}

/** Null when a read fails, so an outage is never read as nobody saying anything. */
export async function loadFeedback(since?: string, until?: string): Promise<Feedback | null> {
  const range =
    (since ? `&created_at=gte.${since}T00:00:00Z` : "") +
    (until ? `&created_at=lt.${nextDay(until)}T00:00:00Z` : "");
  const [votes, rows, team] = await Promise.all([
    readAll<Vote>(
      `/rest/v1/report_section_feedback?select=section_id,feedback,issue,comment,created_at,user_id,app_user(email)` +
        `${range}&order=created_at.desc,id.desc`
    ),
    // Every part of every review, however many: a long review is several parts.
    readAll<{ source_id: string; title: string }>(
      "/rest/v1/brain_chunk?select=source_id,title&source=eq.gmail" +
        "&title=like.Trustpilot%20review*&order=source_id.asc,id.asc"
    ),
    teamUserIds().catch(() => null),
  ]);
  if (!votes || !rows || !team) return null;
  // One per review email: its parts share an id before "#". Two reviews with the same title
  // (same stars, day and opening words) are still two. Newest first.
  const day = (t: string) => /\d{4}-\d{2}-\d{2}/.exec(t)?.[0] ?? "";
  const byReview = new Map(rows.map((r) => [r.source_id.split("#")[0], r.title]));
  const titles = [...byReview.values()];
  return {
    // The team's own test votes are not customers (4 of 74 on 2026-10-11): an @loveiq.org
    // address, or an account that redeemed the team's test coupon (ap_team_user, as AP).
    votes: votes.filter(
      (v) => !isStaffEmail(v.app_user?.email) && !(v.user_id != null && team.has(Number(v.user_id)))
    ),
    reviews: titles.sort((a, b) => day(b).localeCompare(day(a))),
  };
}

const nextDay = (day: string) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** Readers type these; a very long one is cut, never dropped. */
const MAX_COMMENT = 600;

export function renderFeedback(f: Feedback, period: string): string {
  const up = f.votes.filter((v) => v.feedback === "up").length;
  const down = f.votes.filter((v) => v.feedback === "down").length;
  const commented = f.votes.filter((v) => v.comment?.trim());
  const out = [
    `REPORT CHAPTER FEEDBACK, ${period}: ${f.votes.length} vote${f.votes.length === 1 ? "" : "s"}, ` +
      `${up} up and ${down} down` +
      (f.votes.length ? ` (${Math.round((up / f.votes.length) * 100)}% up)` : "") +
      `, ${commented.length} with a comment. A reader can vote on any chapter of their report, ` +
      "and say what was wrong with it. The team's own test votes are left out.",
  ];
  const chapters = new Map<string, { up: number; down: number; issues: Map<string, number> }>();
  for (const v of f.votes) {
    const c = chapters.get(v.section_id) ?? { up: 0, down: 0, issues: new Map() };
    if (v.feedback === "up") c.up += 1;
    else if (v.feedback === "down") c.down += 1;
    if (v.issue) c.issues.set(v.issue, (c.issues.get(v.issue) ?? 0) + 1);
    chapters.set(v.section_id, c);
  }
  if (chapters.size) {
    out.push("", "By chapter, most votes first:");
    for (const [id, c] of [...chapters].sort(
      ([, a], [, b]) => b.up + b.down - (a.up + a.down) || b.down - a.down
    )) {
      const issues = [...c.issues].map(([issue, n]) => `${issue} ${n}`).join(", ");
      out.push(`- ${id}: ${c.up} up, ${c.down} down${issues ? ` (said: ${issues})` : ""}`);
    }
  }
  if (commented.length) {
    out.push("", "Their comments, newest first:");
    for (const v of commented) {
      const text = v.comment!.replace(/\s+/g, " ").trim();
      out.push(
        `- ${v.created_at.slice(0, 10)}, ${v.section_id}, ${v.feedback}` +
          `${v.issue ? ` (${v.issue})` : ""}: "${text.length > MAX_COMMENT ? `${text.slice(0, MAX_COMMENT)}…` : text}"`
      );
    }
  }
  out.push(
    "",
    `TRUSTPILOT REVIEWS that reached our mail, all time: ${f.reviews.length}` +
      (f.reviews.length ? "" : "."),
    ...f.reviews.map((t) => `- ${t}`),
    "",
    "NOT HERE: a satisfaction or NPS score (never collected); what customers write to " +
      "hello@, the contact form included (kept out of Jarvis by decision); Trustpilot's own " +
      "list of reviews (not connected until TRUSTPILOT_API_KEY is set); and calls with " +
      "therapists and coaches, which are Notion's 'Feedback Sessions' (search_company_context " +
      'with sources ["notion"]).'
  );
  return out.join("\n");
}
