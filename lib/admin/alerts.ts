import { clampDays } from "@/lib/admin/next-level";
import { buildStrategySnapshot } from "@/lib/admin/strategy";
import { buildHealthStatusSnapshot } from "@/lib/admin/health";
import { supabaseFetch } from "@/lib/admin/supabase";
import logger from "@/lib/logger";
import type {
  AdminAlertRule,
  AdminAnomalyItem,
  AdminAnomalySnapshot,
  AdminOsTone,
} from "@/lib/admin/os-types";

interface CandidateMetric {
  category: AdminAlertRule["targetType"];
  title: string;
  targetKey: string;
  value: number;
  severity: AdminOsTone;
  detail: string;
  href: string;
  ownerEmail: string | null;
}

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function severityFromHealth(status: "healthy" | "degraded" | "down"): AdminOsTone {
  if (status === "down") return "risk";
  if (status === "degraded") return "watch";
  return "good";
}

function compareValue(
  comparator: AdminAlertRule["comparator"],
  left: number,
  right: number
): boolean {
  if (comparator === "gte") return left >= right;
  if (comparator === "lte") return left <= right;
  return left === right;
}

function sortAnomalies(a: AdminAnomalyItem, b: AdminAnomalyItem): number {
  const severityOrder = { risk: 0, watch: 1, good: 2 };
  return severityOrder[a.severity] - severityOrder[b.severity] || b.value - a.value;
}

