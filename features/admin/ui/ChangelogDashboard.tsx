"use client";

import { useEffect, useMemo, useState } from "react";
import AdminCommentsThread from "@features/admin/ui/AdminCommentsThread";
import ReleaseImpactCenterTab from "@features/admin/ui/ReleaseImpactCenterTab";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import { getCsrfToken } from "@/lib/csrf-client";

interface ChangelogEntry {
  id: number;
  title: string;
  description: string | null;
  category: string;
  adminEmail: string;
  ownerEmail: string | null;
  primaryMetricKey: string | null;
  expectedImpact: string | null;
  reviewDate: string | null;
  measuredOutcome: string | null;
  eventDate: string;
  createdAt: string;
  updatedAt: string;
}

interface Annotation {
  id: number;
  chartKey: string;
  annotationDate: string;
  note: string;
  adminEmail: string;
  createdAt: string;
}

interface DecisionEntry {
  id: number;
  title: string;
  entryType: "decision" | "scoring-change" | "memo";
  status: "draft" | "approved" | "monitoring" | "validated" | "rolled-back";
  primaryMetricKey: string | null;
  rationale: string;
  expectedImpact: string | null;
  observedEffect: string | null;
  changeSummary: string | null;
  reviewWindowDays: number | null;
  linkedReleaseId: number | null;
  linkedExperimentId: number | null;
  evidenceLinks: Array<{ label: string; href: string }>;
  adminEmail: string;
  ownerEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MetricOption {
  key: string;
  label: string;
  description: string;
  href: string;
}

interface ChangelogData {
  changelog: ChangelogEntry[];
  annotations: Annotation[];
  decisions: DecisionEntry[];
  metrics: MetricOption[];
  summary: {
    changelogCount: number;
    annotationCount: number;
    decisionCount: number;
    scoringGovernanceCount: number;
    memoCount: number;
  };
  totalEntries: number;
}

type TimelineItem =
  | (ChangelogEntry & { type: "changelog"; date: string; badge: string })
  | (Annotation & {
      type: "annotation";
      date: string;
      title: string;
      description: string | null;
      category: string;
      badge: string;
    })
  | (DecisionEntry & { type: "decision"; date: string; category: string; badge: string });

type FormMode = "changelog" | "decision" | "scoring-change" | "memo";
type Tab = "Timeline" | "Release Impact" | "Decision Journal" | "Governance" | "Add Entry";

const TABS: Tab[] = ["Timeline", "Release Impact", "Decision Journal", "Governance", "Add Entry"];
const DECISION_STATUSES = ["draft", "approved", "monitoring", "validated", "rolled-back"] as const;
const CATEGORIES = ["survey-change", "site-update", "marketing", "bug-fix", "feature", "other"];

const categoryColors: Record<string, string> = {
  "survey-change": "bg-purple-500/20 text-purple-300",
  "site-update": "bg-blue-500/20 text-blue-300",
  marketing: "bg-emerald-500/20 text-emerald-300",
  "bug-fix": "bg-red-500/20 text-red-300",
  feature: "bg-amber-500/20 text-amber-300",
  other: "bg-white/10 text-text-muted",
  annotation: "bg-cyan-500/20 text-cyan-300",
  decision: "bg-fuchsia-500/20 text-fuchsia-300",
  "scoring-change": "bg-orange-500/20 text-orange-300",
  memo: "bg-indigo-500/20 text-indigo-300",
};

const FORM_MODE_LABELS: Record<FormMode, string> = {
  changelog: "Product Changelog",
  decision: "Decision Entry",
  "scoring-change": "Scoring Governance",
  memo: "Memo Note",
};

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-text-primary">{value}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <p className="text-[11px] uppercase tracking-wider text-text-muted">{label}</p>
      <p className="mt-2 text-sm text-text-primary">{value}</p>
    </div>
  );
}

