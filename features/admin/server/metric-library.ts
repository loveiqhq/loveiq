import { ADMIN_BENCHMARKS, type AdminBenchmarkDefinition } from "@/data/admin-benchmarks";
import { supabaseFetch } from "@features/admin/server/supabase";
import { WORKFLOW_TAGS } from "@features/admin/server/workflow-tags";
import logger from "@shared/observability/logger";

export { ADMIN_BENCHMARKS };

export interface AdminMetricOption {
  key: string;
  label: string;
  description: string;
  href: string;
}

export const ADMIN_METRIC_OPTIONS: AdminMetricOption[] = [
  {
    key: "waitlist_signups",
    label: "Waitlist Signups",
    description: "Top-of-funnel demand entering the system.",
    href: "/admin/pipeline",
  },
  {
    key: "total_submissions",
    label: "Survey Starts",
    description: "Users who started the survey.",
    href: "/admin/submissions",
  },
  {
    key: "completion_rate",
    label: "Completion Rate",
    description: "Share of starts that finish.",
    href: "/admin/product-kpis",
  },
  {
    key: "waitlist_to_start_rate",
    label: "Waitlist -> Start",
    description: "How efficiently demand turns into starts.",
    href: "/admin/pipeline",
  },
  {
    key: "scored_count",
    label: "Scored Submissions",
    description: "Submissions that reached scoring.",
    href: "/admin/scoring",
  },
  {
    key: "scoring_agreement",
    label: "V4/V5 Agreement",
    description: "Engine agreement on primary archetype.",
    href: "/admin/scoring",
  },
  {
    key: "avg_duration_minutes",
    label: "Avg Completion Minutes",
    description: "Average survey duration in minutes.",
    href: "/admin/submissions",
  },
  {
    key: "report_view_rate",
    label: "Report View Rate",
    description: "Share of generated reports with at least one view.",
    href: "/admin/reports",
  },
  {
    key: "revenue_total",
    label: "Revenue Total",
    description: "Total succeeded payment amount.",
    href: "/admin/revenue",
  },
  {
    key: "open_high_priority_cases",
    label: "Open High-Priority Cases",
    description: "Operational risk still unresolved.",
    href: "/admin/strategy",
  },
];

export const WORKFLOW_QUESTION_CHANGE_CANDIDATE_KEY = [
  "workflow",
  "question",
  "change",
  "candidate",
].join("_");

const SCORING_RESULT_SELECT = ["primary_archetype", "v5_primary_archetype"].join(",");
const SCORING_RESULT_ENGINE_VERSION = encodeURIComponent("v4+v5");
const BENCHMARK_OVERRIDE_FIELDS = [
  "metric_key",
  "label",
  "description",
  "source_name",
  "benchmark_type",
  "target_value",
  "warning_value",
  "direction",
  "unit",
].join(",");

const WORKFLOW_METRIC_TO_TAG_NAME = {
  workflow_needs_review: WORKFLOW_TAGS[0].name,
  workflow_root_cause_found: WORKFLOW_TAGS[1].name,
  [WORKFLOW_QUESTION_CHANGE_CANDIDATE_KEY]: WORKFLOW_TAGS[2].name,
  workflow_monitoring: WORKFLOW_TAGS[3].name,
} as const;

export function parseUtmSource(tracker: string | null, fallback = "Direct"): string {
  if (!tracker?.trim()) return fallback;
  try {
    const parsed = JSON.parse(tracker) as Record<string, unknown>;
    return typeof parsed.utm_source === "string" && parsed.utm_source.trim()
      ? parsed.utm_source
      : fallback;
  } catch {
    return tracker.trim();
  }
}

async function fetchExactCount(path: string): Promise<number> {
  const res = await supabaseFetch(path, {
    method: "HEAD",
    headers: { Prefer: "count=exact" },
  });
  const range = res.headers.get("content-range");
  if (!range) return 0;
  const total = range.split("/")[1];
  return total && total !== "*" ? parseInt(total, 10) : 0;
}

async function fetchWorkflowSubmissionCountByTagName(name: string): Promise<number | null> {
  const tagRes = await supabaseFetch(
    `/rest/v1/submission_tag?select=id&name=eq.${encodeURIComponent(name)}`,
    { headers: { Range: "0-1" } }
  );
  if (!tagRes.ok) return null;

  const tags = (await tagRes.json()) as Array<{ id: number }>;
  if (tags.length === 0) return 0;

  const assignmentRes = await supabaseFetch(
    // tags.length > 0 verified by the `if (tags.length === 0) return 0;` check above.
    `/rest/v1/submission_tag_assignment?select=submission_id&tag_id=eq.${tags[0]!.id}`,
    { headers: { Range: "0-9999" } }
  );
  if (!assignmentRes.ok) return null;

  const assignments = (await assignmentRes.json()) as Array<{ submission_id: number }>;
  return new Set(assignments.map((row) => row.submission_id)).size;
}

