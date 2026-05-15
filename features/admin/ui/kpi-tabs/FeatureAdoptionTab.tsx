"use client";

import { useMemo, useState, type ReactNode } from "react";
import AdminCommentsThread from "@features/admin/ui/AdminCommentsThread";
import AdminReviewRequestButton from "@features/admin/ui/AdminReviewRequestButton";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import { getCsrfToken } from "@/lib/csrf-client";

type LaunchCategory = "survey-change" | "site-update" | "feature";
type LaunchConfidence = "high" | "medium" | "low";
type LaunchState = "validated" | "monitoring" | "attention" | "blindspot";
type LaunchTone = "good" | "watch" | "risk" | "neutral";
type MetricStatus = "good" | "watch" | "risk" | "unknown";
type ReviewStatus = "fresh" | "due" | "overdue" | "never" | "unknown";

type InsightSeverity = "critical" | "warning" | "positive" | "info" | "neutral";
type InitiativePriority = "low" | "medium" | "high";

interface MetricOption {
  key: string;
  label: string;
  description: string;
  href: string;
}

interface LaunchMetric {
  key: string | null;
  label: string;
  href: string;
  status: MetricStatus;
  currentValue: number | null;
  currentLabel: string;
  targetLabel: string | null;
  warningLabel: string | null;
  trustMode: string | null;
  trustNote: string | null;
  reviewStatus: ReviewStatus;
}

interface ProductLaunch {
  id: number;
  title: string;
  description: string | null;
  category: LaunchCategory;
  ownerEmail: string | null;
  eventDate: string;
  updatedAt: string;
  reviewDate: string | null;
  expectedImpact: string | null;
  measuredOutcome: string | null;
  metric: LaunchMetric;
  blindspotCount: number;
  confidence: LaunchConfidence;
  confidenceScore: number;
  adoptionState: LaunchState;
  adoptionTone: LaunchTone;
  adoptionDetail: string;
  daysSinceLaunch: number | null;
  daysToReview: number | null;
  openReviewCount: number;
  overdueReviewCount: number;
  linkedDecisionCount: number;
  validatedDecisionCount: number;
  openActionCount: number;
  blockedActionCount: number;
}

interface ProductAdoptionData {
  summary: {
    total: number;
    validated: number;
    monitoring: number;
    attention: number;
    blindspots: number;
    openReviews: number;
  };
  launches: ProductLaunch[];
  metricOptions: MetricOption[];
  generatedAt: string;
}

interface Insight {
  id: string;
  type: "triage" | "trend" | "opportunity" | "trust";
  severity: InsightSeverity;
  title: string;
  description: string;
  metric?: string;
  metricKey?: string | null;
  category: string;
  priority: number;
  confidence: "high" | "medium" | "low";
  sampleSize?: number;
  href?: string;
  actionLabel?: string;
}

interface InsightsResponse {
  insights: Insight[];
  summary: {
    attentionCount: number;
    opportunityCount: number;
    trustCount: number;
  };
  period: number;
  sampleSize: number;
}

interface InitiativeDraft {
  sourceInsightId: string;
  title: string;
  description: string;
  owner_email: string;
  primary_metric_key: string;
  expected_impact: string;
  review_date: string;
  priority: InitiativePriority;
  linked_href: string;
}

const LAUNCH_TONE_CLASSES: Record<LaunchTone, string> = {
  good: "bg-emerald-500/10 text-emerald-300",
  watch: "bg-amber-500/10 text-amber-200",
  risk: "bg-red-500/10 text-red-300",
  neutral: "bg-white/10 text-text-muted",
};

const CONFIDENCE_CLASSES: Record<LaunchConfidence, string> = {
  high: "bg-emerald-500/10 text-emerald-300",
  medium: "bg-amber-500/10 text-amber-200",
  low: "bg-red-500/10 text-red-300",
};

