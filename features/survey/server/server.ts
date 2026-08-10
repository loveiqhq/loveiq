import { getBreaker } from "@shared/http/circuit-breaker";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";
import {
  getScoringConfig,
  getScoringConfigSha,
  scoreArchetypes,
  type ScoringResult,
} from "@features/scoring/logic";
import type { SurveyAnswers } from "./types";

const SUPABASE_TIMEOUT_MS = 8000;

/**
 * T-11: GDPR Art. 7(1) consent versioning. Bumped whenever the Q16015
 * marketing-opt-in copy changes (in `data/survey-source.csv`). Stored on
 * `survey_submission.marketing_opt_in_terms_version` so a regulator inquiry
 * can map a user's "yes" back to the exact text they consented to.
 *
 * Format: ISO date of the copy change. To bump, change the constant AND
 * update `data/survey-source.csv` in the same commit.
 */
export const MARKETING_OPT_IN_TERMS_VERSION = "2026-05-21";

/**
 * Audit M2: GDPR Art. 5(2)/9(2)(a) accountability. Version of the consent terms
 * shown on the survey ConsentScreen (age confirmation + terms acceptance).
 * Stored on `survey_submission.terms_version` alongside `consent_at` so a
 * regulator inquiry can map a submission back to the exact consent text the data
 * subject agreed to. Bump (ISO date) whenever the ConsentScreen copy / linked
 * terms change.
 */
export const CONSENT_TERMS_VERSION = "2026-06-04";

export interface SurveySubmissionPayload {
  email: string;
  firstName: string;
  answers: SurveyAnswers;
  startedAt: string;
  durationMs: number;
  utmTracker?: string | null;
  sessionId?: string | null;
  /**
   * Marketing-opt-in answer (Q16015). `true` = user picked "Yes", `false` =
   * "No", `null` (or absent) = unknown / question not answered. Stored on
   * `survey_submission.marketing_opt_in`; when true, the row also gets a
   * `marketing_opt_in_at = now()` timestamp set inside the RPC.
   */
  marketingOptIn?: boolean | null;
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
      p_marketing_opt_in: payload.marketingOptIn ?? null,
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

  // Audit M2 + T-11: stamp consent-accountability fields as a follow-up PATCH
  // (keeps the submit_survey RPC body — with answer_options / answer_history
  // fan-out — untouched). consent_at + terms_version are recorded on EVERY
  // submission: the survey UI hard-gates submission behind the age + terms
  // checkboxes, so a stored submission implies consent, and persisting an
  // explicit timestamp + terms version closes the GDPR Art. 5(2) accountability
  // gap (proving WHICH terms were agreed to, and when). The marketing-opt-in
  // terms version is added only when the user opted in. Best-effort: a failure
  // is logged and swallowed — the submission itself already succeeded and the
  // audit-trail gap can be backfilled if needed.
  try {
    const consentPatch: Record<string, string> = {
      consent_at: new Date().toISOString(),
      terms_version: CONSENT_TERMS_VERSION,
    };
    if (payload.marketingOptIn === true) {
      consentPatch.marketing_opt_in_terms_version = MARKETING_OPT_IN_TERMS_VERSION;
    }
    await supabaseServiceFetch(`/rest/v1/survey_submission?id=eq.${submissionId}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(consentPatch),
      timeoutMs: 3000,
    });
  } catch (err) {
    logger.warn(
      { err, submissionId, termsVersion: CONSENT_TERMS_VERSION },
      "Audit M2 / T-11: failed to stamp consent fields"
    );
  }

  return { submissionId, isExisting: false };
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
        config_sha: getScoringConfigSha(),
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

// Survey-closed enforcement (F-04). Reads `survey.status` and caches the
// answer in-process for 30 s so concurrent submissions don't each hit
// Supabase. Fails OPEN: any Supabase error returns `false` (allow the
// submission) — never block users on infra trouble; the admin still has
// the toggle for next time.
const SURVEY_STATUS_CACHE_MS = 30_000;
// Shorter TTL applied when the Supabase fetch fails. Prevents a sustained
// outage from adding the per-request 2s timeout to every survey submission
// while still letting the gate recover within seconds once Supabase returns.
const SURVEY_STATUS_FAIL_OPEN_TTL_MS = 5_000;
let surveyStatusCache: { closed: boolean; expiresAt: number } | null = null;

// Test-only: clear the in-process cache between assertions. NOT for prod code.
// Pass a boolean to pre-populate the cache with a known value (avoids hitting
// the Supabase mock for tests that don't care about the gate). Pass nothing
// (or undefined) to fully invalidate so the next call refetches.
export function __resetSurveyStatusCacheForTests(closed?: boolean): void {
  if (closed === undefined) {
    surveyStatusCache = null;
    return;
  }
  surveyStatusCache = { closed, expiresAt: Date.now() + SURVEY_STATUS_CACHE_MS };
}

export async function isSurveyClosed(): Promise<boolean> {
  const now = Date.now();
  if (surveyStatusCache && surveyStatusCache.expiresAt > now) {
    return surveyStatusCache.closed;
  }

  try {
    const res = await supabaseServiceFetch("/rest/v1/survey?select=status&limit=1&order=id.asc", {
      timeoutMs: 2000,
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "Survey status check failed - failing open");
      surveyStatusCache = { closed: false, expiresAt: now + SURVEY_STATUS_FAIL_OPEN_TTL_MS };
      return false;
    }
    const rows = (await res.json()) as Array<{ status: string }>;
    const closed = rows.length > 0 && rows[0]!.status === "closed";
    surveyStatusCache = { closed, expiresAt: now + SURVEY_STATUS_CACHE_MS };
    return closed;
  } catch (err) {
    logger.warn({ err }, "Survey status check threw - failing open");
    surveyStatusCache = { closed: false, expiresAt: now + SURVEY_STATUS_FAIL_OPEN_TTL_MS };
    return false;
  }
}
