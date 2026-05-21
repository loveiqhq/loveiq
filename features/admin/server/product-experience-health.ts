import {
  buildMetricStatusSnapshot,
  type MetricStatusBoardEntry,
} from "@features/admin/server/metric-status";
import { buildProductAdoptionSnapshot } from "@features/admin/server/product-adoption";
import { buildProductIssueRadarSnapshot } from "@features/admin/server/product-issue-radar";
import { buildProductKpiHref } from "@features/admin/server/drilldowns";
import { clampDays } from "@features/admin/server/next-level";
import { supabaseFetch } from "@features/admin/server/supabase";

type ExperienceTone = "good" | "watch" | "risk";

interface ExperienceSignal {
  label: string;
  value: string;
  tone: ExperienceTone | "neutral";
}

export interface ProductExperienceArea {
  key: "onboarding" | "completion" | "report-consumption" | "referrals" | "monetization";
  label: string;
  tone: ExperienceTone;
  score: number;
  primaryMetricKey: string | null;
  primaryMetricLabel: string;
  primaryMetricValue: string;
  ownerEmail: string | null;
  reviewState: "fresh" | "due" | "overdue" | "none";
  summary: string;
  riskSummary: string;
  nextMove: string;
  href: string;
  signals: ExperienceSignal[];
}

export interface ProductExperienceHealthSnapshot {
  generatedAt: string;
  days: number;
  summary: {
    areas: number;
    good: number;
    watch: number;
    risk: number;
    averageScore: number;
    reviewsDue: number;
  };
  areas: ProductExperienceArea[];
}

interface PipelineSummary {
  waitlistSignups: number;
  surveyStarted: number;
  reportViewed: number;
  paymentCompleted: number;
}

interface ReferralSummary {
  totalInvites: number;
  completionsFromInvites: number;
  viralCoefficient: number;
}

interface MonetizationSummary {
  totalRevenue: number;
  successRate: number;
  succeededCount: number;
  totalPayments: number;
}

function scoreFromMetricState(state: MetricStatusBoardEntry["statusState"]): number {
  if (state === "on-track") return 86;
  if (state === "watch") return 66;
  if (state === "off-track") return 42;
  return 20;
}

function toneFromScore(score: number): ExperienceTone {
  if (score >= 75) return "good";
  if (score >= 50) return "watch";
  return "risk";
}

