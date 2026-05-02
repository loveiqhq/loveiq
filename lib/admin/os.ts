import { buildTrustDescriptor, clampDays, round1 } from "@/lib/admin/next-level";
import { ADMIN_METRIC_OPTIONS } from "@/lib/admin/metric-library";
import { buildMetricStatusSnapshot } from "@/lib/admin/metric-status";
import { supabaseFetch } from "@/lib/admin/supabase";
import { buildStrategySnapshot } from "@/lib/admin/strategy";
import logger from "@/lib/logger";
import type {
  AdminActionItem,
  AdminActionPriority,
  AdminActionSourceType,
  AdminActionStatus,
  AdminDecisionReviewItem,
  AdminOsBrief,
  AdminOsMetricCard,
  AdminOsRoleSummary,
  AdminOsSnapshot,
  AdminOsTimelineItem,
  AdminOsTone,
  AdminOsTrustItem,
  LeadCockpitRole,
  LeadCockpitSnapshot,
} from "@/lib/admin/os-types";

type DecisionEntryType = "decision" | "scoring-change" | "memo";

const ACTION_STATUS_ORDER: Record<AdminActionStatus, number> = {
  open: 0,
  "in-progress": 1,
  blocked: 2,
  done: 3,
};

const ACTION_PRIORITY_ORDER: Record<AdminActionPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function toneFromStatus(status: string): AdminOsTone {
  if (status === "good" || status === "healthy") return "good";
  if (status === "risk" || status === "down" || status === "critical") return "risk";
  return "watch";
}

function toneFromMetricStatusState(status: string): AdminOsTone {
  if (status === "on-track") return "good";
  if (status === "critical") return "risk";
  if (status === "off-track") return "risk";
  return "watch";
}

function toneFromTrustWarning(warning: string | null): AdminOsTone {
  return warning ? "watch" : "good";
}

function toneFromActionPriority(
  priority: AdminActionPriority,
  status: AdminActionStatus
): AdminOsTone {
  if (status === "blocked") return "risk";
  if (priority === "high") return "watch";
  return status === "done" ? "good" : "watch";
}

function safeDate(value: string | null): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function compareActions(a: AdminActionItem, b: AdminActionItem): number {
  return (
    ACTION_STATUS_ORDER[a.status] - ACTION_STATUS_ORDER[b.status] ||
    ACTION_PRIORITY_ORDER[a.priority] - ACTION_PRIORITY_ORDER[b.priority] ||
    safeDate(a.dueDate || a.updatedAt) - safeDate(b.dueDate || b.updatedAt)
  );
}

function toActionHref(item: {
  linked_href: string | null;
  source_type: AdminActionSourceType;
  source_id: number | null;
}): string | null {
  if (item.linked_href) return item.linked_href;
  if (item.source_type === "decision" && item.source_id != null) return "/admin/changelog";
  if (item.source_type === "experiment" && item.source_id != null) return "/admin/experiments";
  if (item.source_type === "release" && item.source_id != null) return "/admin/changelog";
  if (item.source_type === "investigation" && item.source_id != null) return "/admin/strategy";
  if (item.source_type === "metric") return "/admin/benchmarks";
  return null;
}

