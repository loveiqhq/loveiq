import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";

export type DashboardSubscriptionCadence = "daily" | "weekly" | "monthly";
export type DashboardSubscriptionAudience =
  | "leadership"
  | "strategy"
  | "product"
  | "growth"
  | "tech"
  | "ops"
  | "research";

export interface DashboardSubscriptionOption {
  key: string;
  label: string;
  href: string;
  audience: DashboardSubscriptionAudience;
}

export interface AdminDashboardSubscriptionRow {
  id: number;
  admin_email: string;
  dashboard_key: string;
  dashboard_label: string;
  audience_role: DashboardSubscriptionAudience;
  cadence: DashboardSubscriptionCadence;
  subscriber_emails: string[] | null;
  linked_metric_key: string | null;
  note: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const DASHBOARD_SUBSCRIPTION_OPTIONS: DashboardSubscriptionOption[] = [
  {
    key: "command-center",
    label: "Command Center",
    href: "/admin",
    audience: "leadership",
  },
  {
    key: "operating-review",
    label: "Operating Review",
    href: "/admin/operating-review",
    audience: "leadership",
  },
  {
    key: "strategy-lead",
    label: "Strategy Lead",
    href: "/admin/strategy-lead",
    audience: "strategy",
  },
  {
    key: "product-lead",
    label: "Product Lead",
    href: "/admin/product-lead",
    audience: "product",
  },
  {
    key: "growth-lead",
    label: "Growth Lead",
    href: "/admin/growth-lead",
    audience: "growth",
  },
  {
    key: "tech-lead",
    label: "Tech Lead",
    href: "/admin/tech-lead",
    audience: "tech",
  },
  {
    key: "metrics-benchmarks",
    label: "Metrics & Benchmarks",
    href: "/admin/benchmarks",
    audience: "ops",
  },
  {
    key: "strategy-hub",
    label: "Strategy Hub",
    href: "/admin/strategy",
    audience: "strategy",
  },
  {
    key: "research-intelligence",
    label: "Research Intelligence",
    href: "/admin/research",
    audience: "research",
  },
  {
    key: "admin-tools",
    label: "Admin Tools",
    href: "/admin/tools",
    audience: "ops",
  },
];

function normalizeSubscriberEmails(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const emails = value
    .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
    .filter(Boolean);
  return emails.length > 0 ? [...new Set(emails)] : [];
}

export async function fetchDashboardSubscriptions(): Promise<AdminDashboardSubscriptionRow[]> {
  try {
    const res = await supabaseFetch(
      "/rest/v1/admin_dashboard_subscription?select=*&order=updated_at.desc",
      {
        headers: { Range: "0-199" },
      }
    );

    if (!res.ok) return [];

    const rows = (await res.json()) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: Number(row.id),
      admin_email: String(row.admin_email ?? ""),
      dashboard_key: String(row.dashboard_key ?? ""),
      dashboard_label: String(row.dashboard_label ?? ""),
      audience_role: row.audience_role as DashboardSubscriptionAudience,
      cadence: row.cadence as DashboardSubscriptionCadence,
      subscriber_emails: normalizeSubscriberEmails(row.subscriber_emails),
      linked_metric_key: typeof row.linked_metric_key === "string" ? row.linked_metric_key : null,
      note: typeof row.note === "string" ? row.note : null,
      is_active: Boolean(row.is_active),
      created_at: String(row.created_at ?? ""),
      updated_at: String(row.updated_at ?? ""),
    }));
  } catch (err) {
    logger.warn({ err }, "Dashboard subscriptions unavailable");
    return [];
  }
}
