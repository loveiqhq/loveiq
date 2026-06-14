"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";

interface VariantRow {
  variant: string;
  completed: number;
  paid: number;
  revenue: number;
  paidRate: number;
}

interface LandingVariantResponse {
  rows: VariantRow[];
}

const EMPTY: VariantRow = {
  variant: "",
  completed: 0,
  paid: 0,
  revenue: 0,
  paidRate: 0,
};

const fmtInt = (n: number) => n.toLocaleString("en-US");
const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const fmtEur = (n: number) => `€${n.toFixed(2)}`;

export default function LandingVariantTab({ days }: { days: number }) {
  const params = useMemo(() => {
    const next: Record<string, string> = {};
    if (days > 0) next.days = String(days);
    return next;
  }, [days]);

  const { data, loading, error } = useAdminFetch<LandingVariantResponse>(
    "/api/admin/funnels/landing-variant",
    params
  );

  const white = data?.rows?.find((r) => r.variant === "white") ?? EMPTY;
  const control = data?.rows?.find((r) => r.variant === "control") ?? EMPTY;
  const hasWhiteData = white.completed > 0 || white.paid > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm text-red-400">
        {error}
      </div>
    );
  }

  // Highlight the better paid-rate column (the money metric), but only once both
  // arms actually have completed surveys — otherwise the comparison is noise.
  const comparable = white.completed > 0 && control.completed > 0;
  const whiteWinsPaid = comparable && white.paidRate > control.paidRate;
  const controlWinsPaid = comparable && control.paidRate > white.paidRate;

  const metrics: Array<{
    label: string;
    note?: string;
    white: string;
    control: string;
    highlight?: boolean;
  }> = [
    {
      label: "Completed surveys",
      white: fmtInt(white.completed),
      control: fmtInt(control.completed),
    },
    { label: "Paid", white: fmtInt(white.paid), control: fmtInt(control.paid) },
    {
      label: "Paid rate",
      note: "paid ÷ completed",
      white: fmtPct(white.paidRate),
      control: fmtPct(control.paidRate),
      highlight: true,
    },
    { label: "Revenue", white: fmtEur(white.revenue), control: fmtEur(control.revenue) },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-white/10 bg-surface p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-serif text-lg font-bold text-text-primary">
            Landing A/B — White vs Dark
          </h3>
          <span className="text-xs text-text-muted">
            {days > 0 ? `Last ${days} days` : "All time"}
          </span>
        </div>

        <div className="mt-5 overflow-hidden rounded-lg border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/[0.03] text-xs uppercase tracking-wide text-text-muted">
                <th className="px-4 py-3 text-left font-medium">Metric</th>
                <th className="px-4 py-3 text-right font-medium">White landing</th>
                <th className="px-4 py-3 text-right font-medium">Dark / Control</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.label} className="border-t border-white/5">
                  <td className="px-4 py-3">
                    <span className="text-text-primary">{m.label}</span>
                    {m.note && <span className="ml-2 text-xs text-text-muted">{m.note}</span>}
                  </td>
                  <td
                    className={`px-4 py-3 text-right tabular-nums ${
                      m.highlight ? "font-bold" : "font-medium"
                    } ${m.highlight && whiteWinsPaid ? "text-emerald-400" : "text-text-primary"}`}
                  >
                    {m.white}
                    {m.highlight && whiteWinsPaid && <span className="ml-1.5">▲</span>}
                  </td>
                  <td
                    className={`px-4 py-3 text-right tabular-nums ${
                      m.highlight ? "font-bold" : "font-medium"
                    } ${m.highlight && controlWinsPaid ? "text-emerald-400" : "text-text-primary"}`}
                  >
                    {m.control}
                    {m.highlight && controlWinsPaid && <span className="ml-1.5">▲</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-text-muted">
          Completed surveys, paid, and revenue are exact (attributed to the landing the buyer first
          saw). Traffic is split ~50/50, so completed volume is a fair top-funnel proxy and paid
          rate is the monetisation signal. Full visitor/traffic counts live in GA4 — segment by the{" "}
          <span className="font-mono">landing_variant</span> user property.
        </p>
      </div>

      {!hasWhiteData && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100/90">
          No white-cohort activity in this window yet. This populates as visitors flow through the
          white landing (the variant tracking must be live in production first).
        </div>
      )}
    </div>
  );
}
