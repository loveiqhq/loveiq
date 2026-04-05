export const SCORING_PENDING_WINDOW_MS = 2 * 60_000;

export const SCORING_PENDING_REASON = "Scoring pending";
export const MISSING_SCORING_REASON = "Missing scoring";

interface ScoringPendingInput {
  completedAt: string | null | undefined;
  primaryArchetype: string | null | undefined;
  recordType?: "submission" | "partial";
  status: string;
  nowMs?: number;
}

export function isScoringPendingSubmission({
  completedAt,
  primaryArchetype,
  recordType = "submission",
  status,
  nowMs = Date.now(),
}: ScoringPendingInput): boolean {
  if (recordType !== "submission" || status !== "completed" || primaryArchetype) {
    return false;
  }

  if (!completedAt) {
    return false;
  }

  const completedAtMs = new Date(completedAt).getTime();
  if (!Number.isFinite(completedAtMs)) {
    return false;
  }

  const ageMs = nowMs - completedAtMs;
  return ageMs >= 0 && ageMs < SCORING_PENDING_WINDOW_MS;
}
