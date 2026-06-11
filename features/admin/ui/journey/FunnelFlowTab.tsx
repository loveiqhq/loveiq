"use client";

import { useMemo, useState, type FC, type ReactNode } from "react";
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

interface BandData {
  nodes: FlowNode[];
  links: FlowLink[];
}

interface FlowData {
  days: number;
  filters: { source: string; landingVariant: string; paywallArm: string };
  bands: {
    acquisition: BandData;
    survey: BandData;
    wizard: BandData;
    monetization: BandData;
  };
  engagement: {
    viewed: number;
    active1min: number;
    active5min: number;
    active10min: number;
    scroll25: number;
    scroll50: number;
    scroll75: number;
    scroll100: number;
  };
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
    introCompletionRate: number;
    wizardCompletionRate: number;
  };
  caveats: { acquisitionSeam: string; wizardConsent: string; armScope: string };
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

const BandCard: FC<{
  step: string;
  title: string;
  subtitle: string;
  note?: string;
  children: ReactNode;
}> = ({ step, title, subtitle, note, children }) => (
  <div className="rounded-xl border border-white/10 bg-surface p-5">
    <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-text-muted">
        {step}
      </span>
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      <span className="text-xs text-text-muted">{subtitle}</span>
    </div>
    {children}
    {note && (
      <p className="mt-3 border-t border-white/5 pt-2 text-[11px] text-text-muted">{note}</p>
    )}
  </div>
);

const EngagementBar: FC<{ label: string; count: number; base: number; color: string }> = ({
  label,
  count,
  base,
  color,
}) => {
  // Capped at 100: consent-gated engagement events can slightly exceed the
  // "viewed" base (an event without a matching report_session row).
  const pct = base > 0 ? Math.min(100, Math.round((count / base) * 100)) : 0;
  const widthPct = base > 0 ? Math.max(2, pct) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-36 shrink-0 text-xs text-text-muted">{label}</span>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full" style={{ width: `${widthPct}%`, background: color }} />
      </div>
      <span className="w-24 shrink-0 text-right text-xs text-text-primary">
        {count.toLocaleString()} · {pct}%
      </span>
    </div>
  );
};

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
          className={`space-y-6 transition-opacity ${loading ? "pointer-events-none opacity-40" : ""}`}
          aria-busy={loading}
        >
          {/* Headline numbers */}
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Visitors" value={data.summary.visitors.toLocaleString()} />
            <StatCard
              label="Survey starts (sessions)"
              value={data.summary.surveyStarted.toLocaleString()}
            />
            <StatCard label="Submitted" value={data.summary.submitted.toLocaleString()} />
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

          {/* Band A — acquisition + intro slides */}
          <BandCard
            step="1 · Arrive"
            title="Acquisition & intro"
            subtitle={`sources → visitors → survey intro slides 1-4 · intro completion ${data.summary.introCompletionRate}%`}
            note={data.caveats.acquisitionSeam}
          >
            <JourneyFlowSankey
              nodes={data.bands.acquisition.nodes}
              links={data.bands.acquisition.links}
              height={250}
              nodeWidth={12}
              labelSize={10.5}
              showLegend={false}
            />
          </BandCard>

          {/* Band B — survey chapters */}
          <BandCard
            step="2 · Answer"
            title="Survey progress by chapter"
            subtitle="how far sessions get through the questionnaire, chapter by chapter"
          >
            <JourneyFlowSankey
              nodes={data.bands.survey.nodes}
              links={data.bands.survey.links}
              height={250}
              nodeWidth={12}
              labelSize={10.5}
              showLegend={false}
            />
          </BandCard>

          {/* Band C — pre-report wizard */}
          <BandCard
            step="3 · Prepare"
            title="Pre-report wizard"
            subtitle={`all 6 slides between submitting and the report · completion ${data.summary.wizardCompletionRate}% of tracked`}
            note={data.caveats.wizardConsent}
          >
            <JourneyFlowSankey
              nodes={data.bands.wizard.nodes}
              links={data.bands.wizard.links}
              height={230}
              nodeWidth={12}
              labelSize={10.5}
              showLegend={false}
            />
          </BandCard>

          {/* Band D — monetization */}
          <BandCard
            step="4 · Convert"
            title="Report & monetization"
            subtitle={`${data.summary.shared.toLocaleString()} shared · ${data.summary.bookedCalls.toLocaleString()} calls booked · ${data.summary.refunded.toLocaleString()} refunded · view→buy ${data.summary.viewToPurchaseRate}%`}
            note={data.caveats.armScope}
          >
            <JourneyFlowSankey
              nodes={data.bands.monetization.nodes}
              links={data.bands.monetization.links}
              height={250}
              nodeWidth={12}
              labelSize={10.5}
            />
          </BandCard>

          {/* Engagement depth */}
          <div className="rounded-xl border border-white/10 bg-surface p-5">
            <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-text-muted">
                Depth
              </span>
              <h3 className="text-sm font-semibold text-text-primary">Report engagement</h3>
              <span className="text-xs text-text-muted">
                of {data.engagement.viewed.toLocaleString()} who viewed the report (consented
                subset)
              </span>
            </div>
            <div className="grid gap-x-10 gap-y-2 lg:grid-cols-2">
              <div className="space-y-2">
                <EngagementBar
                  label="Active 1 min+"
                  count={data.engagement.active1min}
                  base={data.engagement.viewed}
                  color="#8b5cf6"
                />
                <EngagementBar
                  label="Active 5 min+"
                  count={data.engagement.active5min}
                  base={data.engagement.viewed}
                  color="#8b5cf6"
                />
                <EngagementBar
                  label="Active 10 min+"
                  count={data.engagement.active10min}
                  base={data.engagement.viewed}
                  color="#8b5cf6"
                />
              </div>
              <div className="space-y-2">
                <EngagementBar
                  label="Scrolled 25%"
                  count={data.engagement.scroll25}
                  base={data.engagement.viewed}
                  color="#06b6d4"
                />
                <EngagementBar
                  label="Scrolled 50%"
                  count={data.engagement.scroll50}
                  base={data.engagement.viewed}
                  color="#06b6d4"
                />
                <EngagementBar
                  label="Scrolled 75%"
                  count={data.engagement.scroll75}
                  base={data.engagement.viewed}
                  color="#06b6d4"
                />
                <EngagementBar
                  label="Scrolled 100%"
                  count={data.engagement.scroll100}
                  base={data.engagement.viewed}
                  color="#06b6d4"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FunnelFlowTab;
