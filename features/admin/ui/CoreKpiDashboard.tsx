"use client";

import { useMemo } from "react";
import { useAdminFetch } from "./hooks/useAdminFetch";
import { useAdminQueryState } from "./hooks/useAdminQueryState";
import TimeRangeSelector from "./TimeRangeSelector";
import BarChart from "./BarChart";
import KpiCard from "./analytics/KpiCard";
import KpiLayerSection from "./analytics/KpiLayerSection";
import MarketingSpendEditor from "./analytics/MarketingSpendEditor";
import SegmentationPanel from "./analytics/SegmentationPanel";

interface SegmentRow {
  label: string;
  count: number;
  pct: number;
}

interface DailyPoint {
  date: string;
  count: number;
}

interface CoreKpiData {
  range: { since: string; days: number; daysInRange: number };
  marketingInput: {
    adSpendEur: number | null;
    channelMix: Array<{ channel: string; spend: number; pct: number }> | null;
    cpcEur: number | null;
  };
  traffic: { uniqueVisitors: number | null };
  surveyStart: { attempts: number; visitToSurveyCvr: number | null };
  surveyCompletion: {
    completed: number;
    completionRate: number;
    costPerCompletedEur: number | null;
    dropOffRate: number;
    avgDurationMinutes: number | null;
    medianDurationMinutes: number | null;
    p90DurationMinutes: number | null;
    completionsPerDay: number;
    daily: DailyPoint[];
  };
  monetization: {
    paidReports: number;
    surveyToPaidCvr: number | null;
    paidPerDay: number;
    daily: DailyPoint[];
  };
  revenue: { arppEur: number | null; totalRevenueEur: number };
  unitEconomics: {
    cpprEur: number | null;
    cb1Eur: number | null;
    cb1PerReportEur: number | null;
  };
  engagement: {
    reopenRate: number | null;
    medianSessionMinutes: number | null;
    p90SessionMinutes: number | null;
  };
  perceivedValue: {
    sentimentScore: number | null;
    upCount: number;
    downCount: number;
    sampleSize: number;
  };
  virality: {
    referAFriendRate: number | null;
    reportShareRate: number | null;
    avgInvitesPerReferrer: number | null;
    emailShareViewRate: number | null;
  };
  retention: { returnVisitRate: number | null };
  efficiency: { roas: number | null };
  segmentation: {
    completion: {
      archetype: SegmentRow[];
      country: SegmentRow[];
      gender: SegmentRow[];
      age: SegmentRow[];
    };
    paid: {
      archetype: SegmentRow[];
      country: SegmentRow[];
      gender: SegmentRow[];
      age: SegmentRow[];
    };
  };
  deltas: {
    completed: number | null;
    revenue: number | null;
    paidReports: number | null;
  };
}

type Tab = "board" | "marketing" | "segmentation";

const MARKETING_HINT = "Add a marketing-spend row to populate.";

