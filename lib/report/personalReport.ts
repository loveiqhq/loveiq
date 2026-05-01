import { getBreaker } from "@/lib/circuit-breaker";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import logger from "@/lib/logger";
import {
  getStrongestReportAccessPlan,
  isReportPurchasePlan,
  type ReportAccessPlan,
} from "@/lib/report/access";
import type { ReportPurchasePlanId } from "@/lib/checkout/reportPurchase";
import { KNOWN_ARCHETYPES, isArchetypeName } from "@/lib/report/archetypeSlug";

const SUPABASE_TIMEOUT_MS = 8_000;

interface ServiceFetchOptions {
  body?: string;
  headers?: Record<string, string>;
  method?: string;
  timeoutMs?: number;
}

interface SubmissionAccessContext {
  submissionId: number;
  userEmail: string | null;
  userId: number | null;
}

export type ArchetypeTier = "essentials" | "full_report";

export type ArchetypeTierMap = Record<string, ArchetypeTier>;

function isArchetypeTier(value: unknown): value is ArchetypeTier {
  return value === "essentials" || value === "full_report";
}

function sanitizeArchetypeTierMap(value: unknown): ArchetypeTierMap {
  if (!value || typeof value !== "object") return {};
  const result: ArchetypeTierMap = {};
  for (const [key, tier] of Object.entries(value as Record<string, unknown>)) {
    if (isArchetypeName(key) && isArchetypeTier(tier)) {
      result[key] = tier;
    }
  }
  return result;
}

interface PersonalReportRow {
  id: number;
  payment_id: number | null;
  payment_status: string | null;
  url?: string | null;
  unlocked_archetypes?: string[] | null;
  archetype_tiers?: Record<string, unknown> | null;
}

function getSupabaseServiceConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("supabase_not_configured");
  }

  return { serviceRoleKey, url };
}

async function supabaseServiceFetch(path: string, options: ServiceFetchOptions = {}) {
  const { url, serviceRoleKey } = getSupabaseServiceConfig();
  const { method = "GET", body, headers = {}, timeoutMs = SUPABASE_TIMEOUT_MS } = options;

  return getBreaker("supabase").fire(() =>
    fetchWithTimeout(`${url}${path}`, {
      body,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        ...headers,
      },
      method,
      timeoutMs,
    })
  );
}

function normalizeEmail(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}

function getRelatedUser(
  appUser:
    | {
        email?: string | null;
        id?: number | null;
      }
    | Array<{
        email?: string | null;
        id?: number | null;
      }>
    | null
) {
  const row = Array.isArray(appUser) ? (appUser[0] ?? null) : appUser;
  if (!row) {
    return { email: null, id: null };
  }

  return {
    email: normalizeEmail(row.email ?? null),
    id: typeof row.id === "number" ? row.id : null,
  };
}

async function lookupSubmissionIdByToken(reportToken: string) {
  const response = await supabaseServiceFetch(
    // revoked_at=is.null gates every token-driven submission lookup; ops
    // can revoke a leaked token by stamping the row.
    `/rest/v1/report_access_token?token=eq.${encodeURIComponent(reportToken)}&revoked_at=is.null&select=survey_submission_id&limit=1`
  );

  if (!response.ok) {
    throw new Error("report_access_token_lookup_failed");
  }

  const rows = (await response.json()) as Array<{ survey_submission_id: number | null }>;
  return rows[0]?.survey_submission_id ?? null;
}

async function lookupSubmissionIdBySessionId(reportSessionId: string) {
  const response = await supabaseServiceFetch(
    `/rest/v1/survey_submission?session_id=eq.${encodeURIComponent(reportSessionId)}&select=id&limit=1`
  );

  if (!response.ok) {
    throw new Error("survey_submission_lookup_failed");
  }

  const rows = (await response.json()) as Array<{ id: number }>;
  return rows[0]?.id ?? null;
}