function mapActionRow(row: {
  id: number;
  admin_email: string;
  owner_email: string | null;
  title: string;
  description: string | null;
  status: AdminActionStatus;
  priority: AdminActionPriority;
  source_type: AdminActionSourceType;
  source_id: number | null;
  metric_key: string | null;
  expected_impact: string | null;
  measured_outcome: string | null;
  linked_href: string | null;
  due_date: string | null;
  review_date: string | null;
  created_at: string;
  updated_at: string;
}): AdminActionItem {
  return {
    id: row.id,
    adminEmail: row.admin_email,
    ownerEmail: row.owner_email,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    sourceType: row.source_type,
    sourceId: row.source_id,
    metricKey: row.metric_key,
    expectedImpact: row.expected_impact,
    measuredOutcome: row.measured_outcome,
    linkedHref: toActionHref(row),
    dueDate: row.due_date,
    reviewDate: row.review_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function fetchActionItems(limit = 20): Promise<AdminActionItem[]> {
  try {
    const res = await supabaseFetch(
      `/rest/v1/admin_action_item?select=*&order=updated_at.desc&limit=${limit}`
    );
    if (!res.ok) return [];

    const rows = (await res.json()) as Array<{
      id: number;
      admin_email: string;
      owner_email: string | null;
      title: string;
      description: string | null;
      status: AdminActionStatus;
      priority: AdminActionPriority;
      source_type: AdminActionSourceType;
      source_id: number | null;
      metric_key: string | null;
      expected_impact: string | null;
      measured_outcome: string | null;
      linked_href: string | null;
      due_date: string | null;
      review_date: string | null;
      created_at: string;
      updated_at: string;
    }>;

    return rows.map(mapActionRow).sort(compareActions);
  } catch (err) {
    logger.warn({ err }, "Admin action items unavailable");
    return [];
  }
}

async function fetchRecentDecisions(limit = 10): Promise<AdminDecisionReviewItem[]> {
  const res = await supabaseFetch(
    [
      "/rest/v1/admin_decision_entry?select=",
      [
        "id",
        "title",
        "entry_type",
        "status",
        "owner_email",
        "primary_metric_key",
        "expected_impact",
        "observed_effect",
        "review_window_days",
        "updated_at",
      ].join(","),
      "&order=updated_at.desc",
      `&limit=${limit}`,
    ].join("")
  );

  if (!res.ok) return [];

  const rows = (await res.json()) as Array<{
    id: number;
    title: string;
    entry_type: DecisionEntryType;
    status: string;
    owner_email: string | null;
    primary_metric_key: string | null;
    expected_impact: string | null;
    observed_effect: string | null;
    review_window_days: number | null;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    entryType: row.entry_type,
    status: row.status,
    ownerEmail: row.owner_email,
    primaryMetricKey: row.primary_metric_key,
    reviewDate:
      row.review_window_days != null
        ? new Date(new Date(row.updated_at).getTime() + row.review_window_days * 86_400_000)
            .toISOString()
            .slice(0, 10)
        : null,
    expectedImpact: row.expected_impact,
    measuredOutcome: row.observed_effect,
    updatedAt: row.updated_at,
    href: "/admin/changelog",
  }));
}