export default function ChangelogDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("Timeline");
  const { data, loading, error, refetch } = useAdminFetch<ChangelogData>("/api/admin/changelog");
  const [timelineFilter, setTimelineFilter] = useState("all");
  const [decisionFilter, setDecisionFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [formMode, setFormMode] = useState<FormMode>("changelog");
  const [submitting, setSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [formMsg, setFormMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [ownerEmail, setOwnerEmail] = useState("");
  const [primaryMetricKey, setPrimaryMetricKey] = useState("");
  const [reviewDate, setReviewDate] = useState("");
  const [status, setStatus] = useState<(typeof DECISION_STATUSES)[number]>("draft");
  const [rationale, setRationale] = useState("");
  const [expectedImpact, setExpectedImpact] = useState("");
  const [measuredOutcome, setMeasuredOutcome] = useState("");
  const [observedEffect, setObservedEffect] = useState("");
  const [changeSummary, setChangeSummary] = useState("");
  const [reviewWindowDays, setReviewWindowDays] = useState("14");
  const [linkedReleaseId, setLinkedReleaseId] = useState("");
  const [linkedExperimentId, setLinkedExperimentId] = useState("");

  const [decisionDrafts, setDecisionDrafts] = useState<
    Record<number, { status: string; observedEffect: string; reviewWindowDays: string }>
  >({});

  useEffect(() => {
    if (!data?.decisions) return;
    setDecisionDrafts((current) => {
      const next = { ...current };
      for (const entry of data.decisions) {
        next[entry.id] = next[entry.id] ?? {
          status: entry.status,
          observedEffect: entry.observedEffect ?? "",
          reviewWindowDays: entry.reviewWindowDays ? String(entry.reviewWindowDays) : "",
        };
      }
      return next;
    });
  }, [data?.decisions]);

  function resetForm() {
    setTitle("");
    setDescription("");
    setCategory("other");
    setEventDate(new Date().toISOString().slice(0, 10));
    setOwnerEmail("");
    setPrimaryMetricKey("");
    setReviewDate("");
    setStatus("draft");
    setRationale("");
    setExpectedImpact("");
    setMeasuredOutcome("");
    setObservedEffect("");
    setChangeSummary("");
    setReviewWindowDays("14");
    setLinkedReleaseId("");
    setLinkedExperimentId("");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormMsg(null);

    const payload =
      formMode === "changelog"
        ? {
            kind: "changelog" as const,
            title,
            description: description || undefined,
            category,
            eventDate,
            ownerEmail: ownerEmail || undefined,
            primaryMetricKey: primaryMetricKey || undefined,
            expectedImpact: expectedImpact || undefined,
            reviewDate: reviewDate || undefined,
            measuredOutcome: measuredOutcome || undefined,
          }
        : {
            kind: "decision" as const,
            entryType: formMode,
            title,
            ownerEmail: ownerEmail || undefined,
            primaryMetricKey: primaryMetricKey || undefined,
            status,
            rationale,
            expectedImpact: expectedImpact || undefined,
            observedEffect: observedEffect || undefined,
            changeSummary: changeSummary || undefined,
            reviewWindowDays: reviewWindowDays ? parseInt(reviewWindowDays, 10) : undefined,
            linkedReleaseId: linkedReleaseId ? parseInt(linkedReleaseId, 10) : undefined,
            linkedExperimentId: linkedExperimentId ? parseInt(linkedExperimentId, 10) : undefined,
          };

    try {
      const res = await fetch("/api/admin/changelog", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body as { error?: string } | null)?.error || "Failed to save.");
      }
      setFormMsg({
        type: "success",
        text:
          formMode === "changelog"
            ? "Release entry added."
            : formMode === "scoring-change"
              ? "Scoring governance entry added."
              : "Decision journal entry added.",
      });
      resetForm();
      refetch();
    } catch (err) {
      setFormMsg({ type: "error", text: err instanceof Error ? err.message : "Unknown error." });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDecisionUpdate(id: number) {
    const draft = decisionDrafts[id];
    if (!draft) return;

    setUpdatingId(id);
    setFormMsg(null);
    try {
      const res = await fetch("/api/admin/changelog", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({
          id,
          status: draft.status,
          observedEffect: draft.observedEffect || null,
          reviewWindowDays: draft.reviewWindowDays ? parseInt(draft.reviewWindowDays, 10) : null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body as { error?: string } | null)?.error || "Failed to update.");
      }
      setFormMsg({ type: "success", text: `Updated decision #${id}.` });
      refetch();
    } catch (err) {
      setFormMsg({ type: "error", text: err instanceof Error ? err.message : "Unknown error." });
    } finally {
      setUpdatingId(null);
    }
  }

  async function queueDecisionReview(entry: DecisionEntry) {
    setUpdatingId(entry.id);
    setFormMsg(null);
    try {
      const res = await fetch("/api/admin/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({
          title: `Review governance entry: ${entry.title}`,
          description: entry.changeSummary || entry.rationale,
          resource_type: "decision-entry",
          resource_id: entry.id,
          linked_metric_key: entry.primaryMetricKey || null,
          impact_level: entry.entryType === "scoring-change" ? "high" : "medium",
          reviewer_email: entry.ownerEmail || null,
          source_href: "/admin/changelog",
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body as { error?: string } | null)?.error || "Failed to queue review.");
      }
      setFormMsg({ type: "success", text: `Queued review for entry #${entry.id}.` });
    } catch (err) {
      setFormMsg({ type: "error", text: err instanceof Error ? err.message : "Unknown error." });
    } finally {
      setUpdatingId(null);
    }
  }

  async function queueReleaseReview(entry: ChangelogEntry) {
    setUpdatingId(entry.id);
    setFormMsg(null);
    try {
      const res = await fetch("/api/admin/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({
          title: `Review release entry: ${entry.title}`,
          description: entry.description || entry.expectedImpact || null,
          resource_type: "release-entry",
          resource_id: entry.id,
          linked_metric_key: entry.primaryMetricKey || null,
          impact_level: entry.primaryMetricKey ? "high" : "medium",
          reviewer_email: entry.ownerEmail || null,
          source_href: "/admin/changelog",
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body as { error?: string } | null)?.error || "Failed to queue review.");
      }
      setFormMsg({ type: "success", text: `Queued review for release #${entry.id}.` });
    } catch (err) {
      setFormMsg({ type: "error", text: err instanceof Error ? err.message : "Unknown error." });
    } finally {
      setUpdatingId(null);
    }
  }

  const timeline = useMemo<TimelineItem[]>(() => {
    if (!data) return [];
    return [
      ...data.changelog.map((entry) => ({
        ...entry,
        type: "changelog" as const,
        date: entry.eventDate,
        badge: entry.category,
      })),
      ...data.annotations.map((entry) => ({
        ...entry,
        type: "annotation" as const,
        date: entry.annotationDate,
        title: entry.note,
        description: null,
        category: "annotation",
        badge: "annotation",
      })),
      ...data.decisions.map((entry) => ({
        ...entry,
        type: "decision" as const,
        date: entry.updatedAt.slice(0, 10),
        category: entry.entryType,
        badge: `${entry.entryType} | ${entry.status}`,
      })),
    ].sort((left, right) => right.date.localeCompare(left.date));
  }, [data]);

  const filteredTimeline = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return timeline.filter((item) => {
      const matchesFilter =
        timelineFilter === "all"
          ? true
          : item.type === "decision"
            ? item.entryType === timelineFilter || item.status === timelineFilter
            : item.category === timelineFilter;

      const haystack =
        item.type === "decision"
          ? [
              item.title,
              item.rationale,
              item.primaryMetricKey,
              item.expectedImpact,
              item.observedEffect,
              item.changeSummary,
              item.entryType,
              item.status,
            ]
          : [
              item.title,
              item.description,
              item.badge,
              item.type === "changelog" ? item.primaryMetricKey : "",
              item.type === "changelog" ? item.expectedImpact : "",
              item.type === "changelog" ? item.measuredOutcome : "",
              item.type === "annotation" ? item.chartKey : "",
            ];

      const matchesSearch =
        needle.length === 0
          ? true
          : haystack.filter(Boolean).some((value) => value?.toLowerCase().includes(needle));
      return matchesFilter && matchesSearch;
    });
  }, [search, timeline, timelineFilter]);

  const decisionEntries = useMemo(() => data?.decisions ?? [], [data]);
  const governanceEntries = useMemo(
    () => decisionEntries.filter((entry) => entry.entryType === "scoring-change"),
    [decisionEntries]
  );

  const filteredDecisions = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return decisionEntries.filter((entry) => {
      const matchesFilter =
        decisionFilter === "all"
          ? true
          : entry.entryType === decisionFilter || entry.status === decisionFilter;
      const matchesSearch =
        needle.length === 0
          ? true
          : [
              entry.title,
              entry.rationale,
              entry.primaryMetricKey,
              entry.expectedImpact,
              entry.observedEffect,
              entry.changeSummary,
              entry.status,
              entry.entryType,
            ]
              .filter(Boolean)
              .some((value) => value?.toLowerCase().includes(needle));
      return matchesFilter && matchesSearch;
    });
  }, [decisionEntries, decisionFilter, search]);

  const recentDecisionCount = decisionEntries.filter((entry) => {
    const updatedAt = new Date(entry.updatedAt);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    return updatedAt >= cutoff;
  }).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm text-red-400">
        {error || "Failed to load changelog."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-1 rounded-lg border border-white/10 bg-surface p-1">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
              activeTab === tab
                ? "bg-white/10 text-text-primary"
                : "text-text-muted hover:bg-white/5 hover:text-text-primary"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {formMsg && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            formMsg.type === "success"
              ? "border-green-500/20 bg-green-500/5 text-green-400"
              : "border-red-500/20 bg-red-500/5 text-red-400"
          }`}
        >
          {formMsg.text}
        </div>
      )}

      {activeTab === "Timeline" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryCard label="Total Entries" value={data.totalEntries} />
            <SummaryCard label="Product Changes" value={data.summary.changelogCount} />
            <SummaryCard label="Chart Notes" value={data.summary.annotationCount} />
            <SummaryCard label="Decision Entries" value={data.summary.decisionCount} />
            <SummaryCard label="Scoring Changes" value={data.summary.scoringGovernanceCount} />
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search releases, decisions, or notes"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary placeholder-text-muted/50 focus:border-accent-purple focus:outline-none"
            />
            <select
              value={timelineFilter}
              onChange={(event) => setTimelineFilter(event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary focus:border-accent-purple focus:outline-none"
            >
              <option value="all">All timeline items</option>
              <option value="annotation">Annotations</option>
              {CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
              <option value="decision">decision</option>
              <option value="scoring-change">scoring-change</option>
              <option value="memo">memo</option>
              {DECISION_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-0">
            {filteredTimeline.length === 0 && (
              <p className="py-12 text-center text-sm text-text-muted">
                No timeline items match the current filters.
              </p>
            )}
            {filteredTimeline.map((item) => (
              <div
                key={`${item.type}-${item.id}`}
                className="grid gap-3 border-l-2 border-white/10 pb-6 pl-4 lg:grid-cols-[110px_minmax(0,1fr)]"
              >
                <div className="text-xs text-text-muted">{item.date}</div>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        categoryColors[item.category] || categoryColors.other
                      }`}
                    >
                      {item.badge}
                    </span>
                    <span className="font-medium text-text-primary">{item.title}</span>
                  </div>

                  {"description" in item && item.description && (
                    <p className="text-sm text-text-muted">{item.description}</p>
                  )}

                  {item.type === "annotation" && (
                    <p className="text-xs text-cyan-300">Chart: {item.chartKey}</p>
                  )}

                  {item.type === "changelog" && (
                    <div className="grid gap-2 lg:grid-cols-3">
                      <MiniMetric label="Metric" value={item.primaryMetricKey ?? "Not linked"} />
                      <MiniMetric
                        label="Expected Impact"
                        value={item.expectedImpact ?? "Not set"}
                      />
                      <MiniMetric
                        label="Measured Outcome"
                        value={item.measuredOutcome ?? "Monitoring"}
                      />
                    </div>
                  )}
                  {item.type === "changelog" && (
                    <div>
                      <button
                        onClick={() => void queueReleaseReview(item)}
                        disabled={updatingId === item.id}
                        className="rounded-lg border border-white/10 px-3 py-2 text-xs text-text-muted transition hover:bg-white/5 hover:text-text-primary disabled:opacity-50"
                      >
                        Queue review
                      </button>
                    </div>
                  )}

                  {item.type === "changelog" && (
                    <AdminCommentsThread
                      resourceType="release-entry"
                      resourceId={item.id}
                      title="Release Discussion"
                    />
                  )}

                  {item.type === "decision" && (
                    <div className="grid gap-2 lg:grid-cols-4">
                      <MiniMetric label="Metric" value={item.primaryMetricKey ?? "Not linked"} />
                      <MiniMetric label="Rationale" value={item.rationale} />
                      <MiniMetric
                        label="Expected Impact"
                        value={item.expectedImpact ?? "Not set"}
                      />
                      <MiniMetric
                        label="Observed Effect"
                        value={item.observedEffect ?? "Monitoring"}
                      />
                    </div>
                  )}

                  <p className="text-xs text-text-muted/60">
                    Added by {item.adminEmail}
                    {item.type === "changelog" && item.ownerEmail
                      ? ` | owner ${item.ownerEmail}`
                      : ""}
                    {item.type === "decision" && item.ownerEmail
                      ? ` | owner ${item.ownerEmail}`
                      : ""}
                    {item.type === "changelog" && item.reviewDate
                      ? ` | review ${item.reviewDate}`
                      : ""}
                  </p>

                  {item.type === "annotation" && (
                    <AdminCommentsThread
                      resourceType="chart-annotation"
                      resourceId={item.id}
                      title="Annotation Discussion"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "Release Impact" && <ReleaseImpactCenterTab />}

      {activeTab === "Decision Journal" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Decision Entries" value={data.summary.decisionCount} />
            <SummaryCard
              label="Monitoring"
              value={decisionEntries.filter((item) => item.status === "monitoring").length}
            />
            <SummaryCard
              label="Validated"
              value={decisionEntries.filter((item) => item.status === "validated").length}
            />
            <SummaryCard label="Last 30 Days" value={recentDecisionCount} />
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search decisions, rationale, or expected impact"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary placeholder-text-muted/50 focus:border-accent-purple focus:outline-none"
            />
            <select
              value={decisionFilter}
              onChange={(event) => setDecisionFilter(event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary focus:border-accent-purple focus:outline-none"
            >
              <option value="all">All decisions</option>
              <option value="decision">Decision</option>
              <option value="memo">Memo</option>
              <option value="scoring-change">Scoring Change</option>
              {DECISION_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4">
            {filteredDecisions.length === 0 && (
              <p className="rounded-xl border border-white/10 bg-surface p-6 text-sm text-text-muted">
                No decision entries match the current filters.
              </p>
            )}
            {filteredDecisions.map((entry) => {
              const draft = decisionDrafts[entry.id] ?? {
                status: entry.status,
                observedEffect: entry.observedEffect ?? "",
                reviewWindowDays: entry.reviewWindowDays ? String(entry.reviewWindowDays) : "",
              };

              return (
                <div key={entry.id} className="rounded-2xl border border-white/10 bg-surface p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            categoryColors[entry.entryType] || categoryColors.other
                          }`}
                        >
                          {entry.entryType}
                        </span>
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-text-muted">
                          {entry.status}
                        </span>
                        {entry.primaryMetricKey && (
                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-text-muted">
                            {entry.primaryMetricKey}
                          </span>
                        )}
                      </div>
                      <h3 className="mt-2 font-serif text-lg font-semibold text-text-primary">
                        {entry.title}
                      </h3>
                      <p className="mt-2 max-w-3xl text-sm text-text-muted">{entry.rationale}</p>
                    </div>
                    <div className="text-right text-xs text-text-muted">
                      <p>Updated {new Date(entry.updatedAt).toLocaleDateString()}</p>
                      {entry.ownerEmail && <p className="mt-1">Owner {entry.ownerEmail}</p>}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-4">
                    <MiniMetric label="Metric" value={entry.primaryMetricKey ?? "Not linked"} />
                    <MiniMetric
                      label="Expected Impact"
                      value={entry.expectedImpact ?? "Not recorded"}
                    />
                    <MiniMetric
                      label="Observed Effect"
                      value={entry.observedEffect ?? "Still monitoring"}
                    />
                    <MiniMetric
                      label="Change Summary"
                      value={entry.changeSummary ?? "No structured change summary"}
                    />
                  </div>

                  {(entry.linkedReleaseId ||
                    entry.linkedExperimentId ||
                    entry.reviewWindowDays) && (
                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-text-muted">
                      {entry.linkedReleaseId && (
                        <span className="rounded-full bg-white/5 px-2 py-1">
                          Release #{entry.linkedReleaseId}
                        </span>
                      )}
                      {entry.linkedExperimentId && (
                        <span className="rounded-full bg-white/5 px-2 py-1">
                          Experiment #{entry.linkedExperimentId}
                        </span>
                      )}
                      {entry.reviewWindowDays && (
                        <span className="rounded-full bg-white/5 px-2 py-1">
                          Review window {entry.reviewWindowDays} days
                        </span>
                      )}
                    </div>
                  )}

                  {entry.evidenceLinks.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {entry.evidenceLinks.map((link) => (
                        <a
                          key={`${entry.id}-${link.href}`}
                          href={link.href}
                          className="rounded-full border border-white/10 px-3 py-1 text-xs text-text-muted transition hover:border-white/20 hover:text-text-primary"
                        >
                          {link.label}
                        </a>
                      ))}
                    </div>
                  )}

                  <div className="mt-5 grid gap-3 border-t border-white/10 pt-4 lg:grid-cols-[180px_minmax(0,1fr)_160px_auto]">
                    <select
                      value={draft.status}
                      onChange={(event) =>
                        setDecisionDrafts((current) => ({
                          ...current,
                          [entry.id]: { ...draft, status: event.target.value },
                        }))
                      }
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-accent-purple focus:outline-none"
                    >
                      {DECISION_STATUSES.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                    <textarea
                      value={draft.observedEffect}
                      onChange={(event) =>
                        setDecisionDrafts((current) => ({
                          ...current,
                          [entry.id]: { ...draft, observedEffect: event.target.value },
                        }))
                      }
                      rows={2}
                      placeholder="Observed effect or monitoring note"
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary placeholder-text-muted/50 focus:border-accent-purple focus:outline-none"
                    />
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={draft.reviewWindowDays}
                      onChange={(event) =>
                        setDecisionDrafts((current) => ({
                          ...current,
                          [entry.id]: { ...draft, reviewWindowDays: event.target.value },
                        }))
                      }
                      placeholder="Review days"
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary placeholder-text-muted/50 focus:border-accent-purple focus:outline-none"
                    />
                    <button
                      onClick={() => handleDecisionUpdate(entry.id)}
                      disabled={updatingId === entry.id}
                      className="rounded-lg bg-accent-purple px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-purple/80 disabled:opacity-50"
                    >
                      {updatingId === entry.id ? "Saving..." : "Save"}
                    </button>
                  </div>

                  <AdminCommentsThread
                    resourceType="decision-entry"
                    resourceId={entry.id}
                    title="Decision Discussion"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === "Governance" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Scoring Changes" value={data.summary.scoringGovernanceCount} />
            <SummaryCard
              label="Drafts"
              value={governanceEntries.filter((entry) => entry.status === "draft").length}
            />
            <SummaryCard
              label="Monitoring"
              value={governanceEntries.filter((entry) => entry.status === "monitoring").length}
            />
            <SummaryCard
              label="Rolled Back"
              value={governanceEntries.filter((entry) => entry.status === "rolled-back").length}
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-surface p-5">
            <h3 className="font-serif text-lg font-semibold text-text-primary">
              Scoring Governance Workflow
            </h3>
            <p className="mt-2 max-w-3xl text-sm text-text-muted">
              Use this lane for scoring-rule promotions, post-release validation, and rollback
              notes. Entries move from draft to approved, then monitoring, and finally validated or
              rolled back once the review window closes.
            </p>
          </div>

          <div className="grid gap-4">
            {governanceEntries.length === 0 && (
              <p className="rounded-xl border border-white/10 bg-surface p-6 text-sm text-text-muted">
                No scoring governance entries have been recorded yet.
              </p>
            )}
            {governanceEntries.map((entry) => (
              <div key={entry.id} className="rounded-2xl border border-white/10 bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-orange-500/20 px-2 py-0.5 text-xs text-orange-300">
                        {entry.status}
                      </span>
                      {entry.primaryMetricKey && (
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-text-muted">
                          {entry.primaryMetricKey}
                        </span>
                      )}
                      <span className="text-xs text-text-muted">
                        Review window {entry.reviewWindowDays ?? "not set"} days
                      </span>
                    </div>
                    <h3 className="mt-2 font-serif text-lg font-semibold text-text-primary">
                      {entry.title}
                    </h3>
                  </div>
                  <button
                    onClick={() => setActiveTab("Decision Journal")}
                    className="rounded-lg border border-white/10 px-3 py-2 text-xs text-text-muted transition hover:bg-white/5 hover:text-text-primary"
                  >
                    Open in journal
                  </button>
                  <button
                    onClick={() => void queueDecisionReview(entry)}
                    disabled={updatingId === entry.id}
                    className="rounded-lg border border-white/10 px-3 py-2 text-xs text-text-muted transition hover:bg-white/5 hover:text-text-primary disabled:opacity-50"
                  >
                    Queue review
                  </button>
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-4">
                  <MiniMetric label="Metric" value={entry.primaryMetricKey ?? "Not linked"} />
                  <MiniMetric label="Rationale" value={entry.rationale} />
                  <MiniMetric
                    label="Change Summary"
                    value={entry.changeSummary ?? "Not recorded"}
                  />
                  <MiniMetric
                    label="Observed Effect"
                    value={entry.observedEffect ?? "Monitoring"}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "Add Entry" && (
        <form onSubmit={handleSubmit} className="mx-auto max-w-4xl space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Object.entries(FORM_MODE_LABELS).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFormMode(value as FormMode)}
                className={`rounded-xl border px-4 py-3 text-left transition ${
                  formMode === value
                    ? "border-accent-purple bg-accent-purple/10 text-text-primary"
                    : "border-white/10 bg-surface text-text-muted hover:border-white/20 hover:text-text-primary"
                }`}
              >
                <p className="text-sm font-medium">{label}</p>
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-white/10 bg-surface p-5">
            <div className="grid gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-text-muted">
                  Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                  maxLength={200}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary placeholder-text-muted/50 focus:border-accent-purple focus:outline-none"
                  placeholder={
                    formMode === "changelog"
                      ? "e.g. Updated onboarding copy"
                      : "e.g. Promote scoring calibration v5.3"
                  }
                />
              </div>
              {formMode === "changelog" ? (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase text-text-muted">
                      Description
                    </label>
                    <textarea
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      maxLength={2000}
                      rows={3}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary placeholder-text-muted/50 focus:border-accent-purple focus:outline-none"
                      placeholder="Describe what changed and why."
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase text-text-muted">
                        Category
                      </label>
                      <select
                        value={category}
                        onChange={(event) => setCategory(event.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary focus:border-accent-purple focus:outline-none"
                      >
                        {CATEGORIES.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase text-text-muted">
                        Event Date
                      </label>
                      <input
                        type="date"
                        value={eventDate}
                        onChange={(event) => setEventDate(event.target.value)}
                        required
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary focus:border-accent-purple focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase text-text-muted">
                        Owner Email
                      </label>
                      <input
                        type="email"
                        value={ownerEmail}
                        onChange={(event) => setOwnerEmail(event.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary placeholder-text-muted/50 focus:border-accent-purple focus:outline-none"
                        placeholder="owner@loveiq.com"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase text-text-muted">
                        Review Date
                      </label>
                      <input
                        type="date"
                        value={reviewDate}
                        onChange={(event) => setReviewDate(event.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary focus:border-accent-purple focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase text-text-muted">
                        Primary Metric
                      </label>
                      <select
                        value={primaryMetricKey}
                        onChange={(event) => setPrimaryMetricKey(event.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary focus:border-accent-purple focus:outline-none"
                      >
                        <option value="">No metric link</option>
                        {data.metrics.map((metric) => (
                          <option key={metric.key} value={metric.key}>
                            {metric.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase text-text-muted">
                        Expected Impact
                      </label>
                      <textarea
                        value={expectedImpact}
                        onChange={(event) => setExpectedImpact(event.target.value)}
                        rows={3}
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary placeholder-text-muted/50 focus:border-accent-purple focus:outline-none"
                        placeholder="What KPI movement do you expect from this release?"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase text-text-muted">
                      Measured Outcome
                    </label>
                    <textarea
                      value={measuredOutcome}
                      onChange={(event) => setMeasuredOutcome(event.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary placeholder-text-muted/50 focus:border-accent-purple focus:outline-none"
                      placeholder="Observed KPI movement or monitoring note."
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase text-text-muted">
                        Owner Email
                      </label>
                      <input
                        type="email"
                        value={ownerEmail}
                        onChange={(event) => setOwnerEmail(event.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary placeholder-text-muted/50 focus:border-accent-purple focus:outline-none"
                        placeholder="owner@loveiq.com"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase text-text-muted">
                        Primary Metric
                      </label>
                      <select
                        value={primaryMetricKey}
                        onChange={(event) => setPrimaryMetricKey(event.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary focus:border-accent-purple focus:outline-none"
                      >
                        <option value="">No metric link</option>
                        {data.metrics.map((metric) => (
                          <option key={metric.key} value={metric.key}>
                            {metric.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase text-text-muted">
                        Status
                      </label>
                      <select
                        value={status}
                        onChange={(event) =>
                          setStatus(event.target.value as (typeof DECISION_STATUSES)[number])
                        }
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary focus:border-accent-purple focus:outline-none"
                      >
                        {DECISION_STATUSES.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase text-text-muted">
                      Rationale
                    </label>
                    <textarea
                      value={rationale}
                      onChange={(event) => setRationale(event.target.value)}
                      required
                      rows={4}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary placeholder-text-muted/50 focus:border-accent-purple focus:outline-none"
                      placeholder="Why was this decision or scoring release made?"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase text-text-muted">
                        Expected Impact
                      </label>
                      <textarea
                        value={expectedImpact}
                        onChange={(event) => setExpectedImpact(event.target.value)}
                        rows={3}
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary placeholder-text-muted/50 focus:border-accent-purple focus:outline-none"
                        placeholder="What KPI movement do you expect?"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase text-text-muted">
                        Change Summary
                      </label>
                      <textarea
                        value={changeSummary}
                        onChange={(event) => setChangeSummary(event.target.value)}
                        rows={3}
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary placeholder-text-muted/50 focus:border-accent-purple focus:outline-none"
                        placeholder="What actually changed in the product, scoring, or ops layer?"
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase text-text-muted">
                        Review Window Days
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={reviewWindowDays}
                        onChange={(event) => setReviewWindowDays(event.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary focus:border-accent-purple focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase text-text-muted">
                        Linked Release ID
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={linkedReleaseId}
                        onChange={(event) => setLinkedReleaseId(event.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary focus:border-accent-purple focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase text-text-muted">
                        Linked Experiment ID
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={linkedExperimentId}
                        onChange={(event) => setLinkedExperimentId(event.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary focus:border-accent-purple focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase text-text-muted">
                        Observed Effect
                      </label>
                      <input
                        type="text"
                        value={observedEffect}
                        onChange={(event) => setObservedEffect(event.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary placeholder-text-muted/50 focus:border-accent-purple focus:outline-none"
                        placeholder="Optional launch note"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={
              submitting || !title.trim() || (formMode !== "changelog" && !rationale.trim())
            }
            className="w-full rounded-lg bg-accent-purple px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-purple/80 disabled:opacity-50"
          >
            {submitting ? "Saving..." : `Add ${FORM_MODE_LABELS[formMode]}`}
          </button>
        </form>
      )}
    </div>
  );
}