async function lookupSubmissionAccessContext(
  submissionId: number
): Promise<SubmissionAccessContext | null> {
  const response = await supabaseServiceFetch(
    `/rest/v1/survey_submission?id=eq.${submissionId}&select=id,user_id,app_user!fk_survey_submission_user(id,email)&limit=1`
  );

  if (!response.ok) {
    throw new Error("submission_context_lookup_failed");
  }

  const rows = (await response.json()) as Array<{
    app_user:
      | {
          email?: string | null;
          id?: number | null;
        }
      | Array<{
          email?: string | null;
          id?: number | null;
        }>
      | null;
    id: number;
    user_id: number | null;
  }>;

  const row = rows[0];
  if (!row) return null;

  const relatedUser = getRelatedUser(row.app_user ?? null);

  return {
    submissionId: row.id,
    userEmail: relatedUser.email,
    userId: row.user_id ?? relatedUser.id,
  };
}

export async function resolveSubmissionAccessContext({
  reportSessionId,
  reportToken,
  submissionId,
}: {
  reportSessionId?: string | null;
  reportToken?: string | null;
  submissionId?: number | null;
}): Promise<SubmissionAccessContext | null> {
  let resolvedSubmissionId = typeof submissionId === "number" ? submissionId : null;

  if (!resolvedSubmissionId && reportToken) {
    resolvedSubmissionId = await lookupSubmissionIdByToken(reportToken);
  }

  if (!resolvedSubmissionId && reportSessionId) {
    resolvedSubmissionId = await lookupSubmissionIdBySessionId(reportSessionId);
  }

  if (!resolvedSubmissionId) {
    return null;
  }

  return lookupSubmissionAccessContext(resolvedSubmissionId);
}

async function fetchPersonalReportForSubmission(submissionId: number) {
  const response = await supabaseServiceFetch(
    `/rest/v1/personal_report?survey_submission_id=eq.${submissionId}&select=id,payment_id,payment_status,url,unlocked_archetypes,archetype_tiers&limit=1`
  );

  if (!response.ok) {
    throw new Error("personal_report_lookup_failed");
  }

  const rows = (await response.json()) as PersonalReportRow[];
  return rows[0] ?? null;
}

export async function ensurePersonalReportForSubmission({
  reportToken,
  submissionId,
}: {
  reportToken?: string | null;
  submissionId: number;
}) {
  const existing = await fetchPersonalReportForSubmission(submissionId);

  if (existing) {
    if (reportToken && !existing.url) {
      const updateResponse = await supabaseServiceFetch(
        `/rest/v1/personal_report?id=eq.${existing.id}`,
        {
          body: JSON.stringify({ url: `/report/${reportToken}` }),
          headers: {
            Prefer: "return=minimal",
          },
          method: "PATCH",
        }
      );

      if (!updateResponse.ok) {
        logger.warn({ submissionId }, "Unable to patch personal report URL");
      }
    }

    return existing;
  }

  const response = await supabaseServiceFetch("/rest/v1/personal_report", {
    body: JSON.stringify({
      status: "generated",
      survey_submission_id: submissionId,
      ...(reportToken ? { url: `/report/${reportToken}` } : {}),
    }),
    headers: {
      Prefer: "return=representation",
    },
    method: "POST",
  });

  // Concurrent webhooks for the same submission can race past the existence
  // check above and both attempt to insert. The unique constraint on
  // survey_submission_id collapses one of them with a 409 — recover by
  // refetching the row the winner just created instead of throwing.
  if (response.status === 409) {
    const existingAfterRace = await fetchPersonalReportForSubmission(submissionId);
    if (existingAfterRace) {
      return existingAfterRace;
    }
  }

  if (!response.ok) {
    throw new Error("personal_report_create_failed");
  }

  const rows = (await response.json()) as PersonalReportRow[];
  return rows[0] ?? null;
}

/**
 * Lists every succeeded plan a submission has already paid for. Used by
 * checkout-session to refuse a duplicate purchase of the same plan tier.
 * Returns an empty array if no payments exist.
 */
