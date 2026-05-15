"use client";

import { startTransition, useState } from "react";
import AdminCommentsThread from "@features/admin/ui/AdminCommentsThread";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import StatCard from "@features/admin/ui/StatCard";
import type { AdminReviewResourceType } from "@features/admin/server/reviews";
import { getCsrfToken } from "@/lib/csrf-client";
import type {
  BetConfidence,
  BetStatus,
  CompetitiveMoveType,
  DependencyStrength,
  ImpactLevel,
  InitiativePriority,
  InitiativeStatus,
  StrategyPlanningSnapshot,
} from "@features/admin/server/strategy-planning";
import {
  betTone,
  confidenceTone,
  dependencyTone,
  impactTone,
  initiativeTone,
  inputClassName,
  priorityTone,
} from "@features/admin/ui/StrategyPlanningTab/styles";
import {
  emptyBetForm,
  emptyCompetitiveWatchForm,
  emptyDependencyForm,
  emptyInitiativeForm,
} from "@features/admin/ui/StrategyPlanningTab/forms";
import {
  Badge,
  EmptyState,
  FormField,
  MetricCard,
  NarrativeCard,
} from "@features/admin/ui/StrategyPlanningTab/subcomponents";

// Tone tables, form factories, and small subcomponents live under
// ./StrategyPlanningTab/. This file owns the main tab component.

type ComposerType = "initiative" | "bet" | "competitive-watch" | "metric-dependency" | null;

