"use client";

import { useState } from "react";

import type { OverviewPayload, Table } from "@features/admin/server/ap/overview";
import { fmt } from "@features/admin/server/ap/format";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";

import ApFilterBar from "./ApFilterBar";
import { exportTables } from "./csv";
import {
  Bar,
  BlackButton,
  Busy,
  Card,
  DataTable,
  Failed,
  KpiTile,
  LiveBadge,
  Loading,
  NotTracked,
  PageHeader,
  Pills,
  SectionHead,
  StatBox,
  TileGrid,
  useHashScroll,
} from "./kit";
import { useApFilters } from "./useApFilters";

type Split = "assessment" | "source";
const SPLITS: Array<{ value: Split; label: string }> = [
  { value: "assessment", label: "Per assessment" },
  { value: "source", label: "Per source" },
];

function SplitTable({
  split,
  byAssessment,
  bySource,
}: {
  split: Split;
  byAssessment: Table;
  bySource: Table;
}) {
  // Keyed by the split: a sort chosen on one split must not carry over to the other.
  // Where the design marks a per-source split "Sample split", ours says what it really is.
  return split === "source" ? (
    <div className="flex min-w-0 flex-col gap-2.5">
      <NotTracked>Split by the survey&apos;s source · visits not split</NotTracked>
      <DataTable key={split} table={bySource} />
    </div>
  ) : (
    <DataTable key={split} table={byAssessment} />
  );
}

export function RangeLine({
  data,
  sources = "Production database, ad spend from Google Ads via Google Analytics",
  trend,
  withRange = true,
}: {
  data: Pick<OverviewPayload, "range" | "compare" | "generatedAt" | "notes">;
  sources?: string;
  /** What the tiles' trend lines cover, said once here instead of under every tile. */
  trend?: string;
  /** Off where the header already shows the Live badge and the filter bar the range. */
  withRange?: boolean;
}) {
  const at = new Date(data.generatedAt).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-ap-muted">
        {withRange && <LiveBadge />}
        <span>
          {withRange &&
            `Figures below: ${data.range.label}${data.compare ? ` vs ${data.compare.label}` : ""} · `}
          {sources} · updated {at}
          {trend ? ` · trend lines: ${trend.charAt(0).toLowerCase()}${trend.slice(1)}` : ""}
        </span>
      </div>
      {data.notes.map((n) => (
        <p
          key={n}
          className="m-0 rounded-[14px] bg-ap-lilac px-3.5 py-2.5 text-[13px] leading-relaxed text-ap-body"
        >
          {n}
        </p>
      ))}
    </div>
  );
}