async function fetchScoringAgreement(): Promise<number | null> {
  const res = await supabaseFetch(
    [
      "/rest/v1/scoring_result?select=",
      SCORING_RESULT_SELECT,
      "&engine_version=eq.",
      SCORING_RESULT_ENGINE_VERSION,
    ].join(""),
    {
      headers: { Range: "0-49999" },
    }
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{
    primary_archetype: string | null;
    v5_primary_archetype: string | null;
  }>;
  const comparable = rows.filter((row) => row.primary_archetype && row.v5_primary_archetype);
  if (comparable.length === 0) return 0;
  const agreements = comparable.filter(
    (row) => row.primary_archetype === row.v5_primary_archetype
  ).length;
  return Math.round((agreements / comparable.length) * 1000) / 10;
}

async function fetchAverageDurationMinutes(): Promise<number | null> {
  const res = await supabaseFetch("/rest/v1/survey_submission?select=duration_ms", {
    headers: { Range: "0-49999" },
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ duration_ms: number | null }>;
  const durations = rows
    .map((row) => row.duration_ms)
    .filter((value): value is number => value != null && value > 0);
  if (durations.length === 0) return 0;
  return (
    Math.round(
      (durations.reduce((sum, value) => sum + value, 0) / durations.length / 60_000) * 10
    ) / 10
  );
}

async function fetchWaitlistToStartRate(): Promise<number | null> {
  const res = await supabaseFetch("/rest/v1/rpc/get_conversion_pipeline", {
    method: "POST",
    body: JSON.stringify({ since_ts: new Date("2000-01-01T00:00:00.000Z").toISOString() }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const waitlist = Number(data?.stages?.waitlist_signups ?? 0);
  const started = Number(data?.stages?.survey_started ?? 0);
  return waitlist === 0 ? 0 : Math.round((started / waitlist) * 1000) / 10;
}

async function fetchReportViewRate(): Promise<number | null> {
  const [reportsRes, sessionsRes] = await Promise.all([
    supabaseFetch("/rest/v1/personal_report?select=id", {
      headers: { Range: "0-49999" },
    }),
    supabaseFetch("/rest/v1/report_session?select=personal_report_id", {
      headers: { Range: "0-49999" },
    }),
  ]);
  if (!reportsRes.ok || !sessionsRes.ok) return null;
  const reports = (await reportsRes.json()) as Array<{ id: number }>;
  const sessions = (await sessionsRes.json()) as Array<{ personal_report_id: number }>;
  if (reports.length === 0) return 0;
  return (
    Math.round(
      (new Set(sessions.map((row) => row.personal_report_id)).size / reports.length) * 1000
    ) / 10
  );
}

async function fetchRevenueTotal(): Promise<number | null> {
  const res = await supabaseFetch("/rest/v1/payment?select=amount&status=eq.succeeded", {
    headers: { Range: "0-49999" },
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ amount: number | null }>;
  return Math.round(rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0) * 100) / 100;
}

export async function loadBenchmarkDefinitions(): Promise<AdminBenchmarkDefinition[]> {
  try {
    const res = await supabaseFetch(
      [
        "/rest/v1/admin_metric_benchmark?select=",
        BENCHMARK_OVERRIDE_FIELDS,
        "&is_active=eq.true&order=updated_at.desc",
      ].join(""),
      { headers: { Range: "0-199" } }
    );
    if (!res.ok) return ADMIN_BENCHMARKS;

    const rows = (await res.json()) as Array<{
      metric_key: string;
      label: string;
      description: string | null;
      source_name: string;
      benchmark_type: string;
      target_value: number;
      warning_value: number;
      direction: "higher" | "lower";
      unit: "percent" | "minutes" | "count";
    }>;

    const latestByMetric = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      if (!latestByMetric.has(row.metric_key)) latestByMetric.set(row.metric_key, row);
    }

    return ADMIN_BENCHMARKS.map((benchmark) => {
      const override = latestByMetric.get(benchmark.key);
      if (!override) return benchmark;
      return {
        ...benchmark,
        label: override.label || benchmark.label,
        description: override.description || benchmark.description,
        referenceLabel: `${override.benchmark_type}: ${override.source_name}`,
        targetValue: Number(override.target_value),
        warningValue: Number(override.warning_value),
        direction: override.direction,
        unit: override.unit,
      };
    });
  } catch (err) {
    logger.warn({ err }, "Failed to load benchmark definitions");
    return ADMIN_BENCHMARKS;
  }
}

export async function fetchMetricValue(metricKey: string): Promise<number | null> {
  try {
    switch (metricKey) {
      case "total_submissions":
        return fetchExactCount("/rest/v1/survey_submission?select=id&limit=1");
      case "completion_rate": {
        const [total, completed] = await Promise.all([
          fetchExactCount("/rest/v1/survey_submission?select=id&limit=1"),
          fetchExactCount("/rest/v1/survey_submission?select=id&status=eq.completed&limit=1"),
        ]);
        return total === 0 ? 0 : Math.round((completed / total) * 100);
      }
      case "waitlist_signups":
        return fetchExactCount("/rest/v1/waitlist_user?select=id&limit=1");
      case "waitlist_to_start_rate":
        return fetchWaitlistToStartRate();
      case "scored_count":
        return fetchExactCount("/rest/v1/scoring_result?select=id&limit=1");
      case "scoring_agreement":
        return fetchScoringAgreement();
      case "avg_duration_minutes":
        return fetchAverageDurationMinutes();
      case "report_view_rate":
        return fetchReportViewRate();
      case "revenue_total":
        return fetchRevenueTotal();
      case "open_high_priority_cases":
        return fetchExactCount(
          "/rest/v1/admin_investigation_case?select=id&priority=eq.high&status=not.eq.closed&limit=1"
        );
      case "workflow_needs_review":
      case "workflow_root_cause_found":
      case WORKFLOW_QUESTION_CHANGE_CANDIDATE_KEY:
      case "workflow_monitoring": {
        const workflowName =
          // Branch matches one of the WORKFLOW_METRIC_TO_TAG_NAME keys; lookup defined.
          WORKFLOW_METRIC_TO_TAG_NAME[metricKey as keyof typeof WORKFLOW_METRIC_TO_TAG_NAME]!;
        return fetchWorkflowSubmissionCountByTagName(workflowName);
      }
      default:
        return null;
    }
  } catch (err) {
    logger.warn({ err, metricKey }, "Failed to fetch metric value");
    return null;
  }
}