async function fetchRecentTimeline(
  actions: AdminActionItem[],
  decisions: AdminDecisionReviewItem[]
): Promise<AdminOsTimelineItem[]> {
  const [releaseRes, experimentsRes] = await Promise.all([
    supabaseFetch(
      [
        "/rest/v1/product_changelog?select=",
        [
          "id",
          "title",
          "category",
          "primary_metric_key",
          "expected_impact",
          "measured_outcome",
          "event_date",
          "review_date",
          "updated_at",
        ].join(","),
        "&order=event_date.desc&limit=6",
      ].join("")
    ),
    supabaseFetch(
      "/rest/v1/admin_experiment?select=id,name,status,decision_date,updated_at&order=updated_at.desc&limit=6"
    ),
  ]);

  const releases = releaseRes.ok
    ? ((await releaseRes.json()) as Array<{
        id: number;
        title: string;
        category: string;
        primary_metric_key: string | null;
        expected_impact: string | null;
        measured_outcome: string | null;
        event_date: string;
        review_date: string | null;
        updated_at: string;
      }>)
    : [];

  const experiments = experimentsRes.ok
    ? ((await experimentsRes.json()) as Array<{
        id: number;
        name: string;
        status: string;
        decision_date: string | null;
        updated_at: string;
      }>)
    : [];

  return [
    ...releases.map((entry) => ({
      id: `release-${entry.id}`,
      kind: "release" as const,
      title: entry.title,
      detail: [
        `${entry.category} release tracked in changelog`,
        entry.primary_metric_key ? `metric ${entry.primary_metric_key}` : null,
        entry.expected_impact ? `expected ${entry.expected_impact}` : null,
        entry.measured_outcome ? `observed ${entry.measured_outcome}` : null,
        entry.review_date ? `review ${entry.review_date}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      tone: "watch" as const,
      timestamp: `${entry.event_date}T00:00:00.000Z`,
      href: "/admin/changelog",
    })),
    ...experiments.map((entry) => ({
      id: `experiment-${entry.id}`,
      kind: "experiment" as const,
      title: entry.name,
      detail:
        entry.decision_date != null
          ? `Status ${entry.status}. Decision due ${entry.decision_date}.`
          : `Status ${entry.status}.`,
      tone:
        entry.status === "active"
          ? ("watch" as const)
          : entry.status === "completed"
            ? ("good" as const)
            : ("watch" as const),
      timestamp: entry.updated_at,
      href: "/admin/experiments",
    })),
    ...decisions.map((entry) => ({
      id: `decision-${entry.id}`,
      kind: "decision" as const,
      title: entry.title,
      detail: [
        `${entry.entryType} is ${entry.status}.`,
        entry.primaryMetricKey ? `metric ${entry.primaryMetricKey}` : null,
        entry.measuredOutcome ? `observed ${entry.measuredOutcome}` : null,
      ]
        .filter(Boolean)
        .join(" "),
      tone:
        entry.status === "validated"
          ? ("good" as const)
          : entry.status === "rolled-back"
            ? ("risk" as const)
            : ("watch" as const),
      timestamp: entry.updatedAt,
      href: entry.href,
    })),
    ...actions.map((entry) => ({
      id: `action-${entry.id}`,
      kind: "action" as const,
      title: entry.title,
      detail: [
        `Action is ${entry.status}${entry.ownerEmail ? ` with ${entry.ownerEmail}` : ""}.`,
        entry.metricKey ? `metric ${entry.metricKey}` : null,
        entry.expectedImpact ? `expected ${entry.expectedImpact}` : null,
        entry.measuredOutcome ? `observed ${entry.measuredOutcome}` : null,
      ]
        .filter(Boolean)
        .join(" "),
      tone: toneFromActionPriority(entry.priority, entry.status),
      timestamp: entry.updatedAt,
      href: entry.linkedHref ?? "/admin",
    })),
  ]
    .sort((a, b) => safeDate(b.timestamp) - safeDate(a.timestamp))
    .slice(0, 12);
}

async function fetchTrustBoard(): Promise<AdminOsTrustItem[]> {
  const [submissionRes, reportRes, analyticsRes, decisionRes] = await Promise.all([
    supabaseFetch(
      "/rest/v1/survey_submission?select=id,created_date_time&order=created_date_time.desc&limit=1",
      { headers: { Prefer: "count=exact" } }
    ),
    supabaseFetch(
      "/rest/v1/personal_report?select=id,created_date_time&order=created_date_time.desc&limit=1",
      { headers: { Prefer: "count=exact" } }
    ),
    supabaseFetch("/rest/v1/analytics_event?select=id,event_time&order=event_time.desc&limit=1", {
      headers: { Prefer: "count=exact" },
    }),
    supabaseFetch(
      "/rest/v1/admin_decision_entry?select=id,updated_at&order=updated_at.desc&limit=1",
      { headers: { Prefer: "count=exact" } }
    ),
  ]);

  const submissions = submissionRes.ok
    ? ((await submissionRes.json()) as Array<{ id: number; created_date_time: string }>)
    : [];
  const reports = reportRes.ok
    ? ((await reportRes.json()) as Array<{ id: number; created_date_time: string }>)
    : [];
  const events = analyticsRes.ok
    ? ((await analyticsRes.json()) as Array<{ id: number; event_time: string }>)
    : [];
  const decisions = decisionRes.ok
    ? ((await decisionRes.json()) as Array<{ id: number; updated_at: string }>)
    : [];

  const trustItems = [
    {
      label: "Survey Input",
      href: "/admin/health",
      descriptor: buildTrustDescriptor({
        source: "survey_submission",
        mode: "live",
        sampleSize: submissions.length,
        lastUpdated: submissions[0]?.created_date_time ?? null,
      }),
    },
    {
      label: "Report Output",
      href: "/admin/reports",
      descriptor: buildTrustDescriptor({
        source: "personal_report",
        mode: "live",
        sampleSize: reports.length,
        lastUpdated: reports[0]?.created_date_time ?? null,
      }),
    },
    {
      label: "Tracking Events",
      href: "/admin/health",
      descriptor: buildTrustDescriptor({
        source: "analytics_event",
        mode: "live",
        sampleSize: events.length,
        lastUpdated: events[0]?.event_time ?? null,
      }),
    },
    {
      label: "Decision Journal",
      href: "/admin/changelog",
      descriptor: buildTrustDescriptor({
        source: "admin_decision_entry",
        mode: "materialized",
        sampleSize: decisions.length,
        lastUpdated: decisions[0]?.updated_at ?? null,
        staleAfterHours: 7 * 24,
      }),
    },
  ];

  return trustItems.map((item) => ({
    label: item.label,
    source: item.descriptor.source,
    mode: item.descriptor.mode,
    sampleSize: item.descriptor.sampleSize,
    lastUpdated: item.descriptor.lastUpdated,
    freshnessHours: item.descriptor.freshnessHours,
    tone: toneFromTrustWarning(item.descriptor.warning),
    detail: item.descriptor.warning ?? `${item.descriptor.sampleSize} recent rows in probe window.`,
    href: item.href,
  }));
}

async function buildSystemMetrics(): Promise<AdminOsMetricCard[]> {
  const now = new Date().toISOString();

  const supabaseStart = Date.now();
  const supabaseProbe = await supabaseFetch("/rest/v1/survey?select=id&limit=1");
  const supabaseLatency = Date.now() - supabaseStart;

  const [completedRes, scoredRes, latestSubmissionRes] = await Promise.all([
    supabaseFetch("/rest/v1/survey_submission?select=id&status=eq.completed&limit=1", {
      headers: { Prefer: "count=exact" },
    }),
    supabaseFetch("/rest/v1/scoring_result?select=id&limit=1", {
      headers: { Prefer: "count=exact" },
    }),
    supabaseFetch(
      "/rest/v1/survey_submission?select=created_date_time&order=created_date_time.desc&limit=1"
    ),
  ]);

  const completedTotal = parseInt(
    completedRes.headers.get("content-range")?.split("/")[1] || "0",
    10
  );
  const scoredTotal = parseInt(scoredRes.headers.get("content-range")?.split("/")[1] || "0", 10);
  const scoringCoverage = completedTotal > 0 ? round1((scoredTotal / completedTotal) * 100) : 0;
  const latestSubmission = latestSubmissionRes.ok
    ? (((await latestSubmissionRes.json()) as Array<{ created_date_time: string }>)[0]
        ?.created_date_time ?? null)
    : null;
  const submissionAgeHours = latestSubmission
    ? round1((Date.now() - new Date(latestSubmission).getTime()) / 3_600_000)
    : null;

  return [
    {
      key: "supabase_latency",
      label: "Supabase",
      value: `${supabaseLatency} ms`,
      detail: supabaseProbe.ok
        ? `Last probe succeeded at ${now.slice(11, 16)} UTC.`
        : "Probe failed.",
      delta: null,
      tone: !supabaseProbe.ok ? "risk" : supabaseLatency > 2000 ? "watch" : "good",
      href: "/admin/health",
    },
    {
      key: "scoring_coverage",
      label: "Scoring Coverage",
      value: `${scoringCoverage}%`,
      detail: `${scoredTotal}/${completedTotal} completed submissions have scoring output.`,
      delta: null,
      tone: scoringCoverage >= 95 ? "good" : scoringCoverage >= 85 ? "watch" : "risk",
      href: "/admin/scoring",
    },
    {
      key: "submission_freshness",
      label: "Submission Freshness",
      value: submissionAgeHours == null ? "-" : `${submissionAgeHours} h`,
      detail:
        submissionAgeHours == null
          ? "No recent submission found."
          : `Newest submission arrived ${submissionAgeHours} hours ago.`,
      delta: null,
      tone:
        submissionAgeHours == null
          ? "watch"
          : submissionAgeHours <= 24
            ? "good"
            : submissionAgeHours <= 72
              ? "watch"
              : "risk",
      href: "/admin/health",
    },
  ];
}

function mapMetricStatuses(
  snapshot: Awaited<ReturnType<typeof buildMetricStatusSnapshot>>
): AdminOsMetricCard[] {
  return snapshot.statuses.slice(0, 6).map((metric) => ({
    key: metric.metricKey,
    label: metric.label,
    value: metric.currentValueLabel,
    detail: metric.statusReason,
    delta: null,
    tone: toneFromMetricStatusState(metric.statusState),
    href: metric.linkedHref,
    statusLabel: metric.statusState,
    ownerEmail: metric.statusOwnerEmail,
  }));
}

function leadTone(
  role: LeadCockpitRole,
  snapshot: Awaited<ReturnType<typeof buildStrategySnapshot>>
): AdminOsTone {
  const riskLabels = new Set(
    snapshot.guardrails.items
      .filter((item: any) => item.status === "risk")
      .map((item: any) => item.label)
  );

  if (role === "strategy") {
    return snapshot.goals.some((item: any) => item.status === "off-track") ? "risk" : "watch";
  }
  if (role === "product") {
    return riskLabels.has("Completion") ? "risk" : "watch";
  }
  if (role === "growth") {
    return snapshot.opportunities.funnelLeakage[0] ? "watch" : "good";
  }
  return riskLabels.has("Scoring Agreement") || riskLabels.has("Ambiguous Scoring")
    ? "risk"
    : "watch";
}

function buildRoleSummaries(
  snapshot: Awaited<ReturnType<typeof buildStrategySnapshot>>
): AdminOsRoleSummary[] {
  const briefByRole = new Map(
    snapshot.analyst.briefs.map((item: any) => [String(item.role).toLowerCase(), item.summary])
  );

  return [
    {
      role: "strategy",
      label: "Strategy Lead",
      summary:
        briefByRole.get("strategy") ?? snapshot.narrative[0] ?? "No strategy brief available.",
      tone: leadTone("strategy", snapshot),
      href: "/admin/strategy-lead",
    },
    {
      role: "product",
      label: "Product Lead",
      summary: briefByRole.get("product") ?? snapshot.narrative[1] ?? "No product brief available.",
      tone: leadTone("product", snapshot),
      href: "/admin/product-lead",
    },
    {
      role: "growth",
      label: "Growth Lead",
      summary: briefByRole.get("growth") ?? snapshot.narrative[2] ?? "No growth brief available.",
      tone: leadTone("growth", snapshot),
      href: "/admin/growth-lead",
    },
    {
      role: "tech",
      label: "Tech Lead",
      summary: briefByRole.get("tech") ?? snapshot.narrative[3] ?? "No tech brief available.",
      tone: leadTone("tech", snapshot),
      href: "/admin/tech-lead",
    },
  ];
}

function buildWatchlist(
  snapshot: Awaited<ReturnType<typeof buildStrategySnapshot>>
): AdminOsBrief[] {
  return snapshot.triage.slice(0, 6).map((item: any) => ({
    title: item.title,
    detail: `${item.cause}: ${item.evidence}`,
    tone: item.confidence === "high" ? "risk" : "watch",
    href: item.href,
  }));
}

function buildCommandBriefs(
  snapshot: Awaited<ReturnType<typeof buildStrategySnapshot>>,
  decisions: AdminDecisionReviewItem[],
  actions: AdminActionItem[]
): AdminOsBrief[] {
  const openActions = actions.filter((item) => item.status !== "done");
  const overdueActions = openActions.filter(
    (item) => item.dueDate != null && safeDate(item.dueDate) < Date.now()
  );

  return [
    {
      title: "North-star state",
      detail: snapshot.narrative[0] ?? "No narrative summary is available for the selected window.",
      tone: snapshot.guardrails.breached > 0 ? "watch" : "good",
      href: "/admin/strategy",
    },
    {
      title: "Decision cadence",
      detail:
        decisions.length > 0
          ? `${decisions.length} recent decision entries are available for review.`
          : "No recent structured decisions were found.",
      tone: decisions.length > 0 ? "good" : "watch",
      href: "/admin/changelog",
    },
    {
      title: "Execution pressure",
      detail:
        openActions.length > 0
          ? `${openActions.length} open action items, ${overdueActions.length} overdue.`
          : "No open action items are currently tracked.",
      tone: overdueActions.length > 0 ? "risk" : openActions.length > 0 ? "watch" : "good",
      href: "/admin",
    },
  ];
}

function compactMetric(
  key: string,
  label: string,
  value: string,
  detail: string,
  tone: AdminOsTone,
  href: string,
  delta: number | null = null
): AdminOsMetricCard {
  return { key, label, value, detail, delta, tone, href };
}

export async function buildAdminOsSnapshot(inputDays: number): Promise<AdminOsSnapshot> {
  const days = clampDays(inputDays, 7, 90);
  const [snapshot, metricStatusSnapshot, actions, decisions, trustBoard] = await Promise.all([
    buildStrategySnapshot(days),
    buildMetricStatusSnapshot(days),
    fetchActionItems(16),
    fetchRecentDecisions(8),
    fetchTrustBoard(),
  ]);

  const timeline = await fetchRecentTimeline(actions.slice(0, 6), decisions.slice(0, 6));
  const openActions = actions.filter((item) => item.status !== "done");
  const overdueActions = openActions.filter(
    (item) => item.dueDate != null && safeDate(item.dueDate) < Date.now()
  );
  const doneThisWindow = actions.filter(
    (item) => item.status === "done" && Date.now() - safeDate(item.updatedAt) <= days * 86_400_000
  ).length;

  return {
    generatedAt: new Date().toISOString(),
    days,
    briefs: buildCommandBriefs(snapshot, decisions, actions),
    metricBoard: mapMetricStatuses(metricStatusSnapshot),
    leadingIndicators: metricStatusSnapshot.leadingIndicators.slice(0, 6),
    metricOptions: ADMIN_METRIC_OPTIONS,
    decisionBoard: decisions,
    actionBoard: {
      summary: {
        totalOpen: openActions.length,
        blocked: openActions.filter((item) => item.status === "blocked").length,
        overdue: overdueActions.length,
        doneThisWindow,
      },
      items: actions.slice(0, 8),
    },
    trustBoard,
    roleSummaries: buildRoleSummaries(snapshot),
    watchlist: buildWatchlist(snapshot),
    timeline,
  };
}

export async function buildLeadCockpitSnapshot(
  role: LeadCockpitRole,
  inputDays: number
): Promise<LeadCockpitSnapshot> {
  const days = clampDays(inputDays, 7, 90);
  const [snapshot, metricStatusSnapshot, actions, decisions, systemMetrics] = await Promise.all([
    buildStrategySnapshot(days),
    buildMetricStatusSnapshot(days),
    fetchActionItems(20),
    fetchRecentDecisions(8),
    buildSystemMetrics(),
  ]);

  const roleActions = actions.filter((item) => {
    if (item.sourceType === "decision" || item.sourceType === "release") {
      return role === "strategy" || role === "product";
    }
    if (item.sourceType === "experiment" || item.metricKey === "waitlist_signups") {
      return role === "growth";
    }
    if (item.sourceType === "investigation") {
      return role === "tech" || role === "product";
    }
    return true;
  });

  const timeline = await fetchRecentTimeline(roleActions.slice(0, 4), decisions.slice(0, 4));
  const northStarByKey = new Map(snapshot.northStar.map((item: any) => [item.key, item]));
  const guardrailByLabel = new Map(
    snapshot.guardrails.items.map((item: any) => [item.label, item])
  );
  const topChannel = snapshot.opportunities.leaderboards.channels[0];
  const topLeak = snapshot.opportunities.funnelLeakage[0];
  const leadingIndicatorsByRole = {
    strategy: metricStatusSnapshot.leadingIndicators.slice(0, 4),
    product: metricStatusSnapshot.leadingIndicators.filter((item) =>
      ["completion_rate", "scored_count", "scoring_agreement", "report_view_rate"].includes(
        item.metricKey
      )
    ),
    growth: metricStatusSnapshot.leadingIndicators.filter((item) =>
      ["total_submissions", "waitlist_to_start_rate", "revenue_total"].includes(item.metricKey)
    ),
    tech: metricStatusSnapshot.leadingIndicators.filter((item) =>
      ["scoring_agreement", "open_high_priority_cases"].includes(item.metricKey)
    ),
  } satisfies Record<LeadCockpitRole, typeof metricStatusSnapshot.leadingIndicators>;

  if (role === "strategy") {
    return {
      role,
      label: "Strategy Lead",
      generatedAt: new Date().toISOString(),
      days,
      summary:
        snapshot.analyst.briefs.find((item: any) => item.role === "Strategy")?.summary ??
        snapshot.narrative[0] ??
        "No strategy summary available.",
      metrics: [
        compactMetric(
          "demand",
          "Demand",
          northStarByKey.get("waitlist_signups")?.displayValue ?? "-",
          "Top-of-funnel demand entering the system.",
          "watch",
          "/admin/growth",
          northStarByKey.get("waitlist_signups")?.delta ?? null
        ),
        compactMetric(
          "starts",
          "Starts",
          northStarByKey.get("total_submissions")?.displayValue ?? "-",
          "Users entering the survey flow.",
          "watch",
          "/admin/pipeline",
          northStarByKey.get("total_submissions")?.delta ?? null
        ),
        compactMetric(
          "completion",
          "Completion",
          northStarByKey.get("completion_rate")?.displayValue ?? "-",
          guardrailByLabel.get("Completion")?.detail ?? "Core conversion health.",
          toneFromStatus(guardrailByLabel.get("Completion")?.status ?? "watch"),
          "/admin/product-kpis",
          northStarByKey.get("completion_rate")?.delta ?? null
        ),
        compactMetric(
          "engine_trust",
          "Engine Trust",
          northStarByKey.get("scoring_agreement")?.displayValue ?? "-",
          guardrailByLabel.get("Scoring Agreement")?.detail ?? "Scoring governance.",
          toneFromStatus(guardrailByLabel.get("Scoring Agreement")?.status ?? "watch"),
          "/admin/scoring",
          northStarByKey.get("scoring_agreement")?.delta ?? null
        ),
      ],
      priorities: [
        ...buildWatchlist(snapshot).slice(0, 3),
        ...snapshot.opportunities.backlog.slice(0, 3).map((item: any) => ({
          title: item.title,
          detail: `${item.source} with ${item.impact} impact and score ${item.score}.`,
          tone: item.impact === "high" ? ("watch" as const) : ("good" as const),
          href: item.href,
        })),
      ],
      supporting: snapshot.goals.slice(0, 4).map((item: any) => ({
        label: item.label,
        value: `${item.progressPct}%`,
        detail: `${item.metricLabel}: ${item.currentValueLabel ?? item.currentValue ?? "-"}.`,
        href: item.href,
      })),
      leadingIndicators: leadingIndicatorsByRole.strategy,
      actions: roleActions.slice(0, 6),
      timeline,
    };
  }

  if (role === "product") {
    return {
      role,
      label: "Product Lead",
      generatedAt: new Date().toISOString(),
      days,
      summary:
        snapshot.analyst.briefs.find((item: any) => item.role === "Product")?.summary ??
        "No product summary available.",
      metrics: [
        compactMetric(
          "completion",
          "Completion",
          northStarByKey.get("completion_rate")?.displayValue ?? "-",
          guardrailByLabel.get("Completion")?.detail ?? "Survey completion health.",
          toneFromStatus(guardrailByLabel.get("Completion")?.status ?? "watch"),
          "/admin/product-kpis",
          northStarByKey.get("completion_rate")?.delta ?? null
        ),
        compactMetric(
          "scoring_agreement",
          "Scoring Agreement",
          northStarByKey.get("scoring_agreement")?.displayValue ?? "-",
          guardrailByLabel.get("Scoring Agreement")?.detail ?? "Cross-engine trust.",
          toneFromStatus(guardrailByLabel.get("Scoring Agreement")?.status ?? "watch"),
          "/admin/scoring",
          northStarByKey.get("scoring_agreement")?.delta ?? null
        ),
        compactMetric(
          "queue_pressure",
          "High-Priority Queue",
          String(guardrailByLabel.get("High-Priority Queue")?.current ?? "-"),
          guardrailByLabel.get("High-Priority Queue")?.detail ?? "Open investigations.",
          toneFromStatus(guardrailByLabel.get("High-Priority Queue")?.status ?? "watch"),
          "/admin/strategy"
        ),
        compactMetric(
          "ambiguous_scoring",
          "Ambiguous Cases",
          String(guardrailByLabel.get("Ambiguous Scoring")?.current ?? "-"),
          guardrailByLabel.get("Ambiguous Scoring")?.detail ?? "Manual review pressure.",
          toneFromStatus(guardrailByLabel.get("Ambiguous Scoring")?.status ?? "watch"),
          "/admin/scorecard"
        ),
      ],
      priorities: [
        ...snapshot.releaseImpact.entries.slice(0, 3).map((item: any) => ({
          title: item.title,
          detail: `${item.deltaCompletionRate} pp completion and ${item.deltaSubmissions} start delta.`,
          tone:
            item.deltaCompletionRate < 0 || item.deltaSubmissions < 0
              ? ("risk" as const)
              : ("good" as const),
          href: item.href,
        })),
        ...buildWatchlist(snapshot)
          .filter((item) => /question|release|scoring/.test(item.detail))
          .slice(0, 3),
      ],
      supporting: snapshot.workQueue.items.slice(0, 4).map((item: any) => ({
        label: item.title,
        value: item.priority,
        detail: item.detail,
        href: item.href,
      })),
      leadingIndicators: leadingIndicatorsByRole.product,
      actions: roleActions.slice(0, 6),
      timeline,
    };
  }

  if (role === "growth") {
    const topChannelTone: AdminOsTone =
      topChannel?.conversionRate >= 50
        ? "good"
        : topChannel?.conversionRate >= 25
          ? "watch"
          : "risk";

    return {
      role,
      label: "Growth Lead",
      generatedAt: new Date().toISOString(),
      days,
      summary:
        snapshot.analyst.briefs.find((item: any) => item.role === "Growth")?.summary ??
        "No growth summary available.",
      metrics: [
        compactMetric(
          "demand",
          "Demand",
          northStarByKey.get("waitlist_signups")?.displayValue ?? "-",
          "Current top-of-funnel demand.",
          "watch",
          "/admin/growth",
          northStarByKey.get("waitlist_signups")?.delta ?? null
        ),
        compactMetric(
          "starts",
          "Starts",
          northStarByKey.get("total_submissions")?.displayValue ?? "-",
          "How much demand converted into started surveys.",
          "watch",
          "/admin/pipeline",
          northStarByKey.get("total_submissions")?.delta ?? null
        ),
        compactMetric(
          "best_channel",
          "Best Channel",
          topChannel ? `${topChannel.source} ${topChannel.conversionRate}%` : "-",
          topChannel
            ? `${topChannel.started} starts from ${topChannel.source}.`
            : "No clear source winner in the current window.",
          topChannelTone,
          "/admin/funnels"
        ),
        compactMetric(
          "largest_leak",
          "Largest Leak",
          topLeak ? `${topLeak.lossRate}%` : "-",
          topLeak
            ? `${topLeak.from} -> ${topLeak.to} is losing ${topLeak.lossCount} users.`
            : "No dominant funnel leak is visible.",
          topLeak ? "watch" : "good",
          topLeak?.href ?? "/admin/funnels"
        ),
      ],
      priorities: [
        ...snapshot.opportunities.backlog
          .filter(
            (item: any) => item.source === "Release Impact" || item.source === "UTM Conversion"
          )
          .slice(0, 4)
          .map((item: any) => ({
            title: item.title,
            detail: `${item.detail} Score ${item.score}.`,
            tone: item.impact === "high" ? ("watch" as const) : ("good" as const),
            href: item.href,
          })),
        ...buildWatchlist(snapshot).slice(0, 2),
      ],
      supporting: snapshot.opportunities.leaderboards.channels.slice(0, 4).map((item: any) => ({
        label: item.source,
        value: `${item.conversionRate}%`,
        detail: `${item.started} starts from ${item.signups} signups.`,
        href: "/admin/funnels",
      })),
      leadingIndicators: leadingIndicatorsByRole.growth,
      actions: roleActions.slice(0, 6),
      timeline,
    };
  }

  return {
    role,
    label: "Tech Lead",
    generatedAt: new Date().toISOString(),
    days,
    summary:
      snapshot.analyst.briefs.find((item: any) => item.role === "Tech")?.summary ??
      "No tech summary available.",
    metrics: [
      ...systemMetrics,
      compactMetric(
        "high_priority_cases",
        "High-Priority Queue",
        String(guardrailByLabel.get("High-Priority Queue")?.current ?? "-"),
        guardrailByLabel.get("High-Priority Queue")?.detail ?? "Open incidents and investigations.",
        toneFromStatus(guardrailByLabel.get("High-Priority Queue")?.status ?? "watch"),
        "/admin/strategy"
      ),
    ],
    priorities: [
      ...buildWatchlist(snapshot)
        .filter((item) => /data-quality|scoring|release/.test(item.detail))
        .slice(0, 3),
      ...decisions
        .filter((item) => item.entryType === "scoring-change")
        .slice(0, 2)
        .map((item) => ({
          title: item.title,
          detail: `Scoring governance entry is ${item.status}.`,
          tone: item.status === "validated" ? ("good" as const) : ("watch" as const),
          href: item.href,
        })),
    ],
    supporting: (await fetchTrustBoard()).map((item) => ({
      label: item.label,
      value: item.freshnessHours == null ? "-" : `${item.freshnessHours}h`,
      detail: item.detail,
      href: item.href,
    })),
    leadingIndicators: leadingIndicatorsByRole.tech,
    actions: roleActions.slice(0, 6),
    timeline,
  };
}
