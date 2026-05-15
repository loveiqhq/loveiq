import { NextResponse } from "next/server";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { logAdminAction } from "@features/admin/server/audit";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";
import { GET as coreKpisGet } from "../core-kpis/route";

interface KpiRow {
  layer: string;
  kpi: string;
  value: string;
  unit: string;
  definition: string;
  formula: string;
  whyItMatters: string;
}

function fmt(value: number | null, unit: "eur" | "pct" | "min" | "x" | "n"): string {
  if (value == null) return "—";
  switch (unit) {
    case "eur":
      return `€${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case "pct":
      return `${value.toFixed(1)}%`;
    case "min":
      return `${value.toFixed(1)} min`;
    case "x":
      return `${value.toFixed(2)}x`;
    case "n":
    default:
      return value.toLocaleString("en-US");
  }
}

function escapeCsv(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(request: Request) {
  const admin = await verifyAdminSession();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!hasRole(admin.role, "admin"))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const ip = getClientIp(request);
  const rl = await checkRateLimit(ip, {
    bucket: "admin-core-kpis-export",
    limit: 5,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Please try again later." }, { status: 429 });

  // Reuse the core-kpis handler so the CSV is byte-identical to the dashboard.
  let data: Awaited<ReturnType<typeof coreKpisGet>> extends Response ? unknown : never =
    undefined as never;
  try {
    const res = await coreKpisGet(request);
    if (!res.ok) {
      return NextResponse.json({ error: "Unable to load KPIs for export." }, { status: 500 });
    }
    data = await res.json();
  } catch (err) {
    logger.error({ err }, "core-kpis export: handler call failed");
    return NextResponse.json({ error: "Unable to load KPIs for export." }, { status: 500 });
  }

  // Type the payload concretely now that we have it.
  const k = data as {
    range: { since: string; days: number; daysInRange: number };
    marketingInput: {
      adSpendEur: number | null;
      channelMix: Array<{ channel: string; spend: number; pct: number }> | null;
      cpcEur: number | null;
    };
    traffic: { uniqueVisitors: number | null };
    surveyStart: { attempts: number; visitToSurveyCvr: number | null };
    surveyCompletion: {
      completed: number;
      completionRate: number;
      costPerCompletedEur: number | null;
      dropOffRate: number;
      avgDurationMinutes: number | null;
      medianDurationMinutes: number | null;
      p90DurationMinutes: number | null;
      completionsPerDay: number;
    };
    monetization: { paidReports: number; surveyToPaidCvr: number | null; paidPerDay: number };
    revenue: { arppEur: number | null; totalRevenueEur: number };
    unitEconomics: {
      cpprEur: number | null;
      cb1Eur: number | null;
      cb1PerReportEur: number | null;
    };
    engagement: {
      reopenRate: number | null;
      medianSessionMinutes: number | null;
      p90SessionMinutes: number | null;
    };
    perceivedValue: { sentimentScore: number | null; sampleSize: number };
    virality: {
      referAFriendRate: number | null;
      reportShareRate: number | null;
      avgInvitesPerReferrer: number | null;
      emailShareViewRate: number | null;
    };
    retention: { returnVisitRate: number | null };
    efficiency: { roas: number | null };
    segmentation: {
      completion: {
        archetype: Array<{ label: string; pct: number }>;
        country: Array<{ label: string; pct: number }>;
        gender: Array<{ label: string; pct: number }>;
        age: Array<{ label: string; pct: number }>;
      };
      paid: {
        archetype: Array<{ label: string; pct: number }>;
        country: Array<{ label: string; pct: number }>;
        gender: Array<{ label: string; pct: number }>;
        age: Array<{ label: string; pct: number }>;
      };
    };
  };

  const channelMixDisplay = k.marketingInput.channelMix
    ? k.marketingInput.channelMix.map((c) => `${c.channel} ${c.pct.toFixed(1)}%`).join(" | ")
    : "—";

  const segDisplay = (rows: Array<{ label: string; pct: number }>) =>
    rows.length === 0 ? "—" : rows.map((r) => `${r.label} ${r.pct.toFixed(1)}%`).join(" | ");

  const rows: KpiRow[] = [
    // Marketing Input
    {
      layer: "Marketing Input",
      kpi: "Advertisement spent",
      value: fmt(k.marketingInput.adSpendEur, "eur"),
      unit: "EUR",
      definition: "Total acquisition spend across all channels",
      formula: "Σ channel spend",
      whyItMatters: "Primary cost driver",
    },
    {
      layer: "Marketing Input",
      kpi: "Channel Mix",
      value: channelMixDisplay,
      unit: "% & € per channel",
      definition: "Budget distribution by channel",
      formula: "Channel spend / Total spend",
      whyItMatters: "Optimization & learning",
    },
    {
      layer: "Traffic",
      kpi: "Cost per Click (CPC)",
      value: fmt(k.marketingInput.cpcEur, "eur"),
      unit: "EUR",
      definition: "Average cost per paid click",
      formula: "Advertisement spent / Total clicks",
      whyItMatters: "Media efficiency",
    },
    {
      layer: "Traffic",
      kpi: "Unique Visitors",
      value: fmt(k.traffic.uniqueVisitors, "n"),
      unit: "count",
      definition: "Distinct site visitors",
      formula: "Unique sessions",
      whyItMatters: "True top-of-funnel size",
    },
    {
      layer: "Survey Start",
      kpi: "Survey Attempts",
      value: fmt(k.surveyStart.attempts, "n"),
      unit: "count",
      definition: "Users who start the survey",
      formula: "Count of starts (partial saves + completed submissions)",
      whyItMatters: "Engagement quality",
    },
    {
      layer: "Survey Start",
      kpi: "Visit → Survey CVR",
      value: fmt(k.surveyStart.visitToSurveyCvr, "pct"),
      unit: "%",
      definition: "Visitor-to-survey conversion",
      formula: "Survey attempts / Unique visitors",
      whyItMatters: "Messaging & intent fit",
    },
    {
      layer: "Survey Completion",
      kpi: "Survey Completed",
      value: fmt(k.surveyCompletion.completed, "n"),
      unit: "count",
      definition: "Fully completed surveys",
      formula: "Count of completions",
      whyItMatters: "Monetization gate",
    },
    {
      layer: "Survey Completion",
      kpi: "Survey Completion Rate",
      value: fmt(k.surveyCompletion.completionRate, "pct"),
      unit: "%",
      definition: "Attempts reaching completion",
      formula: "Survey completed / Survey attempts",
      whyItMatters: "UX, length, motivation",
    },
    {
      layer: "Survey Completion",
      kpi: "Cost per Survey Completed",
      value: fmt(k.surveyCompletion.costPerCompletedEur, "eur"),
      unit: "EUR",
      definition: "Advertisement cost per completion",
      formula: "Advertisement spent / Survey completed",
      whyItMatters: "CAC proxy",
    },
    {
      layer: "Survey Completion",
      kpi: "Survey Drop-off Rate",
      value: fmt(k.surveyCompletion.dropOffRate, "pct"),
      unit: "%",
      definition: "Abandoned surveys",
      formula: "1 − Completion rate",
      whyItMatters: "Friction indicator",
    },
    {
      layer: "Survey Completion",
      kpi: "Avg. Time to Complete (Median)",
      value: fmt(k.surveyCompletion.medianDurationMinutes, "min"),
      unit: "minutes",
      definition: "Median time spent completing survey",
      formula: "Median(duration_ms) / 60000",
      whyItMatters: "Fatigue & pacing control",
    },
    {
      layer: "Survey Completion",
      kpi: "Avg. Time to Complete (P90)",
      value: fmt(k.surveyCompletion.p90DurationMinutes, "min"),
      unit: "minutes",
      definition: "P90 time spent completing survey",
      formula: "P90(duration_ms) / 60000",
      whyItMatters: "Fatigue & pacing control",
    },
    {
      layer: "Survey Completion",
      kpi: "Survey Completions per Day",
      value: fmt(k.surveyCompletion.completionsPerDay, "n"),
      unit: "/day",
      definition: "Avg. daily completions",
      formula: "Survey completed / Days in range",
      whyItMatters: "Operational throughput",
    },
    {
      layer: "Monetization",
      kpi: "Paid Reports",
      value: fmt(k.monetization.paidReports, "n"),
      unit: "count",
      definition: "Sold reports",
      formula: "Count of payment WHERE status = succeeded",
      whyItMatters: "Core revenue unit",
    },
    {
      layer: "Monetization",
      kpi: "Survey → Paid CVR",
      value: fmt(k.monetization.surveyToPaidCvr, "pct"),
      unit: "%",
      definition: "Completion-to-purchase conversion",
      formula: "Paid reports / Survey completed",
      whyItMatters: "Value & pricing fit",
    },
    {
      layer: "Monetization",
      kpi: "Paid Reports per Day",
      value: fmt(k.monetization.paidPerDay, "n"),
      unit: "/day",
      definition: "Avg. daily paid reports",
      formula: "Paid reports / Days in range",
      whyItMatters: "Revenue velocity",
    },
    {
      layer: "Revenue",
      kpi: "Revenue per Paid Report (ARPP)",
      value: fmt(k.revenue.arppEur, "eur"),
      unit: "EUR",
      definition: "Avg. revenue per report",
      formula: "Total revenue / Paid reports",
      whyItMatters: "Pricing & upsell health",
    },
    {
      layer: "Revenue",
      kpi: "Total Revenue",
      value: fmt(k.revenue.totalRevenueEur, "eur"),
      unit: "EUR",
      definition: "Gross revenue",
      formula: "Σ payment.amount WHERE succeeded",
      whyItMatters: "Top-line performance",
    },
    {
      layer: "Unit Economics",
      kpi: "Cost per Paid Report (CPPR)",
      value: fmt(k.unitEconomics.cpprEur, "eur"),
      unit: "EUR",
      definition: "Advertisement cost per sale",
      formula: "Advertisement spent / Paid reports",
      whyItMatters: "CAC proxy",
    },
    {
      layer: "Unit Economics",
      kpi: "Gross Contribution (CB I)",
      value: fmt(k.unitEconomics.cb1Eur, "eur"),
      unit: "EUR",
      definition: "Revenue minus marketing",
      formula: "Total revenue − Marketing budget",
      whyItMatters: "First profitability check",
    },
    {
      layer: "Unit Economics",
      kpi: "CB I per Report",
      value: fmt(k.unitEconomics.cb1PerReportEur, "eur"),
      unit: "EUR",
      definition: "Contribution per report",
      formula: "CB I / Paid reports",
      whyItMatters: "Scales linearly",
    },
    {
      layer: "Engagement & Trust",
      kpi: "Report Reopen Rate",
      value: fmt(k.engagement.reopenRate, "pct"),
      unit: "%",
      definition: "Share of users reopening report",
      formula: "(Sessions − Unique reports) / Unique reports",
      whyItMatters: "Depth of perceived value",
    },
    {
      layer: "Engagement & Trust",
      kpi: "Avg. Report Session Duration (Median)",
      value: fmt(k.engagement.medianSessionMinutes, "min"),
      unit: "minutes",
      definition: "Median report session length",
      formula: "Median(ended_at − started_at)",
      whyItMatters: "Insight absorption proxy",
    },
    {
      layer: "Engagement & Trust",
      kpi: "Avg. Report Session Duration (P90)",
      value: fmt(k.engagement.p90SessionMinutes, "min"),
      unit: "minutes",
      definition: "P90 report session length",
      formula: "P90(ended_at − started_at)",
      whyItMatters: "Insight absorption proxy",
    },
    {
      layer: "Perceived Value",
      kpi: "Sentiment Score (NPS proxy)",
      value: `${fmt(k.perceivedValue.sentimentScore, "pct")} (n=${k.perceivedValue.sampleSize})`,
      unit: "%",
      definition: "Post-report thumbs up rate (proxy for NPS)",
      formula: "ups / (ups + downs) on report_section_feedback",
      whyItMatters: "Retention & referrals",
    },
    {
      layer: "Virality & Sharing",
      kpi: "Refer-a-friend Rate",
      value: fmt(k.virality.referAFriendRate, "pct"),
      unit: "%",
      definition: "Rate of users referring at least one other person",
      formula: "DISTINCT referrer_email in invite_event / Paid reports",
      whyItMatters: "Organic growth engine",
    },
    {
      layer: "Virality & Sharing",
      kpi: "Report Share Rate",
      value: fmt(k.virality.reportShareRate, "pct"),
      unit: "%",
      definition: "Share of reports that were shared (granted access)",
      formula: "DISTINCT personal_report_id in report_share / Paid reports",
      whyItMatters: "Organic growth engine",
    },
    {
      layer: "Virality & Sharing",
      kpi: "Avg. Invites per Referrer",
      value: fmt(k.virality.avgInvitesPerReferrer, "n"),
      unit: "count",
      definition: "Avg. invites sent per unique referrer",
      formula: "invite_event.count / DISTINCT referrer_email",
      whyItMatters: "Viral coefficient input",
    },
    {
      layer: "Virality & Sharing",
      kpi: "Shared Report View Rate",
      value: fmt(k.virality.emailShareViewRate, "pct"),
      unit: "%",
      definition: "Share recipients who opened the shared report",
      formula: "Shares with view_count > 0 / Total shares",
      whyItMatters: "UX & trust signal",
    },
    {
      layer: "Retention (Early)",
      kpi: "Return Visit Rate",
      value: fmt(k.retention.returnVisitRate, "pct"),
      unit: "%",
      definition: "Users returning after first report",
      formula: "Users with ≥2 report sessions / Paid reports",
      whyItMatters: "Long-term relationship signal",
    },
    {
      layer: "Efficiency & Scale",
      kpi: "ROAS (Return on Ad Spend)",
      value: fmt(k.efficiency.roas, "x"),
      unit: "multiple",
      definition: "Revenue vs marketing spend",
      formula: "Total revenue / Marketing budget",
      whyItMatters: "Scale sanity check",
    },
    // Segmentation — completion
    {
      layer: "Segmentation",
      kpi: "Completion — Primary Archetype",
      value: segDisplay(k.segmentation.completion.archetype),
      unit: "% per segment",
      definition: "Completed-survey breakdown by primary archetype",
      formula: "scoring_result GROUP BY primary_archetype",
      whyItMatters: "Emotional resonance signal",
    },
    {
      layer: "Segmentation",
      kpi: "Completion — Country",
      value: segDisplay(k.segmentation.completion.country),
      unit: "% per segment",
      definition: "Completed-survey breakdown by country",
      formula: "user_profile.location_primary",
      whyItMatters: "ICP definition / audience enhancement",
    },
    {
      layer: "Segmentation",
      kpi: "Completion — Gender",
      value: segDisplay(k.segmentation.completion.gender),
      unit: "% per segment",
      definition: "Completed-survey breakdown by gender",
      formula: "user_profile.gender",
      whyItMatters: "ICP definition / audience enhancement",
    },
    {
      layer: "Segmentation",
      kpi: "Completion — Age",
      value: segDisplay(k.segmentation.completion.age),
      unit: "% per segment",
      definition: "Completed-survey breakdown by age bucket",
      formula: "Bucketed user_profile.birthday",
      whyItMatters: "ICP definition / audience enhancement",
    },
    // Segmentation — paid
    {
      layer: "Segmentation",
      kpi: "Paid — Primary Archetype",
      value: segDisplay(k.segmentation.paid.archetype),
      unit: "% per segment",
      definition: "Paying-customer breakdown by primary archetype",
      formula: "scoring_result ∩ succeeded payments",
      whyItMatters: "ICP definition / audience enhancement",
    },
    {
      layer: "Segmentation",
      kpi: "Paid — Country",
      value: segDisplay(k.segmentation.paid.country),
      unit: "% per segment",
      definition: "Paying-customer breakdown by country",
      formula: "user_profile.location_primary ∩ succeeded payments",
      whyItMatters: "ICP definition / audience enhancement",
    },
    {
      layer: "Segmentation",
      kpi: "Paid — Gender",
      value: segDisplay(k.segmentation.paid.gender),
      unit: "% per segment",
      definition: "Paying-customer breakdown by gender",
      formula: "user_profile.gender ∩ succeeded payments",
      whyItMatters: "ICP definition / audience enhancement",
    },
    {
      layer: "Segmentation",
      kpi: "Paid — Age",
      value: segDisplay(k.segmentation.paid.age),
      unit: "% per segment",
      definition: "Paying-customer breakdown by age bucket",
      formula: "Bucketed user_profile.birthday ∩ succeeded payments",
      whyItMatters: "ICP definition / audience enhancement",
    },
  ];

  const header = ["Layer", "KPI", "Value", "Unit", "Definition", "Formula", "Why it matters"];
  const csv = [
    `# Core_KPI Export — generated ${new Date().toISOString()} for window ${k.range.days}d`,
    header.map(escapeCsv).join(","),
    ...rows.map((r) =>
      [r.layer, r.kpi, r.value, r.unit, r.definition, r.formula, r.whyItMatters]
        .map(escapeCsv)
        .join(",")
    ),
  ].join("\n");

  void logAdminAction({
    admin_email: admin.email,
    action: "export_core_kpis",
    resource_type: "analytics",
    metadata: { days: k.range.days },
    ip,
  });

  const filename = `core-kpis-${new Date().toISOString().slice(0, 10)}-${k.range.days}d.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
