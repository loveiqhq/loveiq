import { getBreaker } from "@/lib/circuit-breaker";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import {
  getStrongestReportAccessPlan,
  isReportPurchasePlan,
  type ReportAccessPlan,
} from "@/lib/report/access";

export type { ReportAccessPlan } from "@/lib/report/access";

export const SHARE_SEAT_LIMIT_BY_PLAN: Record<NonNullable<ReportAccessPlan>, number> = {
  essentials: 1,
  full_report: 2,
  all_reports: 2,
};

export function getShareSeatLimit(plan: ReportAccessPlan): number {
  switch (plan) {
    case "full_report":
    case "all_reports":
      return 2;
    case "essentials":
      return 1;
    case null:
    default:
      return 0;
  }
}

export function canSharePlan(plan: ReportAccessPlan): boolean {
  return getShareSeatLimit(plan) > 0;
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
