/**
 * F-01: GDPR DSAR (Data Subject Access Request) implementation.
 *
 * Handles `export` and `delete` for a normalized email across the high-PII
 * tables. Payment rows are intentionally NOT deleted — they're retained for
 * accounting/tax obligations and the audit-log entry records this fact under
 * `notes`. A separate "wipe payments" workflow can be added later if/when
 * the company adopts a payment-data retention policy.
 *
 * Tables walked:
 *   - waitlist_user            (by email)
 *   - invite_event             (by sender or recipient email)
 *   - email_suppression        (by email)
 *   - app_user                 (by email; the identity root)
 *     - survey_submission      (via app_user_id)
 *       - survey_submission_answer + history + options
 *       - scoring_result
 *       - analytics_event
 *       - report_section_feedback
 *       - personal_report
 *         - personal_report_section
 *         - report_access_token
 *         - report_access_email
 *         - report_share (+ report_share_view via cascade)
 *         - report_price_quote
 *
 * Skipped (intentional, see above):
 *   - payment, payment_item, payment_webhook_event
 *   - survey_partial_save (no direct email link; auto-purged by F-02)
 *   - cron_run, data_subject_request_log (audit trails)
 */

import { createHash } from "crypto";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";

export type DsrAction = "export" | "delete";

export interface DsrResult {
  ok: boolean;
  rowsAffected: Record<string, number>;
  exportData?: Record<string, unknown[]>;
  warnings: string[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!EMAIL_RE.test(trimmed) || trimmed.length > 320) return null;
  return trimmed;
}

export function emailHash(normalized: string): string {
  return createHash("sha256").update(normalized).digest("hex");
}

/** Fetch JSON from a Supabase REST URL; return [] on failure (logged). */
async function fetchRows<T>(path: string, ctx: string): Promise<T[]> {
  try {
    const res = await supabaseFetch(path);
    if (!res.ok) {
      logger.warn({ status: res.status, ctx }, "DSR fetch non-ok");
      return [];
    }
    return (await res.json()) as T[];
  } catch (err) {
    logger.warn({ err, ctx }, "DSR fetch threw");
    return [];
  }
}

/**
 * DELETE by filter; return number of rows deleted. Uses count=exact in the
 * Content-Range header instead of streaming the deleted rows back, so a
 * user with many years of analytics_event rows doesn't OOM the function.
 *
 * P-08: on failure (non-ok status or thrown error) we flip `result.ok = false`
 * and append a warning so the audit log records "partial" instead of "success".
 * Previously a 500 mid-cascade returned 0 rows and lied about success.
 */
async function deleteWhere(path: string, ctx: string, result?: DsrResult): Promise<number> {
  try {
    const res = await supabaseFetch(path, {
      method: "DELETE",
      headers: { Prefer: "return=minimal,count=exact" },
    });
    if (!res.ok) {
      logger.warn({ status: res.status, ctx }, "DSR delete non-ok");
      if (result) {
        result.ok = false;
        result.warnings.push(`${ctx}: HTTP ${res.status}`);
      }
      return 0;
    }
    const range = res.headers.get("content-range") ?? "";
    const totalStr = range.split("/")[1];
    const deleted = totalStr && totalStr !== "*" ? parseInt(totalStr, 10) : 0;
    return Number.isFinite(deleted) ? deleted : 0;
  } catch (err) {
    logger.warn({ err, ctx }, "DSR delete threw");
    if (result) {
      result.ok = false;
      result.warnings.push(`${ctx}: threw`);
    }
    return 0;
  }
}

/** Format `in.(...)` filter, returning null if list empty (caller skips call). */
function inFilter(ids: number[]): string | null {
  if (ids.length === 0) return null;
  return `in.(${ids.join(",")})`;
}

interface AppUserRow {
  id: number;
  email: string | null;
}

interface SubmissionRow {
  id: number;
}

interface PersonalReportRow {
  id: number;
}

