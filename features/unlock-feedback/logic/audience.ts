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
  survey_submission?: {
    user_id?: number | null;
    duration_ms?: number | null;
    app_user?: { email?: string | null; processing_restricted_at?: string | null } | null;
    scoring_result?: ScoringRow[] | ScoringRow | null;
  } | null;
}

export type SkipReason = "restricted" | "no_email" | "test" | "no_archetype";

export type Reader = { email: string; userId: number | null; archetypeName: string };

/**
 * The reader to email, or why not. Restricted processing (Art. 18) and a missing address
 * first; then staff and runs too fast to be real, by the admin panel's own test rule (our
 * probes read staff reports, so this covers them too); then the archetype the email names,
 * as the report titles it ("The Spiritual Lover").
 */
export function readerOf(row: CandidateRow): Reader | { skip: SkipReason } {
  const sub = row.survey_submission;
  if (sub?.app_user?.processing_restricted_at) return { skip: "restricted" };
  const email = sub?.app_user?.email?.trim() ?? "";
  if (!email) return { skip: "no_email" };
  const test = evaluateTestSubmission({
    recordType: "submission",
    email,
    durationMs: sub?.duration_ms ?? null,
  });
  if (test.isLikelyTest) return { skip: "test" };
  const scoring = Array.isArray(sub?.scoring_result) ? sub.scoring_result[0] : sub?.scoring_result;
  const archetype = normalizeArchetypeName(
    scoring?.v5_primary_archetype || scoring?.primary_archetype || null
  );
  if (!archetype) return { skip: "no_archetype" };
  return { email, userId: sub?.user_id ?? null, archetypeName: `The ${archetype}` };
}
