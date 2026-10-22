import { evaluateTestSubmission } from "@features/admin/server/test-submission";
import { normalizeArchetypeName } from "@features/report/server/archetypeSlug";

import { UNLOCK_FEEDBACK_FROM } from "./launch";

/**
 * Who the unlock-feedback email goes to, as far as the report's own row can say. The checks
 * that need another lookup (a paid plan, the suppression list, an earlier email to the same
 * person) are the cron's, after these.
 */

const HOUR_MS = 3_600_000;

/** The reports one run looks at: created 3 to 5 hours ago, and never before the launch. */
export function candidateWindow(nowMs: number): { from: string; to: string } | null {
  const from = Math.max(nowMs - 5 * HOUR_MS, Date.parse(UNLOCK_FEEDBACK_FROM));
  const to = nowMs - 3 * HOUR_MS;
  return from <= to ? { from: new Date(from).toISOString(), to: new Date(to).toISOString() } : null;
}

interface ScoringRow {
  primary_archetype?: string | null;
  v5_primary_archetype?: string | null;
}

/** A personal_report row as the cron reads it, with its submission, owner and scoring. */
export interface CandidateRow {
  id: number;
  survey_submission_id: number;
  /** When the report was made: the tranche pages back through reports by it. */
  created_date_time?: string | null;
  survey_submission?: {
    user_id?: number | null;
    duration_ms?: number | null;
    app_user?: {
      email?: string | null;
      first_name?: string | null;
      processing_restricted_at?: string | null;
    } | null;
    scoring_result?: ScoringRow[] | ScoringRow | null;
  } | null;
}

export type SkipReason = "restricted" | "no_email" | "test" | "no_archetype";

export type Reader = {
  email: string;
  userId: number | null;
  archetypeName: string;
  /** The greeting's name (greetingName); null gives "Hi there,". */
  firstName: string | null;
};

/**
 * The reader to email, or why not. Restricted processing (Art. 18) and a missing address
 * first; then staff and runs too fast to be real, by the admin panel's own test rule (our
 * probes read staff reports, so this covers them too), unless this is the admin's own test;
 * then the archetype the email names, as the report titles it ("The Spiritual Lover").
 */
export function readerOf(
  row: CandidateRow,
  opts: { staffTest?: boolean } = {}
): Reader | { skip: SkipReason } {
  const sub = row.survey_submission;
  if (sub?.app_user?.processing_restricted_at) return { skip: "restricted" };
  const email = sub?.app_user?.email?.trim() ?? "";
  if (!email) return { skip: "no_email" };
  const test = evaluateTestSubmission({
    recordType: "submission",
    email,
    durationMs: sub?.duration_ms ?? null,
  });
  if (test.isLikelyTest && !opts.staffTest) return { skip: "test" };
  const scoring = Array.isArray(sub?.scoring_result) ? sub.scoring_result[0] : sub?.scoring_result;
  const archetype = normalizeArchetypeName(
    scoring?.v5_primary_archetype || scoring?.primary_archetype || null
  );
  if (!archetype) return { skip: "no_archetype" };
  return {
    email,
    userId: sub?.user_id ?? null,
    archetypeName: `The ${archetype}`,
    firstName: greetingName(sub?.app_user?.first_name),
  };
}

/**
 * The name the email greets, from what the reader typed as their first name: its first word,
 * without a trailing full stop, in Title Case when they typed it all in lower or upper case
 * ("ANA" and "ana" read "Ana"). Initials ("J", "JD"), digits, an @ or an underscore are no
 * name, and the email says "Hi there,". On 22.10 one in five readers' names needed this.
 */
export function greetingName(raw: string | null | undefined): string | null {
  const word = (raw ?? "").trim().split(/\s+/)[0]!.replace(/\.+$/, "");
  if (!word || /[\d@_]/.test(word)) return null;
  const lower = word.toLowerCase();
  const upper = word.toUpperCase();
  // Scripts without case (Chinese, Japanese) have one-character names; Latin ones have initials.
  const cased = lower !== upper;
  if (cased && (word.length === 1 || (word.length === 2 && word === upper))) return null;
  if (word !== lower && word !== upper) return word;
  return lower.replace(
    /(^|[-'’])(\p{L})/gu,
    (_m, before: string, letter: string) => before + letter.toUpperCase()
  );
}
