import { surveyQuestions } from "@/data/survey-data";
import { ADMIN_METRIC_OPTIONS } from "@features/admin/server/metric-library";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@/lib/logger";

export type ResearchRepositoryEntryType =
  | "signal"
  | "theme"
  | "pain-point"
  | "contradiction"
  | "wording"
  | "answer-quality"
  | "custom";

export type ResearchRepositoryStatus = "draft" | "active" | "validated" | "archived";
export type ResearchRepositoryPriority = "low" | "medium" | "high";

export interface ResearchRepositoryMetricOption {
  key: string;
  label: string;
  href: string;
  description: string;
}

export interface AdminResearchRepositoryEntry {
  id: number;
  admin_email: string;
  title: string;
  summary: string | null;
  entry_type: ResearchRepositoryEntryType;
  status: ResearchRepositoryStatus;
  priority: ResearchRepositoryPriority;
  owner_email: string | null;
  primary_metric_key: string | null;
  question_id: string | null;
  theme: string | null;
  source_key: string | null;
  source_href: string | null;
  evidence: string[];
  recommendation: string | null;
  linked_action_id: number | null;
  review_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResearchRepositorySnapshotEntry extends AdminResearchRepositoryEntry {
  primary_metric_label: string | null;
  primary_metric_href: string | null;
  question_label: string | null;
  review_state: "fresh" | "due" | "overdue" | "none";
  open_review_count: number;
  latest_review_status:
    | "requested"
    | "in-review"
    | "approved"
    | "changes-requested"
    | "rejected"
    | null;
  linked_action: {
    id: number;
    title: string;
    status: string;
    owner_email: string | null;
    review_date: string | null;
  } | null;
}

interface MetricRegistryRow {
  metric_key: string;
  label: string | null;
  linked_href: string | null;
}

interface ActionRow {
  id: number;
  title: string;
  status: string;
  owner_email: string | null;
  review_date: string | null;
}

interface ReviewRow {
  id: number;
  resource_id: number | null;
  status: "requested" | "in-review" | "approved" | "changes-requested" | "rejected";
  due_date: string | null;
  updated_at: string;
}

const OPEN_REVIEW_STATUSES = new Set(["requested", "in-review", "changes-requested"]);

const questionLabelMap = new Map(
  surveyQuestions
    .filter((question) => !question.qId.startsWith("00"))
    .map((question) => [question.qId, `${question.qId} - ${question.question}`])
);

function normalizeEvidence(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 8);
}

function reviewState(reviewDate: string | null): "fresh" | "due" | "overdue" | "none" {
  if (!reviewDate) return "none";
  const today = new Date().toISOString().slice(0, 10);
  if (reviewDate < today) return "overdue";
  if (reviewDate === today) return "due";
  const diffDays = Math.ceil(
    (new Date(reviewDate).getTime() - new Date(today).getTime()) / 86_400_000
  );
  return diffDays <= 7 ? "due" : "fresh";
}

async function fetchMetricOptions(): Promise<ResearchRepositoryMetricOption[]> {
  try {
    const res = await supabaseFetch(
      "/rest/v1/admin_metric_registry?select=metric_key,label,linked_href&order=updated_at.desc",
      { headers: { Range: "0-199" } }
    );

    const metricMap = new Map<string, ResearchRepositoryMetricOption>(
      ADMIN_METRIC_OPTIONS.map((metric) => [
        metric.key,
        {
          key: metric.key,
          label: metric.label,
          href: metric.href,
          description: metric.description,
        },
      ])
    );

    if (res.ok) {
      const rows = (await res.json()) as MetricRegistryRow[];
      for (const row of rows) {
        if (!row.metric_key) continue;
        const existing = metricMap.get(row.metric_key);
        metricMap.set(row.metric_key, {
          key: row.metric_key,
          label: row.label?.trim() || existing?.label || row.metric_key,
          href: row.linked_href?.trim() || existing?.href || "/admin/benchmarks",
          description: existing?.description || "Canonical admin metric.",
        });
      }
    }

    return [...metricMap.values()].sort((a, b) => a.label.localeCompare(b.label));
  } catch (err) {
    logger.warn({ err }, "Research repository metric options unavailable");
    return ADMIN_METRIC_OPTIONS.map((metric) => ({
      key: metric.key,
      label: metric.label,
      href: metric.href,
      description: metric.description,
    }));
  }
}

