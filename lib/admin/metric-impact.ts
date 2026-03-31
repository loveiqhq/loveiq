import { ADMIN_METRIC_OPTIONS, fetchMetricValue } from "@/lib/admin/metric-library";
import {
  buildMetricRegistrySnapshot,
  formatMetricValue,
  type MetricUnit,
} from "@/lib/admin/metric-registry";
import { supabaseFetch } from "@/lib/admin/supabase";
import logger from "@/lib/logger";

type ImpactKind = "release" | "decision" | "experiment" | "action";

type ReleaseRow = {
  id: number;
  title: string;
  category: string;
  owner_email: string | null;
  primary_metric_key: string | null;
  expected_impact: string | null;
  measured_outcome: string | null;
  review_date: string | null;
  event_date: string;
  updated_at: string;
};

type DecisionRow = {
  id: number;
  title: string;
  entry_type: "decision" | "scoring-change" | "memo";
  status: string;
  owner_email: string | null;
  primary_metric_key: string | null;
  expected_impact: string | null;
  observed_effect: string | null;
  review_window_days: number | null;
  updated_at: string;
};

type ExperimentRow = {
  id: number;
  name: string;
  status: string;
  owner_email: string | null;
  primary_metric_key: string;
  expected_impact: string | null;
  result_summary: string | null;
  outcome: string | null;
  decision_date: string | null;
  updated_at: string;
};

type ActionRow = {
  id: number;
  title: string;
  status: string;
  priority: string;
  owner_email: string | null;
  metric_key: string | null;
  expected_impact: string | null;
  measured_outcome: string | null;
  review_date: string | null;
  linked_href: string | null;
  updated_at: string;
};

export interface AdminMetricImpactItem {
  id: string;
  kind: ImpactKind;
  numericId: number;
  title: string;
  ownerEmail: string | null;
  statusLabel: string;
  expectedImpact: string | null;
  measuredOutcome: string | null;
  reviewDate: string | null;
  timestamp: string;
  href: string;
  attentionNeeded: boolean;
}

export interface AdminMetricImpactGroup {
  metricKey: string;
  label: string;
  description: string;
  ownerEmail: string | null;
  stewardshipRole: string | null;
  currentValueLabel: string;
  trustMode: string | null;
  linkedHref: string;
  openReviewItems: number;
  counts: {
    total: number;
    releases: number;
    decisions: number;
    experiments: number;
    actions: number;
  };
  items: AdminMetricImpactItem[];
}

export interface AdminMetricImpactSnapshot {
  generatedAt: string;
  summary: {
    metricsWithActivity: number;
    linkedItems: number;
    openReviewItems: number;
    metricsWithoutOwner: number;
    unlinkedChanges: number;
  };
  unlinkedByKind: Record<ImpactKind, number>;
  groups: AdminMetricImpactGroup[];
}

function safeTime(value: string | null): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function inferUnit(metricKey: string): MetricUnit {
  if (
    metricKey.includes("rate") ||
    metricKey.includes("agreement") ||
    metricKey.includes("completion")
  ) {
    return "percent";
  }
  if (metricKey.includes("minute")) return "minutes";
  if (metricKey.includes("revenue")) return "currency";
  if (metricKey.includes("score")) return "score";
  return "count";
}