export async function exportDataSubject(emailNorm: string): Promise<DsrResult> {
  const result: DsrResult = { ok: true, rowsAffected: {}, exportData: {}, warnings: [] };
  const enc = encodeURIComponent;

  const waitlist = await fetchRows<unknown>(
    `/rest/v1/waitlist_user?email=eq.${enc(emailNorm)}&select=*`,
    "wl"
  );
  result.exportData!.waitlist_user = waitlist;
  result.rowsAffected.waitlist_user = waitlist.length;

  const suppression = await fetchRows<unknown>(
    `/rest/v1/email_suppression?email=eq.${enc(emailNorm)}&select=*`,
    "supp"
  );
  result.exportData!.email_suppression = suppression;
  result.rowsAffected.email_suppression = suppression.length;

  const invites = await fetchRows<unknown>(
    `/rest/v1/invite_event?or=(sender_email.eq.${enc(emailNorm)},recipient_email.eq.${enc(emailNorm)})&select=*`,
    "inv"
  );
  result.exportData!.invite_event = invites;
  result.rowsAffected.invite_event = invites.length;

  const users = await fetchRows<AppUserRow>(
    `/rest/v1/app_user?email=eq.${enc(emailNorm)}&select=*`,
    "user"
  );
  result.exportData!.app_user = users;
  result.rowsAffected.app_user = users.length;

  if (users.length === 0) return result;
  const userIds = users.map((u) => u.id);
  const userIdsFilter = inFilter(userIds)!;

  const submissions = await fetchRows<SubmissionRow>(
    `/rest/v1/survey_submission?app_user_id=${userIdsFilter}&select=*`,
    "sub"
  );
  result.exportData!.survey_submission = submissions;
  result.rowsAffected.survey_submission = submissions.length;

  if (submissions.length === 0) return result;
  const subIds = submissions.map((s) => s.id);
  const subFilter = inFilter(subIds)!;

  result.exportData!.survey_submission_answer = await fetchRows(
    `/rest/v1/survey_submission_answer?survey_submission_id=${subFilter}&select=*`,
    "ans"
  );
  result.exportData!.scoring_result = await fetchRows(
    `/rest/v1/scoring_result?survey_submission_id=${subFilter}&select=*`,
    "sr"
  );
  result.exportData!.analytics_event = await fetchRows(
    `/rest/v1/analytics_event?survey_submission_id=${subFilter}&select=*`,
    "ae"
  );
  // report_section_feedback carries the user's 👍/👎 plus free-text
  // `comment`/`issue` — user-authored content that an Art. 15 access request
  // must return in full.
  result.exportData!.report_section_feedback = await fetchRows(
    // eslint-disable-next-line no-secrets/no-secrets -- REST path, not a secret
    `/rest/v1/report_section_feedback?survey_submission_id=${subFilter}&select=*`,
    "rsf"
  );
  // report_access_token is keyed by survey_submission_id (NOT personal_report_id
  // — that column does not exist on this table), so it is fetched here with the
  // submission filter, independent of whether a personal_report row exists yet.
  result.exportData!.report_access_token = await fetchRows(
    `/rest/v1/report_access_token?survey_submission_id=${subFilter}&select=*`,
    "rat"
  );

  const reports = await fetchRows<PersonalReportRow>(
    `/rest/v1/personal_report?survey_submission_id=${subFilter}&select=*`,
    "pr"
  );
  result.exportData!.personal_report = reports;
  result.rowsAffected.personal_report = reports.length;

  if (reports.length === 0) {
    result.warnings.push("payment data retained (accounting retention)");
    return result;
  }
  const reportIds = reports.map((r) => r.id);
  const reportFilter = inFilter(reportIds)!;

  result.exportData!.report_share = await fetchRows(
    `/rest/v1/report_share?personal_report_id=${reportFilter}&select=*`,
    "rs"
  );
  result.warnings.push("payment data retained (accounting retention)");
  return result;
}