async function fetchResearchRepositoryEntries(): Promise<AdminResearchRepositoryEntry[]> {
  try {
    const res = await supabaseFetch(
      "/rest/v1/admin_research_repository_entry?select=*&order=updated_at.desc",
      { headers: { Range: "0-199" } }
    );
    if (!res.ok) return [];

    const rows = (await res.json()) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: Number(row.id),
      admin_email: String(row.admin_email ?? ""),
      title: String(row.title ?? ""),
      summary: typeof row.summary === "string" ? row.summary : null,
      entry_type: row.entry_type as ResearchRepositoryEntryType,
      status: row.status as ResearchRepositoryStatus,
      priority: row.priority as ResearchRepositoryPriority,
      owner_email: typeof row.owner_email === "string" ? row.owner_email : null,
      primary_metric_key:
        typeof row.primary_metric_key === "string" ? row.primary_metric_key : null,
      question_id: typeof row.question_id === "string" ? row.question_id : null,
      theme: typeof row.theme === "string" ? row.theme : null,
      source_key: typeof row.source_key === "string" ? row.source_key : null,
      source_href: typeof row.source_href === "string" ? row.source_href : null,
      evidence: normalizeEvidence(row.evidence),
      recommendation: typeof row.recommendation === "string" ? row.recommendation : null,
      linked_action_id:
        typeof row.linked_action_id === "number"
          ? row.linked_action_id
          : Number(row.linked_action_id ?? null) || null,
      review_date: typeof row.review_date === "string" ? row.review_date : null,
      created_at: String(row.created_at ?? ""),
      updated_at: String(row.updated_at ?? ""),
    }));
  } catch (err) {
    logger.warn({ err }, "Research repository unavailable");
    return [];
  }
}

export async function buildResearchRepositorySnapshot(): Promise<{
  generatedAt: string;
  summary: {
    total: number;
    active: number;
    validated: number;
    overdueReviews: number;
    highPriority: number;
    linkedActions: number;
  };
  metricOptions: ResearchRepositoryMetricOption[];
  entries: ResearchRepositorySnapshotEntry[];
}> {
  const [entries, metricOptions] = await Promise.all([
    fetchResearchRepositoryEntries(),
    fetchMetricOptions(),
  ]);

  const metricOptionsMap = new Map(metricOptions.map((metric) => [metric.key, metric]));

  const [reviewRows, actionRows] = await Promise.all([
    (async () => {
      try {
        const res = await supabaseFetch(
          "/rest/v1/admin_review_request?select=id,resource_id,status,due_date,updated_at&resource_type=eq.research-entry&order=updated_at.desc",
          { headers: { Range: "0-499" } }
        );
        if (!res.ok) return [] as ReviewRow[];
        return (await res.json()) as ReviewRow[];
      } catch (err) {
        logger.warn({ err }, "Research repository reviews unavailable");
        return [] as ReviewRow[];
      }
    })(),
    (async () => {
      const actionIds = [
        ...new Set(entries.map((entry) => entry.linked_action_id).filter(Boolean)),
      ];
      if (actionIds.length === 0) return [] as ActionRow[];
      try {
        const res = await supabaseFetch(
          `/rest/v1/admin_action_item?select=id,title,status,owner_email,review_date&id=in.(${actionIds.join(",")})`,
          { headers: { Range: "0-199" } }
        );
        if (!res.ok) return [] as ActionRow[];
        return (await res.json()) as ActionRow[];
      } catch (err) {
        logger.warn({ err }, "Research repository actions unavailable");
        return [] as ActionRow[];
      }
    })(),
  ]);

  const reviewsByEntry = new Map<number, ReviewRow[]>();
  for (const row of reviewRows) {
    if (!row.resource_id) continue;
    const current = reviewsByEntry.get(row.resource_id) ?? [];
    current.push(row);
    reviewsByEntry.set(row.resource_id, current);
  }

  const actionMap = new Map(actionRows.map((row) => [row.id, row]));

  const snapshotEntries = entries.map((entry) => {
    const metric = entry.primary_metric_key
      ? (metricOptionsMap.get(entry.primary_metric_key) ?? null)
      : null;
    const reviews = reviewsByEntry.get(entry.id) ?? [];
    const latestReview = reviews[0] ?? null;
    const linkedAction =
      entry.linked_action_id != null ? (actionMap.get(entry.linked_action_id) ?? null) : null;

    return {
      ...entry,
      primary_metric_label: metric?.label ?? null,
      primary_metric_href: metric?.href ?? null,
      question_label: entry.question_id
        ? (questionLabelMap.get(entry.question_id) ?? entry.question_id)
        : null,
      review_state: reviewState(entry.review_date),
      open_review_count: reviews.filter((review) => OPEN_REVIEW_STATUSES.has(review.status)).length,
      latest_review_status: latestReview?.status ?? null,
      linked_action: linkedAction
        ? {
            id: linkedAction.id,
            title: linkedAction.title,
            status: linkedAction.status,
            owner_email: linkedAction.owner_email,
            review_date: linkedAction.review_date,
          }
        : null,
    } satisfies ResearchRepositorySnapshotEntry;
  });

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      total: snapshotEntries.length,
      active: snapshotEntries.filter((entry) => entry.status === "active").length,
      validated: snapshotEntries.filter((entry) => entry.status === "validated").length,
      overdueReviews: snapshotEntries.filter((entry) => entry.review_state === "overdue").length,
      highPriority: snapshotEntries.filter((entry) => entry.priority === "high").length,
      linkedActions: snapshotEntries.filter((entry) => entry.linked_action != null).length,
    },
    metricOptions,
    entries: snapshotEntries,
  };
}
