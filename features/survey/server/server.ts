import { getBreaker } from "@shared/http/circuit-breaker";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";
import { getScoringConfig, scoreArchetypes, type ScoringResult } from "@features/scoring/logic";
import type { SurveyAnswers } from "./types";

const SUPABASE_TIMEOUT_MS = 8000;

export interface SurveySubmissionPayload {
  email: string;
  firstName: string;
  answers: SurveyAnswers;
  startedAt: string;
  durationMs: number;
  utmTracker?: string | null;
  sessionId?: string | null;
}

export interface SurveyScoringSummary {
  primaryArchetype: string;
  v5PrimaryArchetype: string | null;
}

export interface SubmitSurveyOnceResult {
  submissionId: number;
  isExisting: boolean;
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("supabase_not_configured");
  }

  return { url, serviceRoleKey };
}

async function supabaseServiceFetch(
  path: string,
  options: {
    method?: string;
    body?: string;
    headers?: Record<string, string>;
    timeoutMs?: number;
  } = {}
) {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const { method = "GET", body, headers = {}, timeoutMs = SUPABASE_TIMEOUT_MS } = options;

  return getBreaker("supabase").fire(() =>
    fetchWithTimeout(`${url}${path}`, {
      method,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        ...headers,
      },
      body,
      timeoutMs,
    })
  );
}

function buildScoringSummary(scoringResult: ScoringResult | null): SurveyScoringSummary | null {
  if (!scoringResult) return null;

  return {
    primaryArchetype: scoringResult.primaryArchetype,
    v5PrimaryArchetype: scoringResult.v5?.primaryArchetype ?? null,
  };
}

export function computeSurveyScoring(answers: SurveyAnswers): ScoringResult | null {
  try {
    const config = getScoringConfig();
    return scoreArchetypes(config, answers);
  } catch (err) {
    logger.error({ err }, "Scoring error - submission saved without score");
    return null;
  }
}

export async function fetchSubmissionBySessionId(sessionId: string | null | undefined) {
  if (!sessionId) return null;

  const response = await supabaseServiceFetch(
    `/rest/v1/survey_submission?session_id=eq.${encodeURIComponent(sessionId)}&select=id,status&limit=1`
  );

  if (!response.ok) {
    throw new Error("survey_submission_lookup_failed");
  }

  const rows = (await response.json()) as Array<{ id: number; status: string }>;
  return rows[0] ?? null;
}

async function runSubmitSurveyRpc(payload: SurveySubmissionPayload) {
  const response = await supabaseServiceFetch("/rest/v1/rpc/submit_survey", {
    method: "POST",
    body: JSON.stringify({
      p_email: payload.email,
      p_first_name: payload.firstName,
      p_answers: payload.answers,
      p_started_at: payload.startedAt,
      p_duration_ms: payload.durationMs,
      p_utm_tracker: payload.utmTracker || null,
      p_session_id: payload.sessionId || null,
    }),
  });

  if (!response.ok) {
    logger.error({ status: response.status }, "Supabase survey RPC failed");
    throw new Error("submit_survey_rpc_failed");
  }

  const rpcResult = await response.json();
  if (rpcResult?.success === false) {
    logger.error({ error: rpcResult.error }, "Survey RPC returned failure");
    throw new Error("submit_survey_rpc_rejected");
  }

  if (typeof rpcResult === "number") return rpcResult;
  if (typeof rpcResult?.submission_id === "number") return rpcResult.submission_id;

  throw new Error("submit_survey_rpc_missing_submission_id");
}

export async function submitSurveyOnce(
  payload: SurveySubmissionPayload
): Promise<SubmitSurveyOnceResult> {
  const existing = await fetchSubmissionBySessionId(payload.sessionId);
  if (existing) {
    return { submissionId: existing.id, isExisting: true };
  }

  const submissionId = await runSubmitSurveyRpc(payload);
  return { submissionId, isExisting: false };
}

/**
 * Persists the Hotjar user_id (parsed client-side from the
 * `_hjSessionUser_<siteid>` cookie) onto the submission row so admins can
 * deep-link to recordings. Best-effort: a failure here is logged and
 * swallowed — never block survey completion on optional analytics metadata.
 */
export async function setSubmissionHotjarUserId(
  submissionId: number,
  hotjarUserId: string
): Promise<void> {
  try {
    const response = await supabaseServiceFetch(
      `/rest/v1/survey_submission?id=eq.${submissionId}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ hotjar_user_id: hotjarUserId }),
        timeoutMs: 3000,
      }
    );
    if (!response.ok) {
      logger.warn(
        { submissionId, status: response.status },
        "Failed to persist hotjar_user_id on submission"
      );
    }
  } catch (err) {
    logger.warn({ err, submissionId }, "Error setting hotjar_user_id");
  }
}

export async function fetchScoringSummary(
  submissionId: number
): Promise<SurveyScoringSummary | null> {
  const response = await supabaseServiceFetch(
    `/rest/v1/scoring_result?survey_submission_id=eq.${submissionId}&select=primary_archetype,v5_primary_archetype&limit=1`
  );

  if (!response.ok) {
    throw new Error("scoring_result_lookup_failed");
  }

  const rows = (await response.json()) as Array<{
    primary_archetype: string;
    v5_primary_archetype: string | null;
  }>;

  if (rows.length === 0) return null;

  // rows.length > 0 checked above.
  return {
    primaryArchetype: rows[0]!.primary_archetype,
    v5PrimaryArchetype: rows[0]!.v5_primary_archetype ?? null,
  };
}

async function storeScoringResult(submissionId: number, scoringResult: ScoringResult) {
  const response = await supabaseServiceFetch(
    "/rest/v1/scoring_result?on_conflict=survey_submission_id",
    {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        survey_submission_id: submissionId,
        engine_version: scoringResult.v5 ? "v4+v5" : "v4",
        primary_archetype: scoringResult.primaryArchetype,
        percentages: scoringResult.percent,
        raw_scores: scoringResult.rawScore,
        diagnostics: scoringResult.diagnostics,
        v5_primary_archetype: scoringResult.v5?.primaryArchetype ?? null,
        v5_percentages: scoringResult.v5?.finalPct ?? null,
        v5_raw_scores: scoringResult.v5?.rawTotal ?? null,
        v5_diagnostics: scoringResult.v5
          ? {
              rawPct: scoringResult.v5.rawPct,
              ranking: scoringResult.v5.ranking,
              anchors: scoringResult.v5.diagnostics.anchors,
              gaps: scoringResult.v5.diagnostics.gaps,
              payloadFingerprint: scoringResult.v5.diagnostics.payloadFingerprint,
            }
          : null,
      }),
      timeoutMs: 5000,
    }
  );

  if (!response.ok) {
    logger.error({ status: response.status }, "Failed to store scoring result");
    throw new Error("store_scoring_result_failed");
  }
}

export async function ensureSubmissionScored(
  submissionId: number,
  answers: SurveyAnswers,
  precomputedScoring?: ScoringResult | null
): Promise<SurveyScoringSummary | null> {
  try {
    const existingSummary = await fetchScoringSummary(submissionId);
    if (existingSummary) return existingSummary;
  } catch (err) {
    logger.error({ err, submissionId }, "Unable to look up existing scoring result");
  }

  const scoringResult = precomputedScoring ?? computeSurveyScoring(answers);
  const scoringSummary = buildScoringSummary(scoringResult);

  if (!scoringResult) {
    return null;
  }

  try {
    await storeScoringResult(submissionId, scoringResult);
  } catch (err) {
    logger.error({ err, submissionId }, "Error storing scoring result");
  }

  return scoringSummary;
}