const METRIC_STATUS_CLASSES: Record<MetricStatus, string> = {
  good: "border-emerald-500/20 bg-emerald-500/5 text-emerald-300",
  watch: "border-amber-500/20 bg-amber-500/5 text-amber-200",
  risk: "border-red-500/20 bg-red-500/5 text-red-300",
  unknown: "border-white/10 bg-white/5 text-text-muted",
};

const REVIEW_STATUS_CLASSES: Record<ReviewStatus, string> = {
  fresh: "bg-emerald-500/10 text-emerald-300",
  due: "bg-amber-500/10 text-amber-200",
  overdue: "bg-red-500/10 text-red-300",
  never: "bg-white/10 text-text-muted",
  unknown: "bg-white/10 text-text-muted",
};

const SEVERITY_CLASSES: Record<InsightSeverity, string> = {
  critical: "bg-red-500/10 text-red-300",
  warning: "bg-amber-500/10 text-amber-200",
  positive: "bg-emerald-500/10 text-emerald-300",
  info: "bg-cyan-500/10 text-cyan-300",
  neutral: "bg-white/10 text-text-muted",
};

const INPUT_CLASS =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-white/20 focus:outline-none";

function isoDate(daysFromNow: number) {
  return new Date(Date.now() + daysFromNow * 86_400_000).toISOString().slice(0, 10);
}

function initiativePriority(severity: InsightSeverity): InitiativePriority {
  if (severity === "critical" || severity === "warning") return "high";
  if (severity === "positive" || severity === "info") return "medium";
  return "low";
}

function reviewDateFromSeverity(severity: InsightSeverity) {
  if (severity === "critical") return isoDate(7);
  if (severity === "warning") return isoDate(14);
  return isoDate(21);
}

function actionPriority(severity: InsightSeverity) {
  return severity === "critical" || severity === "warning" ? "high" : "medium";
}

function reviewLabel(status: ReviewStatus) {
  if (status === "fresh") return "Review fresh";
  if (status === "due") return "Review due";
  if (status === "overdue") return "Review overdue";
  if (status === "never") return "Never reviewed";
  return "Review unknown";
}

function formatReviewCountdown(days: number | null) {
  if (days == null) return "No review date";
  if (days > 0) return `${days}d left`;
  if (days === 0) return "Due today";
  return `${Math.abs(days)}d overdue`;
}

function categoryLabel(category: string) {
  return category.replace(/-/g, " ");
}

function buildInitiativeDraft(insight: Insight): InitiativeDraft {
  return {
    sourceInsightId: insight.id,
    title: insight.title,
    description: insight.description,
    owner_email: "",
    primary_metric_key: insight.metricKey ?? "",
    expected_impact: insight.description,
    review_date: reviewDateFromSeverity(insight.severity),
    priority: initiativePriority(insight.severity),
    linked_href: insight.href ?? "/admin/product-kpis?tab=Feature%20Adoption",
  };
}

