import { ensurePersonalReportForSubmission } from "@features/report/server/personalReport";
import { isFeatureEnabled, readFeatureFlag } from "@shared/flags/system-flags";
import { getBreaker } from "@shared/http/circuit-breaker";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";

/**
 * Pre-unlock (Notion "RFD > Pre-Unlock", Figma Report-3.0 1604:2328): the EUR 1.99 gate's
 * two switches, and the stamps it keeps on personal_report (migration 20261020090000).
 *
 *   initial_gate_cohort_at  the survey was submitted while the gate was on. Only these
 *                           reports are ever gated; one read for free before stays free.
 *   initial_gate_seen_at    the first time the gate was shown: its "paywall reached", and the
 *                           day E07 counts its four days from.
 *
 * Every read is a query of its own that fails soft. The columns are never added to the
 * report lookup's select: an unapplied migration would turn that lookup into a 400 for
 * every reader, paid ones included.
 */

const SUPABASE_TIMEOUT_MS = 5_000;

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("supabase_not_configured");
  return { url, serviceRoleKey };
}

async function serviceFetch(
  path: string,
  options: { method?: string; body?: string; headers?: Record<string, string> } = {}
): Promise<Response> {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const { method = "GET", body, headers = {} } = options;
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
      timeoutMs: SUPABASE_TIMEOUT_MS,
    })
  );
}

function isRowId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/** The gate itself. Off when its row is missing or Supabase is down: an outage gates no one. */
export function isInitialUnlockGateEnabled(): Promise<boolean> {
  return isFeatureEnabled("report_initial_unlock_gate", false);
}

/**
 * The gate's switch for the emails that skip its cohort: true or false as set (false before
 * the migration adds its row), null when it can't be read. Unlike the gate itself, which an
 * unreadable switch leaves off (an outage gates nobody), an email must not read "unreadable"
 * as "off" and reach the cohort: on null it reads the cohort as if the gate were on.
 */
export function readInitialUnlockGateSwitch(): Promise<boolean | null> {
  return readFeatureFlag("report_initial_unlock_gate", false);
}

/** E07, the day-4 gift. Off by default for the same reason. */
export function isInitialGiftEmailEnabled(): Promise<boolean> {
  return isFeatureEnabled("initial_unlock_gift_email", false);
}

export interface InitialGateState {
  cohortAt: string | null;
  seenAt: string | null;
}

/** A report's two stamps, or null when they can't be read (the caller then gates nobody). */
export async function readInitialGateState(
  personalReportId: number
): Promise<InitialGateState | null> {
  if (!isRowId(personalReportId)) return null;
  try {
    const response = await serviceFetch(
      `/rest/v1/personal_report?id=eq.${personalReportId}&select=initial_gate_cohort_at,initial_gate_seen_at&limit=1`
    );
    if (!response.ok) {
      logger.warn(
        { personalReportId, status: response.status },
        "pre-unlock: gate state read failed"
      );
      return null;
    }
    const rows = (await response.json()) as Array<{
      initial_gate_cohort_at?: string | null;
      initial_gate_seen_at?: string | null;
    }>;
    const row = Array.isArray(rows) ? rows[0] : undefined;
    if (!row) return null;
    return {
      cohortAt: row.initial_gate_cohort_at ?? null,
      seenAt: row.initial_gate_seen_at ?? null,
    };
  } catch (err) {
    logger.warn({ err, personalReportId }, "pre-unlock: gate state read failed");
    return null;
  }
}

/**
 * Which of a batch of reports are in the gate's cohort, or null when the read fails: the
 * caller decides, and an email offering the cohort something the gate undercuts must not
 * guess (the 72h email stops its run).
 */
export async function readInitialGateCohortIds(
  personalReportIds: number[]
): Promise<Set<number> | null> {
  const ids = [...new Set(personalReportIds.filter(isRowId))];
  if (ids.length === 0) return new Set();
  try {
    const response = await serviceFetch(
      `/rest/v1/personal_report?id=in.(${ids.join(",")})&initial_gate_cohort_at=not.is.null&select=id`
    );
    if (!response.ok) {
      logger.warn({ status: response.status }, "pre-unlock: cohort read failed");
      return null;
    }
    const rows = (await response.json()) as Array<{ id?: unknown }>;
    if (!Array.isArray(rows)) return null;
    return new Set(rows.map((row) => row.id).filter(isRowId));
  } catch (err) {
    logger.warn({ err }, "pre-unlock: cohort read failed");
    return null;
  }
}

/** The first stamp lands and later ones match nothing (`is.null`). Never throws. */
async function stampOnce(
  personalReportId: number,
  column: "initial_gate_cohort_at" | "initial_gate_seen_at"
): Promise<void> {
  if (!isRowId(personalReportId)) return;
  try {
    const response = await serviceFetch(
      `/rest/v1/personal_report?id=eq.${personalReportId}&${column}=is.null`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ [column]: new Date().toISOString() }),
      }
    );
    if (!response.ok) {
      logger.warn(
        { personalReportId, column, status: response.status },
        "pre-unlock: stamp failed"
      );
    }
  } catch (err) {
    logger.warn({ err, personalReportId, column }, "pre-unlock: stamp failed");
  }
}

export function stampInitialGateCohort(personalReportId: number): Promise<void> {
  return stampOnce(personalReportId, "initial_gate_cohort_at");
}

export function stampInitialGateSeen(personalReportId: number): Promise<void> {
  return stampOnce(personalReportId, "initial_gate_seen_at");
}

/**
 * A survey submitted while the gate is on joins its cohort. The survey waits for this
 * before it replies: a reader who skips the wizard opens the report a moment after the
 * reply, and a stamp still on its way would show them the report once, then gate it on
 * the next visit. Never throws; a report that misses the stamp is simply not gated.
 */
export async function joinInitialGateCohort(submissionId: number): Promise<void> {
  try {
    if (!(await isInitialUnlockGateEnabled())) return;
    const report = await ensurePersonalReportForSubmission({ submissionId });
    if (report?.id) await stampInitialGateCohort(report.id);
  } catch (err) {
    logger.warn({ err, submissionId }, "pre-unlock: cohort stamp failed, report not gated");
  }
}
