"use client";

import { useState } from "react";
import AdminCommentsThread from "@/components/admin/AdminCommentsThread";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import { getCsrfToken } from "@/lib/csrf-client";
import type {
  AdminAlertComparator,
  AdminAlertRule,
  AdminAlertTargetType,
  AdminOsTone,
} from "@/lib/admin/os-types";

interface AlertTargetsResponse {
  rules: AdminAlertRule[];
  targets: Array<{
    type: AdminAlertTargetType;
    key: string;
    label: string;
    href: string;
  }>;
}

const COMPARATORS: AdminAlertComparator[] = ["gte", "lte", "eq"];
const SEVERITIES: Array<Exclude<AdminOsTone, "good">> = ["watch", "risk"];

export default function AlertPoliciesTab() {
  const [draft, setDraft] = useState({
    label: "",
    owner_email: "",
    target_type: "guardrail" as AdminAlertTargetType,
    target_key: "",
    comparator: "lte" as AdminAlertComparator,
    threshold_numeric: "0",
    severity: "watch" as Exclude<AdminOsTone, "good">,
  });
  const [message, setMessage] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const { data, loading, error, refetch } =
    useAdminFetch<AlertTargetsResponse>("/api/admin/alerts");

  async function createRule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingId(-1);
    setMessage(null);
    const linkedTargetHref =
      (data?.targets ?? []).find(
        (item) => item.key === draft.target_key && item.type === draft.target_type
      )?.href ?? null;

    const res = await fetch("/api/admin/alerts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": getCsrfToken(),
      },
      body: JSON.stringify({
        ...draft,
        owner_email: draft.owner_email || null,
        threshold_numeric: Number(draft.threshold_numeric),
        linked_href: linkedTargetHref,
      }),
    });

    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      setMessage(body?.error || "Unable to create alert policy.");
      setSavingId(null);
      return;
    }

    setDraft({
      label: "",
      owner_email: "",
      target_type: "guardrail",
      target_key: "",
      comparator: "lte",
      threshold_numeric: "0",
      severity: "watch",
    });
    setSavingId(null);
    setMessage("Alert policy created.");
    refetch();
  }

  async function toggleActive(rule: AdminAlertRule) {
    setSavingId(rule.id);
    setMessage(null);
    const res = await fetch(`/api/admin/alerts/${rule.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": getCsrfToken(),
      },
      body: JSON.stringify({ is_active: !rule.isActive }),
    });
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      setMessage(body?.error || "Unable to update alert policy.");
      setSavingId(null);
      return;
    }
    setSavingId(null);
    refetch();
  }

  async function queueReview(rule: AdminAlertRule) {
    setSavingId(rule.id);
    setMessage(null);
    const res = await fetch("/api/admin/reviews", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": getCsrfToken(),
      },
      body: JSON.stringify({
        title: `Review alert policy: ${rule.label}`,
        description: `${rule.targetType} ${rule.targetKey} ${rule.comparator} ${rule.thresholdNumeric}`,
        resource_type: "alert-policy",
        resource_id: rule.id,
        impact_level: rule.severity === "risk" ? "high" : "medium",
        reviewer_email: rule.ownerEmail || null,
        source_href: rule.linkedHref || "/admin/tools",
      }),
    });
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      setMessage(body?.error || "Unable to queue review request.");
      setSavingId(null);
      return;
    }
    setSavingId(null);
    setMessage(`Queued review for alert policy #${rule.id}.`);
  }

  const targets = (data?.targets ?? []).filter((item) => item.type === draft.target_type);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm text-red-400">
        {error || "Failed to load alert policies."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <form onSubmit={createRule} className="rounded-xl border border-white/10 bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-text-primary">Create alert policy</h3>
          <span className="text-xs uppercase tracking-wide text-text-muted">internal workflow</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <input
            value={draft.label}
            onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))}
            placeholder="Policy label"
            className="rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none"
            required
          />
          <input
            value={draft.owner_email}
            onChange={(event) =>
              setDraft((current) => ({ ...current, owner_email: event.target.value }))
            }
            placeholder="Owner email"
            className="rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none"
          />
          <select
            value={draft.target_type}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                target_type: event.target.value as AdminAlertTargetType,
                target_key: "",
              }))
            }
            className="rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none"
          >
            <option value="guardrail">guardrail</option>
            <option value="service">service</option>
            <option value="trust">trust</option>
            <option value="action">action</option>
            <option value="decision">decision</option>
          </select>
          <select
            value={draft.target_key}
            onChange={(event) =>
              setDraft((current) => ({ ...current, target_key: event.target.value }))
            }
            className="rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none"
            required
          >
            <option value="">Select target</option>
            {targets.map((target) => (
              <option key={target.key} value={target.key}>
                {target.label}
              </option>
            ))}
          </select>
          <select
            value={draft.comparator}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                comparator: event.target.value as AdminAlertComparator,
              }))
            }
            className="rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none"
          >
            {COMPARATORS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <input
            type="number"
            value={draft.threshold_numeric}
            onChange={(event) =>
              setDraft((current) => ({ ...current, threshold_numeric: event.target.value }))
            }
            placeholder="Threshold"
            className="rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none"
            required
          />
          <select
            value={draft.severity}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                severity: event.target.value as Exclude<AdminOsTone, "good">,
              }))
            }
            className="rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none"
          >
            {SEVERITIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-text-muted">
            Rules drive the anomaly center and give ownership to operational thresholds.
          </p>
          <button
            disabled={savingId === -1}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-text-primary transition hover:bg-white/5 disabled:opacity-60"
          >
            Create policy
          </button>
        </div>
        {message && <p className="mt-3 text-sm text-text-muted">{message}</p>}
      </form>

      <div className="space-y-3">
        {data.rules.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 p-6 text-sm text-text-muted">
            No alert policies created yet.
          </p>
        ) : (
          data.rules.map((rule) => (
            <div key={rule.id} className="rounded-xl border border-white/10 bg-surface p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="font-medium text-text-primary">{rule.label}</p>
                  <p className="mt-1 text-sm text-text-muted">
                    {rule.targetType} · {rule.targetKey} · {rule.comparator} {rule.thresholdNumeric}
                    {rule.ownerEmail ? ` · ${rule.ownerEmail}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                      rule.severity === "risk"
                        ? "bg-red-500/10 text-red-300"
                        : "bg-amber-500/10 text-amber-200"
                    }`}
                  >
                    {rule.severity}
                  </span>
                  <button
                    onClick={() => void queueReview(rule)}
                    disabled={savingId === rule.id}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-text-muted transition hover:bg-white/5 hover:text-text-primary disabled:opacity-60"
                  >
                    Queue review
                  </button>
                  <button
                    onClick={() => void toggleActive(rule)}
                    disabled={savingId === rule.id}
                    className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                      rule.isActive
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                        : "border-white/10 text-text-muted hover:bg-white/5 hover:text-text-primary"
                    } disabled:opacity-60`}
                  >
                    {rule.isActive ? "Active" : "Inactive"}
                  </button>
                </div>
              </div>

              <AdminCommentsThread
                resourceType="alert-policy"
                resourceId={rule.id}
                title="Policy Discussion"
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
