/**
 * Detection of "test" submissions for the admin bulk-delete tool.
 *
 * A submission is considered a test when ANY of these holds:
 *   - Completed with duration_ms <= 60_000 (≤ 60s end-to-end)
 *   - Partial with < 5 answers AND saved_at - started_at <= 60_000
 *   - Email matches the staff allowlist regex (default: ^.+@loveiq\.org$)
 *
 * Server is the source of truth. The UI can render the same flag, but the
 * bulk-delete endpoint re-checks every id before deleting.
 */

import { isStaffEmail } from "@shared/env/staff-email";

const TEST_DURATION_THRESHOLD_MS = 60_000;
const PARTIAL_MIN_ANSWERS_REAL = 5;

/**
 * The staff-email rule moved to `shared/env/staff-email.ts` when payments
 * started using it too — it decides revenue classification now, not just which
 * submissions the bulk-delete tool offers to remove. Re-exported here so the
 * existing admin call sites keep their import.
 */
export {
  getStaffEmailRegex as getTestEmailRegex,
  __resetStaffEmailRegexForTests as __resetTestEmailRegexForTests,
} from "@shared/env/staff-email";

export interface TestEvalInput {
  recordType: "submission" | "partial";
  email: string | null | undefined;
  durationMs: number | null | undefined;
  /** Partial only: number of answers saved so far. */
  answerCount?: number | null;
  /** Partial only: ISO start_at. */
  startedAt?: string | null;
  /** Partial only: ISO saved_at (or now()). */
  savedAt?: string | null;
}

export interface TestEvalResult {
  isLikelyTest: boolean;
  reasons: string[];
}

export function evaluateTestSubmission(input: TestEvalInput): TestEvalResult {
  const reasons: string[] = [];
  if (isStaffEmail(input.email)) {
    reasons.push("staff_email");
  }

  if (input.recordType === "submission") {
    if (typeof input.durationMs === "number" && input.durationMs <= TEST_DURATION_THRESHOLD_MS) {
      reasons.push("short_duration");
    }
  } else {
    const answers = input.answerCount ?? 0;
    const start = input.startedAt ? Date.parse(input.startedAt) : NaN;
    const saved = input.savedAt ? Date.parse(input.savedAt) : NaN;
    if (
      answers < PARTIAL_MIN_ANSWERS_REAL &&
      Number.isFinite(start) &&
      Number.isFinite(saved) &&
      saved - start <= TEST_DURATION_THRESHOLD_MS
    ) {
      reasons.push("short_partial");
    }
  }

  return {
    isLikelyTest: reasons.length > 0,
    reasons,
  };
}