export default function CoreKpiDashboard() {
  // Tab + time range live in the URL so views are bookmarkable / Slack-shareable
  // (e.g. ?tab=segmentation&days=90), matching the Data Explorer.
  const { searchParams, setQueryState } = useAdminQueryState();
  const daysParam = searchParams.get("days");
  const parsedDays = daysParam != null ? parseInt(daysParam, 10) : NaN;
  const days = Number.isFinite(parsedDays) ? parsedDays : 30; // preserve days=0 (all time)
  const tabParam = searchParams.get("tab");
  const tab: Tab = tabParam === "marketing" || tabParam === "segmentation" ? tabParam : "board";
  const params = useMemo(() => ({ days: String(days) }), [days]);
  const { data, loading, error } = useAdminFetch<CoreKpiData>(
    "/api/admin/analytics/core-kpis",
    params
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-text-primary">Core KPIs</h1>
          <p className="mt-1 text-sm text-text-muted">
            Single source of truth for marketing, funnel, monetization, engagement, virality,
            retention, and segmentation KPIs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <TimeRangeSelector
            value={days}
            onChange={(d) => setQueryState({ days: d === 30 ? null : d })}
          />
          {tab !== "marketing" && (
            <a
              href={`/api/admin/analytics/export?days=${days}${
                tab === "segmentation" ? "&format=segmentation" : ""
              }`}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-text-muted transition hover:border-white/20 hover:text-text-primary"
              download
            >
              Export CSV
            </a>
          )}
        </div>
      </header>

      <nav className="flex gap-1 rounded-lg bg-white/5 p-1 w-fit" aria-label="Dashboard sections">
        {(
          [
            { id: "board", label: "KPI Board" },
            { id: "marketing", label: "Marketing Inputs" },
            { id: "segmentation", label: "Segmentation" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setQueryState({ tab: t.id === "board" ? null : t.id })}
            aria-pressed={tab === t.id}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
              tab === t.id
                ? "bg-white/10 text-text-primary"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {loading && <DashboardSkeleton />}
      {error && (
        <div
          className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center text-sm text-red-400"
          role="alert"
        >
          {error}
        </div>
      )}
      {!loading && !error && data && (
        <>
          {tab === "board" && <BoardTab data={data} />}
          {tab === "marketing" && <MarketingSpendEditor days={days} />}
          {tab === "segmentation" && <SegmentationPanel {...data.segmentation} />}
        </>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
    </div>
  );
}

function DailyTrend({ title, points }: { title: string; points: DailyPoint[] }) {
  if (!points || points.length === 0) return null;
  return (
    <section className="rounded-xl border border-white/10 bg-surface p-5">
      <h3 className="mb-4 font-serif text-base font-semibold text-text-primary">{title}</h3>
      <BarChart
        items={points.map((d) => ({ label: d.date.slice(5), value: d.count }))}
        direction="vertical"
        maxHeight={160}
      />
    </section>
  );
}

function BoardTab({ data }: { data: CoreKpiData }) {
  return (
    <div className="space-y-8">
      <KpiLayerSection
        layer="Marketing Input"
        description="Manual entries from the Marketing Inputs tab."
      >
        <KpiCard
          label="Advertisement spent"
          value={data.marketingInput.adSpendEur}
          format="currency"
          formula="Σ marketing_spend.spend_eur"
          definition="Total acquisition spend across all channels"
          whyItMatters="Primary cost driver"
          emptyHint={MARKETING_HINT}
        />
        <KpiCard
          label="Channel Mix"
          value={
            data.marketingInput.channelMix
              ? data.marketingInput.channelMix
                  .slice(0, 3)
                  .map((c) => `${c.channel} ${c.pct.toFixed(0)}%`)
                  .join(" · ")
              : null
          }
          format="raw"
          formula="Channel spend / Total spend"
          definition="Budget distribution by channel (top 3)"
          whyItMatters="Optimization & learning"
          emptyHint={MARKETING_HINT}
        />
        <KpiCard
          label="Cost per Click (CPC)"
          value={data.marketingInput.cpcEur}
          format="currency"
          formula="Ad spent / Total clicks"
          definition="Average cost per paid click"
          whyItMatters="Media efficiency"
          emptyHint={MARKETING_HINT}
        />
        <KpiCard
          label="Unique Visitors"
          value={data.traffic.uniqueVisitors}
          format="number"
          formula="Σ marketing_spend.unique_visitors"
          definition="Distinct site visitors (manual GA4 entry)"
          whyItMatters="True top-of-funnel size"
          emptyHint={MARKETING_HINT}
        />
      </KpiLayerSection>

      <KpiLayerSection layer="Survey Funnel">
        <KpiCard
          label="Survey Attempts"
          value={data.surveyStart.attempts}
          format="number"
          formula="Distinct partial-save sessions + completed submissions"
          definition="Users who started the survey"
          whyItMatters="Engagement quality"
        />
        <KpiCard
          label="Visit → Survey CVR"
          value={data.surveyStart.visitToSurveyCvr}
          format="percent"
          formula="Survey attempts / Unique visitors"
          definition="Visitor-to-survey conversion"
          whyItMatters="Messaging & intent fit"
          emptyHint="Add unique visitors to populate."
        />
        <KpiCard
          label="Survey Completed"
          value={data.surveyCompletion.completed}
          format="number"
          formula="Count of survey_submission WHERE status = completed"
          definition="Fully completed surveys"
          whyItMatters="Monetization gate"
          delta={data.deltas.completed}
        />
        <KpiCard
          label="Survey Completion Rate"
          value={data.surveyCompletion.completionRate}
          format="percent"
          formula="Completed / Attempts"
          definition="Attempts reaching completion"
          whyItMatters="UX, length, motivation"
        />
        <KpiCard
          label="Cost per Survey Completed"
          value={data.surveyCompletion.costPerCompletedEur}
          format="currency"
          formula="Ad spent / Completed"
          definition="Advertisement cost per completion"
          whyItMatters="CAC proxy"
          emptyHint={MARKETING_HINT}
        />
        <KpiCard
          label="Drop-off Rate"
          value={data.surveyCompletion.dropOffRate}
          format="percent"
          formula="100% − Completion rate"
          definition="Abandoned surveys"
          whyItMatters="Friction indicator"
        />
        <KpiCard
          label="Median Time to Complete"
          value={data.surveyCompletion.medianDurationMinutes}
          format="minutes"
          formula="Median(duration_ms) / 60000"
          definition="Median time spent completing survey"
          whyItMatters="Fatigue & pacing control"
          sub={
            data.surveyCompletion.p90DurationMinutes != null
              ? `P90: ${data.surveyCompletion.p90DurationMinutes.toFixed(1)} min`
              : undefined
          }
        />
        <KpiCard
          label="Completions per Day"
          value={data.surveyCompletion.completionsPerDay}
          format="number"
          formula="Completed / Days in range"
          definition="Avg. daily completions"
          whyItMatters="Operational throughput"
        />
      </KpiLayerSection>

      <DailyTrend title="Daily Completions" points={data.surveyCompletion.daily} />

      <KpiLayerSection layer="Monetization">
        <KpiCard
          label="Paid Reports"
          value={data.monetization.paidReports}
          format="number"
          formula="Count of payment WHERE status = succeeded"
          definition="Sold reports"
          whyItMatters="Core revenue unit"
          delta={data.deltas.paidReports}
        />
        <KpiCard
          label="Survey → Paid CVR"
          value={data.monetization.surveyToPaidCvr}
          format="percent"
          formula="Paid reports / Completed"
          definition="Completion-to-purchase conversion"
          whyItMatters="Value & pricing fit"
        />
        <KpiCard
          label="Paid Reports per Day"
          value={data.monetization.paidPerDay}
          format="number"
          formula="Paid / Days in range"
          definition="Avg. daily paid reports"
          whyItMatters="Revenue velocity"
        />
      </KpiLayerSection>

      <DailyTrend title="Daily Paid Reports" points={data.monetization.daily} />

      <KpiLayerSection layer="Revenue">
        <KpiCard
          label="ARPP (Avg. Revenue per Paid Report)"
          value={data.revenue.arppEur}
          format="currency"
          formula="Total revenue / Paid reports"
          definition="Avg. revenue per report"
          whyItMatters="Pricing & upsell health"
        />
        <KpiCard
          label="Total Revenue"
          value={data.revenue.totalRevenueEur}
          format="currency"
          formula="Σ payment.amount WHERE succeeded"
          definition="Gross revenue"
          whyItMatters="Top-line performance"
          delta={data.deltas.revenue}
        />
      </KpiLayerSection>

      <KpiLayerSection layer="Unit Economics">
        <KpiCard
          label="CPPR (Cost per Paid Report)"
          value={data.unitEconomics.cpprEur}
          format="currency"
          formula="Ad spent / Paid reports"
          definition="Advertisement cost per sale"
          whyItMatters="CAC proxy"
          emptyHint={MARKETING_HINT}
        />
        <KpiCard
          label="Gross Contribution (CB I)"
          value={data.unitEconomics.cb1Eur}
          format="currency"
          formula="Revenue − Ad spent"
          definition="Revenue minus marketing"
          whyItMatters="First profitability check"
          emptyHint={MARKETING_HINT}
        />
        <KpiCard
          label="CB I per Report"
          value={data.unitEconomics.cb1PerReportEur}
          format="currency"
          formula="CB I / Paid reports"
          definition="Contribution per report"
          whyItMatters="Scales linearly"
          emptyHint={MARKETING_HINT}
        />
        <KpiCard
          label="ROAS (Return on Ad Spend)"
          value={data.efficiency.roas}
          format="multiple"
          formula="Total revenue / Ad spent"
          definition="Revenue vs marketing spend"
          whyItMatters="Scale sanity check"
          emptyHint={MARKETING_HINT}
        />
      </KpiLayerSection>

      <KpiLayerSection layer="Engagement & Trust">
        <KpiCard
          label="Report Reopen Rate"
          value={data.engagement.reopenRate}
          format="percent"
          formula="(Sessions − Unique reports) / Unique reports"
          definition="Share of users reopening report"
          whyItMatters="Depth of perceived value"
        />
        <KpiCard
          label="Median Session Duration"
          value={data.engagement.medianSessionMinutes}
          format="minutes"
          formula="Median(ended_at − started_at)"
          definition="Median report session length"
          whyItMatters="Insight absorption proxy"
          sub={
            data.engagement.p90SessionMinutes != null
              ? `P90: ${data.engagement.p90SessionMinutes.toFixed(1)} min`
              : undefined
          }
        />
      </KpiLayerSection>

      <KpiLayerSection layer="Perceived Value">
        <KpiCard
          label="Sentiment Score (NPS proxy)"
          value={data.perceivedValue.sentimentScore}
          format="percent"
          formula="ups / (ups + downs)"
          definition="Post-report thumbs-up rate; treat as a directional NPS proxy until a 0–10 NPS modal ships"
          whyItMatters="Retention & referrals"
          sub={`n=${data.perceivedValue.sampleSize} · ${data.perceivedValue.upCount}↑ / ${data.perceivedValue.downCount}↓`}
          emptyHint="No feedback rows yet."
        />
      </KpiLayerSection>

      <KpiLayerSection layer="Virality & Sharing">
        <KpiCard
          label="Refer-a-friend Rate"
          value={data.virality.referAFriendRate}
          format="percent"
          formula="DISTINCT referrer_email / Paid reports"
          definition="Rate of users referring at least one other person"
          whyItMatters="Organic growth engine"
        />
        <KpiCard
          label="Report Share Rate"
          value={data.virality.reportShareRate}
          format="percent"
          formula="DISTINCT shared report / Paid reports"
          definition="Share of reports that were granted access to a recipient"
          whyItMatters="Organic growth engine"
        />
        <KpiCard
          label="Avg. Invites per Referrer"
          value={data.virality.avgInvitesPerReferrer}
          format="number"
          formula="invite_event.count / DISTINCT referrer_email"
          definition="Avg. invites sent per unique referrer"
          whyItMatters="Viral coefficient input"
        />
        <KpiCard
          label="Shared Report View Rate"
          value={data.virality.emailShareViewRate}
          format="percent"
          formula="Shares with view_count > 0 / Total shares"
          definition="Share recipients who opened the shared report"
          whyItMatters="UX & trust signal"
        />
      </KpiLayerSection>

      <KpiLayerSection layer="Retention (Early)">
        <KpiCard
          label="Return Visit Rate"
          value={data.retention.returnVisitRate}
          format="percent"
          formula="Users with ≥2 report sessions / Paid reports"
          definition="Users returning after first report"
          whyItMatters="Long-term relationship signal"
        />
      </KpiLayerSection>
    </div>
  );
}
