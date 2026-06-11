"use client";

import { useMemo, useState, type FC } from "react";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import StatCard from "@features/admin/ui/StatCard";
import JourneyFlowSankey, {
  type FlowNode,
  type FlowLink,
} from "@features/admin/ui/journey/JourneyFlowSankey";

// Local copies of the option lists (avoid importing the server-only classifier
// module into the client bundle).
const SOURCE_OPTIONS = [
  "all",
  "Google Ads",
  "Paid Social",
  "Organic Search",
  "Organic Social",
  "Email",
  "Referral",
  "Direct",
  "Other",
];
const DAY_OPTIONS = [7, 30, 90, 365];

interface FlowData {
  days: number;
  filters: { source: string; landingVariant: string; paywallArm: string };
  nodes: FlowNode[];
  links: FlowLink[];
  summary: {
    visitors: number;
    surveyStarted: number;
    submitted: number;
    scored: number;
    viewed: number;
    paywall: number;
    checkout: number;
    purchased: number;
    refunded: number;
    revenue: number;
    shared: number;
    bookedCalls: number;
    viewRate: number;
    purchaseRate: number;
    viewToPurchaseRate: number;
  };
  caveats: { visitorsSeam: string; armScope: string };
}

const Select: FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}> = ({ label, value, onChange, options }) => (
  <label className="flex flex-col gap-1 text-xs text-text-muted">
    <span className="uppercase tracking-wider">{label}</span>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-text-primary focus-visible-ring"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  </label>
);

const FunnelFlowTab: FC = () => {
  const [days, setDays] = useState(30);
  const [source, setSource] = useState("all");
  const [landingVariant, setLandingVariant] = useState("all");
  const [paywallArm, setPaywallArm] = useState("all");

  const params = useMemo(
    () => ({ days: String(days), source, landingVariant, paywallArm }),
    [days, source, landingVariant, paywallArm]
  );
  const { data, loading, error } = useAdminFetch<FlowData>("/api/admin/journey/flow", params);

  const money = (n: number) =>
    `€${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-white/10 bg-surface p-4">
        <Select
          label="Range"
          value={String(days)}
          onChange={(v) => setDays(Number(v))}
          options={DAY_OPTIONS.map((d) => ({ value: String(d), label: `Last ${d} days` }))}
        />
        <Select
          label="Traffic source"
          value={source}
          onChange={setSource}
          options={SOURCE_OPTIONS.map((s) => ({
            value: s,
            label: s === "all" ? "All sources" : s,
          }))}
        />
        <Select
          label="Landing variant"
          value={landingVariant}
          onChange={setLandingVariant}
          options={[
            { value: "all", label: "All" },
            { value: "control", label: "Dark (control)" },
            { value: "white", label: "White" },
          ]}
        />
        <Select
          label="Paywall arm"
          value={paywallArm}
          onChange={setPaywallArm}
          options={[
            { value: "all", label: "All" },
            { value: "control", label: "Control" },
            { value: "treatment", label: "Treatment" },
          ]}
        />
        {loading && (
          <span className="ml-auto inline-flex items-center gap-2 text-xs text-text-muted">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
            Updating…
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm text-red-400">
          {error}
        </div>
      )}

      {data && (
        <div
          className={`space-y-6 transition-opacity ${loading ? "opacity-40" : ""}`}
          aria-busy={loading}
        >
          {/* Top-of-funnel context + headline numbers */}
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Visitors" value={data.summary.visitors.toLocaleString()} />
            <StatCard label="Survey starts" value={data.summary.surveyStarted.toLocaleString()} />
            <StatCard label="Completed" value={data.summary.submitted.toLocaleString()} />
            <StatCard
              label="Viewed report"
              value={`${data.summary.viewed.toLocaleString()} · ${data.summary.viewRate}%`}
            />
            <StatCard
              label="Purchased"
              value={`${data.summary.purchased.toLocaleString()} · ${data.summary.purchaseRate}%`}
            />
            <StatCard label="Revenue" value={money(data.summary.revenue)} />
          </div>

          {/* The Sankey */}
          <div className="rounded-xl border border-white/10 bg-surface p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-sm font-medium text-text-primary">Funnel flow</h3>
              <span className="text-xs text-text-muted">
                {data.summary.shared.toLocaleString()} shared ·{" "}
                {data.summary.bookedCalls.toLocaleString()} calls booked ·{" "}
                {data.summary.refunded.toLocaleString()} refunded · view→buy{" "}
                {data.summary.viewToPurchaseRate}%
              </span>
            </div>
            <JourneyFlowSankey nodes={data.nodes} links={data.links} />
            <p className="mt-4 border-t border-white/5 pt-3 text-[11px] leading-relaxed text-text-muted">
              {data.caveats.visitorsSeam} {data.caveats.armScope}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default FunnelFlowTab;
