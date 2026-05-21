import { randomBytes } from "crypto";
import { getBreaker } from "@shared/http/circuit-breaker";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";
import { REPORT_ACCESS_TOKEN_REGEX } from "@features/checkout/server/reportPurchase";

export const REPORT_SHARE_TOKEN_REGEX = /^rpts_[A-Za-z0-9]{20}$/;
export { REPORT_ACCESS_TOKEN_REGEX };

// eslint-disable-next-line no-secrets/no-secrets
const BASE62 = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function generateShareToken(): string {
  const bytes = randomBytes(20);
  let token = "rpts_";
  for (const b of bytes) token += BASE62[b % BASE62.length];
  return token;
}

export interface OwnerAccessContext {
  personalReportId: number;
  submissionId: number;
  ownerUserId: number | null;
  ownerEmail: string | null;
  ownerFirstName: string | null;
}

export interface ReportShareRow {
  id: number;
  personal_report_id: number;
  recipient_email: string;
  share_token: string;
  shared_by_user_id: number | null;
  plan_at_share: "essentials" | "full_report" | "all_reports";
  personal_message: string | null;
  last_viewed_at: string | null;
  view_count: number;
  revoked_at: string | null;
  created_at: string;
}

export interface ShareAccessContext {
  share: ReportShareRow;
  submissionId: number;
  personalReportId: number;
  ownerFirstName: string | null;
  ownerEmail: string | null;
}

const SUPABASE_TIMEOUT_MS = 8_000;

function getSupabaseServiceConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("supabase_not_configured");
  }

  return { serviceRoleKey, url };
}

interface ServiceFetchOptions {
  body?: string;
  headers?: Record<string, string>;
  method?: string;
}

async function supabaseFetch(path: string, options: ServiceFetchOptions = {}) {
  const { url, serviceRoleKey } = getSupabaseServiceConfig();
  const { method = "GET", body, headers = {} } = options;
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
      timeoutMs: SUPABASE_TIMEOUT_MS,
    })
  );
}

function firstRelated<T extends object>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function normalizeEmail(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim() ? raw.trim().toLowerCase() : null;
}

