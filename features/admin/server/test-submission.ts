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

const TEST_DURATION_THRESHOLD_MS = 60_000;
const PARTIAL_MIN_ANSWERS_REAL = 5;

let cachedRegex: RegExp | null | undefined;

/**
 * Returns the configured staff email regex, or null when unset/invalid.
 * Source: env ADMIN_TEST_EMAIL_REGEX, default `^.+@loveiq\.org$`.
 */
export function getTestEmailRegex(): RegExp | null {
  if (cachedRegex !== undefined) return cachedRegex;
  const raw = process.env.ADMIN_TEST_EMAIL_REGEX ?? "^.+@loveiq\\.org$";
  if (!raw.trim()) {
    cachedRegex = null;
    return cachedRegex;
  }
  try {
    // The pattern comes from server-side env (ADMIN_TEST_EMAIL_REGEX) and
    // is only matched against email strings — no untrusted input.
    // eslint-disable-next-line security/detect-non-literal-regexp
    cachedRegex = new RegExp(raw, "i");
  } catch {
    cachedRegex = null;
  }
  return cachedRegex;
}

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
  const regex = getTestEmailRegex();
  if (regex && input.email && regex.test(input.email)) {
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

/** Reset the cached regex — for tests only. */
export function __resetTestEmailRegexForTests(): void {
  cachedRegex = undefined;
}