export async function fetchAlertRules(): Promise<AdminAlertRule[]> {
  try {
    const res = await supabaseFetch("/rest/v1/admin_alert_rule?select=*&order=updated_at.desc", {
      headers: { Range: "0-99" },
    });
    if (!res.ok) return [];

    const rows = (await res.json()) as Array<{
      id: number;
      admin_email: string;
      owner_email: string | null;
      label: string;
      target_type: AdminAlertRule["targetType"];
      target_key: string;
      comparator: AdminAlertRule["comparator"];
      threshold_numeric: number;
      severity: AdminOsTone;
      linked_href: string | null;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      adminEmail: row.admin_email,
      ownerEmail: row.owner_email,
      label: row.label,
      targetType: row.target_type,
      targetKey: row.target_key,
      comparator: row.comparator,
      thresholdNumeric: Number(row.threshold_numeric),
      severity: row.severity,
      linkedHref: row.linked_href,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch (err) {
    logger.warn({ err }, "Alert rules unavailable");
    return [];
  }
}

export async function buildAnomalySnapshot(inputDays: number): Promise<AdminAnomalySnapshot> {
  const days = clampDays(inputDays, 7, 90);
  const [health, strategy, rules, actionRes, decisionRes] = await Promise.all([
    buildHealthStatusSnapshot(),
    buildStrategySnapshot(days),
    fetchAlertRules(),
    supabaseFetch("/rest/v1/admin_action_item?select=*&order=updated_at.desc", {
      headers: { Range: "0-99" },
    }),
    supabaseFetch(
      "/rest/v1/admin_decision_entry?select=id,title,status,owner_email,review_window_days,updated_at&order=updated_at.desc",
      { headers: { Range: "0-49" } }
    ),
  ]);

  const actions = actionRes.ok
    ? ((await actionRes.json()) as Array<{
        id: number;
        title: string;
        status: "open" | "in-progress" | "blocked" | "done";
        owner_email: string | null;
        due_date: string | null;
        linked_href: string | null;
      }>)
    : [];
  const decisions = decisionRes.ok
    ? ((await decisionRes.json()) as Array<{
        id: number;
        title: string;
        status: string;
        owner_email: string | null;
        review_window_days: number | null;
        updated_at: string;
      }>)
    : [];

  const candidateMap = new Map<string, CandidateMetric>();

  for (const item of health.guardrails) {
    const key = normalizeKey(item.label);
    candidateMap.set(key, {
      category: "guardrail",
      title: item.label,
      targetKey: key,
      value: item.current,
      severity: severityFromHealth(item.status),
      detail: item.detail,
      href: item.href,
      ownerEmail: null,
    });
  }

  for (const item of health.services) {
    const key = normalizeKey(item.name);
    candidateMap.set(key, {
      category: "service",
      title: item.name,
      targetKey: key,
      value: item.latencyMs ?? (item.status === "healthy" ? 0 : item.status === "degraded" ? 1 : 2),
      severity: severityFromHealth(item.status),
      detail: item.detail,
      href: "/admin/health",
      ownerEmail: null,
    });
  }

  for (const item of health.trustLayers) {
    const key = normalizeKey(`${item.source}_freshness_hours`);
    candidateMap.set(key, {
      category: "trust",
      title: `${item.source} freshness`,
      targetKey: key,
      value: item.freshnessHours ?? 999,
      severity: item.warning ? "watch" : "good",
      detail: item.warning ?? `${item.sampleSize} rows sampled.`,
      href: "/admin/health",
      ownerEmail: null,
    });
  }

  const blockedActions = actions.filter((item) => item.status === "blocked");
  const overdueActions = actions.filter(
    (item) =>
      item.status !== "done" &&
      item.due_date != null &&
      new Date(item.due_date).getTime() < Date.now()
  );
  candidateMap.set("blocked_actions", {
    category: "action",
    title: "Blocked actions",
    targetKey: "blocked_actions",
    value: blockedActions.length,
    severity: blockedActions.length > 0 ? "risk" : "good",
    detail: `${blockedActions.length} blocked action items need intervention.`,
    href: "/admin",
    ownerEmail: blockedActions[0]?.owner_email ?? null,
  });
  candidateMap.set("overdue_actions", {
    category: "action",
    title: "Overdue actions",
    targetKey: "overdue_actions",
    value: overdueActions.length,
    severity: overdueActions.length > 0 ? "watch" : "good",
    detail: `${overdueActions.length} action items have passed their due date.`,
    href: "/admin",
    ownerEmail: overdueActions[0]?.owner_email ?? null,
  });

  const pendingExperimentDecisions = strategy.experiments.summary.pendingDecision;
  candidateMap.set("pending_experiment_decisions", {
    category: "decision",
    title: "Pending experiment decisions",
    targetKey: "pending_experiment_decisions",
    value: pendingExperimentDecisions,
    severity: pendingExperimentDecisions > 0 ? "watch" : "good",
    detail: `${pendingExperimentDecisions} experiments have crossed their decision date without closure.`,
    href: "/admin/experiments",
    ownerEmail: strategy.experiments.items.find((item) => item.decisionDate)?.ownerEmail ?? null,
  });

  const staleDecisionReviews = decisions.filter((item) => {
    if (item.review_window_days == null) return false;
    return (
      !["validated", "rolled-back"].includes(item.status) &&
      new Date(item.updated_at).getTime() + item.review_window_days * 86_400_000 < Date.now()
    );
  });
  candidateMap.set("stale_decision_reviews", {
    category: "decision",
    title: "Stale decision reviews",
    targetKey: "stale_decision_reviews",
    value: staleDecisionReviews.length,
    severity: staleDecisionReviews.length > 0 ? "watch" : "good",
    detail: `${staleDecisionReviews.length} decision entries are past their review window.`,
    href: "/admin/changelog",
    ownerEmail: staleDecisionReviews[0]?.owner_email ?? null,
  });

  const anomalyMap = new Map<string, AdminAnomalyItem>();
  for (const candidate of candidateMap.values()) {
    if (candidate.severity === "good" || candidate.value <= 0) continue;
    anomalyMap.set(candidate.targetKey, {
      id: candidate.targetKey,
      title: candidate.title,
      category: candidate.category,
      severity: candidate.severity,
      targetKey: candidate.targetKey,
      value: candidate.value,
      detail: candidate.detail,
      href: candidate.href,
      ownerEmail: candidate.ownerEmail,
      matchedRules: [],
    });
  }

  for (const rule of rules.filter((item) => item.isActive)) {
    const candidate = candidateMap.get(rule.targetKey);
    if (!candidate) continue;
    if (!compareValue(rule.comparator, candidate.value, rule.thresholdNumeric)) continue;

    const existing = anomalyMap.get(rule.targetKey);
    if (existing) {
      existing.matchedRules.push({ id: rule.id, label: rule.label });
      if (rule.severity === "risk") existing.severity = "risk";
      continue;
    }

    anomalyMap.set(rule.targetKey, {
      id: `rule-${rule.id}`,
      title: rule.label,
      category: rule.targetType,
      severity: rule.severity,
      targetKey: rule.targetKey,
      value: candidate.value,
      detail: `${candidate.detail} Rule threshold ${rule.comparator} ${rule.thresholdNumeric}.`,
      href: rule.linkedHref ?? candidate.href,
      ownerEmail: rule.ownerEmail,
      matchedRules: [{ id: rule.id, label: rule.label }],
    });
  }

  const items = [...anomalyMap.values()].sort(sortAnomalies);
  return {
    generatedAt: new Date().toISOString(),
    days,
    summary: {
      total: items.length,
      risk: items.filter((item) => item.severity === "risk").length,
      watch: items.filter((item) => item.severity === "watch").length,
      matchedRules: items.reduce((sum, item) => sum + item.matchedRules.length, 0),
    },
    items,
    activeRules: rules.filter((item) => item.isActive),
  };
}