export async function getPaidPlansForSubmission(
  submissionId: number
): Promise<ReportPurchasePlanId[]> {
  const personalReport = await fetchPersonalReportForSubmission(submissionId);
  if (!personalReport) return [];

  const response = await supabaseServiceFetch(
    `/rest/v1/payment?personal_report_id=eq.${personalReport.id}&status=eq.succeeded&select=metadata`
  );

  if (!response.ok) {
    throw new Error("payment_lookup_failed");
  }

  const rows = (await response.json()) as Array<{
    metadata: Record<string, unknown> | null;
  }>;

  const paid = new Set<ReportPurchasePlanId>();
  for (const row of rows) {
    const candidate = row.metadata?.plan;
    if (isReportPurchasePlan(candidate)) {
      paid.add(candidate);
    }
  }
  return Array.from(paid);
}

export async function getReportAccessPlanForSubmission(submissionId: number): Promise<{
  accessPlan: ReportAccessPlan;
  archetypeTiers: ArchetypeTierMap;
  personalReportId: number | null;
  unlockedArchetypeColumn: string[];
}> {
  const personalReport = await fetchPersonalReportForSubmission(submissionId);

  if (!personalReport) {
    return {
      accessPlan: null,
      archetypeTiers: {},
      personalReportId: null,
      unlockedArchetypeColumn: [],
    };
  }

  const paymentResponse = await supabaseServiceFetch(
    `/rest/v1/payment?personal_report_id=eq.${personalReport.id}&status=eq.succeeded&select=id,metadata,payment_date_time&order=payment_date_time.desc`
  );

  if (!paymentResponse.ok) {
    throw new Error("payment_lookup_failed");
  }

  const payments = (await paymentResponse.json()) as Array<{
    id: number;
    metadata: Record<string, unknown> | null;
    payment_date_time: string | null;
  }>;

  const strongestPlan = getStrongestReportAccessPlan(
    payments.map((payment) => {
      const candidate = payment.metadata?.plan;
      return isReportPurchasePlan(candidate) ? candidate : null;
    })
  );

  const columnValues = Array.isArray(personalReport.unlocked_archetypes)
    ? personalReport.unlocked_archetypes.filter(isArchetypeName)
    : [];

  return {
    accessPlan: strongestPlan,
    archetypeTiers: sanitizeArchetypeTierMap(personalReport.archetype_tiers ?? {}),
    personalReportId: personalReport.id,
    unlockedArchetypeColumn: columnValues,
  };
}

/**
 * Resolves which archetypes the user can view, plus the tier they hold for
 * each. The primary archetype is always seeded. `accessPlan === "all_reports"`
 * promotes every known archetype to `full_report` tier.
 */
export function resolveUnlockedArchetypeTiers({
  accessPlan,
  archetypeTiers,
  columnValues,
  primaryArchetype,
}: {
  accessPlan: ReportAccessPlan;
  archetypeTiers: ArchetypeTierMap | undefined | null;
  columnValues: string[] | undefined | null;
  primaryArchetype: string;
}): ArchetypeTierMap {
  if (accessPlan === "all_reports") {
    return Object.fromEntries(
      KNOWN_ARCHETYPES.map((name) => [name, "full_report" as ArchetypeTier])
    );
  }

  const result: ArchetypeTierMap = {};

  // Per-archetype tiers from the new column take precedence.
  if (archetypeTiers) {
    for (const [name, tier] of Object.entries(archetypeTiers)) {
      if (isArchetypeName(name) && isArchetypeTier(tier)) {
        result[name] = tier;
      }
    }
  }

  // Legacy column: any archetype here without a tier is implicitly full_report.
  if (Array.isArray(columnValues)) {
    for (const name of columnValues) {
      if (!isArchetypeName(name)) continue;
      if (!result[name]) result[name] = "full_report";
    }
  }

  // The primary archetype is always viewable. Tier comes from accessPlan; if
  // the user has a per-archetype tier already (e.g. they bought essentials on
  // primary explicitly), keep the strongest.
  if (isArchetypeName(primaryArchetype)) {
    const primaryTier: ArchetypeTier | null =
      accessPlan === "full_report" || accessPlan === "essentials" ? accessPlan : null;
    if (primaryTier) {
      const current = result[primaryArchetype];
      if (current !== "full_report") {
        result[primaryArchetype] = primaryTier === "full_report" ? "full_report" : primaryTier;
      }
    } else if (!result[primaryArchetype]) {
      // No paid plan yet — leave primary out of the tier map. Callers that want
      // a name list still get primary via `resolveUnlockedArchetypes`.
    }
  }

  return result;
}