export async function deleteDataSubject(emailNorm: string): Promise<DsrResult> {
  const result: DsrResult = { ok: true, rowsAffected: {}, warnings: [] };
  const enc = encodeURIComponent;

  // Tier 1: directly email-keyed rows. Safe to delete unconditionally
  // regardless of whether the cascade later succeeds or is blocked by a
  // payment FK. Bug fix: previously waitlist was only deleted when no
  // app_user existed AND no payment block fired — leaving orphan waitlist
  // rows for paying customers requesting deletion.
  result.rowsAffected.invite_event = await deleteWhere(
    `/rest/v1/invite_event?or=(sender_email.eq.${enc(emailNorm)},recipient_email.eq.${enc(emailNorm)})`,
    "inv",
    result
  );
  result.rowsAffected.email_suppression = await deleteWhere(
    `/rest/v1/email_suppression?email=eq.${enc(emailNorm)}`,
    "supp",
    result
  );
  result.rowsAffected.waitlist_user = await deleteWhere(
    `/rest/v1/waitlist_user?email=eq.${enc(emailNorm)}`,
    "wl",
    result
  );

  // Tier 2: app_user-rooted cascade.
  const users = await fetchRows<AppUserRow>(
    `/rest/v1/app_user?email=eq.${enc(emailNorm)}&select=id`,
    "user-lookup"
  );

  if (users.length === 0) {
    result.warnings.push("payment data retained (accounting retention)");
    return result;
  }

  const userIds = users.map((u) => u.id);
  const userIdsFilter = inFilter(userIds)!;
  result.rowsAffected.app_user_matched = users.length;

  // P-02: payments are retained for accounting/tax (§147 AO, §257 HGB). The
  // payment.user_id column is NOT NULL, so the app_user row itself cannot be
  // hard-deleted while any payment references it. Instead we PSEUDONYMIZE
  // app_user (strip email, first_name, utm_tracker, auth_user_id) so the row
  // is no longer linkable to the natural person. The rest of the cascade
  // (personal_report, survey_submission, scoring, etc.) deletes as normal —
  // and the payment.personal_report_id FK now uses ON DELETE SET NULL
  // (migration 20260527120000) so the personal_report deletion no longer
  // throws an FK violation.
  const payments = await fetchRows<{ id: number }>(
    `/rest/v1/payment?user_id=${userIdsFilter}&select=id&limit=1`,
    "pay-check"
  );
  const hasPayments = payments.length > 0;

  // No payments path falls through to delete app_user; payments path
  // pseudonymizes it below.
  const submissions = await fetchRows<SubmissionRow>(
    `/rest/v1/survey_submission?app_user_id=${userIdsFilter}&select=id`,
    "sub-lookup"
  );
  const subIds = submissions.map((s) => s.id);

  if (subIds.length > 0) {
    const subFilter = inFilter(subIds)!;

    // Personal report sub-cascade (must precede survey_submission delete).
    const reports = await fetchRows<PersonalReportRow>(
      `/rest/v1/personal_report?survey_submission_id=${subFilter}&select=id`,
      "pr-lookup"
    );
    const reportIds = reports.map((r) => r.id);

    if (reportIds.length > 0) {
      const reportFilter = inFilter(reportIds)!;
      result.rowsAffected.report_access_email = await deleteWhere(
        `/rest/v1/report_access_email?personal_report_id=${reportFilter}`,
        "rae",
        result
      );
      result.rowsAffected.report_share = await deleteWhere(
        `/rest/v1/report_share?personal_report_id=${reportFilter}`,
        "rs",
        result
      );
      result.rowsAffected.personal_report_section = await deleteWhere(
        `/rest/v1/personal_report_section?personal_report_id=${reportFilter}`,
        "prs",
        result
      );
      result.rowsAffected.report_price_quote = await deleteWhere(
        `/rest/v1/report_price_quote?personal_report_id=${reportFilter}`,
        "rpq",
        result
      );
      result.rowsAffected.personal_report = await deleteWhere(
        `/rest/v1/personal_report?id=${reportFilter}`,
        "pr",
        result
      );
    }

    // Survey-submission sub-cascade.
    const answerIds = (
      await fetchRows<{ id: number }>(
        `/rest/v1/survey_submission_answer?survey_submission_id=${subFilter}&select=id`,
        "ans-lookup"
      )
    ).map((a) => a.id);
    const ansFilter = inFilter(answerIds);
    if (ansFilter) {
      await deleteWhere(
        `/rest/v1/survey_submission_answer_options?survey_submission_answer_id=${ansFilter}`,
        "ans-opts",
        result
      );
      await deleteWhere(
        `/rest/v1/survey_submission_answer_history?survey_submission_answer_id=${ansFilter}`,
        "ans-hist",
        result
      );
    }

    result.rowsAffected.survey_submission_answer = await deleteWhere(
      `/rest/v1/survey_submission_answer?survey_submission_id=${subFilter}`,
      "ans",
      result
    );
    result.rowsAffected.scoring_result = await deleteWhere(
      `/rest/v1/scoring_result?survey_submission_id=${subFilter}`,
      "sr",
      result
    );
    result.rowsAffected.analytics_event = await deleteWhere(
      `/rest/v1/analytics_event?survey_submission_id=${subFilter}`,
      "ae",
      result
    );
    // report_section_feedback (👍/👎 + free-text comment/issue). Its
    // survey_submission_id FK is ON DELETE CASCADE, so the survey_submission
    // delete below would clear these implicitly — but we delete + count them
    // explicitly so the audit log records the erasure rather than relying on
    // silent cascade ordering.
    result.rowsAffected.report_section_feedback = await deleteWhere(
      // eslint-disable-next-line no-secrets/no-secrets -- REST path, not a secret
      `/rest/v1/report_section_feedback?survey_submission_id=${subFilter}`,
      "rsf",
      result
    );
    // report_access_token is keyed by survey_submission_id and its FK to
    // survey_submission is ON DELETE CASCADE (set by 20260527120200), so the
    // survey_submission delete below would clear it anyway — but we delete it
    // explicitly here (by the correct column) so the audit log records the
    // tokens and the order never relies on cascade timing.
    result.rowsAffected.report_access_token = await deleteWhere(
      `/rest/v1/report_access_token?survey_submission_id=${subFilter}`,
      "rat",
      result
    );
    result.rowsAffected.survey_submission = await deleteWhere(
      `/rest/v1/survey_submission?id=${subFilter}`,
      "sub",
      result
    );
  }

  if (hasPayments) {
    // Pseudonymize the app_user row. The PK survives (so payment.user_id
    // stays referentially intact), but email/first_name/utm_tracker/
    // auth_user_id are nulled — the row no longer identifies a natural
    // person, satisfying GDPR Art. 17 § 1 read with § 3 (retention for legal
    // obligations is a § 3(b) exception, but the residual data must be
    // minimized). The hash of the original email goes into the audit log
    // via the caller, so a future regulator inquiry can re-link if needed
    // (e.g. proof of erasure).
    try {
      const patch = await supabaseFetch(`/rest/v1/app_user?id=${userIdsFilter}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          email: null,
          first_name: null,
          utm_tracker: null,
          auth_user_id: null,
        }),
      });
      if (patch.ok) {
        result.rowsAffected.app_user_pseudonymized = users.length;
      } else {
        result.ok = false;
        result.warnings.push(`app_user pseudonymize non-ok: ${patch.status}`);
      }
    } catch (err) {
      result.ok = false;
      logger.warn({ err }, "DSR app_user pseudonymize threw");
      result.warnings.push("app_user pseudonymize threw");
    }
    result.warnings.push(
      "payment data retained (accounting retention); app_user pseudonymized in place"
    );
    return result;
  }

  result.rowsAffected.app_user = await deleteWhere(
    `/rest/v1/app_user?id=${userIdsFilter}`,
    "user",
    result
  );
  // waitlist_user is already deleted as a Tier-1 email-keyed row above.

  result.warnings.push("payment data retained (accounting retention)");
  return result;
}

export async function recordDsrAuditLog({
  emailNorm,
  action,
  adminEmail,
  ip,
  rowsAffected,
  notes,
}: {
  emailNorm: string;
  action: DsrAction;
  adminEmail: string;
  ip: string | null;
  rowsAffected: Record<string, number>;
  notes: string;
}): Promise<void> {
  try {
    await supabaseFetch("/rest/v1/data_subject_request_log", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        email_normalized: emailNorm,
        email_sha256: emailHash(emailNorm),
        action,
        admin_email: adminEmail,
        ip,
        rows_affected: rowsAffected,
        notes,
      }),
    });
  } catch (err) {
    // The DSR work already happened; failing to log is bad but not catastrophic.
    // Surface to ops Slack via the logger.error → Slack mirror.
    logger.error({ err, action }, "DSR audit log write failed");
  }
}
