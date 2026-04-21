import { getBreaker } from "@/lib/circuit-breaker";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import logger from "@/lib/logger";
import {
  getStrongestReportAccessPlan,
  isReportPurchasePlan,
  type ReportAccessPlan,
} from "@/lib/report/access";
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

interface PersonalReportRow {
  id: number;
  payment_id: number | null;
  payment_status: string | null;
  url?: string | null;
  unlocked_archetypes?: string[] | null;
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
    `/rest/v1/report_access_token?token=eq.${encodeURIComponent(reportToken)}&select=survey_submission_id&limit=1`
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
    `/rest/v1/personal_report?survey_submission_id=eq.${submissionId}&select=id,payment_id,payment_status,url,unlocked_archetypes&limit=1`
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

  if (!response.ok) {
    throw new Error("personal_report_create_failed");
  }

  const rows = (await response.json()) as PersonalReportRow[];
  return rows[0] ?? null;
}

export async function getReportAccessPlanForSubmission(submissionId: number): Promise<{
  accessPlan: ReportAccessPlan;
  personalReportId: number | null;
  unlockedArchetypeColumn: string[];
}> {
  const personalReport = await fetchPersonalReportForSubmission(submissionId);

  if (!personalReport) {
    return {
      accessPlan: null,
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
    personalReportId: personalReport.id,
    unlockedArchetypeColumn: columnValues,
  };
}

export function resolveUnlockedArchetypes({
  accessPlan,
  columnValues,
  primaryArchetype,
}: {
  accessPlan: ReportAccessPlan;
  columnValues: string[] | undefined | null;
  primaryArchetype: string;
}): string[] {
  if (accessPlan === "all_reports") {
    return [...KNOWN_ARCHETYPES];
  }

  const source = Array.isArray(columnValues) ? columnValues : [];
  const set = new Set<string>(source.filter(isArchetypeName));

  if (isArchetypeName(primaryArchetype)) {
    set.add(primaryArchetype);
  }

  if (accessPlan === "full_report" && isArchetypeName(primaryArchetype)) {
    set.add(primaryArchetype);
  }

  return Array.from(set);
}

async function fetchPersonalReportById(personalReportId: number) {
  const response = await supabaseServiceFetch(
    `/rest/v1/personal_report?id=eq.${personalReportId}&select=id,payment_id,payment_status,url,unlocked_archetypes&limit=1`
  );

  if (!response.ok) {
    throw new Error("personal_report_lookup_failed");
  }

  const rows = (await response.json()) as PersonalReportRow[];
  return rows[0] ?? null;
}

export async function addUnlockedArchetypeForPersonalReport({
  archetype,
  personalReportId,
}: {
  archetype: string;
  personalReportId: number;
}): Promise<string[]> {
  if (!isArchetypeName(archetype)) {
    throw new Error("invalid_archetype");
  }

  const personalReport = await fetchPersonalReportById(personalReportId);
  if (!personalReport) {
    throw new Error("personal_report_not_found");
  }

  const existing = Array.isArray(personalReport.unlocked_archetypes)
    ? personalReport.unlocked_archetypes.filter(isArchetypeName)
    : [];

  if (existing.includes(archetype)) {
    return existing;
  }

  const next = Array.from(new Set([...existing, archetype]));

  const updateResponse = await supabaseServiceFetch(
    `/rest/v1/personal_report?id=eq.${personalReport.id}`,
    {
      body: JSON.stringify({ unlocked_archetypes: next }),
      headers: { Prefer: "return=minimal" },
      method: "PATCH",
    }
  );

  if (!updateResponse.ok) {
    logger.error(
      { personalReportId, status: updateResponse.status },
      "Unable to persist unlocked archetype"
    );
    throw new Error("unlocked_archetypes_update_failed");
  }

  return next;
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