export default function FeatureAdoptionTab({ days }: { days: number }) {
  const params = useMemo(() => ({ days: String(days) }), [days]);
  const {
    data: adoptionData,
    loading: adoptionLoading,
    error: adoptionError,
    refetch: refetchAdoption,
  } = useAdminFetch<ProductAdoptionData>("/api/admin/product-kpis/adoption", params);
  const {
    data: insightsData,
    loading: insightsLoading,
    error: insightsError,
    refetch: refetchInsights,
  } = useAdminFetch<InsightsResponse>("/api/admin/insights", params);

  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [initiativeDraft, setInitiativeDraft] = useState<InitiativeDraft | null>(null);

  async function createReleaseAction(launch: ProductLaunch) {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/actions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({
          title: `Follow up release: ${launch.title}`,
          description: launch.adoptionDetail,
          priority:
            launch.adoptionState === "attention" || launch.blockedActionCount > 0
              ? "high"
              : launch.adoptionState === "blindspot"
                ? "medium"
                : "low",
          owner_email: launch.ownerEmail,
          source_type: "release",
          source_id: launch.id,
          metric_key: launch.metric.key,
          expected_impact: launch.expectedImpact,
          measured_outcome: launch.measuredOutcome,
          linked_href: "/admin/changelog",
          due_date: launch.reviewDate ?? isoDate(14),
          review_date: launch.reviewDate ?? isoDate(21),
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          (body as { error?: string } | null)?.error || "Failed to create follow-up action."
        );
      }

      setMessage({ type: "success", text: `Created follow-up action for release #${launch.id}.` });
      refetchAdoption();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Unknown error." });
    } finally {
      setSaving(false);
    }
  }

  async function createInsightAction(insight: Insight) {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/actions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({
          title: `Insight follow-up: ${insight.title}`,
          description: insight.description,
          priority: actionPriority(insight.severity),
          owner_email: null,
          source_type: "investigation",
          source_id: null,
          metric_key: insight.metricKey ?? null,
          expected_impact: insight.metric ?? insight.description,
          measured_outcome: null,
          linked_href: insight.href ?? "/admin/product-kpis?tab=Feature%20Adoption",
          due_date: reviewDateFromSeverity(insight.severity),
          review_date: isoDate(28),
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          (body as { error?: string } | null)?.error || "Failed to create action item."
        );
      }

      setMessage({ type: "success", text: `Created action from insight ${insight.id}.` });
      refetchAdoption();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Unknown error." });
    } finally {
      setSaving(false);
    }
  }

  async function submitInitiative() {
    if (!initiativeDraft || !initiativeDraft.title.trim()) return;

    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/strategy-planning", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({
          action: "create",
          resourceType: "initiative",
          title: initiativeDraft.title.trim(),
          description: initiativeDraft.description.trim() || null,
          status: "planned",
          priority: initiativeDraft.priority,
          owner_email: initiativeDraft.owner_email.trim() || null,
          goal_id: null,
          primary_metric_key: initiativeDraft.primary_metric_key || null,
          secondary_metric_keys: [],
          expected_impact: initiativeDraft.expected_impact.trim() || null,
          review_date: initiativeDraft.review_date || null,
          linked_href: initiativeDraft.linked_href,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          (body as { error?: string } | null)?.error || "Failed to promote insight to initiative."
        );
      }

      setMessage({
        type: "success",
        text: `Promoted insight ${initiativeDraft.sourceInsightId} into a strategy initiative.`,
      });
      setInitiativeDraft(null);
      refetchInsights();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Unknown error." });
    } finally {
      setSaving(false);
    }
  }

  if (adoptionLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
      </div>
    );
  }

  if (adoptionError || !adoptionData) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm text-red-400">
        {adoptionError || "Failed to load feature adoption board."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-serif text-xl font-semibold text-text-primary">Feature Adoption</h3>
          <p className="mt-1 max-w-4xl text-sm text-text-muted">
            Track whether launches have metric coverage, readouts, reviews, and downstream
            follow-through.
          </p>
        </div>
        <p className="text-xs text-text-muted">
          Updated {new Date(adoptionData.generatedAt).toLocaleString()}
        </p>
      </div>

      {message && (
        <div
          className={`rounded-xl border p-4 text-sm ${
            message.type === "success"
              ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-300"
              : "border-red-500/20 bg-red-500/5 text-red-300"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryTile label="Launches" value={String(adoptionData.summary.total)} />
        <SummaryTile label="Validated" value={String(adoptionData.summary.validated)} tone="good" />
        <SummaryTile
          label="Monitoring"
          value={String(adoptionData.summary.monitoring)}
          tone="watch"
        />
        <SummaryTile label="Attention" value={String(adoptionData.summary.attention)} tone="risk" />
        <SummaryTile label="Blindspots" value={String(adoptionData.summary.blindspots)} />
        <SummaryTile
          label="Open Reviews"
          value={String(adoptionData.summary.openReviews)}
          tone="watch"
        />
      </div>

      {initiativeDraft && (
        <section className="rounded-xl border border-white/10 bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-text-primary">
                Promote Insight To Initiative
              </h4>
              <p className="mt-1 text-sm text-text-muted">
                Convert a validated signal into a tracked initiative without leaving the product
                surface.
              </p>
            </div>
            <button
              onClick={() => setInitiativeDraft(null)}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary transition hover:bg-white/10"
            >
              Cancel
            </button>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <FormField label="Title">
              <input
                value={initiativeDraft.title}
                onChange={(event) =>
                  setInitiativeDraft((current) =>
                    current ? { ...current, title: event.target.value } : current
                  )
                }
                className={INPUT_CLASS}
              />
            </FormField>
            <FormField label="Owner Email">
              <input
                type="email"
                value={initiativeDraft.owner_email}
                onChange={(event) =>
                  setInitiativeDraft((current) =>
                    current ? { ...current, owner_email: event.target.value } : current
                  )
                }
                className={INPUT_CLASS}
                placeholder="owner@loveiq.com"
              />
            </FormField>
            <FormField label="Primary Metric">
              <select
                value={initiativeDraft.primary_metric_key}
                onChange={(event) =>
                  setInitiativeDraft((current) =>
                    current ? { ...current, primary_metric_key: event.target.value } : current
                  )
                }
                className={INPUT_CLASS}
              >
                <option value="">No linked metric</option>
                {adoptionData.metricOptions.map((metric) => (
                  <option key={metric.key} value={metric.key}>
                    {metric.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Review Date">
              <input
                type="date"
                value={initiativeDraft.review_date}
                onChange={(event) =>
                  setInitiativeDraft((current) =>
                    current ? { ...current, review_date: event.target.value } : current
                  )
                }
                className={INPUT_CLASS}
              />
            </FormField>
            <FormField label="Description" className="lg:col-span-2">
              <textarea
                value={initiativeDraft.description}
                onChange={(event) =>
                  setInitiativeDraft((current) =>
                    current ? { ...current, description: event.target.value } : current
                  )
                }
                className={`${INPUT_CLASS} min-h-24`}
              />
            </FormField>
            <FormField label="Expected Impact" className="lg:col-span-2">
              <textarea
                value={initiativeDraft.expected_impact}
                onChange={(event) =>
                  setInitiativeDraft((current) =>
                    current ? { ...current, expected_impact: event.target.value } : current
                  )
                }
                className={`${INPUT_CLASS} min-h-24`}
              />
            </FormField>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              onClick={() => void submitInitiative()}
              disabled={saving || !initiativeDraft.title.trim()}
              className="rounded-lg bg-accent-purple px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-purple/80 disabled:opacity-40"
            >
              {saving ? "Saving..." : "Create Initiative"}
            </button>
          </div>
        </section>
      )}

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-text-primary">Adoption Board</h4>
            <p className="mt-1 text-sm text-text-muted">
              Product-facing launches with current metric signal, review posture, and follow-up
              state.
            </p>
          </div>
          <a
            href="/admin/changelog"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary transition hover:bg-white/10"
          >
            Open changelog
          </a>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {adoptionData.launches.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/10 p-6 text-sm text-text-muted">
              No product launches were found in the selected window.
            </div>
          )}
          {adoptionData.launches.map((launch) => (
            <div key={launch.id} className="rounded-xl border border-white/10 bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={LAUNCH_TONE_CLASSES[launch.adoptionTone]}>
                      {launch.adoptionState}
                    </Badge>
                    <Badge className={CONFIDENCE_CLASSES[launch.confidence]}>
                      {launch.confidence} confidence
                    </Badge>
                    <Badge className="bg-white/10 text-text-muted">{launch.category}</Badge>
                  </div>
                  <p className="mt-2 text-lg font-semibold text-text-primary">{launch.title}</p>
                  <p className="mt-1 text-sm text-text-muted">{launch.adoptionDetail}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => void createReleaseAction(launch)}
                    disabled={saving}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary transition hover:bg-white/10 disabled:opacity-40"
                  >
                    Create follow-up action
                  </button>
                  <AdminReviewRequestButton
                    title={`Review release adoption: ${launch.title}`}
                    description={launch.measuredOutcome || launch.adoptionDetail}
                    resourceType="release-entry"
                    resourceId={launch.id}
                    linkedMetricKey={launch.metric.key}
                    impactLevel={
                      launch.adoptionState === "attention"
                        ? "high"
                        : launch.adoptionState === "blindspot"
                          ? "medium"
                          : "low"
                    }
                    reviewerEmail={launch.ownerEmail}
                    sourceHref="/admin/product-kpis?tab=Feature%20Adoption"
                    dueDate={launch.reviewDate ?? isoDate(14)}
                    payloadSnapshot={{
                      category: launch.category,
                      adoptionState: launch.adoptionState,
                      confidence: launch.confidence,
                      blindspotCount: launch.blindspotCount,
                      openReviewCount: launch.openReviewCount,
                    }}
                    label="Request review"
                    busyLabel="Requesting..."
                    successLabel="Queued"
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary transition hover:bg-white/10 disabled:opacity-40"
                    onSuccess={() => refetchAdoption()}
                  />
                  <a
                    href={launch.metric.href}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary transition hover:bg-white/10"
                  >
                    Open metric
                  </a>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricMeta label="Metric" value={launch.metric.label} />
                <MetricMeta label="Current" value={launch.metric.currentLabel} />
                <MetricMeta
                  label="Review"
                  value={launch.reviewDate ?? "Not scheduled"}
                  meta={formatReviewCountdown(launch.daysToReview)}
                />
                <MetricMeta
                  label="Launch"
                  value={launch.eventDate}
                  meta={
                    launch.daysSinceLaunch != null ? `${launch.daysSinceLaunch}d ago` : undefined
                  }
                />
              </div>

              <div className="mt-4 grid gap-3 xl:grid-cols-2">
                <div
                  className={`rounded-xl border p-4 ${METRIC_STATUS_CLASSES[launch.metric.status]}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide opacity-80">Metric Health</p>
                      <p className="mt-1 text-sm font-semibold">{launch.metric.label}</p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${REVIEW_STATUS_CLASSES[launch.metric.reviewStatus]}`}
                    >
                      {reviewLabel(launch.metric.reviewStatus)}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <MiniMeta label="Target" value={launch.metric.targetLabel ?? "Not set"} />
                    <MiniMeta label="Warning" value={launch.metric.warningLabel ?? "Not set"} />
                    <MiniMeta label="Trust" value={launch.metric.trustMode ?? "Not documented"} />
                    <MiniMeta label="Blindspots" value={String(launch.blindspotCount)} />
                  </div>
                  {launch.metric.trustNote && (
                    <p className="mt-3 rounded-lg border border-white/10 bg-black/10 px-3 py-3 text-sm">
                      {launch.metric.trustNote}
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-wide text-text-muted">Governance</p>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <MiniMeta label="Open Reviews" value={String(launch.openReviewCount)} />
                    <MiniMeta label="Overdue Reviews" value={String(launch.overdueReviewCount)} />
                    <MiniMeta label="Linked Decisions" value={String(launch.linkedDecisionCount)} />
                    <MiniMeta label="Open Actions" value={String(launch.openActionCount)} />
                  </div>
                  {launch.blockedActionCount > 0 && (
                    <p className="mt-3 text-sm text-red-300">
                      {launch.blockedActionCount} linked action
                      {launch.blockedActionCount === 1 ? "" : "s"} currently blocked.
                    </p>
                  )}
                  {launch.ownerEmail && (
                    <p className="mt-3 text-sm text-text-muted">Owner: {launch.ownerEmail}</p>
                  )}
                </div>
              </div>

              {(launch.expectedImpact || launch.measuredOutcome || launch.description) && (
                <div className="mt-4 grid gap-3 lg:grid-cols-3">
                  <NarrativeCard label="Release Summary" value={launch.description} />
                  <NarrativeCard label="Expected Impact" value={launch.expectedImpact} />
                  <NarrativeCard label="Measured Outcome" value={launch.measuredOutcome} />
                </div>
              )}

              <AdminCommentsThread
                resourceType="release-entry"
                resourceId={launch.id}
                title="Release Discussion"
              />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-text-primary">Insight Intake</h4>
            <p className="mt-1 text-sm text-text-muted">
              Convert automated product signals into tracked actions or roadmap initiatives.
            </p>
          </div>
          {insightsData && (
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-red-500/10 text-red-300">
                {insightsData.summary.attentionCount} attention
              </Badge>
              <Badge className="bg-emerald-500/10 text-emerald-300">
                {insightsData.summary.opportunityCount} opportunities
              </Badge>
              <Badge className="bg-white/10 text-text-muted">
                {insightsData.summary.trustCount} trust
              </Badge>
            </div>
          )}
        </div>

        {insightsLoading && (
          <div className="flex items-center justify-center py-10">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
          </div>
        )}

        {insightsError && !insightsLoading && (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
            {insightsError}
          </div>
        )}

        {!insightsLoading && !insightsError && insightsData && (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-text-muted">
              Last {insightsData.period} days · {insightsData.sampleSize.toLocaleString()}{" "}
              submissions analyzed
            </p>
            {insightsData.insights.length === 0 && (
              <div className="rounded-xl border border-dashed border-white/10 p-6 text-sm text-text-muted">
                No automated insights were surfaced in this window.
              </div>
            )}
            {insightsData.insights.map((insight) => (
              <div key={insight.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={SEVERITY_CLASSES[insight.severity]}>
                        {insight.severity}
                      </Badge>
                      <Badge className="bg-white/10 text-text-muted">
                        {categoryLabel(insight.category)}
                      </Badge>
                      <Badge className="bg-white/10 text-text-muted">{insight.confidence}</Badge>
                    </div>
                    <p className="mt-2 text-base font-semibold text-text-primary">
                      {insight.title}
                    </p>
                    <p className="mt-2 text-sm text-text-muted">{insight.description}</p>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-text-muted">
                      {insight.metric && <span>{insight.metric}</span>}
                      {insight.metricKey && <span>metric {insight.metricKey}</span>}
                      {insight.sampleSize != null && <span>n={insight.sampleSize}</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => void createInsightAction(insight)}
                      disabled={saving}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary transition hover:bg-white/10 disabled:opacity-40"
                    >
                      Create action
                    </button>
                    <button
                      onClick={() => setInitiativeDraft(buildInitiativeDraft(insight))}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary transition hover:bg-white/10"
                    >
                      Promote to initiative
                    </button>
                    {insight.href && (
                      <a
                        href={insight.href}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary transition hover:bg-white/10"
                      >
                        {insight.actionLabel ?? "Open view"}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "good" | "watch" | "risk";
}) {
  const classes =
    tone === "good"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
      : tone === "watch"
        ? "border-amber-500/20 bg-amber-500/10 text-amber-200"
        : tone === "risk"
          ? "border-red-500/20 bg-red-500/10 text-red-300"
          : "border-white/10 bg-white/5 text-text-primary";

  return (
    <div className={`rounded-xl border p-4 ${classes}`}>
      <p className="text-xs uppercase tracking-wide">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function FormField({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs text-text-muted">{label}</label>
      {children}
    </div>
  );
}

function Badge({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${className}`}>
      {children}
    </span>
  );
}

function MetricMeta({ label, value, meta }: { label: string; value: string; meta?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-sm font-medium text-text-primary">{value}</p>
      {meta && <p className="mt-2 text-xs text-text-muted">{meta}</p>}
    </div>
  );
}

function MiniMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-3">
      <p className="text-[11px] uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-sm font-medium text-text-primary">{value}</p>
    </div>
  );
}

function NarrativeCard({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-sm text-text-primary">{value}</p>
    </div>
  );
}
