import { getBreaker } from "@shared/http/circuit-breaker";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import {
  getStrongestReportAccessPlan,
  isReportPurchasePlan,
  type ReportAccessPlan,
} from "@features/report/server/access";

export type { ReportAccessPlan } from "@features/report/server/access";

/**
 * Every reader may share their report with two people, paid or not (Marcus, LoveIQ
 * WhatsApp group, 2026-10-05: "people can share the report to up to 2 people for free in
 * the state the report has"). A recipient sees it as its owner does — locked where the
 * owner has not paid — because /api/report gives a shared viewer the owner's own plan.
 * Until then only buyers could share, essentials with one seat.
 */
export const SHARE_SEAT_LIMIT = 2;

/** What report_share.plan_at_share records: the owner's plan then, or 'free'. */
export function sharePlanLabel(
  plan: ReportAccessPlan
): "free" | "essentials" | "full_report" | "core" | "all_reports" {
  return plan ?? "free";
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

async function supabaseGet(path: string) {
  const { url, serviceRoleKey } = getSupabaseServiceConfig();
  return getBreaker("supabase").fire(() =>
    fetchWithTimeout(`${url}${path}`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      method: "GET",
      timeoutMs: SUPABASE_TIMEOUT_MS,
    })
  );
}

/**
 * Resolve the strongest succeeded plan tier for a personal_report.
 * Returns null when no succeeded payment exists (free / unpaid reports).
 */
export async function getReportPlanByPersonalReportId(
  personalReportId: number
): Promise<ReportAccessPlan> {
  const response = await supabaseGet(
    `/rest/v1/payment?personal_report_id=eq.${personalReportId}&status=eq.succeeded&select=metadata,payment_date_time&order=payment_date_time.desc`
  );

  if (!response.ok) {
    throw new Error("payment_lookup_failed");
  }

  const rows = (await response.json()) as Array<{
    metadata: Record<string, unknown> | null;
  }>;

  return getStrongestReportAccessPlan(
    rows.map((row) => {
      const candidate = row.metadata?.plan;
      return isReportPurchasePlan(candidate) ? candidate : null;
    })
  );
}
