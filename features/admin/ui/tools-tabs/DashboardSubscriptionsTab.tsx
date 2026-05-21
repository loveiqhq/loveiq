"use client";

import { useMemo, useState } from "react";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import { getCsrfToken } from "@shared/http/csrf-client";

type AudienceRole = "leadership" | "strategy" | "product" | "growth" | "tech" | "ops" | "research";
type Cadence = "daily" | "weekly" | "monthly";

interface DashboardOption {
  key: string;
  label: string;
  href: string;
  audience: AudienceRole;
}

interface DashboardSubscription {
  id: number;
  admin_email: string;
  dashboard_key: string;
  dashboard_label: string;
  audience_role: AudienceRole;
  cadence: Cadence;
  subscriber_emails: string[] | null;
  linked_metric_key: string | null;
  note: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface DashboardSubscriptionsResponse {
  subscriptions: DashboardSubscription[];
  dashboards: DashboardOption[];
  admins: Array<{ email: string; role: string }>;
  summary: {
    active: number;
    dashboardsCovered: number;
    audiences: number;
  };
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-surface p-4">
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-2 font-serif text-2xl font-semibold text-text-primary">{value}</p>
    </div>
  );
}

export default function DashboardSubscriptionsTab() {
  const { data, loading, error, refetch } = useAdminFetch<DashboardSubscriptionsResponse>(
    "/api/admin/dashboard-subscriptions"
  );
  const [message, setMessage] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [draft, setDraft] = useState({
    dashboard_key: "command-center",
    audience_role: "leadership" as AudienceRole,
    cadence: "weekly" as Cadence,
    linked_metric_key: "",
    subscriber_emails: "",
    note: "",
  });
  const [edits, setEdits] = useState<
    Record<
      number,
      {
        dashboard_key: string;
        audience_role: AudienceRole;
        cadence: Cadence;
        linked_metric_key: string;
        subscriber_emails: string;
        note: string;
        is_active: boolean;
      }
    >
  >({});

  const adminHint = useMemo(
    () => (data?.admins ?? []).map((entry) => entry.email).join(", "),
    [data?.admins]
  );

  async function createSubscription(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingId(-1);
    setMessage(null);

    const res = await fetch("/api/admin/dashboard-subscriptions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": getCsrfToken(),
      },
      body: JSON.stringify({
        ...draft,
        linked_metric_key: draft.linked_metric_key || null,
        note: draft.note || null,
        subscriber_emails: draft.subscriber_emails
          .split(",")
          .map((entry) => entry.trim().toLowerCase())
          .filter(Boolean),
      }),
    });

    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      setMessage(body?.error || "Unable to create dashboard subscription.");
      setSavingId(null);
      return;
    }

    setDraft({
      dashboard_key: "command-center",
      audience_role: "leadership",
      cadence: "weekly",
      linked_metric_key: "",
      subscriber_emails: "",
      note: "",
    });
    setSavingId(null);
    setMessage("Dashboard subscription created.");
    refetch();
  }

  async function saveSubscription(subscription: DashboardSubscription) {
    const edit = edits[subscription.id] ?? {
      dashboard_key: subscription.dashboard_key,
      audience_role: subscription.audience_role,
      cadence: subscription.cadence,
      linked_metric_key: subscription.linked_metric_key ?? "",
      subscriber_emails: (subscription.subscriber_emails ?? []).join(", "),
      note: subscription.note ?? "",
      is_active: subscription.is_active,
    };

    setSavingId(subscription.id);
    setMessage(null);

    const res = await fetch(`/api/admin/dashboard-subscriptions/${subscription.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": getCsrfToken(),
      },
      body: JSON.stringify({
        dashboard_key: edit.dashboard_key,
        audience_role: edit.audience_role,
        cadence: edit.cadence,
        linked_metric_key: edit.linked_metric_key || null,
        note: edit.note || null,
        is_active: edit.is_active,
        subscriber_emails: edit.subscriber_emails
          .split(",")
          .map((entry) => entry.trim().toLowerCase())
          .filter(Boolean),
      }),
    });

    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      setMessage(body?.error || "Unable to update dashboard subscription.");
      setSavingId(null);
      return;
    }

    setSavingId(null);
    setMessage(`Updated subscription #${subscription.id}.`);
    refetch();
  }

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
        {error || "Failed to load dashboard subscriptions."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryTile label="Active" value={String(data.summary.active)} />
        <SummaryTile label="Dashboards Covered" value={String(data.summary.dashboardsCovered)} />
        <SummaryTile label="Audiences Covered" value={String(data.summary.audiences)} />
      </div>

      <form
        onSubmit={createSubscription}
        className="rounded-xl border border-white/10 bg-surface p-5"
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-text-primary">Create dashboard subscription</h3>
          <span className="text-xs uppercase tracking-wide text-text-muted">distribution</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <select
            value={draft.dashboard_key}
            onChange={(event) => {
              const dashboard = data.dashboards.find((item) => item.key === event.target.value);
              setDraft((current) => ({
                ...current,
                dashboard_key: event.target.value,
                audience_role: dashboard?.audience ?? current.audience_role,
              }));
            }}
            className="rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none"
          >
            {data.dashboards.map((dashboard) => (
              <option key={dashboard.key} value={dashboard.key}>
                {dashboard.label}
              </option>
            ))}
          </select>
          <select
            value={draft.audience_role}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                audience_role: event.target.value as AudienceRole,
              }))
            }
            className="rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none"
          >
            {["leadership", "strategy", "product", "growth", "tech", "ops", "research"].map(
              (item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              )
            )}
          </select>
          <select
            value={draft.cadence}
            onChange={(event) =>
              setDraft((current) => ({ ...current, cadence: event.target.value as Cadence }))
            }
            className="rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none"
          >
            {["daily", "weekly", "monthly"].map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <input
            value={draft.linked_metric_key}
            onChange={(event) =>
              setDraft((current) => ({ ...current, linked_metric_key: event.target.value }))
            }
            placeholder="Primary metric key (optional)"
            className="rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none"
          />
          <input
            value={draft.subscriber_emails}
            onChange={(event) =>
              setDraft((current) => ({ ...current, subscriber_emails: event.target.value }))
            }
            placeholder="name@company.com, lead@company.com"
            className="rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none md:col-span-2"
            required
          />
          <textarea
            value={draft.note}
            onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
            rows={3}
            placeholder="Why this dashboard needs recurring internal distribution"
            className="rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none md:col-span-2 xl:col-span-3"
          />
        </div>
        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-xs text-text-muted">
            Suggested admin emails: {adminHint || "No admin roster loaded."}
          </p>
          <button
            disabled={savingId === -1}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-text-primary transition hover:bg-white/5 disabled:opacity-60"
          >
            Create subscription
          </button>
        </div>
        {message && <p className="mt-3 text-sm text-text-muted">{message}</p>}
      </form>

      <div className="space-y-3">
        {data.subscriptions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 p-6 text-sm text-text-muted">
            No internal dashboard subscriptions created yet.
          </p>
        ) : (
          data.subscriptions.map((subscription) => {
            const edit = edits[subscription.id] ?? {
              dashboard_key: subscription.dashboard_key,
              audience_role: subscription.audience_role,
              cadence: subscription.cadence,
              linked_metric_key: subscription.linked_metric_key ?? "",
              subscriber_emails: (subscription.subscriber_emails ?? []).join(", "),
              note: subscription.note ?? "",
              is_active: subscription.is_active,
            };

            return (
              <div
                key={subscription.id}
                className="rounded-xl border border-white/10 bg-surface p-5"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                        {subscription.dashboard_label}
                      </span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                        {subscription.audience_role}
                      </span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                        {subscription.cadence}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${
                          edit.is_active
                            ? "bg-emerald-500/10 text-emerald-300"
                            : "bg-white/10 text-text-muted"
                        }`}
                      >
                        {edit.is_active ? "active" : "inactive"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-text-muted">
                      Created by {subscription.admin_email} on{" "}
                      {new Date(subscription.created_at).toLocaleString()}
                    </p>
                  </div>
                  <a
                    href={
                      data.dashboards.find((item) => item.key === edit.dashboard_key)?.href ??
                      "/admin"
                    }
                    className="rounded-lg border border-white/10 px-3 py-2 text-xs text-text-muted transition hover:bg-white/5 hover:text-text-primary"
                  >
                    Open dashboard
                  </a>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <select
                    value={edit.dashboard_key}
                    onChange={(event) =>
                      setEdits((current) => ({
                        ...current,
                        [subscription.id]: { ...edit, dashboard_key: event.target.value },
                      }))
                    }
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary outline-none"
                  >
                    {data.dashboards.map((dashboard) => (
                      <option key={dashboard.key} value={dashboard.key}>
                        {dashboard.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={edit.audience_role}
                    onChange={(event) =>
                      setEdits((current) => ({
                        ...current,
                        [subscription.id]: {
                          ...edit,
                          audience_role: event.target.value as AudienceRole,
                        },
                      }))
                    }
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary outline-none"
                  >
                    {["leadership", "strategy", "product", "growth", "tech", "ops", "research"].map(
                      (item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      )
                    )}
                  </select>
                  <select
                    value={edit.cadence}
                    onChange={(event) =>
                      setEdits((current) => ({
                        ...current,
                        [subscription.id]: { ...edit, cadence: event.target.value as Cadence },
                      }))
                    }
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary outline-none"
                  >
                    {["daily", "weekly", "monthly"].map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  <input
                    value={edit.linked_metric_key}
                    onChange={(event) =>
                      setEdits((current) => ({
                        ...current,
                        [subscription.id]: { ...edit, linked_metric_key: event.target.value },
                      }))
                    }
                    placeholder="Metric key"
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary outline-none"
                  />
                  <input
                    value={edit.subscriber_emails}
                    onChange={(event) =>
                      setEdits((current) => ({
                        ...current,
                        [subscription.id]: { ...edit, subscriber_emails: event.target.value },
                      }))
                    }
                    placeholder="Subscriber emails"
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary outline-none md:col-span-2"
                  />
                  <textarea
                    value={edit.note}
                    onChange={(event) =>
                      setEdits((current) => ({
                        ...current,
                        [subscription.id]: { ...edit, note: event.target.value },
                      }))
                    }
                    rows={2}
                    placeholder="Notes"
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary outline-none md:col-span-2 xl:col-span-3"
                  />
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm text-text-muted">
                    <input
                      type="checkbox"
                      checked={edit.is_active}
                      onChange={(event) =>
                        setEdits((current) => ({
                          ...current,
                          [subscription.id]: { ...edit, is_active: event.target.checked },
                        }))
                      }
                    />
                    Active subscription
                  </label>
                  <button
                    onClick={() => void saveSubscription(subscription)}
                    disabled={savingId === subscription.id}
                    className="rounded-lg bg-accent-purple px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-purple/80 disabled:opacity-50"
                  >
                    {savingId === subscription.id ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