function reviewState(
  entry: MetricStatusBoardEntry | undefined
): "fresh" | "due" | "overdue" | "none" {
  if (!entry) return "none";
  return entry.reviewState === "unplanned" ? "none" : entry.reviewState;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatCount(value: number) {
  return value.toLocaleString();
}

function buildTabHref(pathname: string, tab: string) {
  return `${pathname}?${new URLSearchParams({ tab }).toString()}`;
}

async function fetchPipelineSummary(days: number): Promise<PipelineSummary> {
  const since =
    days > 0
      ? new Date(Date.now() - days * 86_400_000).toISOString()
      : new Date("2000-01-01T00:00:00.000Z").toISOString();

  const res = await supabaseFetch("/rest/v1/rpc/get_conversion_pipeline", {
    method: "POST",
    body: JSON.stringify({ since_ts: since }),
  });
  if (!res.ok) {
    return { waitlistSignups: 0, surveyStarted: 0, reportViewed: 0, paymentCompleted: 0 };
  }

  const raw = await res.json();
  return {
    waitlistSignups: Number(raw?.stages?.waitlist_signups ?? 0),
    surveyStarted: Number(raw?.stages?.survey_started ?? 0),
    reportViewed: Number(raw?.stages?.report_viewed ?? 0),
    paymentCompleted: Number(raw?.stages?.payment_completed ?? 0),
  };
}

async function fetchReferralSummary(days: number): Promise<ReferralSummary> {
  const since = days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : null;
  const res = await supabaseFetch("/rest/v1/rpc/get_referral_chains", {
    method: "POST",
    body: JSON.stringify({ since_ts: since }),
  });
  if (!res.ok) {
    return { totalInvites: 0, completionsFromInvites: 0, viralCoefficient: 0 };
  }

  const data = await res.json();
  return {
    totalInvites: Number(data?.total_invites ?? 0),
    completionsFromInvites: Number(data?.completions_from_invites ?? 0),
    viralCoefficient: Number(data?.viral_coefficient ?? 0),
  };
}

async function fetchMonetizationSummary(days: number): Promise<MonetizationSummary> {
  const since = days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : null;
  const dateFilter = since ? `&payment_date_time=gte.${since}` : "";
  const res = await supabaseFetch(
    `/rest/v1/payment?select=amount,status${dateFilter}&order=payment_date_time.desc`,
    { headers: { Range: "0-49999" } }
  );

  if (!res.ok) {
    return { totalRevenue: 0, successRate: 0, succeededCount: 0, totalPayments: 0 };
  }

  const rows = (await res.json()) as Array<{ amount: number | null; status: string }>;
  const succeeded = rows.filter((row) => row.status === "succeeded");

  return {
    totalRevenue:
      Math.round(succeeded.reduce((sum, row) => sum + Number(row.amount ?? 0), 0) * 100) / 100,
    successRate: rows.length > 0 ? Math.round((succeeded.length / rows.length) * 1000) / 10 : 0,
    succeededCount: succeeded.length,
    totalPayments: rows.length,
  };
}

function metricEntryByKey(
  statuses: MetricStatusBoardEntry[],
  key: string
): MetricStatusBoardEntry | undefined {
  return statuses.find((entry) => entry.metricKey === key);
}

export async function buildProductExperienceHealthSnapshot(
  inputDays: number
): Promise<ProductExperienceHealthSnapshot> {
  const days = clampDays(inputDays || 30, 7, 90);
  const [metricStatus, issueRadar, adoption, pipeline, referrals, monetization] = await Promise.all(
    [
      buildMetricStatusSnapshot(days),
      buildProductIssueRadarSnapshot(days),
      buildProductAdoptionSnapshot(days),
      fetchPipelineSummary(days),
      fetchReferralSummary(days),
      fetchMonetizationSummary(days),
    ]
  );

  const waitlistToStart = metricEntryByKey(metricStatus.statuses, "waitlist_to_start_rate");
  const waitlistSignups = metricEntryByKey(metricStatus.statuses, "waitlist_signups");
  const completionRate = metricEntryByKey(metricStatus.statuses, "completion_rate");
  const avgDuration = metricEntryByKey(metricStatus.statuses, "avg_duration_minutes");
  const reportViewRate = metricEntryByKey(metricStatus.statuses, "report_view_rate");
  const revenueTotal = metricEntryByKey(metricStatus.statuses, "revenue_total");

  const onboardingScore = clampScore(
    scoreFromMetricState(waitlistToStart?.statusState ?? "watch") -
      (issueRadar.summary.contextHotspots > 0 ? 4 : 0)
  );
  const completionScore = clampScore(
    scoreFromMetricState(completionRate?.statusState ?? "watch") -
      Math.min(issueRadar.summary.criticalQuestions * 2, 18) -
      (avgDuration?.statusState === "critical"
        ? 8
        : avgDuration?.statusState === "off-track"
          ? 5
          : 0)
  );
  const reportScore = clampScore(
    scoreFromMetricState(reportViewRate?.statusState ?? "watch") -
      Math.min(adoption.summary.blindspots * 4, 16) -
      Math.min(adoption.summary.openReviews * 2, 10)
  );

  const referralConversionRate =
    referrals.totalInvites > 0
      ? Math.round((referrals.completionsFromInvites / referrals.totalInvites) * 1000) / 10
      : 0;
  const referralScore = clampScore(
    referrals.viralCoefficient >= 0.25
      ? 82
      : referrals.viralCoefficient >= 0.12
        ? 66
        : referrals.totalInvites > 0
          ? 42
          : 35
  );

  const monetizationScore = clampScore(
    scoreFromMetricState(revenueTotal?.statusState ?? "watch") +
      (monetization.successRate >= 85 ? 6 : monetization.successRate >= 70 ? 0 : -14)
  );

  const areas: ProductExperienceArea[] = [
    {
      key: "onboarding",
      label: "Onboarding",
      tone: toneFromScore(onboardingScore),
      score: onboardingScore,
      primaryMetricKey: waitlistToStart?.metricKey ?? null,
      primaryMetricLabel: waitlistToStart?.label ?? "Waitlist -> Start",
      primaryMetricValue: waitlistToStart?.currentValueLabel ?? "Not tracked",
      ownerEmail: waitlistToStart?.statusOwnerEmail ?? null,
      reviewState: reviewState(waitlistToStart),
      summary:
        "Demand turning into started sessions cleanly enough to feed the rest of the product.",
      riskSummary:
        issueRadar.summary.contextHotspots > 0
          ? `${issueRadar.summary.contextHotspots} context hotspots are concentrating onboarding friction.`
          : "No concentrated onboarding friction hotspot is dominating the current window.",
      nextMove:
        onboardingScore < 50
          ? "Audit source and placement hotspots first, then tighten the first-screen transition from waitlist to survey."
          : "Keep monitoring acquisition mix and preserve the current start-rate posture.",
      href: "/admin/pipeline",
      signals: [
        {
          label: "Waitlist -> Start",
          value: waitlistToStart?.currentValueLabel ?? "Not tracked",
          tone: toneFromScore(scoreFromMetricState(waitlistToStart?.statusState ?? "watch")),
        },
        {
          label: "Waitlist Signups",
          value: waitlistSignups?.currentValueLabel ?? formatCount(pipeline.waitlistSignups),
          tone: "neutral",
        },
        {
          label: "Survey Starts",
          value: formatCount(pipeline.surveyStarted),
          tone: "neutral",
        },
      ],
    },
    {
      key: "completion",
      label: "Completion",
      tone: toneFromScore(completionScore),
      score: completionScore,
      primaryMetricKey: completionRate?.metricKey ?? null,
      primaryMetricLabel: completionRate?.label ?? "Completion Rate",
      primaryMetricValue: completionRate?.currentValueLabel ?? "Not tracked",
      ownerEmail: completionRate?.statusOwnerEmail ?? null,
      reviewState: reviewState(completionRate),
      summary:
        "Survey flow quality from start through completion, including time burden and question-level failure points.",
      riskSummary: `${issueRadar.summary.criticalQuestions} critical questions, ${issueRadar.summary.chapterHotspots} chapter hotspots, ${issueRadar.summary.lowQualityQuestions} low-quality questions.`,
      nextMove:
        completionScore < 50
          ? "Start with the top issue-radar cluster and the highest-friction chapter before editing downstream reporting or monetization surfaces."
          : "Protect completion quality by reviewing top chapter hotspots before they spill into broader funnel loss.",
      href: buildProductKpiHref({ days, tab: "Issue Radar" }),
      signals: [
        {
          label: "Completion Rate",
          value: completionRate?.currentValueLabel ?? "Not tracked",
          tone: toneFromScore(scoreFromMetricState(completionRate?.statusState ?? "watch")),
        },
        {
          label: "Avg Minutes",
          value: avgDuration?.currentValueLabel ?? "Not tracked",
          tone:
            avgDuration?.statusState === "critical" || avgDuration?.statusState === "off-track"
              ? "risk"
              : avgDuration?.statusState === "watch"
                ? "watch"
                : "neutral",
        },
        {
          label: "Critical Questions",
          value: String(issueRadar.summary.criticalQuestions),
          tone: issueRadar.summary.criticalQuestions > 0 ? "risk" : "neutral",
        },
      ],
    },
    {
      key: "report-consumption",
      label: "Report Consumption",
      tone: toneFromScore(reportScore),
      score: reportScore,
      primaryMetricKey: reportViewRate?.metricKey ?? null,
      primaryMetricLabel: reportViewRate?.label ?? "Report View Rate",
      primaryMetricValue: reportViewRate?.currentValueLabel ?? "Not tracked",
      ownerEmail: reportViewRate?.statusOwnerEmail ?? null,
      reviewState: reviewState(reportViewRate),
      summary:
        "Whether completed work turns into actual report consumption and validated post-launch outcomes.",
      riskSummary:
        adoption.summary.blindspots > 0 || adoption.summary.openReviews > 0
          ? `${adoption.summary.blindspots} launch blindspots and ${adoption.summary.openReviews} open launch reviews are weakening readout quality.`
          : "Launch review posture is not currently degrading report-consumption visibility.",
      nextMove:
        reportScore < 50
          ? "Close launch blindspots and overdue release reviews before assuming weak report viewing is a content problem."
          : "Use feature-adoption reviews to keep report-consumption readouts decision-ready.",
      href: buildProductKpiHref({ days, tab: "Feature Adoption" }),
      signals: [
        {
          label: "Report View Rate",
          value: reportViewRate?.currentValueLabel ?? "Not tracked",
          tone: toneFromScore(scoreFromMetricState(reportViewRate?.statusState ?? "watch")),
        },
        {
          label: "Viewed Reports",
          value: formatCount(pipeline.reportViewed),
          tone: "neutral",
        },
        {
          label: "Launch Blindspots",
          value: String(adoption.summary.blindspots),
          tone: adoption.summary.blindspots > 0 ? "watch" : "neutral",
        },
      ],
    },
    {
      key: "referrals",
      label: "Referrals",
      tone: toneFromScore(referralScore),
      score: referralScore,
      primaryMetricKey: null,
      primaryMetricLabel: "Referral Loop",
      primaryMetricValue: `${referrals.viralCoefficient.toFixed(2)} viral coefficient`,
      ownerEmail: null,
      reviewState: "none",
      summary:
        "How effectively completed experiences produce invites and additional completed users.",
      riskSummary:
        referrals.totalInvites === 0
          ? "Referral activity is effectively absent in the selected window."
          : `${referrals.completionsFromInvites} completions came from ${referrals.totalInvites} invites.`,
      nextMove:
        referralScore < 50
          ? "Audit referral-chain quality and invite conversion before investing in more share volume."
          : "Keep the referral loop healthy by monitoring invite quality alongside raw invite volume.",
      href: buildTabHref("/admin/growth", "Referral Chains"),
      signals: [
        {
          label: "Invites",
          value: formatCount(referrals.totalInvites),
          tone: referrals.totalInvites > 0 ? "neutral" : "risk",
        },
        {
          label: "Invite Completion",
          value: `${referralConversionRate}%`,
          tone:
            referralConversionRate >= 25 ? "good" : referralConversionRate >= 12 ? "watch" : "risk",
        },
        {
          label: "Viral Coefficient",
          value: referrals.viralCoefficient.toFixed(2),
          tone:
            referrals.viralCoefficient >= 0.25
              ? "good"
              : referrals.viralCoefficient >= 0.12
                ? "watch"
                : "risk",
        },
      ],
    },
    {
      key: "monetization",
      label: "Monetization",
      tone: toneFromScore(monetizationScore),
      score: monetizationScore,
      primaryMetricKey: revenueTotal?.metricKey ?? null,
      primaryMetricLabel: revenueTotal?.label ?? "Revenue Total",
      primaryMetricValue: revenueTotal?.currentValueLabel ?? `$${monetization.totalRevenue}`,
      ownerEmail: revenueTotal?.statusOwnerEmail ?? null,
      reviewState: reviewState(revenueTotal),
      summary:
        "Payment conversion and revenue quality after product value has already been realized.",
      riskSummary:
        monetization.totalPayments > 0
          ? `${monetization.successRate}% success rate across ${monetization.totalPayments} payment attempts.`
          : "No payment activity landed in the selected window.",
      nextMove:
        monetizationScore < 50
          ? "Check payment success rate and value-realization steps before treating the issue as pure demand weakness."
          : "Protect payment quality and keep the revenue path tied to validated value moments.",
      href: "/admin/revenue",
      signals: [
        {
          label: "Revenue",
          value: revenueTotal?.currentValueLabel ?? `$${monetization.totalRevenue}`,
          tone: toneFromScore(scoreFromMetricState(revenueTotal?.statusState ?? "watch")),
        },
        {
          label: "Succeeded Payments",
          value: formatCount(monetization.succeededCount || pipeline.paymentCompleted),
          tone: "neutral",
        },
        {
          label: "Success Rate",
          value: `${monetization.successRate}%`,
          tone:
            monetization.successRate >= 85
              ? "good"
              : monetization.successRate >= 70
                ? "watch"
                : "risk",
        },
      ],
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    days,
    summary: {
      areas: areas.length,
      good: areas.filter((area) => area.tone === "good").length,
      watch: areas.filter((area) => area.tone === "watch").length,
      risk: areas.filter((area) => area.tone === "risk").length,
      averageScore: Math.round(areas.reduce((sum, area) => sum + area.score, 0) / areas.length),
      reviewsDue: areas.filter(
        (area) => area.reviewState === "due" || area.reviewState === "overdue"
      ).length,
    },
    areas,
  };
}