function deriveDecisionReviewDate(
  updatedAt: string,
  reviewWindowDays: number | null
): string | null {
  if (reviewWindowDays == null) return null;
  return new Date(new Date(updatedAt).getTime() + reviewWindowDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function needsReview(reviewDate: string | null, measuredOutcome: string | null): boolean {
  return Boolean(
    reviewDate &&
    reviewDate <= new Date().toISOString().slice(0, 10) &&
    !(measuredOutcome && measuredOutcome.trim())
  );
}

function pushMetricItem(
  groups: Map<string, AdminMetricImpactItem[]>,
  unlinkedByKind: Record<ImpactKind, number>,
  metricKey: string | null,
  item: AdminMetricImpactItem
) {
  if (!metricKey) {
    unlinkedByKind[item.kind] += 1;
    return;
  }

  const current = groups.get(metricKey) ?? [];
  current.push(item);
  groups.set(metricKey, current);
}

export async function buildMetricImpactSnapshot(): Promise<AdminMetricImpactSnapshot> {
  const [registry, releasesRes, decisionsRes, experimentsRes, actionsRes] = await Promise.all([
    buildMetricRegistrySnapshot(),
    supabaseFetch(
      [
        "/rest/v1/product_changelog?select=",
        [
          "id",
          "title",
          "category",
          "owner_email",
          "primary_metric_key",
          "expected_impact",
          "measured_outcome",
          "review_date",
          "event_date",
          "updated_at",
        ].join(","),
        "&order=updated_at.desc",
      ].join(""),
      { headers: { Range: "0-499" } }
    ),
    supabaseFetch(
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
      ].join(""),
      { headers: { Range: "0-499" } }
    ),
    supabaseFetch(
      [
        "/rest/v1/admin_experiment?select=",
        [
          "id",
          "name",
          "status",
          "owner_email",
          "primary_metric_key",
          "expected_impact",
          "result_summary",
          "outcome",
          "decision_date",
          "updated_at",
        ].join(","),
        "&order=updated_at.desc",
      ].join(""),
      { headers: { Range: "0-499" } }
    ),
    supabaseFetch(
      [
        "/rest/v1/admin_action_item?select=",
        [
          "id",
          "title",
          "status",
          "priority",
          "owner_email",
          "metric_key",
          "expected_impact",
          "measured_outcome",
          "review_date",
          "linked_href",
          "updated_at",
        ].join(","),
        "&order=updated_at.desc",
      ].join(""),
      { headers: { Range: "0-499" } }
    ),
  ]);

  const releases = releasesRes.ok ? ((await releasesRes.json()) as ReleaseRow[]) : [];
  const decisions = decisionsRes.ok ? ((await decisionsRes.json()) as DecisionRow[]) : [];
  const experiments = experimentsRes.ok ? ((await experimentsRes.json()) as ExperimentRow[]) : [];
  const actions = actionsRes.ok ? ((await actionsRes.json()) as ActionRow[]) : [];

  const groups = new Map<string, AdminMetricImpactItem[]>();
  const unlinkedByKind: Record<ImpactKind, number> = {
    release: 0,
    decision: 0,
    experiment: 0,
    action: 0,
  };

  for (const entry of releases) {
    pushMetricItem(groups, unlinkedByKind, entry.primary_metric_key, {
      id: `release-${entry.id}`,
      kind: "release",
      numericId: entry.id,
      title: entry.title,
      ownerEmail: entry.owner_email,
      statusLabel: entry.category,
      expectedImpact: entry.expected_impact,
      measuredOutcome: entry.measured_outcome,
      reviewDate: entry.review_date,
      timestamp: entry.updated_at || `${entry.event_date}T00:00:00.000Z`,
      href: "/admin/changelog",
      attentionNeeded: needsReview(entry.review_date, entry.measured_outcome),
    });
  }

  for (const entry of decisions) {
    const reviewDate = deriveDecisionReviewDate(entry.updated_at, entry.review_window_days);
    pushMetricItem(groups, unlinkedByKind, entry.primary_metric_key, {
      id: `decision-${entry.id}`,
      kind: "decision",
      numericId: entry.id,
      title: entry.title,
      ownerEmail: entry.owner_email,
      statusLabel: `${entry.entry_type} · ${entry.status}`,
      expectedImpact: entry.expected_impact,
      measuredOutcome: entry.observed_effect,
      reviewDate,
      timestamp: entry.updated_at,
      href: "/admin/changelog",
      attentionNeeded: needsReview(reviewDate, entry.observed_effect),
    });
  }

  for (const entry of experiments) {
    const measuredOutcome = entry.outcome ?? entry.result_summary;
    pushMetricItem(groups, unlinkedByKind, entry.primary_metric_key, {
      id: `experiment-${entry.id}`,
      kind: "experiment",
      numericId: entry.id,
      title: entry.name,
      ownerEmail: entry.owner_email,
      statusLabel: entry.status,
      expectedImpact: entry.expected_impact,
      measuredOutcome,
      reviewDate: entry.decision_date,
      timestamp: entry.updated_at,
      href: "/admin/experiments",
      attentionNeeded: needsReview(entry.decision_date, measuredOutcome),
    });
  }

  for (const entry of actions) {
    pushMetricItem(groups, unlinkedByKind, entry.metric_key, {
      id: `action-${entry.id}`,
      kind: "action",
      numericId: entry.id,
      title: entry.title,
      ownerEmail: entry.owner_email,
      statusLabel: `${entry.status} · ${entry.priority}`,
      expectedImpact: entry.expected_impact,
      measuredOutcome: entry.measured_outcome,
      reviewDate: entry.review_date,
      timestamp: entry.updated_at,
      href: entry.linked_href || "/admin",
      attentionNeeded: needsReview(entry.review_date, entry.measured_outcome),
    });
  }

  const registryByKey = new Map(registry.entries.map((entry) => [entry.metric_key, entry]));
  const metricOptionsByKey = new Map(ADMIN_METRIC_OPTIONS.map((entry) => [entry.key, entry]));
  const fallbackValueLabels = new Map<string, string>();

  await Promise.all(
    [...groups.keys()].map(async (metricKey) => {
      if (registryByKey.has(metricKey)) return;
      try {
        const value = await fetchMetricValue(metricKey);
        fallbackValueLabels.set(metricKey, formatMetricValue(value, inferUnit(metricKey)));
      } catch (err) {
        logger.warn({ err, metricKey }, "Metric impact value probe failed");
      }
    })
  );

  const groupedMetrics = [...groups.entries()]
    .map(([metricKey, items]) => {
      const registryEntry = registryByKey.get(metricKey);
      const option = metricOptionsByKey.get(metricKey);
      const sortedItems = [...items].sort(
        (left, right) => safeTime(right.timestamp) - safeTime(left.timestamp)
      );
      const openReviewItems = sortedItems.filter((item) => item.attentionNeeded).length;

      return {
        metricKey,
        label: registryEntry?.label ?? option?.label ?? metricKey,
        description:
          registryEntry?.description ??
          registryEntry?.metric_description ??
          option?.description ??
          "No metric description available.",
        ownerEmail: registryEntry?.owner_email ?? null,
        stewardshipRole: registryEntry?.stewardship_role ?? null,
        currentValueLabel:
          registryEntry?.current_value_label ?? fallbackValueLabels.get(metricKey) ?? "—",
        trustMode: registryEntry?.trust_mode ?? null,
        linkedHref: registryEntry?.linked_href ?? option?.href ?? "/admin/benchmarks",
        openReviewItems,
        counts: {
          total: sortedItems.length,
          releases: sortedItems.filter((item) => item.kind === "release").length,
          decisions: sortedItems.filter((item) => item.kind === "decision").length,
          experiments: sortedItems.filter((item) => item.kind === "experiment").length,
          actions: sortedItems.filter((item) => item.kind === "action").length,
        },
        items: sortedItems,
      };
    })
    .sort((left, right) => {
      if (right.openReviewItems !== left.openReviewItems) {
        return right.openReviewItems - left.openReviewItems;
      }
      if (right.counts.total !== left.counts.total) {
        return right.counts.total - left.counts.total;
      }
      return (
        safeTime(right.items[0]?.timestamp ?? null) - safeTime(left.items[0]?.timestamp ?? null)
      );
    });

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      metricsWithActivity: groupedMetrics.length,
      linkedItems: groupedMetrics.reduce((sum, group) => sum + group.counts.total, 0),
      openReviewItems: groupedMetrics.reduce((sum, group) => sum + group.openReviewItems, 0),
      metricsWithoutOwner: groupedMetrics.filter((group) => !group.ownerEmail).length,
      unlinkedChanges: Object.values(unlinkedByKind).reduce((sum, value) => sum + value, 0),
    },
    unlinkedByKind,
    groups: groupedMetrics,
  };
}
