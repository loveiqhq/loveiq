"use client";

import { useState } from "react";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import { getCsrfToken } from "@/lib/csrf-client";

interface SpendRow {
  id: number;
  date: string;
  channel: string;
  spend_eur: number;
  clicks: number;
  impressions: number;
  unique_visitors: number;
  notes: string | null;
  created_by_email: string | null;
  updated_at: string;
}

interface SpendListResponse {
  rows: SpendRow[];
  totals: {
    spend_eur: number;
    clicks: number;
    impressions: number;
    unique_visitors: number;
  };
}

interface FormState {
  date: string;
  channel: string;
  spend_eur: string;
  clicks: string;
  impressions: string;
  unique_visitors: string;
  notes: string;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const emptyForm = (): FormState => ({
  date: todayIso(),
  channel: "Meta",
  spend_eur: "",
  clicks: "",
  impressions: "",
  unique_visitors: "",
  notes: "",
});

const KNOWN_CHANNELS = [
  "Meta",
  "Google",
  "TikTok",
  "LinkedIn",
  "Reddit",
  "X",
  "Direct",
  "Organic",
  "Influencer",
  "Other",
];

export default function MarketingSpendEditor({ days }: { days: number }) {
  const params = { days: String(days) };
  const { data, loading, error, refetch } = useAdminFetch<SpendListResponse>(
    "/api/admin/analytics/marketing-spend",
    params
  );

  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  const update = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      const payload = {
        date: form.date,
        channel: form.channel.trim(),
        spend_eur: Number(form.spend_eur || 0),
        clicks: Number(form.clicks || 0),
        impressions: Number(form.impressions || 0),
        unique_visitors: Number(form.unique_visitors || 0),
        notes: form.notes.trim() || null,
      };
      const res = await fetch("/api/admin/analytics/marketing-spend", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": getCsrfToken() },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Save failed (${res.status})`);
      }
      setFeedback({ type: "ok", msg: `Saved ${payload.channel} on ${payload.date}` });
      setForm(emptyForm());
      refetch();
    } catch (err) {
      setFeedback({
        type: "err",
        msg: err instanceof Error ? err.message : "Save failed",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: number) {
    if (!window.confirm("Delete this row? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/admin/analytics/marketing-spend?id=${id}`, {
        method: "DELETE",
        headers: { "x-csrf-token": getCsrfToken() },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Delete failed (${res.status})`);
      }
      setFeedback({ type: "ok", msg: "Deleted" });
      refetch();
    } catch (err) {
      setFeedback({
        type: "err",
        msg: err instanceof Error ? err.message : "Delete failed",
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="font-serif text-base font-semibold text-text-primary">
          Add or update a row
        </h3>
        <p className="mt-1 text-xs text-text-muted">
          One row per (date, channel). Re-saving the same combination overwrites in place.
        </p>
        <form
          onSubmit={submit}
          className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-7"
        >
          <Field label="Date">
            <input
              type="date"
              required
              value={form.date}
              onChange={(e) => update("date", e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Channel">
            <input
              list="ms-channels"
              required
              value={form.channel}
              onChange={(e) => update("channel", e.target.value)}
              className={inputCls}
              placeholder="Meta, Google, …"
            />
            <datalist id="ms-channels">
              {KNOWN_CHANNELS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Spend (€)">
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.spend_eur}
              onChange={(e) => update("spend_eur", e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Clicks">
            <input
              type="number"
              min={0}
              step="1"
              value={form.clicks}
              onChange={(e) => update("clicks", e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Impressions">
            <input
              type="number"
              min={0}
              step="1"
              value={form.impressions}
              onChange={(e) => update("impressions", e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Visitors">
            <input
              type="number"
              min={0}
              step="1"
              value={form.unique_visitors}
              onChange={(e) => update("unique_visitors", e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Notes (optional)">
            <input
              type="text"
              maxLength={500}
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              className={inputCls}
            />
          </Field>
          <div className="sm:col-span-3 lg:col-span-7 flex items-center justify-between gap-3">
            {feedback && (
              <p
                className={`text-xs ${
                  feedback.type === "ok" ? "text-emerald-400" : "text-red-400"
                }`}
                role="status"
              >
                {feedback.msg}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="ml-auto rounded-lg bg-accent-purple px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-purple/90 disabled:opacity-50"
            >
              {submitting ? "Saving…" : "Save row"}
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-xl border border-white/10 bg-surface">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <h3 className="font-serif text-base font-semibold text-text-primary">
            Marketing spend rows ({days === 0 ? "all time" : `last ${days}d`})
          </h3>
          {data && (
            <p className="text-xs text-text-muted">
              Total: €
              {data.totals.spend_eur.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
              {" · "}
              {data.totals.clicks.toLocaleString("en-US")} clicks
              {" · "}
              {data.totals.unique_visitors.toLocaleString("en-US")} visitors
            </p>
          )}
        </div>
        {loading && <p className="px-5 py-4 text-sm text-text-muted">Loading…</p>}
        {error && (
          <p className="px-5 py-4 text-sm text-red-400" role="alert">
            {error}
          </p>
        )}
        {!loading && !error && data && data.rows.length === 0 && (
          <p className="px-5 py-6 text-center text-sm text-text-muted">
            No rows yet — add one above and the marketing KPIs above will populate.
          </p>
        )}
        {!loading && !error && data && data.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/5 text-xs uppercase tracking-wider text-text-muted">
                <tr>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Channel</th>
                  <th className="px-4 py-2 text-right">Spend</th>
                  <th className="px-4 py-2 text-right">Clicks</th>
                  <th className="px-4 py-2 text-right">Impressions</th>
                  <th className="px-4 py-2 text-right">Visitors</th>
                  <th className="px-4 py-2">Notes</th>
                  <th className="px-4 py-2 text-right" />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-white/5 text-text-primary hover:bg-white/[0.02]"
                  >
                    <td className="px-4 py-2 font-mono text-xs">{r.date}</td>
                    <td className="px-4 py-2">{r.channel}</td>
                    <td className="px-4 py-2 text-right">
                      €
                      {r.spend_eur.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-4 py-2 text-right">{r.clicks.toLocaleString("en-US")}</td>
                    <td className="px-4 py-2 text-right">
                      {r.impressions.toLocaleString("en-US")}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {r.unique_visitors.toLocaleString("en-US")}
                    </td>
                    <td className="px-4 py-2 text-xs text-text-muted">{r.notes || "—"}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => remove(r.id)}
                        className="rounded border border-red-500/20 px-2 py-1 text-xs text-red-400 transition hover:border-red-500/40 hover:bg-red-500/10"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-white/10 bg-page px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent-purple focus:outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs">
      <span className="mb-1 block font-medium uppercase tracking-wider text-text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}
