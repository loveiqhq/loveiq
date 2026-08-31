"use client";

import { useMemo, useState, type FC, type ReactNode } from "react";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import StatCard from "@features/admin/ui/StatCard";
import { armLabel } from "@features/attribution/server/labels";
import JourneyFlowSankey, {
  type FlowNode,
  type FlowLink,
} from "@features/admin/ui/journey/JourneyFlowSankey";

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
interface FrictionRow {
  cId: number;
  label: string;
  reached: number;
  abandons: number;
  backs: number;
  medianMs: number;
}
interface FlowData {
  days: number;
  filters: { source: string; landingVariant: string; paywallArm: string };
  bands: {
    acquisition: BandData;
    survey: BandData;
    wizard: BandData;
    monetization: BandData;
    recovery: BandData;
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
  friction: FrictionRow[];
  pricing: {
    points: Array<{ price: number; shown: number; converted: number }>;
    steps: Array<{ step: number; shown: number; converted: number }>;
  };
  recoveredAmongNurtured: number;
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
  caveats: {
    acquisitionSeam: string;
    wizardConsent: string;
    armScope: string;
    recovery: string;
    truncation?: string;
  };
}

interface Segment {
  source: string;
  landingVariant: string;
}

const money = (n: number) =>
  `€${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

/** Biggest drop node in a band (excluding refunds) → header chip text. */
function bandLeak(nodes: FlowNode[]): string | null {
  const drops = nodes.filter((n) => n.kind === "drop" && !n.id.endsWith("refunded"));
  if (!drops.length) return null;
  const top = drops.reduce((a, b) => (b.count > a.count ? b : a));
  return top.count > 0 ? `${top.label} (${top.count.toLocaleString()})` : null;
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
      className="focus-visible-ring rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-text-primary"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  </label>
);

const SegmentFilters: FC<{ value: Segment; onChange: (s: Segment) => void }> = ({
  value,
  onChange,
}) => (
  <>
    <Select
      label="Traffic source"
      value={value.source}
      onChange={(v) => onChange({ ...value, source: v })}
      options={SOURCE_OPTIONS.map((s) => ({ value: s, label: s === "all" ? "All sources" : s }))}
    />
    {/* Values are the RAW arm as stored in utm_tracker, because the route filters on
        exact equality against it (journey/flow route.ts); only the labels are
        translated, and from the shared vocabulary so this dropdown cannot drift from
        the names in Slack and the rest of /admin.

        `white_prev` was missing entirely, so the arm CURRENTLY under test could not
        be selected — the only choices were the live V2 arm and a dark arm that has
        not been assigned since 21 Aug. */}
    <Select
      label="Landing page"
      value={value.landingVariant}
      onChange={(v) => onChange({ ...value, landingVariant: v })}
      options={[
        { value: "all", label: "All" },
        { value: "white", label: armLabel("landing", "white").short },
        { value: "white_prev", label: armLabel("landing", "white_prev").short },
        { value: "control", label: armLabel("landing", "control").short },
      ]}
    />
  </>
);

const BandCard: FC<{
  step: string;
  title: string;
  subtitle: string;
  leak?: string | null;
  note?: string;
  children: ReactNode;
}> = ({ step, title, subtitle, leak, note, children }) => (
  <div className="rounded-xl border border-white/10 bg-surface p-5">
    <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-text-muted">
        {step}
      </span>
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      <span className="text-xs text-text-muted">{subtitle}</span>
      {leak && (
        <span className="ml-auto rounded-full bg-red-500/15 px-3 py-1 text-xs font-medium text-red-300">
          Biggest leak: {leak}
        </span>
      )}
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

const FrictionTable: FC<{ rows: FrictionRow[] }> = ({ rows }) => {
  const maxAbandon = Math.max(1, ...rows.map((r) => r.abandons));
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-[10px] uppercase tracking-wider text-text-muted">
          <tr>
            <th className="py-1.5 pr-3">Chapter</th>
            <th className="px-3 py-1.5 text-right">Reached</th>
            <th className="px-3 py-1.5 text-right">Abandons</th>
            <th className="px-3 py-1.5 text-right">Back-clicks</th>
            <th className="px-3 py-1.5 text-right">Median time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.cId} className="border-t border-white/5">
              <td className="py-1.5 pr-3 text-text-primary">{r.label}</td>
              <td className="px-3 py-1.5 text-right text-text-muted">
                {r.reached.toLocaleString()}
              </td>
              <td className="px-3 py-1.5 text-right">
                <span
                  className="rounded px-2 py-0.5 font-medium text-red-200"
                  style={{
                    background: `rgba(239,68,68,${0.12 + (r.abandons / maxAbandon) * 0.5})`,
                  }}
                >
                  {r.abandons.toLocaleString()}
                </span>
              </td>
              <td className="px-3 py-1.5 text-right text-text-muted">{r.backs.toLocaleString()}</td>
              <td className="px-3 py-1.5 text-right text-text-muted">
                {r.medianMs > 0 ? `${(r.medianMs / 1000).toFixed(1)}s` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const PricingPanel: FC<{ pricing: FlowData["pricing"] }> = ({ pricing }) => {
  const maxShown = Math.max(1, ...pricing.points.map((p) => p.shown));
  return (
    <div className="grid gap-x-10 gap-y-2 lg:grid-cols-2">
      <div>
        <p className="mb-2 text-[10px] uppercase tracking-wider text-text-muted">
          Price points shown → converted
        </p>
        <div className="space-y-1.5">
          {pricing.points.length === 0 && <p className="text-xs text-text-muted">No data.</p>}
          {pricing.points.map((p) => (
            <div key={p.price} className="flex items-center gap-3">
              <span className="w-16 shrink-0 text-right text-xs text-text-primary">€{p.price}</span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full bg-accent-purple"
                  style={{ width: `${Math.max(2, Math.round((p.shown / maxShown) * 100))}%` }}
                />
              </div>
              <span className="w-28 shrink-0 text-right text-xs text-text-muted">
                {p.shown.toLocaleString()} shown · {p.converted} buy
              </span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-[10px] uppercase tracking-wider text-text-muted">
          Discount step → converted
        </p>
        <div className="space-y-1.5">
          {pricing.steps.length === 0 && <p className="text-xs text-text-muted">No data.</p>}
          {pricing.steps.map((s) => (
            <div key={s.step} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-text-primary">Step {s.step}</span>
              <span className="text-text-muted">
                {s.shown.toLocaleString()} shown ·{" "}
                {s.shown > 0 ? Math.round((s.converted / s.shown) * 100) : 0}% buy
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/** The full set of bands + panels for ONE segment's data. */
const Atlas: FC<{ data: FlowData; loading: boolean }> = ({ data, loading }) => (
  <div
    className={`space-y-6 transition-opacity ${loading ? "pointer-events-none opacity-40" : ""}`}
    aria-busy={loading}
  >
    {data.caveats.truncation && (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-200">
        ⚠ {data.caveats.truncation}
      </div>
    )}
    <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
      <StatCard label="Visitors" value={data.summary.visitors.toLocaleString()} />
      <StatCard label="Survey starts" value={data.summary.surveyStarted.toLocaleString()} />
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

    <BandCard
      step="1 · Arrive"
      title="Acquisition & intro"
      subtitle={`sources → visitors → intro slides 1-4 · intro completion ${data.summary.introCompletionRate}%`}
      leak={bandLeak(data.bands.acquisition.nodes)}
      note={data.caveats.acquisitionSeam}
    >
      <JourneyFlowSankey
        nodes={data.bands.acquisition.nodes}
        links={data.bands.acquisition.links}
        height={250}
        nodeWidth={12}
        labelSize={10.5}
        showLegend={false}
        showLinkLabels
      />
    </BandCard>

    <BandCard
      step="2 · Answer"
      title="Survey progress by chapter"
      subtitle="reach + friction (abandons, back-clicks, time) per chapter"
      leak={bandLeak(data.bands.survey.nodes)}
    >
      <JourneyFlowSankey
        nodes={data.bands.survey.nodes}
        links={data.bands.survey.links}
        height={250}
        nodeWidth={12}
        labelSize={10.5}
        showLegend={false}
        showLinkLabels
      />
      <FrictionTable rows={data.friction} />
    </BandCard>

    <BandCard
      step="3 · Prepare"
      title="Pre-report wizard"
      subtitle={`6 slides · completion ${data.summary.wizardCompletionRate}% of tracked`}
      leak={bandLeak(data.bands.wizard.nodes)}
      note={data.caveats.wizardConsent}
    >
      <JourneyFlowSankey
        nodes={data.bands.wizard.nodes}
        links={data.bands.wizard.links}
        height={230}
        nodeWidth={12}
        labelSize={10.5}
        showLegend={false}
        showLinkLabels
      />
    </BandCard>

    <BandCard
      step="4 · Convert"
      title="Report & monetization"
      subtitle={`${data.summary.shared.toLocaleString()} shared · ${data.summary.bookedCalls.toLocaleString()} calls · ${data.summary.refunded.toLocaleString()} refunded · view→buy ${data.summary.viewToPurchaseRate}%`}
      leak={bandLeak(data.bands.monetization.nodes)}
      note={data.caveats.armScope}
    >
      <JourneyFlowSankey
        nodes={data.bands.monetization.nodes}
        links={data.bands.monetization.links}
        height={250}
        nodeWidth={12}
        labelSize={10.5}
        showLinkLabels
      />
    </BandCard>

    <BandCard
      step="5 · Recover"
      title="Email re-engagement ladder"
      subtitle={`${data.recoveredAmongNurtured.toLocaleString()} nurtured users eventually purchased`}
      leak={bandLeak(data.bands.recovery.nodes)}
      note={data.caveats.recovery}
    >
      <JourneyFlowSankey
        nodes={data.bands.recovery.nodes}
        links={data.bands.recovery.links}
        height={210}
        nodeWidth={12}
        labelSize={10.5}
        showLegend={false}
        showLinkLabels
      />
    </BandCard>

    <div className="rounded-xl border border-white/10 bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-text-muted">
          Depth
        </span>
        <h3 className="text-sm font-semibold text-text-primary">Report engagement</h3>
        <span className="text-xs text-text-muted">
          of {data.engagement.viewed.toLocaleString()} who viewed (consented subset)
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

    <div className="rounded-xl border border-white/10 bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-text-muted">
          Pricing
        </span>
        <h3 className="text-sm font-semibold text-text-primary">Prices shown & discounting</h3>
      </div>
      <PricingPanel pricing={data.pricing} />
    </div>
  </div>
);

const Spinner: FC = () => (
  <div className="flex items-center justify-center py-24">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
  </div>
);

const SegmentColumn: FC<{ label: string; params: Record<string, string>; enabled: boolean }> = ({
  label,
  params,
  enabled,
}) => {
  const { data, loading, error } = useAdminFetch<FlowData>(
    "/api/admin/journey/flow",
    params,
    enabled
  );
  return (
    <div className="space-y-4">
      {label && (
        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-text-primary">
          {label}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm text-red-400">
          {error}
        </div>
      )}
      {!data && !error ? <Spinner /> : data ? <Atlas data={data} loading={loading} /> : null}
    </div>
  );
};

const FunnelFlowTab: FC = () => {
  const [days, setDays] = useState(30);
  const [compare, setCompare] = useState(false);
  const [segA, setSegA] = useState<Segment>({ source: "all", landingVariant: "all" });
  const [segB, setSegB] = useState<Segment>({ source: "Google Ads", landingVariant: "all" });

  const paramsA = useMemo(() => ({ days: String(days), ...segA }), [days, segA]);
  const paramsB = useMemo(() => ({ days: String(days), ...segB }), [days, segB]);

  const labelOf = (s: Segment) =>
    [
      s.source === "all" ? "All sources" : s.source,
      s.landingVariant !== "all" ? s.landingVariant : null,
    ]
      .filter(Boolean)
      .join(" · ");

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
        <SegmentFilters value={segA} onChange={setSegA} />
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-text-muted">
          <input
            type="checkbox"
            checked={compare}
            onChange={(e) => setCompare(e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-surface"
          />
          Compare two segments
        </label>
      </div>

      {compare && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-accent-purple/30 bg-accent-purple/5 p-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-accent-purple">
            Segment B
          </span>
          <SegmentFilters value={segB} onChange={setSegB} />
        </div>
      )}

      {compare ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <SegmentColumn label={`A · ${labelOf(segA)}`} params={paramsA} enabled />
          <SegmentColumn label={`B · ${labelOf(segB)}`} params={paramsB} enabled />
        </div>
      ) : (
        <SegmentColumn label="" params={paramsA} enabled />
      )}
    </div>
  );
};

export default FunnelFlowTab;