export default function StrategyPlanningTab() {
  const { data, loading, error, refetch } = useAdminFetch<StrategyPlanningSnapshot>(
    "/api/admin/strategy-planning"
  );
  const [composer, setComposer] = useState<ComposerType>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [initiativeEditId, setInitiativeEditId] = useState<number | null>(null);
  const [betEditId, setBetEditId] = useState<number | null>(null);
  const [competitiveEditId, setCompetitiveEditId] = useState<number | null>(null);
  const [dependencyEditId, setDependencyEditId] = useState<number | null>(null);

  const [initiativeForm, setInitiativeForm] = useState(emptyInitiativeForm);
  const [betForm, setBetForm] = useState(emptyBetForm);
  const [competitiveForm, setCompetitiveForm] = useState(emptyCompetitiveWatchForm);
  const [dependencyForm, setDependencyForm] = useState(emptyDependencyForm);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center text-sm text-red-400">
        {error || "Failed to load strategy planning."}
      </div>
    );
  }

  async function send(payload: Record<string, unknown>) {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/strategy-planning", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error((body as { error?: string } | null)?.error || "Request failed.");
      }

      setMessage({ type: "success", text: "Saved strategy planning record." });
      refetch();
      return true;
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Unknown error." });
      return false;
    } finally {
      setSaving(false);
    }
  }

  function resetComposer() {
    setComposer(null);
    setInitiativeEditId(null);
    setBetEditId(null);
    setCompetitiveEditId(null);
    setDependencyEditId(null);
    setInitiativeForm(emptyInitiativeForm());
    setBetForm(emptyBetForm());
    setCompetitiveForm(emptyCompetitiveWatchForm());
    setDependencyForm(emptyDependencyForm());
  }

  async function queueReview({
    title,
    description,
    resourceType,
    resourceId,
    linkedMetricKey,
    impactLevel,
    reviewerEmail,
    sourceHref,
    dueDate,
    successText,
  }: {
    title: string;
    description: string | null;
    resourceType: AdminReviewResourceType;
    resourceId: number;
    linkedMetricKey?: string | null;
    impactLevel: ImpactLevel;
    reviewerEmail?: string | null;
    sourceHref?: string | null;
    dueDate?: string | null;
    successText: string;
  }) {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({
          title,
          description,
          resource_type: resourceType,
          resource_id: resourceId,
          linked_metric_key: linkedMetricKey ?? null,
          impact_level: impactLevel,
          reviewer_email: reviewerEmail ?? null,
          source_href: sourceHref ?? null,
          due_date: dueDate ?? null,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error((body as { error?: string } | null)?.error || "Failed to queue review.");
      }

      setMessage({ type: "success", text: successText });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Unknown error." });
    } finally {
      setSaving(false);
    }
  }

  async function submitInitiative() {
    if (!initiativeForm.title.trim()) return;
    const success = await send({
      action: initiativeEditId ? "update" : "create",
      resourceType: "initiative",
      ...(initiativeEditId ? { id: initiativeEditId } : {}),
      title: initiativeForm.title.trim(),
      description: initiativeForm.description.trim() || null,
      status: initiativeForm.status,
      priority: initiativeForm.priority,
      owner_email: initiativeForm.owner_email.trim() || null,
      goal_id: initiativeForm.goal_id ? Number(initiativeForm.goal_id) : null,
      primary_metric_key: initiativeForm.primary_metric_key || null,
      secondary_metric_keys: initiativeForm.secondary_metric_keys,
      expected_impact: initiativeForm.expected_impact.trim() || null,
      review_date: initiativeForm.review_date || null,
      linked_href: initiativeForm.linked_href.trim() || null,
    });
    if (success) resetComposer();
  }

  async function submitBet() {
    if (!betForm.title.trim() || !betForm.hypothesis.trim()) return;
    const success = await send({
      action: betEditId ? "update" : "create",
      resourceType: "bet",
      ...(betEditId ? { id: betEditId } : {}),
      title: betForm.title.trim(),
      hypothesis: betForm.hypothesis.trim(),
      status: betForm.status,
      confidence: betForm.confidence,
      upside_note: betForm.upside_note.trim() || null,
      downside_note: betForm.downside_note.trim() || null,
      primary_metric_key: betForm.primary_metric_key || null,
      review_date: betForm.review_date || null,
      owner_email: betForm.owner_email.trim() || null,
      decision_note: betForm.decision_note.trim() || null,
    });
    if (success) resetComposer();
  }

  async function submitCompetitiveWatch() {
    if (
      !competitiveForm.competitor_name.trim() ||
      !competitiveForm.title.trim() ||
      !competitiveForm.detail.trim()
    ) {
      return;
    }
    const success = await send({
      action: competitiveEditId ? "update" : "create",
      resourceType: "competitive-watch",
      ...(competitiveEditId ? { id: competitiveEditId } : {}),
      competitor_name: competitiveForm.competitor_name.trim(),
      move_type: competitiveForm.move_type,
      title: competitiveForm.title.trim(),
      detail: competitiveForm.detail.trim(),
      impact_level: competitiveForm.impact_level,
      primary_metric_key: competitiveForm.primary_metric_key || null,
      recommended_response: competitiveForm.recommended_response.trim() || null,
      source_href: competitiveForm.source_href.trim() || null,
      observed_at: competitiveForm.observed_at || undefined,
    });
    if (success) resetComposer();
  }

  async function submitDependency() {
    if (!dependencyForm.parent_metric_key || !dependencyForm.child_metric_key) return;
    const success = await send({
      action: dependencyEditId ? "update" : "create",
      resourceType: "metric-dependency",
      ...(dependencyEditId ? { id: dependencyEditId } : {}),
      parent_metric_key: dependencyForm.parent_metric_key,
      child_metric_key: dependencyForm.child_metric_key,
      relationship_strength: dependencyForm.relationship_strength,
      hypothesis_note: dependencyForm.hypothesis_note.trim() || null,
      evidence_note: dependencyForm.evidence_note.trim() || null,
    });
    if (success) resetComposer();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-serif text-xl font-semibold text-text-primary">Strategy Planning</h3>
          <p className="mt-1 max-w-4xl text-sm text-text-muted">
            Connect goals, initiatives, strategic bets, market signals, and metric dependencies in
            one operating layer.
          </p>
        </div>
        <p className="text-xs text-text-muted">
          Updated {new Date(data.generatedAt).toLocaleString()}
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
        <StatCard label="Initiatives" value={data.summary.initiatives} />
        <StatCard label="Active Initiatives" value={data.summary.activeInitiatives} />
        <StatCard label="Review Due" value={data.summary.reviewDue} />
        <StatCard label="Active Bets" value={data.summary.activeBets} />
        <StatCard label="High-Impact Moves" value={data.summary.highImpactMoves} />
        <StatCard label="Dependencies" value={data.summary.dependencyLinks} />
      </div>

      <section className="rounded-xl border border-white/10 bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-text-primary">Goal-to-Initiative Mapping</h4>
            <p className="mt-1 text-sm text-text-muted">
              Track which initiatives are supposed to move which goals and metrics.
            </p>
          </div>
          <button
            onClick={() => {
              startTransition(() => {
                setComposer(composer === "initiative" ? null : "initiative");
                setInitiativeEditId(null);
                setInitiativeForm(emptyInitiativeForm());
                setMessage(null);
              });
            }}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/10"
          >
            {composer === "initiative" ? "Cancel" : "New Initiative"}
          </button>
        </div>

        {composer === "initiative" && (
          <div className="mt-4 grid gap-4 rounded-xl border border-white/10 bg-page p-4 lg:grid-cols-2">
            <FormField label="Title">
              <input
                value={initiativeForm.title}
                onChange={(event) =>
                  setInitiativeForm((current) => ({ ...current, title: event.target.value }))
                }
                className={inputClassName}
                placeholder="Reduce survey start friction"
              />
            </FormField>
            <FormField label="Owner Email">
              <input
                type="email"
                value={initiativeForm.owner_email}
                onChange={(event) =>
                  setInitiativeForm((current) => ({ ...current, owner_email: event.target.value }))
                }
                className={inputClassName}
                placeholder="owner@loveiq.com"
              />
            </FormField>
            <FormField label="Status">
              <select
                value={initiativeForm.status}
                onChange={(event) =>
                  setInitiativeForm((current) => ({
                    ...current,
                    status: event.target.value as InitiativeStatus,
                  }))
                }
                className={inputClassName}
              >
                {(["planned", "active", "watch", "blocked", "completed"] as InitiativeStatus[]).map(
                  (status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  )
                )}
              </select>
            </FormField>
            <FormField label="Priority">
              <select
                value={initiativeForm.priority}
                onChange={(event) =>
                  setInitiativeForm((current) => ({
                    ...current,
                    priority: event.target.value as InitiativePriority,
                  }))
                }
                className={inputClassName}
              >
                {(["low", "medium", "high"] as InitiativePriority[]).map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Goal">
              <select
                value={initiativeForm.goal_id}
                onChange={(event) =>
                  setInitiativeForm((current) => ({ ...current, goal_id: event.target.value }))
                }
                className={inputClassName}
              >
                <option value="">No linked goal</option>
                {data.goals.map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    {goal.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Primary Metric">
              <select
                value={initiativeForm.primary_metric_key}
                onChange={(event) =>
                  setInitiativeForm((current) => ({
                    ...current,
                    primary_metric_key: event.target.value,
                  }))
                }
                className={inputClassName}
              >
                <option value="">No primary metric</option>
                {data.metrics.map((metric) => (
                  <option key={metric.key} value={metric.key}>
                    {metric.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Secondary Metrics" className="lg:col-span-2">
              <select
                multiple
                value={initiativeForm.secondary_metric_keys}
                onChange={(event) =>
                  setInitiativeForm((current) => ({
                    ...current,
                    secondary_metric_keys: Array.from(event.target.selectedOptions).map(
                      (option) => option.value
                    ),
                  }))
                }
                className={`${inputClassName} min-h-28`}
              >
                {data.metrics.map((metric) => (
                  <option key={metric.key} value={metric.key}>
                    {metric.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Description" className="lg:col-span-2">
              <textarea
                value={initiativeForm.description}
                onChange={(event) =>
                  setInitiativeForm((current) => ({ ...current, description: event.target.value }))
                }
                className={`${inputClassName} min-h-24`}
                placeholder="What is changing and why now?"
              />
            </FormField>
            <FormField label="Expected Impact" className="lg:col-span-2">
              <textarea
                value={initiativeForm.expected_impact}
                onChange={(event) =>
                  setInitiativeForm((current) => ({
                    ...current,
                    expected_impact: event.target.value,
                  }))
                }
                className={`${inputClassName} min-h-24`}
                placeholder="Expected KPI movement and business effect."
              />
            </FormField>
            <FormField label="Review Date">
              <input
                type="date"
                value={initiativeForm.review_date}
                onChange={(event) =>
                  setInitiativeForm((current) => ({ ...current, review_date: event.target.value }))
                }
                className={inputClassName}
              />
            </FormField>
            <FormField label="Linked Href">
              <input
                value={initiativeForm.linked_href}
                onChange={(event) =>
                  setInitiativeForm((current) => ({ ...current, linked_href: event.target.value }))
                }
                className={inputClassName}
                placeholder="/admin/report-builder"
              />
            </FormField>
            <div className="lg:col-span-2 flex justify-end gap-3">
              <button
                onClick={resetComposer}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                onClick={submitInitiative}
                disabled={saving || !initiativeForm.title.trim()}
                className="rounded-lg bg-accent-purple px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-purple/80 disabled:opacity-40"
              >
                {saving ? "Saving..." : initiativeEditId ? "Save Initiative" : "Create Initiative"}
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {data.initiatives.length === 0 && (
            <EmptyState text="No initiatives have been tracked yet." />
          )}
          {data.initiatives.map((initiative) => (
            <div key={initiative.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={initiativeTone[initiative.status]}>{initiative.status}</Badge>
                    <Badge className={priorityTone[initiative.priority]}>
                      {initiative.priority}
                    </Badge>
                    {initiative.goalLabel && (
                      <Badge className="bg-white/10 text-text-muted">{initiative.goalLabel}</Badge>
                    )}
                  </div>
                  <p className="mt-2 text-base font-semibold text-text-primary">
                    {initiative.title}
                  </p>
                </div>
                <p className="text-xs text-text-muted">
                  {new Date(initiative.updatedAt).toLocaleDateString()}
                </p>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  onClick={() =>
                    void queueReview({
                      title: `Review initiative: ${initiative.title}`,
                      description: initiative.description ?? initiative.expectedImpact ?? null,
                      resourceType: "strategy-initiative",
                      resourceId: initiative.id,
                      linkedMetricKey: initiative.primaryMetricKey,
                      impactLevel: initiative.priority === "high" ? "high" : "medium",
                      reviewerEmail: initiative.ownerEmail,
                      sourceHref: initiative.linkedHref ?? "/admin/strategy",
                      dueDate: initiative.reviewDate,
                      successText: `Queued review for initiative #${initiative.id}.`,
                    })
                  }
                  disabled={saving}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary transition hover:bg-white/10 disabled:opacity-40"
                >
                  Queue review
                </button>
                <button
                  onClick={() => {
                    setComposer("initiative");
                    setInitiativeEditId(initiative.id);
                    setInitiativeForm({
                      title: initiative.title,
                      description: initiative.description ?? "",
                      status: initiative.status,
                      priority: initiative.priority,
                      owner_email: initiative.ownerEmail ?? "",
                      goal_id: initiative.goalId ? String(initiative.goalId) : "",
                      primary_metric_key: initiative.primaryMetricKey ?? "",
                      secondary_metric_keys: initiative.secondaryMetricKeys,
                      expected_impact: initiative.expectedImpact ?? "",
                      review_date: initiative.reviewDate ?? "",
                      linked_href: initiative.linkedHref ?? "",
                    });
                    setMessage(null);
                  }}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary transition hover:bg-white/10"
                >
                  Edit
                </button>
              </div>
              <p className="mt-3 text-sm text-text-muted">
                {initiative.description || "No initiative description logged."}
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Owner" value={initiative.ownerEmail || "Unassigned"} />
                <MetricCard
                  label="Primary Metric"
                  value={initiative.primaryMetricLabel || "Not linked"}
                />
                <MetricCard label="Review Date" value={initiative.reviewDate || "Not set"} />
                <MetricCard label="Goal Metric" value={initiative.goalMetricKey || "Not linked"} />
              </div>
              {(initiative.expectedImpact ||
                initiative.secondaryMetricKeys.length > 0 ||
                initiative.linkedHref) && (
                <div className="mt-4 grid gap-3 lg:grid-cols-3">
                  {initiative.expectedImpact && (
                    <NarrativeCard label="Expected Impact" value={initiative.expectedImpact} />
                  )}
                  {initiative.secondaryMetricKeys.length > 0 && (
                    <NarrativeCard
                      label="Secondary Metrics"
                      value={initiative.secondaryMetricKeys.join(", ")}
                    />
                  )}
                  {initiative.linkedHref && (
                    <a
                      href={initiative.linkedHref}
                      className="rounded-lg border border-white/10 bg-surface px-3 py-3 text-sm text-text-primary transition hover:border-white/20 hover:bg-white/5"
                    >
                      Open linked surface
                    </a>
                  )}
                </div>
              )}
              <AdminCommentsThread
                resourceType="strategy-initiative"
                resourceId={initiative.id}
                title="Initiative Discussion"
              />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-text-primary">Strategic Bets Tracker</h4>
            <p className="mt-1 text-sm text-text-muted">
              Track the strategic hypotheses leadership is actively taking or monitoring.
            </p>
          </div>
          <button
            onClick={() => {
              startTransition(() => {
                setComposer(composer === "bet" ? null : "bet");
                setBetEditId(null);
                setBetForm(emptyBetForm());
                setMessage(null);
              });
            }}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/10"
          >
            {composer === "bet" ? "Cancel" : "New Bet"}
          </button>
        </div>

        {composer === "bet" && (
          <div className="mt-4 grid gap-4 rounded-xl border border-white/10 bg-page p-4 lg:grid-cols-2">
            <FormField label="Title">
              <input
                value={betForm.title}
                onChange={(event) =>
                  setBetForm((current) => ({ ...current, title: event.target.value }))
                }
                className={inputClassName}
                placeholder="Lean onboarding will improve starts"
              />
            </FormField>
            <FormField label="Owner Email">
              <input
                type="email"
                value={betForm.owner_email}
                onChange={(event) =>
                  setBetForm((current) => ({ ...current, owner_email: event.target.value }))
                }
                className={inputClassName}
                placeholder="owner@loveiq.com"
              />
            </FormField>
            <FormField label="Status">
              <select
                value={betForm.status}
                onChange={(event) =>
                  setBetForm((current) => ({ ...current, status: event.target.value as BetStatus }))
                }
                className={inputClassName}
              >
                {(["proposed", "active", "validated", "invalidated", "parked"] as BetStatus[]).map(
                  (status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  )
                )}
              </select>
            </FormField>
            <FormField label="Confidence">
              <select
                value={betForm.confidence}
                onChange={(event) =>
                  setBetForm((current) => ({
                    ...current,
                    confidence: event.target.value as BetConfidence,
                  }))
                }
                className={inputClassName}
              >
                {(["low", "medium", "high"] as BetConfidence[]).map((confidence) => (
                  <option key={confidence} value={confidence}>
                    {confidence}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Primary Metric">
              <select
                value={betForm.primary_metric_key}
                onChange={(event) =>
                  setBetForm((current) => ({
                    ...current,
                    primary_metric_key: event.target.value,
                  }))
                }
                className={inputClassName}
              >
                <option value="">No primary metric</option>
                {data.metrics.map((metric) => (
                  <option key={metric.key} value={metric.key}>
                    {metric.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Review Date">
              <input
                type="date"
                value={betForm.review_date}
                onChange={(event) =>
                  setBetForm((current) => ({ ...current, review_date: event.target.value }))
                }
                className={inputClassName}
              />
            </FormField>
            <FormField label="Hypothesis" className="lg:col-span-2">
              <textarea
                value={betForm.hypothesis}
                onChange={(event) =>
                  setBetForm((current) => ({ ...current, hypothesis: event.target.value }))
                }
                className={`${inputClassName} min-h-24`}
                placeholder="If we shift the intro experience, more high-intent users will complete."
              />
            </FormField>
            <FormField label="Upside" className="lg:col-span-2">
              <textarea
                value={betForm.upside_note}
                onChange={(event) =>
                  setBetForm((current) => ({ ...current, upside_note: event.target.value }))
                }
                className={`${inputClassName} min-h-20`}
                placeholder="What happens if this bet is right?"
              />
            </FormField>
            <FormField label="Downside" className="lg:col-span-2">
              <textarea
                value={betForm.downside_note}
                onChange={(event) =>
                  setBetForm((current) => ({ ...current, downside_note: event.target.value }))
                }
                className={`${inputClassName} min-h-20`}
                placeholder="What happens if this bet is wrong?"
              />
            </FormField>
            <FormField label="Decision Note" className="lg:col-span-2">
              <textarea
                value={betForm.decision_note}
                onChange={(event) =>
                  setBetForm((current) => ({ ...current, decision_note: event.target.value }))
                }
                className={`${inputClassName} min-h-20`}
                placeholder="How leadership should interpret this bet after review."
              />
            </FormField>
            <div className="lg:col-span-2 flex justify-end gap-3">
              <button
                onClick={resetComposer}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                onClick={submitBet}
                disabled={saving || !betForm.title.trim() || !betForm.hypothesis.trim()}
                className="rounded-lg bg-accent-purple px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-purple/80 disabled:opacity-40"
              >
                {saving ? "Saving..." : betEditId ? "Save Bet" : "Create Bet"}
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {data.bets.length === 0 && <EmptyState text="No strategic bets have been tracked yet." />}
          {data.bets.map((bet) => (
            <div key={bet.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={betTone[bet.status]}>{bet.status}</Badge>
                    <Badge className={confidenceTone[bet.confidence]}>{bet.confidence}</Badge>
                    {bet.primaryMetricLabel && (
                      <Badge className="bg-white/10 text-text-muted">
                        {bet.primaryMetricLabel}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-2 text-base font-semibold text-text-primary">{bet.title}</p>
                </div>
                <p className="text-xs text-text-muted">
                  {new Date(bet.updatedAt).toLocaleDateString()}
                </p>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  onClick={() =>
                    void queueReview({
                      title: `Review strategic bet: ${bet.title}`,
                      description: bet.hypothesis,
                      resourceType: "strategy-bet",
                      resourceId: bet.id,
                      linkedMetricKey: bet.primaryMetricKey,
                      impactLevel:
                        bet.status === "active" && bet.confidence === "high" ? "high" : "medium",
                      reviewerEmail: bet.ownerEmail,
                      sourceHref: "/admin/strategy",
                      dueDate: bet.reviewDate,
                      successText: `Queued review for bet #${bet.id}.`,
                    })
                  }
                  disabled={saving}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary transition hover:bg-white/10 disabled:opacity-40"
                >
                  Queue review
                </button>
                <button
                  onClick={() => {
                    setComposer("bet");
                    setBetEditId(bet.id);
                    setBetForm({
                      title: bet.title,
                      hypothesis: bet.hypothesis,
                      status: bet.status,
                      confidence: bet.confidence,
                      upside_note: bet.upsideNote ?? "",
                      downside_note: bet.downsideNote ?? "",
                      primary_metric_key: bet.primaryMetricKey ?? "",
                      review_date: bet.reviewDate ?? "",
                      owner_email: bet.ownerEmail ?? "",
                      decision_note: bet.decisionNote ?? "",
                    });
                    setMessage(null);
                  }}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary transition hover:bg-white/10"
                >
                  Edit
                </button>
              </div>
              <p className="mt-3 text-sm text-text-muted">{bet.hypothesis}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Owner" value={bet.ownerEmail || "Unassigned"} />
                <MetricCard label="Review Date" value={bet.reviewDate || "Not set"} />
                <MetricCard label="Metric" value={bet.primaryMetricLabel || "Not linked"} />
                <MetricCard label="Status" value={bet.status} />
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                {bet.upsideNote && <NarrativeCard label="Upside" value={bet.upsideNote} />}
                {bet.downsideNote && <NarrativeCard label="Downside" value={bet.downsideNote} />}
                {bet.decisionNote && (
                  <NarrativeCard label="Decision Note" value={bet.decisionNote} />
                )}
              </div>
              <AdminCommentsThread
                resourceType="strategy-bet"
                resourceId={bet.id}
                title="Bet Discussion"
              />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-text-primary">Competitive Watch</h4>
            <p className="mt-1 text-sm text-text-muted">
              Log competitor and market moves that might change goals, positioning, or roadmap.
            </p>
          </div>
          <button
            onClick={() => {
              startTransition(() => {
                setComposer(composer === "competitive-watch" ? null : "competitive-watch");
                setCompetitiveEditId(null);
                setCompetitiveForm(emptyCompetitiveWatchForm());
                setMessage(null);
              });
            }}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/10"
          >
            {composer === "competitive-watch" ? "Cancel" : "New Signal"}
          </button>
        </div>

        {composer === "competitive-watch" && (
          <div className="mt-4 grid gap-4 rounded-xl border border-white/10 bg-page p-4 lg:grid-cols-2">
            <FormField label="Competitor">
              <input
                value={competitiveForm.competitor_name}
                onChange={(event) =>
                  setCompetitiveForm((current) => ({
                    ...current,
                    competitor_name: event.target.value,
                  }))
                }
                className={inputClassName}
                placeholder="Typeform"
              />
            </FormField>
            <FormField label="Move Type">
              <select
                value={competitiveForm.move_type}
                onChange={(event) =>
                  setCompetitiveForm((current) => ({
                    ...current,
                    move_type: event.target.value as CompetitiveMoveType,
                  }))
                }
                className={inputClassName}
              >
                {(
                  [
                    "feature",
                    "pricing",
                    "positioning",
                    "distribution",
                    "partnership",
                    "brand",
                    "other",
                  ] as CompetitiveMoveType[]
                ).map((moveType) => (
                  <option key={moveType} value={moveType}>
                    {moveType}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Title">
              <input
                value={competitiveForm.title}
                onChange={(event) =>
                  setCompetitiveForm((current) => ({ ...current, title: event.target.value }))
                }
                className={inputClassName}
                placeholder="Competitor launched analytics bundle"
              />
            </FormField>
            <FormField label="Impact Level">
              <select
                value={competitiveForm.impact_level}
                onChange={(event) =>
                  setCompetitiveForm((current) => ({
                    ...current,
                    impact_level: event.target.value as ImpactLevel,
                  }))
                }
                className={inputClassName}
              >
                {(["low", "medium", "high", "critical"] as ImpactLevel[]).map((impact) => (
                  <option key={impact} value={impact}>
                    {impact}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Primary Metric">
              <select
                value={competitiveForm.primary_metric_key}
                onChange={(event) =>
                  setCompetitiveForm((current) => ({
                    ...current,
                    primary_metric_key: event.target.value,
                  }))
                }
                className={inputClassName}
              >
                <option value="">No linked metric</option>
                {data.metrics.map((metric) => (
                  <option key={metric.key} value={metric.key}>
                    {metric.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Observed At">
              <input
                type="date"
                value={competitiveForm.observed_at}
                onChange={(event) =>
                  setCompetitiveForm((current) => ({ ...current, observed_at: event.target.value }))
                }
                className={inputClassName}
              />
            </FormField>
            <FormField label="Detail" className="lg:col-span-2">
              <textarea
                value={competitiveForm.detail}
                onChange={(event) =>
                  setCompetitiveForm((current) => ({ ...current, detail: event.target.value }))
                }
                className={`${inputClassName} min-h-24`}
                placeholder="What changed in the market?"
              />
            </FormField>
            <FormField label="Recommended Response" className="lg:col-span-2">
              <textarea
                value={competitiveForm.recommended_response}
                onChange={(event) =>
                  setCompetitiveForm((current) => ({
                    ...current,
                    recommended_response: event.target.value,
                  }))
                }
                className={`${inputClassName} min-h-20`}
                placeholder="How should leadership respond?"
              />
            </FormField>
            <FormField label="Source Href" className="lg:col-span-2">
              <input
                value={competitiveForm.source_href}
                onChange={(event) =>
                  setCompetitiveForm((current) => ({ ...current, source_href: event.target.value }))
                }
                className={inputClassName}
                placeholder="https://example.com/release-note"
              />
            </FormField>
            <div className="lg:col-span-2 flex justify-end gap-3">
              <button
                onClick={resetComposer}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                onClick={submitCompetitiveWatch}
                disabled={
                  saving ||
                  !competitiveForm.competitor_name.trim() ||
                  !competitiveForm.title.trim() ||
                  !competitiveForm.detail.trim()
                }
                className="rounded-lg bg-accent-purple px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-purple/80 disabled:opacity-40"
              >
                {saving ? "Saving..." : competitiveEditId ? "Save Signal" : "Create Signal"}
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {data.competitiveWatch.length === 0 && (
            <EmptyState text="No competitive signals have been logged yet." />
          )}
          {data.competitiveWatch.map((item) => (
            <div key={item.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={impactTone[item.impactLevel]}>{item.impactLevel}</Badge>
                    <Badge className="bg-white/10 text-text-muted">{item.moveType}</Badge>
                    <Badge className="bg-white/10 text-text-muted">{item.competitorName}</Badge>
                  </div>
                  <p className="mt-2 text-base font-semibold text-text-primary">{item.title}</p>
                </div>
                <p className="text-xs text-text-muted">
                  {new Date(item.observedAt).toLocaleDateString()}
                </p>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  onClick={() =>
                    void queueReview({
                      title: `Review market signal: ${item.title}`,
                      description: item.detail,
                      resourceType: "competitive-watch",
                      resourceId: item.id,
                      linkedMetricKey: item.primaryMetricKey,
                      impactLevel: item.impactLevel,
                      sourceHref: item.sourceHref ?? "/admin/strategy",
                      successText: `Queued review for signal #${item.id}.`,
                    })
                  }
                  disabled={saving}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary transition hover:bg-white/10 disabled:opacity-40"
                >
                  Queue review
                </button>
                <button
                  onClick={() => {
                    setComposer("competitive-watch");
                    setCompetitiveEditId(item.id);
                    setCompetitiveForm({
                      competitor_name: item.competitorName,
                      move_type: item.moveType,
                      title: item.title,
                      detail: item.detail,
                      impact_level: item.impactLevel,
                      primary_metric_key: item.primaryMetricKey ?? "",
                      recommended_response: item.recommendedResponse ?? "",
                      source_href: item.sourceHref ?? "",
                      observed_at: item.observedAt,
                    });
                    setMessage(null);
                  }}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary transition hover:bg-white/10"
                >
                  Edit
                </button>
              </div>
              <p className="mt-3 text-sm text-text-muted">{item.detail}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Metric" value={item.primaryMetricLabel || "Not linked"} />
                <MetricCard
                  label="Observed"
                  value={new Date(item.observedAt).toLocaleDateString()}
                />
                <MetricCard label="Updated" value={new Date(item.updatedAt).toLocaleDateString()} />
                <MetricCard label="Source" value={item.sourceHref ? "Linked" : "None"} />
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {item.recommendedResponse && (
                  <NarrativeCard label="Recommended Response" value={item.recommendedResponse} />
                )}
                {item.sourceHref && (
                  <a
                    href={item.sourceHref}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-white/10 bg-surface px-3 py-3 text-sm text-text-primary transition hover:border-white/20 hover:bg-white/5"
                  >
                    Open source link
                  </a>
                )}
              </div>
              <AdminCommentsThread
                resourceType="competitive-watch"
                resourceId={item.id}
                title="Signal Discussion"
              />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-text-primary">Cross-Metric Dependency Map</h4>
            <p className="mt-1 text-sm text-text-muted">
              Capture which canonical metrics are believed to drive other metrics and why.
            </p>
          </div>
          <button
            onClick={() => {
              startTransition(() => {
                setComposer(composer === "metric-dependency" ? null : "metric-dependency");
                setDependencyEditId(null);
                setDependencyForm(emptyDependencyForm());
                setMessage(null);
              });
            }}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/10"
          >
            {composer === "metric-dependency" ? "Cancel" : "New Dependency"}
          </button>
        </div>

        {composer === "metric-dependency" && (
          <div className="mt-4 grid gap-4 rounded-xl border border-white/10 bg-page p-4 lg:grid-cols-2">
            <FormField label="Parent Metric">
              <select
                value={dependencyForm.parent_metric_key}
                onChange={(event) =>
                  setDependencyForm((current) => ({
                    ...current,
                    parent_metric_key: event.target.value,
                  }))
                }
                className={inputClassName}
              >
                <option value="">Select metric</option>
                {data.metrics.map((metric) => (
                  <option key={metric.key} value={metric.key}>
                    {metric.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Child Metric">
              <select
                value={dependencyForm.child_metric_key}
                onChange={(event) =>
                  setDependencyForm((current) => ({
                    ...current,
                    child_metric_key: event.target.value,
                  }))
                }
                className={inputClassName}
              >
                <option value="">Select metric</option>
                {data.metrics.map((metric) => (
                  <option key={metric.key} value={metric.key}>
                    {metric.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Strength">
              <select
                value={dependencyForm.relationship_strength}
                onChange={(event) =>
                  setDependencyForm((current) => ({
                    ...current,
                    relationship_strength: event.target.value as DependencyStrength,
                  }))
                }
                className={inputClassName}
              >
                {(["weak", "medium", "strong"] as DependencyStrength[]).map((strength) => (
                  <option key={strength} value={strength}>
                    {strength}
                  </option>
                ))}
              </select>
            </FormField>
            <div />
            <FormField label="Hypothesis Note" className="lg:col-span-2">
              <textarea
                value={dependencyForm.hypothesis_note}
                onChange={(event) =>
                  setDependencyForm((current) => ({
                    ...current,
                    hypothesis_note: event.target.value,
                  }))
                }
                className={`${inputClassName} min-h-20`}
                placeholder="Why should the parent metric move the child metric?"
              />
            </FormField>
            <FormField label="Evidence Note" className="lg:col-span-2">
              <textarea
                value={dependencyForm.evidence_note}
                onChange={(event) =>
                  setDependencyForm((current) => ({
                    ...current,
                    evidence_note: event.target.value,
                  }))
                }
                className={`${inputClassName} min-h-20`}
                placeholder="What evidence supports this relationship?"
              />
            </FormField>
            <div className="lg:col-span-2 flex justify-end gap-3">
              <button
                onClick={resetComposer}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                onClick={submitDependency}
                disabled={
                  saving || !dependencyForm.parent_metric_key || !dependencyForm.child_metric_key
                }
                className="rounded-lg bg-accent-purple px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-purple/80 disabled:opacity-40"
              >
                {saving ? "Saving..." : dependencyEditId ? "Save Dependency" : "Create Dependency"}
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 space-y-3">
          {data.dependencies.length === 0 && (
            <EmptyState text="No metric dependencies have been logged yet." />
          )}
          {data.dependencies.map((dependency) => (
            <div
              key={dependency.id}
              className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-white/20"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={dependencyTone[dependency.relationshipStrength]}>
                      {dependency.relationshipStrength}
                    </Badge>
                    <span className="text-sm font-semibold text-text-primary">
                      {dependency.parentMetricLabel} {"->"} {dependency.childMetricLabel}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-text-muted">
                    {dependency.hypothesisNote || "No hypothesis note logged."}
                  </p>
                </div>
                <p className="text-xs text-text-muted">
                  {new Date(dependency.updatedAt).toLocaleDateString()}
                </p>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  onClick={() =>
                    void queueReview({
                      title: `Review dependency: ${dependency.parentMetricLabel} -> ${dependency.childMetricLabel}`,
                      description: dependency.hypothesisNote ?? dependency.evidenceNote ?? null,
                      resourceType: "metric-dependency",
                      resourceId: dependency.id,
                      linkedMetricKey: dependency.childMetricKey,
                      impactLevel:
                        dependency.relationshipStrength === "strong"
                          ? "high"
                          : dependency.relationshipStrength === "medium"
                            ? "medium"
                            : "low",
                      sourceHref: "/admin/strategy",
                      successText: `Queued review for dependency #${dependency.id}.`,
                    })
                  }
                  disabled={saving}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary transition hover:bg-white/10 disabled:opacity-40"
                >
                  Queue review
                </button>
                <button
                  onClick={() => {
                    setComposer("metric-dependency");
                    setDependencyEditId(dependency.id);
                    setDependencyForm({
                      parent_metric_key: dependency.parentMetricKey,
                      child_metric_key: dependency.childMetricKey,
                      relationship_strength: dependency.relationshipStrength,
                      hypothesis_note: dependency.hypothesisNote ?? "",
                      evidence_note: dependency.evidenceNote ?? "",
                    });
                    setMessage(null);
                  }}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary transition hover:bg-white/10"
                >
                  Edit
                </button>
              </div>
              {dependency.evidenceNote && (
                <div className="mt-3 rounded-lg border border-white/10 bg-surface px-3 py-3 text-sm text-text-muted">
                  {dependency.evidenceNote}
                </div>
              )}
              <AdminCommentsThread
                resourceType="metric-dependency"
                resourceId={dependency.id}
                title="Dependency Discussion"
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