function normalizeFirstName(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

/**
 * Resolve the owner of a report from an `rpt_...` access token.
 * Used to prove ownership before share mutations.
 *
 * Uses explicit two-step fetches because `report_access_token.survey_submission_id`
 * has no FK constraint (see 20260409183414 migration), so PostgREST cannot embed the
 * join via relationship alias.
 */
export async function resolveOwnerFromAccessToken(
  token: string
): Promise<OwnerAccessContext | null> {
  if (!REPORT_ACCESS_TOKEN_REGEX.test(token)) return null;

  // revoked_at=is.null filters out tokens flagged for revocation by ops
  // (e.g. after a leak). Backed by partial index idx_report_access_token_active_token.
  const tokenRes = await supabaseFetch(
    `/rest/v1/report_access_token?token=eq.${encodeURIComponent(token)}&revoked_at=is.null&select=survey_submission_id&limit=1`
  );
  if (!tokenRes.ok) return null;
  const tokenRows = (await tokenRes.json()) as Array<{ survey_submission_id: number | null }>;
  const submissionId = tokenRows[0]?.survey_submission_id;
  if (!submissionId) return null;

  const [submissionRes, prRes] = await Promise.all([
    supabaseFetch(
      `/rest/v1/survey_submission?id=eq.${submissionId}&select=id,user_id,app_user!fk_survey_submission_user(id,email,first_name)&limit=1`
    ),
    supabaseFetch(
      `/rest/v1/personal_report?survey_submission_id=eq.${submissionId}&select=id&limit=1`
    ),
  ]);

  if (!submissionRes.ok || !prRes.ok) return null;

  const submissionRows = (await submissionRes.json()) as Array<{
    id: number;
    user_id: number | null;
    app_user:
      | { id?: number | null; email?: string | null; first_name?: string | null }
      | Array<{ id?: number | null; email?: string | null; first_name?: string | null }>
      | null;
  }>;
  const submission = submissionRows[0];
  if (!submission) return null;

  const prRows = (await prRes.json()) as Array<{ id: number }>;
  const personalReport = prRows[0];
  if (!personalReport) return null;

  const appUser = firstRelated(submission.app_user);

  return {
    personalReportId: personalReport.id,
    submissionId: submission.id,
    ownerUserId: submission.user_id ?? appUser?.id ?? null,
    ownerEmail: normalizeEmail(appUser?.email ?? null),
    ownerFirstName: normalizeFirstName(appUser?.first_name ?? null),
  };
}

/**
 * Resolve a shared-report viewer from an `rpts_...` share token.
 * Returns null when the share is missing or revoked.
 */
export async function resolveShareFromToken(token: string): Promise<ShareAccessContext | null> {
  if (!REPORT_SHARE_TOKEN_REGEX.test(token)) return null;

  const shareRes = await supabaseFetch(
    `/rest/v1/report_share?share_token=eq.${encodeURIComponent(token)}&select=*&limit=1`
  );
  if (!shareRes.ok) return null;
  const shareRows = (await shareRes.json()) as ReportShareRow[];
  const share = shareRows[0];
  if (!share || share.revoked_at) return null;

  const prRes = await supabaseFetch(
    `/rest/v1/personal_report?id=eq.${share.personal_report_id}&select=id,survey_submission_id,survey_submission!fk_personal_report_submission(id,app_user!fk_survey_submission_user(email,first_name))&limit=1`
  );

  let submissionId: number | null = null;
  let ownerEmail: string | null = null;
  let ownerFirstName: string | null = null;

  if (prRes.ok) {
    const prRows = (await prRes.json()) as Array<{
      id: number;
      survey_submission_id: number | null;
      survey_submission:
        | {
            id: number;
            app_user:
              | { email?: string | null; first_name?: string | null }
              | Array<{ email?: string | null; first_name?: string | null }>
              | null;
          }
        | Array<{
            id: number;
            app_user:
              | { email?: string | null; first_name?: string | null }
              | Array<{ email?: string | null; first_name?: string | null }>
              | null;
          }>
        | null;
    }>;
    const pr = prRows[0];
    const submission = firstRelated(pr?.survey_submission ?? null);
    submissionId = submission?.id ?? pr?.survey_submission_id ?? null;
    const appUser = firstRelated(submission?.app_user ?? null);
    ownerEmail = normalizeEmail(appUser?.email ?? null);
    ownerFirstName = normalizeFirstName(appUser?.first_name ?? null);
  }

  if (!submissionId) {
    // Simpler fallback: just look up submission_id.
    const prFallback = await supabaseFetch(
      `/rest/v1/personal_report?id=eq.${share.personal_report_id}&select=survey_submission_id&limit=1`
    );
    if (prFallback.ok) {
      const rows = (await prFallback.json()) as Array<{ survey_submission_id: number | null }>;
      submissionId = rows[0]?.survey_submission_id ?? null;
    }
  }

  if (!submissionId) return null;

  return {
    share,
    submissionId,
    personalReportId: share.personal_report_id,
    ownerEmail,
    ownerFirstName,
  };
}

export async function listActiveSharesForReport(
  personalReportId: number
): Promise<
  Array<Pick<ReportShareRow, "id" | "recipient_email" | "created_at" | "last_viewed_at">>
> {
  const response = await supabaseFetch(
    `/rest/v1/report_share?personal_report_id=eq.${personalReportId}&revoked_at=is.null&select=id,recipient_email,created_at,last_viewed_at&order=created_at.desc`
  );

  if (!response.ok) {
    throw new Error("report_share_list_failed");
  }

  return (await response.json()) as Array<
    Pick<ReportShareRow, "id" | "recipient_email" | "created_at" | "last_viewed_at">
  >;
}

export interface CreateShareResult {
  ok?: boolean;
  row?: ReportShareRow;
  error?: "seat_limit_reached" | "duplicate_recipient" | "plan_not_shareable" | "no_seats";
  active?: number;
  limit?: number;
}

export async function createReportShareViaRpc(params: {
  personalReportId: number;
  recipientEmail: string;
  sharedByUserId: number | null;
  plan: "essentials" | "full_report" | "all_reports";
  seatLimit: number;
  shareToken: string;
  personalMessage?: string | null;
}): Promise<CreateShareResult> {
  const response = await supabaseFetch(`/rest/v1/rpc/create_report_share`, {
    body: JSON.stringify({
      p_personal_report_id: params.personalReportId,
      p_recipient_email: params.recipientEmail,
      p_shared_by_user_id: params.sharedByUserId,
      p_plan: params.plan,
      p_seat_limit: params.seatLimit,
      p_share_token: params.shareToken,
      p_personal_message: params.personalMessage ?? null,
    }),
    headers: { Prefer: "return=representation" },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("create_report_share_rpc_failed");
  }

  return (await response.json()) as CreateShareResult;
}

/** Set revoked_at on a share row. Returns true if a row was updated. */
export async function revokeReportShare(params: {
  shareId: number;
  personalReportId: number;
}): Promise<boolean> {
  const response = await supabaseFetch(
    `/rest/v1/report_share?id=eq.${params.shareId}&personal_report_id=eq.${params.personalReportId}&revoked_at=is.null`,
    {
      body: JSON.stringify({ revoked_at: new Date().toISOString() }),
      headers: { Prefer: "return=representation" },
      method: "PATCH",
    }
  );

  if (!response.ok) {
    throw new Error("revoke_report_share_failed");
  }

  const rows = (await response.json()) as Array<{ id: number }>;
  return rows.length > 0;
}

/** Fire-and-forget: bump view count + last_viewed_at on the share row. */
export async function markShareViewed(shareId: number): Promise<void> {
  try {
    const response = await supabaseFetch(`/rest/v1/rpc/increment_report_share_view`, {
      body: JSON.stringify({ p_share_id: shareId }),
      method: "POST",
    });
    if (!response.ok) {
      logger.warn({ shareId, status: response.status }, "markShareViewed RPC failed");
    }
  } catch (err) {
    logger.warn({ err, shareId }, "markShareViewed error");
  }
}
