/**
 * F-01: GDPR DSAR endpoint.
 *
 * POST /api/admin/data-subject
 * Body: { email: string; action: "export" | "delete"; confirm?: string }
 *
 * For action=delete, `confirm` must equal `DELETE-<normalized_email>` so an
 * admin cannot fat-finger an email and accidentally wipe a real user's data.
 *
 * Response:
 *   export → { rowsAffected, exportData, warnings }
 *   delete → { rowsAffected, warnings }
 *
 * Every call writes a row to `data_subject_request_log` (regardless of
 * success/failure) for compliance audit purposes.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { logAdminAction } from "@features/admin/server/audit";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import { notifySlack, escapeSlack, maskEmail } from "@shared/observability/slack";
import logger from "@shared/observability/logger";
import {
  deleteDataSubject,
  exportDataSubject,
  normalizeEmail,
  recordDsrAuditLog,
} from "@features/admin/server/data-subject";

const bodySchema = z.object({
  email: z.string().min(3).max(320),
  action: z.enum(["export", "delete"]),
  confirm: z.string().max(400).optional(),
});

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
    bucket: "admin-data-subject",
    limit: 10,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const emailNorm = normalizeEmail(parsed.data.email);
  if (!emailNorm) {
    return NextResponse.json({ error: "Invalid email." }, { status: 400 });
  }

  // Delete requires the explicit confirm string. Keeps DSR delete from being
  // a one-click footgun in the admin UI.
  if (parsed.data.action === "delete") {
    const expectedConfirm = `DELETE-${emailNorm}`;
    if (parsed.data.confirm !== expectedConfirm) {
      return NextResponse.json(
        { error: `Delete requires confirm: "${expectedConfirm}".` },
        { status: 400 }
      );
    }
  }

  try {
    const result =
      parsed.data.action === "export"
        ? await exportDataSubject(emailNorm)
        : await deleteDataSubject(emailNorm);

    // Audit log (best-effort; failures don't block response — see helper).
    await recordDsrAuditLog({
      emailNorm,
      action: parsed.data.action,
      adminEmail: admin.email,
      ip,
      rowsAffected: result.rowsAffected,
      notes: result.warnings.join("; "),
    });

    // Mirror to admin_action_log for the standard admin audit trail.
    await logAdminAction({
      admin_email: admin.email,
      action: `data_subject_${parsed.data.action}`,
      resource_type: "data_subject",
      resource_id: emailNorm,
      metadata: { rowsAffected: result.rowsAffected, warnings: result.warnings },
      ip,
    });

    // Ops Slack alert — DSR actions are uncommon and worth visibility.
    await notifySlack({
      channel: "ops",
      kind: `data_subject_${parsed.data.action}`,
      text: `:package: *DSR ${parsed.data.action}* — ${escapeSlack(maskEmail(emailNorm))} by ${escapeSlack(maskEmail(admin.email))} — ${result.ok ? "ok" : "partial"}`,
      username: "ops_alerts",
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  } catch (err) {
    logger.error({ err, action: parsed.data.action }, "DSR handler error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