export function resolveUnlockedArchetypes({
  accessPlan,
  archetypeTiers,
  columnValues,
  primaryArchetype,
}: {
  accessPlan: ReportAccessPlan;
  archetypeTiers?: ArchetypeTierMap | null;
  columnValues: string[] | undefined | null;
  primaryArchetype: string;
}): string[] {
  if (accessPlan === "all_reports") {
    return [...KNOWN_ARCHETYPES];
  }

  const tiers = resolveUnlockedArchetypeTiers({
    accessPlan,
    archetypeTiers: archetypeTiers ?? {},
    columnValues,
    primaryArchetype,
  });
  const set = new Set<string>(Object.keys(tiers));

  // The primary archetype is viewable even on the free plan (free sections
  // still render); ensure the name list includes it regardless of tier.
  if (isArchetypeName(primaryArchetype)) {
    set.add(primaryArchetype);
  }

  return Array.from(set);
}

/**
 * Persists a per-archetype tier on the personal_report row.
 * Atomic via the `upsert_archetype_tier` Postgres RPC — racing webhooks (e.g.
 * two checkout sessions for the same report finishing within ms) merge under
 * a single row write lock with "highest tier wins" semantics.
 */
export async function upsertArchetypeTierForPersonalReport({
  archetype,
  personalReportId,
  tier,
}: {
  archetype: string;
  personalReportId: number;
  tier: ArchetypeTier;
}): Promise<ArchetypeTierMap> {
  if (!isArchetypeName(archetype)) {
    throw new Error("invalid_archetype");
  }
  if (!isArchetypeTier(tier)) {
    throw new Error("invalid_tier");
  }

  const response = await supabaseServiceFetch("/rest/v1/rpc/upsert_archetype_tier", {
    body: JSON.stringify({
      p_personal_report_id: personalReportId,
      p_archetype: archetype,
      p_tier: tier,
    }),
    headers: { Prefer: "return=representation" },
    method: "POST",
  });

  if (!response.ok) {
    logger.error(
      { personalReportId, status: response.status, tier },
      "Unable to persist archetype tier"
    );
    throw new Error("archetype_tier_update_failed");
  }

  const payload = await response.json().catch(() => null);
  return sanitizeArchetypeTierMap(payload);
}

/** @deprecated Use upsertArchetypeTierForPersonalReport with tier="full_report". */
export async function addUnlockedArchetypeForPersonalReport({
  archetype,
  personalReportId,
}: {
  archetype: string;
  personalReportId: number;
}): Promise<string[]> {
  const tiers = await upsertArchetypeTierForPersonalReport({
    archetype,
    personalReportId,
    tier: "full_report",
  });
  return Object.keys(tiers).filter(isArchetypeName);
}

export async function addUnlockedArchetypeForSubmission({
  archetype,
  submissionId,
}: {
  archetype: string;
  submissionId: number;
}): Promise<string[]> {
  const personalReport = await fetchPersonalReportForSubmission(submissionId);
  if (!personalReport) {
    throw new Error("personal_report_not_found");
  }

  return addUnlockedArchetypeForPersonalReport({
    archetype,
    personalReportId: personalReport.id,
  });
}

export async function recordReportSessionView({
  ipAddress,
  personalReportId,
  userAgent,
  userId,
  utmTracker,
}: {
  ipAddress?: string | null;
  personalReportId: number;
  userAgent?: string | null;
  userId?: number | null;
  utmTracker?: string | null;
}) {
  const response = await supabaseServiceFetch("/rest/v1/report_session", {
    body: JSON.stringify({
      ...(ipAddress ? { ip_address: ipAddress } : {}),
      personal_report_id: personalReportId,
      ...(userAgent ? { user_agent: userAgent } : {}),
      ...(typeof userId === "number" ? { user_id: userId } : {}),
      ...(utmTracker ? { utm_tracker: utmTracker } : {}),
    }),
    headers: {
      Prefer: "return=minimal",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("report_session_create_failed");
  }
}
