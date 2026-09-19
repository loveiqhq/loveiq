"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";

interface VariantRow {
  variant: string;
  /** Plain-English arm name, from the shared `armLabel` vocabulary (attached server-side). */
  label: string;
  /** True for an arm no longer being assigned — shown as history, never as a contender. */
  retired: boolean;
  completed: number;
  paid: number;
  revenue: number;
  paidRate: number;
}

interface LandingVariantResponse {
  rows: VariantRow[];
}

const fmtInt = (n: number) => n.toLocaleString("en-US");
const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const fmtEur = (n: number) => `€${n.toFixed(2)}`;

/**
 * One ROW per landing arm, metrics as columns.
 *
 * It used to be two fixed columns, "White landing" and "Dark / Control", because
 * the RPC behind it collapsed every arm that was not `white` into `control`. That
 * made the second column a bin holding three unrelated things — the retired dark
 * arm, the live V1 arm, and every submission with no arm stamped — and on
 * production it credited the dark landing page with 61 purchases and €807.89 while
 * the real dark arm sold nothing in the six days it ran. A row per arm is what lets
 * the screen say how many arms there actually are, which two are live, and which
 * traffic could not be attributed at all.
 */
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

  const rows = data?.rows ?? [];

  /**
   * Best paid rate among the arms that are actually being compared: live arms only,
   * and only once at least two of them have completed surveys. A retired arm cannot
   * "win" a test that is no longer running, and the unattributed bucket is not an
   * arm — highlighting either would be inviting a decision from a number that does
   * not support one.
   */
  const contenders = rows.filter((r) => !r.retired && r.variant !== "unknown" && r.completed > 0);
  const leader =
    contenders.length > 1
      ? contenders.reduce((best, r) => (r.paidRate > best.paidRate ? r : best))
      : null;
  const leaderIsClear = leader
    ? contenders.every((r) => r === leader || r.paidRate < leader.paidRate)
    : false;

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

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-white/10 bg-surface p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-serif text-lg font-bold text-text-primary">
            Landing page — surveys, purchases and revenue by arm
          </h3>
          <span className="text-xs text-text-muted">
            {days > 0 ? `Last ${days} days` : "All time"}
          </span>
        </div>

        <div className="mt-5 overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/[0.03] text-xs uppercase tracking-wide text-text-muted">
                <th className="px-4 py-3 text-left font-medium">Landing page</th>
                <th className="px-4 py-3 text-right font-medium">Completed surveys</th>
                <th className="px-4 py-3 text-right font-medium">Paid</th>
                <th className="px-4 py-3 text-right font-medium">
                  Paid rate
                  <span className="ml-1 normal-case text-text-muted">(paid ÷ completed)</span>
                </th>
                <th className="px-4 py-3 text-right font-medium">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr className="border-t border-white/5">
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-text-muted">
                    No submissions in this window.
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const isLeader = leaderIsClear && r === leader;
                return (
                  <tr key={r.variant} className="border-t border-white/5">
                    <td className="px-4 py-3">
                      <span className="text-text-primary">{r.label}</span>
                      {r.retired && (
                        <span className="ml-2 text-xs text-text-muted">no longer assigned</span>
                      )}
                      {r.variant === "unknown" && (
                        <span className="ml-2 text-xs text-text-muted">
                          no arm was stamped — not part of the comparison
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-text-primary">
                      {fmtInt(r.completed)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-text-primary">
                      {fmtInt(r.paid)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-bold tabular-nums ${
                        isLeader ? "text-emerald-400" : "text-text-primary"
                      }`}
                    >
                      {fmtPct(r.paidRate)}
                      {isLeader && <span className="ml-1.5">▲</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-text-primary">
                      {fmtEur(r.revenue)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-text-muted">
          Attribution is the arm stamped on the buyer&apos;s own submission, so a row with no arm
          recorded is traffic that predates the stamping or never carried the cookie — it is shown
          for completeness and is not one of the arms under test. Landing views are not stored
          server-side, so completed surveys stand in for the top of the funnel — full visitor counts
          live in GA4, segmented by the <span className="font-mono">landing_variant</span> user
          property.
        </p>
      </div>
    </div>
  );
}
