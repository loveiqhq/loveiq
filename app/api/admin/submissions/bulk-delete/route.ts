/**
 * Bulk-delete survey submissions and their cascade.
 *
 * Locked down: admin role only, CSRF + rate-limited, capped at 100 ids per
 * request. Each id is independently re-verified server-side as
 * `is_likely_test === true` before deletion (the client cannot lie about
 * which submissions are tests). Submissions with a `personal_report` row
 * are ALWAYS skipped, even if they otherwise look like tests.
 *
 * Body: { ids: number[] }
 * Response: { deleted: number, skipped: Array<{ id: number; reason: string }> }
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { logAdminAction } from "@features/admin/server/audit";
import { deleteSubmissionCascade } from "@features/admin/server/delete-submission";
import { evaluateTestSubmission } from "@features/admin/server/test-submission";
import { supabaseFetch } from "@features/admin/server/supabase";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import { notifySlack, escapeSlack } from "@shared/observability/slack";
import logger from "@shared/observability/logger";

const bodySchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(100),
});

interface SubmissionLookupRow {
  id: number;
  duration_ms: number | null;
  app_user: { email: string | null } | null;
}

export async function POST(request: Request) {
  const admin = await verifyAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!hasRole(admin.role, "admin")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-bulk-delete",
    limit: 5,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  // Dedupe + cap defensively (Zod already caps but be explicit).
  const ids = [...new Set(parsed.data.ids)].slice(0, 100);

  // Look up every submission in a single query so we can re-evaluate the test
  // flag against authoritative data, not whatever the client claimed.
  const lookupQuery =
    `/rest/v1/survey_submission?id=in.(${ids.join(",")})` +
    `&select=id,duration_ms,app_user!fk_survey_submission_user(email)`;
  const lookupRes = await supabaseFetch(lookupQuery, {
    headers: { Range: `0-${Math.max(ids.length - 1, 0)}` },
  });
  if (!lookupRes.ok) {
    logger.error({ status: lookupRes.status }, "Bulk-delete lookup failed");
    return NextResponse.json({ error: "Unable to load submissions." }, { status: 500 });
  }

  const rows = (await lookupRes.json()) as SubmissionLookupRow[];
  const byId = new Map<number, SubmissionLookupRow>();
  for (const row of rows) byId.set(row.id, row);

  const skipped: Array<{ id: number; reason: string }> = [];
  let deleted = 0;

  for (const id of ids) {
    const row = byId.get(id);
    if (!row) {
      skipped.push({ id, reason: "not_found" });
      continue;
    }
    const evaluation = evaluateTestSubmission({
      recordType: "submission",
      email: row.app_user?.email ?? null,
      durationMs: row.duration_ms,
    });
    if (!evaluation.isLikelyTest) {
      skipped.push({ id, reason: "not_test_submission" });
      continue;
    }

    const result = await deleteSubmissionCascade(id);
    if (!result.ok) {
      skipped.push({ id, reason: result.reason });
      continue;
    }

    deleted += 1;
    await logAdminAction({
      admin_email: admin.email,
      action: "delete_submission_bulk",
      resource_type: "submission",
      resource_id: String(id),
      metadata: { reasons: evaluation.reasons },
      ip,
    });
  }

  logger.info({ adminEmail: admin.email, deleted, skipped: skipped.length, ip }, "Bulk delete");

  if (deleted > 0) {
    const sample = ids.slice(0, 5).join(", ");
    const more = ids.length > 5 ? ` (+${ids.length - 5} more)` : "";
    await notifySlack({
      channel: "ops",
      kind: "admin_bulk_delete",
      text: `:wastebasket: *${escapeSlack(admin.email)}* bulk-deleted ${deleted} submission(s) (skipped ${skipped.length}). IDs: ${sample}${more}`,
      username: "ops_alerts",
    });
  }

  return NextResponse.json({ deleted, skipped });
}