export default function ApOverview() {
  const { params } = useApFilters();
  const { data, loading, error, refetch } = useAdminFetch<OverviewPayload>(
    "/api/admin/ap/overview",
    params
  );
  useHashScroll(Boolean(data));
  const [trafficSplit, setTrafficSplit] = useState<Split>("assessment");
  const [subsSplit, setSubsSplit] = useState<Split>("assessment");
  const [engSplit, setEngSplit] = useState<Split>("assessment");

  return (
    <>
      <PageHeader
        crumbs={["Overall", "Overview"]}
        title="Overall performance"
        description="Traffic, submissions, engagement, revenue and cost across every assessment and source."
        actions={
          <BlackButton
            disabled={!data}
            onClick={() =>
              data &&
              exportTables(
                `ap-overview-${data.range.from}-${data.range.to}`,
                [
                  { name: "Traffic per assessment", table: data.traffic.byAssessment },
                  { name: "Traffic per source", table: data.traffic.bySource },
                  { name: "Submissions per assessment", table: data.submissions.byAssessment },
                  { name: "Submissions per source", table: data.submissions.bySource },
                  { name: "Engagement per assessment", table: data.engagement.byAssessment },
                  { name: "Engagement per source", table: data.engagement.bySource },
                  { name: "Revenue per assessment", table: data.revenue.byAssessment },
                  { name: "Costs per assessment", table: data.costs.byAssessment },
                  {
                    name: "Funnel",
                    table: {
                      columns: [
                        { label: "Step", unit: "text" },
                        { label: "People", unit: "count" },
                        { label: "Share of visits", unit: "pct" },
                        { label: "Share of the step before", unit: "pct" },
                      ],
                      rows: data.submissions.funnel.map((f) => ({
                        label: f.label,
                        values: [f.value, f.ofFirst, f.ofPrev],
                      })),
                    },
                  },
                  {
                    name: `Visitors per period (${data.traffic.caption})`,
                    table: {
                      columns: [
                        { label: "Period", unit: "text" },
                        { label: "Visitors", unit: "count" },
                        { label: "Days in the range", unit: "count" },
                      ],
                      rows: data.traffic.bars.map((b) => ({
                        label: b.label,
                        values: [b.value, b.days],
                      })),
                    },
                  },
                ],
                data.tiles
              )
            }
          >
            Export CSV
          </BlackButton>
        }
      />
      <ApFilterBar scope="overall" />
      {loading && !data && <Loading label="the overview" />}
      {error && <Failed message={error} onRetry={refetch} />}
      {data && (
        <Busy busy={loading}>
          <RangeLine data={data} trend={data.tiles[0]?.trend} />
          <TileGrid>
            {data.tiles.map((t) => (
              <KpiTile key={t.key} tile={t} />
            ))}
          </TileGrid>

          <Card id="traffic" labelledBy="h-traffic">
            <SectionHead
              id="h-traffic"
              eyebrow="01 · Traffic"
              title="Traffic"
              description="Unique daily visits to every public page, once per browser per day."
              right={
                <Pills
                  label="Split traffic by"
                  options={SPLITS}
                  value={trafficSplit}
                  onChange={setTrafficSplit}
                />
              }
            />
            <div
              className="grid items-start gap-6"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))" }}
            >
              <figure className="m-0 flex flex-col gap-3">
                <figcaption className="text-[13px] font-bold text-ap-body">
                  Visitors per{" "}
                  {data.traffic.caption.split(" ")[0] === "Daily"
                    ? "day"
                    : data.traffic.caption.split(" ")[0] === "Monthly"
                      ? "month"
                      : "week"}
                </figcaption>
                <VisitBars bars={data.traffic.bars} />
              </figure>
              <SplitTable
                split={trafficSplit}
                byAssessment={data.traffic.byAssessment}
                bySource={data.traffic.bySource}
              />
            </div>
          </Card>

          <Card id="submissions" labelledBy="h-subs">
            <SectionHead
              id="h-subs"
              eyebrow="02 · Submissions"
              title="Submissions"
              description="From visit to finished survey to opened and paid report."
              right={
                <Pills
                  label="Split submissions by"
                  options={SPLITS}
                  value={subsSplit}
                  onChange={setSubsSplit}
                />
              }
            />
            <div
              className="grid items-start gap-6"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))" }}
            >
              <div className="flex flex-col gap-3.5">
                <span className="text-[13px] font-bold text-ap-body">
                  {/* With visits blank under a filter, the shares are of the starts. */}
                  Funnel · share of{" "}
                  {data.submissions.funnel[0]?.value === null ? "starts" : "visits"}
                </span>
                {data.submissions.funnel.map((f, i) => (
                  <div key={f.label} className="flex flex-col gap-1.5">
                    <div className="flex justify-between gap-3 text-[13px]">
                      <span className="font-semibold">{f.label}</span>
                      <span className="tabular-nums text-ap-muted">
                        <strong className="text-ap-ink">{fmt("count", f.value)}</strong> ·{" "}
                        {fmt("pct", f.ofFirst)} ·{" "}
                        {i === 0 ? "entry" : `${fmt("pct", f.ofPrev, 1)} of previous`}
                      </span>
                    </div>
                    <Bar pct={f.ofFirst} minWidth={4} />
                  </div>
                ))}
                <p className="m-0 text-xs leading-relaxed text-ap-muted">
                  Opened and paid: of the people who submitted in the range, so far.
                </p>
              </div>
              <SplitTable
                split={subsSplit}
                byAssessment={data.submissions.byAssessment}
                bySource={data.submissions.bySource}
              />
            </div>
          </Card>

          <Card id="engagement" labelledBy="h-eng">
            <SectionHead
              id="h-eng"
              eyebrow="03 · Engagement"
              title="Engagement"
              description="How people move through the survey and how they read the report."
              right={
                <Pills
                  label="Split engagement by"
                  options={SPLITS}
                  value={engSplit}
                  onChange={setEngSplit}
                />
              }
            />
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))" }}
            >
              <EngagementCard
                title="Survey"
                href="assessment-a/survey"
                link="Open survey report →"
                stats={data.engagement.survey}
              />
              <EngagementCard
                title="Report"
                href="assessment-a/report"
                link="Open report analytics →"
                stats={data.engagement.report}
              />
            </div>
            <SplitTable
              split={engSplit}
              byAssessment={data.engagement.byAssessment}
              bySource={data.engagement.bySource}
            />
          </Card>

          <div
            className="grid items-start gap-6"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(360px, 100%), 1fr))" }}
          >
            <Card id="revenue" labelledBy="h-rev">
              <SectionHead id="h-rev" eyebrow="04 · Revenue · per assessment" title="Revenue" />
              <div
                className="grid gap-3"
                style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(120px, 100%), 1fr))" }}
              >
                {data.revenue.stats.map((s) => (
                  <StatBox key={s.label} stat={s} />
                ))}
              </div>
              <DataTable table={data.revenue.byAssessment} minWidth={440} />
            </Card>
            <Card id="costs" labelledBy="h-cost">
              <SectionHead id="h-cost" eyebrow="05 · Costs · per assessment" title="Costs & CAC" />
              <div
                className="grid gap-3"
                style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(120px, 100%), 1fr))" }}
              >
                {data.costs.stats.map((s) => (
                  <StatBox key={s.label} stat={s} />
                ))}
              </div>
              <DataTable table={data.costs.byAssessment} minWidth={440} />
            </Card>
          </div>
        </Busy>
      )}
    </>
  );
}

