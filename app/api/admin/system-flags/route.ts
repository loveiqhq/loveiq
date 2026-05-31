/**
 * F-12: Admin API for toggling system kill-switch flags.
 *
 * GET  /api/admin/system-flags
 *   → { flags: [{ key, enabled, description, updated_at, updated_by }] }
 *
 * PATCH /api/admin/system-flags
 *   Body: { key: string, enabled: boolean }
 *   → { ok: true, flag: {...} }
 *
 * Admin role required. CSRF + rate-limited. Every flip is recorded via
 * logAdminAction and pinged to ops Slack. The system_flags helper reads
 * are cached 30 s in-process so a PATCH propagates within that window.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { logAdminAction } from "@features/admin/server/audit";
import { supabaseFetch } from "@features/admin/server/supabase";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import { notifySlack, escapeSlack, maskEmail } from "@shared/observability/slack";
import logger from "@shared/observability/logger";

const patchSchema = z.object({
  key: z.string().min(1).max(64),
  enabled: z.boolean(),
});

const ALLOWED_KEYS = new Set(["survey_submissions", "nurture_sequence", "report_paywall_enforced"]);

export async function GET() {
  const admin = await verifyAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!hasRole(admin.role, "viewer")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const res = await supabaseFetch(
      "/rest/v1/system_flags?select=key,enabled,description,updated_at,updated_by&order=key.asc"
    );
    if (!res.ok) {
      logger.error({ status: res.status }, "system-flags GET failed");
      return NextResponse.json({ error: "Unable to load flags." }, { status: 500 });
    }
    const flags = await res.json();
    return NextResponse.json({ flags });
  } catch (err) {
    logger.error({ err }, "system-flags GET error");
    return NextResponse.json({ error: "Unable to load flags." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
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
    bucket: "admin-system-flags",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }
  if (!ALLOWED_KEYS.has(parsed.data.key)) {
    return NextResponse.json({ error: "Unknown flag." }, { status: 400 });
  }

  try {
    // R-20: capture the prior value so the audit log records {prior, next}.
    // Without this, reconstructing the history of a flag requires joining
    // sequential rows and inferring order. Best-effort: a fetch failure
    // doesn't block the toggle.
    let priorEnabled: boolean | null = null;
    try {
      const priorRes = await supabaseFetch(
        `/rest/v1/system_flags?key=eq.${encodeURIComponent(parsed.data.key)}&select=enabled&limit=1`
      );
      if (priorRes.ok) {
        const priorRows = (await priorRes.json()) as Array<{ enabled: boolean }>;
        if (priorRows.length > 0) priorEnabled = priorRows[0]!.enabled;
      }
    } catch {
      // Ignore — the audit entry will just record `prior: null`.
    }

    const res = await supabaseFetch(
      `/rest/v1/system_flags?key=eq.${encodeURIComponent(parsed.data.key)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          enabled: parsed.data.enabled,
          updated_at: new Date().toISOString(),
          updated_by: admin.email,
        }),
      }
    );
    if (!res.ok) {
      logger.error({ status: res.status, key: parsed.data.key }, "system-flags PATCH failed");
      return NextResponse.json({ error: "Unable to update flag." }, { status: 500 });
    }
    const rows = (await res.json()) as unknown[];
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "Flag not found." }, { status: 404 });
    }

    await logAdminAction({
      admin_email: admin.email,
      action: "toggle_system_flag",
      resource_type: "system_flag",
      resource_id: parsed.data.key,
      metadata: { prior: priorEnabled, next: parsed.data.enabled },
      ip,
    });

    await notifySlack({
      channel: "ops",
      kind: "system_flag_toggle",
      text: `:control_knobs: *${escapeSlack(parsed.data.key)}* set to *${parsed.data.enabled ? "ENABLED" : "DISABLED"}* by ${escapeSlack(maskEmail(admin.email))}`,
      username: "ops_alerts",
    });

    return NextResponse.json({ ok: true, flag: rows[0] });
  } catch (err) {
    logger.error({ err, key: parsed.data.key }, "system-flags PATCH error");
    return NextResponse.json({ error: "Unable to update flag." }, { status: 500 });
  }
}