function VisitBars({ bars }: { bars: OverviewPayload["traffic"]["bars"] }) {
  const max = Math.max(1, ...bars.map((b) => b.value ?? 0));
  if (bars.every((b) => b.value === null)) {
    return (
      <p className="m-0 text-sm text-ap-muted">Visits can&rsquo;t be split by these filters.</p>
    );
  }
  // Many bars on a phone: no room for every figure and label, so some step aside there.
  const many = bars.length > 8;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-[200px] items-end gap-2 border-b border-ap-line px-1 sm:gap-4">
        {bars.map((b) => (
          <div
            key={b.label}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
          >
            <span
              className={`text-xs font-bold tabular-nums ${b.full ? "" : "text-ap-muted"} ${many ? "max-sm:hidden" : ""}`}
            >
              {fmt("count", b.value)}
            </span>
            <div
              className={`w-full max-w-16 rounded-t-lg rounded-b-sm ${b.full ? "bg-ap-purple" : "bg-ap-mist"}`}
              style={{ height: `${Math.round(((b.value ?? 0) / max) * 150)}px` }}
              title={
                b.full
                  ? undefined
                  : `${b.days} day${b.days === 1 ? "" : "s"} of this period in the range`
              }
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2 px-1 sm:gap-4">
        {bars.map((b, i) => (
          <span
            key={b.label}
            className={`min-w-0 flex-1 text-center text-xs text-ap-muted ${many && i % 3 ? "max-sm:invisible" : ""}`}
          >
            {b.label}
            {!b.full && (
              <span className="block text-[10px]">
                {b.days} day{b.days === 1 ? "" : "s"}
              </span>
            )}
          </span>
        ))}
      </div>
      {bars.some((b) => !b.full) && (
        <p className="m-0 text-xs text-ap-muted">
          Lighter bars: a week cut short by the range, so not comparable with the others.
        </p>
      )}
    </div>
  );
}

function EngagementCard({
  title,
  href,
  link,
  stats,
}: {
  title: string;
  href: string;
  link: string;
  stats: OverviewPayload["engagement"]["survey"];
}) {
  const { query } = useApFilters();
  return (
    <a
      href={`/admin/ap/${href}${query}`}
      className="flex flex-col gap-3.5 rounded-[18px] bg-ap-lilac p-5 text-ap-ink no-underline"
    >
      <span className="font-serif text-lg font-semibold">{title}</span>
      <span className="grid grid-cols-2 gap-3">
        {stats.map((s) => (
          <span key={s.label} className="flex min-w-0 flex-col gap-0.5">
            <span className="text-xs text-ap-muted">{s.label}</span>
            <span className="font-serif text-2xl font-semibold tabular-nums">
              {s.value === null && s.note ? s.note.split(" · ")[0] : fmt(s.unit, s.value)}
            </span>
            {s.note && s.value !== null && (
              <span className="text-[11px] leading-snug text-ap-muted">{s.note}</span>
            )}
            {s.note && s.value === null && (
              <span className="text-[11px] leading-snug text-ap-muted">
                {s.note.split(" · ").slice(1).join(" · ")}
              </span>
            )}
          </span>
        ))}
      </span>
      <span className="text-[13px] font-bold text-ap-plum">{link}</span>
    </a>
  );
}
