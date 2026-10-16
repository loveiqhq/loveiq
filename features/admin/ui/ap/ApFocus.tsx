"use client";

import { Fragment, useState } from "react";

import type { Grain } from "@features/admin/server/ap/filters";
import type {
  AssessmentRow,
  ChartColor,
  ChartSeries,
  FocusChart,
  FocusPayload,
} from "@features/admin/server/ap/focus";
import {
  EMPTY,
  fmt,
  linearFit,
  niceMax,
  type Tone,
  type Unit,
} from "@features/admin/server/ap/format";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";

import ApFilterBar from "./ApFilterBar";
import { Busy, Eyebrow, Failed, KpiTileV2, Loading, PageHeader, RangeLine } from "./kit";
import { useApFilters } from "./useApFilters";

const COLOR: Record<ChartColor, string> = { purple: "#795fc8", ink: "#161021", green: "#2e7d5b" };
const MUTED = "#6b6678";
const TONE_TEXT: Record<Tone, string> = {
  good: "text-ap-good",
  bad: "text-ap-bad",
  flat: "text-ap-muted",
};
const GRAINS: Array<{ value: Grain; label: string }> = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
];
const QUARTERS = [0, 0.25, 0.5, 0.75, 1];

/**
 * A series' trend as the design words it: the least-squares line's change over the range,
 * grey under 3%, else green or red by which way is good (down, for a cost).
 */
function trendOf(s: ChartSeries): { text: string; tone: Tone } {
  const f = linearFit(s.values);
  if (!f) return { text: "", tone: "flat" };
  const base = Math.abs(f.from) > 1e-9 ? Math.abs(f.from) : null;
  if (base === null || Math.abs(f.to - f.from) < 1e-9) return { text: "→ flat", tone: "flat" };
  const change = ((f.to - f.from) / base) * 100;
  const up = change > 0;
  return {
    text: `${up ? "↗ +" : "↘ −"}${Math.abs(change).toFixed(0)}% trend`,
    tone: Math.abs(change) < 3 ? "flat" : up !== Boolean(s.lowerBetter) ? "good" : "bad",
  };
}

/** A rate is scaled in percent, as the design draws it (an empty rate axis tops at 1%, not 100%). */
const per = (u: Unit) => (u === "pct" ? 100 : 1);

function finite(series: ChartSeries[]): number[] {
  return series.flatMap((s) =>
    s.values
      .filter((v): v is number => v !== null && Number.isFinite(v))
      .map((v) => v * per(s.unit))
  );
}

/** An axis label: counts whole, rates as drawn (a tenth under 10%), euros with cents. */
function axisLabel(unit: Unit, v: number, top: number, wholeEuros: boolean): string {
  if (unit === "pct") return `${v.toFixed(top < 10 ? 1 : 0)}%`;
  if (unit === "eur") return fmt("eur", v, wholeEuros ? 0 : 2);
  if (unit === "ratio") return fmt("ratio", v, 2);
  return fmt("count", v);
}

/** The polyline's runs: a null breaks the line, and a lone point is drawn as a dot. */
function runs(values: Array<number | null>, at: (i: number, v: number) => string): string[] {
  const out: string[][] = [[]];
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) out.push([]);
    else out[out.length - 1]!.push(at(i, v));
  });
  return out.filter((r) => r.length).map((r) => (r.length === 1 ? `${r[0]} ${r[0]}` : r.join(" ")));
}

function ChartCard({ chart }: { chart: FocusChart }) {
  const [grain, setGrain] = useState<Grain>("day");
  const id = `h-chart-${chart.key}`;
  const view = chart.views[grain];
  const n = view.labels.length;
  const left = view.series.filter((s) => s.axis === "left");
  const right = view.series.filter((s) => s.axis === "right");
  const lUnit = left[0]?.unit ?? "count";
  const rUnit = right[0]?.unit ?? "eur";
  // Euros beside a rate are whole, as drawn on the unlock charts.
  const wholeEuros = rUnit === "eur" && lUnit === "pct";
  // The design's tops: 10% over the highest point, or the floor (a completion rate's 100%).
  // An axis of whole numbers tops at 4 at least, so no two of its quarter lines read the same.
  const lTop = Math.max(
    lUnit === "count" ? 4 : 0,
    chart.leftMin !== undefined
      ? niceMax(Math.max(chart.leftMin * per(lUnit), ...finite(left)))
      : niceMax(Math.max(0, ...finite(left)) * 1.1)
  );
  const rTop = right.length
    ? Math.max(
        rUnit === "count" || wholeEuros ? 4 : 0,
        niceMax(Math.max(0, ...finite(right)) * 1.1)
      )
    : 1;
  const topOf = (s: ChartSeries) => (s.axis === "right" ? rTop : lTop);
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * 100 : 50);
  /** Height from the bottom in %, inside the axis. */
  const h = (s: ChartSeries, v: number) =>
    (Math.max(0, Math.min(v * per(s.unit), topOf(s))) / topOf(s)) * 100;
  const axisColor = (side: ChartSeries[]) => (side.length === 1 ? COLOR[side[0]!.color] : MUTED);
  const marginRight = right.length ? 52 : 12;
  const height = chart.wide ? 280 : 220;
  // About seven labels (three on a phone), the last one always; one too close to it gives way.
  const ticks = (count: number) => {
    const step = Math.max(1, Math.ceil(n / count));
    return view.labels
      .map((label, i) => ({ label, i }))
      .filter(({ i }) => i % step === 0 || i === n - 1)
      .filter(({ i }, k) => i === n - 1 || n - 1 - i >= step * 0.6 || k === 0);
  };

  return (
    <section
      aria-labelledby={id}
      className="flex min-w-0 flex-col gap-3.5 rounded-[20px] border border-ap-line bg-white p-5 shadow-ap sm:px-6 sm:py-[22px]"
      style={chart.wide ? { gridColumn: "1 / -1" } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={id} className="m-0 font-serif text-xl font-semibold text-ap-ink">
            {chart.title}
          </h2>
          <span className="text-[13px] text-ap-muted">
            {chart.sub[grain]}
            {chart.blocked ? "" : " · thin dashed lines show the linear trend"}
          </span>
        </div>
        {!chart.blocked && (
          <label className="flex-none">
            <span className="sr-only">Group {chart.title} by</span>
            <select
              value={grain}
              onChange={(e) => setGrain(GRAINS.find((g) => g.value === e.target.value)!.value)}
              className="min-h-9 rounded-lg border border-ap-ink/[0.18] bg-white px-2.5 font-sans text-[13px] font-semibold text-ap-ink"
            >
              {GRAINS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {chart.blocked ? (
        // In the chart's place: it fills the card, so a row's taller neighbour leaves no hole.
        <p className="m-0 flex flex-1 items-center justify-center rounded-[14px] bg-ap-ground px-6 py-8 text-center text-[13px] leading-relaxed text-ap-muted">
          {chart.blocked}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-[22px] gap-y-2.5">
            {view.series.map((s) => {
              const t = trendOf(s);
              return (
                <div key={s.name} className="flex flex-col gap-0.5">
                  <span className="inline-flex items-center gap-1.5 text-xs text-ap-body">
                    <span
                      aria-hidden="true"
                      className="h-0 w-[18px] border-t-[3px]"
                      style={{
                        borderTopStyle: s.dotted ? "dotted" : "solid",
                        borderTopColor: COLOR[s.color],
                      }}
                    />
                    {s.name}
                  </span>
                  <span className="flex items-baseline gap-2">
                    <span
                      className={`font-serif text-[22px] font-semibold tabular-nums ${s.color === "green" ? "text-ap-good" : "text-ap-ink"}`}
                    >
                      {fmt(s.unit, s.total, s.unit === "eur" || s.unit === "ratio" ? 2 : undefined)}
                    </span>
                    <span className={`whitespace-nowrap text-xs font-bold ${TONE_TEXT[t.tone]}`}>
                      {t.text}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
          <div
            className="relative mt-2 border-b border-ap-line"
            style={{ height, marginLeft: 48, marginRight }}
          >
            {QUARTERS.map((f) => (
              <Fragment key={f}>
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 border-t border-ap-track"
                  style={{ bottom: `${f * 100}%` }}
                />
                <span
                  className="absolute -left-12 w-[42px] translate-y-1/2 text-right text-[11px] tabular-nums"
                  style={{ bottom: `${f * 100}%`, color: axisColor(left) }}
                >
                  {axisLabel(lUnit, f * lTop, lTop, false)}
                </span>
                {right.length > 0 && (
                  <span
                    className="absolute left-full ml-1.5 translate-y-1/2 whitespace-nowrap text-[11px] tabular-nums"
                    style={{ bottom: `${f * 100}%`, color: axisColor(right) }}
                  >
                    {axisLabel(rUnit, f * rTop, rTop, wholeEuros)}
                  </span>
                )}
              </Fragment>
            ))}
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
              className="absolute inset-0 h-full w-full overflow-visible"
            >
              {view.series.map((s, k) =>
                runs(s.values, (i, v) => `${x(i).toFixed(2)},${(100 - h(s, v)).toFixed(2)}`).map(
                  (points, r) => (
                    <polyline
                      key={`${s.name}-${r}`}
                      data-series={s.name}
                      points={points}
                      fill="none"
                      stroke={COLOR[s.color]}
                      strokeWidth={chart.wide && k === 0 ? 2.8 : 2.4}
                      strokeDasharray={s.dotted ? "2 5" : undefined}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  )
                )
              )}
              {view.series.map((s) => {
                const f = linearFit(s.values);
                if (!f) return null;
                const y = (v: number) => (100 - h(s, v)).toFixed(2);
                return (
                  <polyline
                    key={`${s.name}-trend`}
                    data-trend={s.name}
                    points={`${x(0).toFixed(2)},${y(f.from)} ${x(n - 1).toFixed(2)},${y(f.to)}`}
                    fill="none"
                    stroke={COLOR[s.color]}
                    strokeWidth={1.6}
                    strokeDasharray="7 5"
                    strokeOpacity={0.55}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
            </svg>
            {view.series.map((s) => {
              const last = s.values.findLastIndex((v) => v !== null && Number.isFinite(v));
              if (last < 0) return null;
              return (
                <span
                  key={`${s.name}-end`}
                  aria-hidden="true"
                  className="absolute -mb-1 -ml-1 h-2 w-2 rounded-full shadow-[0_0_0_2px_#ffffff]"
                  style={{
                    left: `${x(last)}%`,
                    bottom: `${h(s, s.values[last]!)}%`,
                    background: COLOR[s.color],
                  }}
                />
              );
            })}
          </div>
          <div className="relative h-4" style={{ marginLeft: 48, marginRight }}>
            {[
              { list: ticks(7), only: "max-sm:hidden" },
              { list: ticks(3), only: "sm:hidden" },
            ].map(({ list, only }) =>
              list.map(({ label, i }) => (
                <span
                  key={`${only}-${i}`}
                  className={`absolute whitespace-nowrap text-[11px] text-ap-muted ${only}`}
                  style={{
                    left: `${x(i)}%`,
                    transform: `translateX(${n === 1 ? "-50%" : i === 0 ? "0" : i === n - 1 ? "-100%" : "-50%"})`,
                  }}
                >
                  {grain === "week" ? `Wk ${label}` : label}
                </span>
              ))
            )}
          </div>
        </>
      )}
    </section>
  );
}

/** "14 min", "2.8 min", as the design writes a median time. */
const minutes = (ms: number | null, digits: number) =>
  ms === null ? EMPTY : fmt("min", ms / 60_000, digits);

const ASM_COLUMNS = "minmax(180px, 1.5fr) repeat(7, minmax(96px, 1fr)) minmax(170px, 1.4fr)";

/** The row's submissions per day, its fitted line dashed, and the change the line makes. */
function TrendCell({ row }: { row: AssessmentRow }) {
  if (!row.trend) {
    return (
      <span
        role="cell"
        className="flex items-center px-3.5 py-2 text-[11px] font-bold text-ap-muted"
      >
        {row.live ? EMPTY : "not live"}
      </span>
    );
  }
  const { values, from, to } = row.trend;
  const k = values.length;
  const top = Math.max(...values) || 1;
  const X = (i: number) => (k > 1 ? (i / (k - 1)) * 120 : 60).toFixed(1);
  const Y = (v: number) => (30 - (Math.max(0, Math.min(v, top)) / top) * 28).toFixed(1);
  const change = from ? ((to - from) / Math.abs(from)) * 100 : 0;
  const tone: Tone = Math.abs(change) < 3 ? "flat" : change > 0 ? "good" : "bad";
  return (
    <span role="cell" className="flex flex-col justify-center gap-0.5 px-3.5 py-2">
      <svg
        viewBox="0 0 120 32"
        preserveAspectRatio="none"
        aria-hidden="true"
        className="h-[30px] w-full overflow-visible"
      >
        <polyline
          points={values.map((v, i) => `${X(i)},${Y(v)}`).join(" ")}
          fill="none"
          stroke="#795fc8"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points={`${X(0)},${Y(from)} ${X(k - 1)},${Y(to)}`}
          fill="none"
          stroke="#795fc8"
          strokeWidth={1.4}
          strokeDasharray="6 4"
          strokeOpacity={0.6}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className={`text-[11px] font-bold ${TONE_TEXT[tone]}`}>
        {change >= 0 ? "↗ +" : "↘ −"}
        {Math.abs(change).toFixed(0)}% trend · {fmt("count", from)} → {fmt("count", to)} / day
      </span>
    </span>
  );
}

function Assessments({ a }: { a: FocusPayload["assessments"] }) {
  const tiles = [
    {
      label: "Best performing assessment",
      value: a.best?.label ?? EMPTY,
      sub: a.best?.sub ?? "No assessment is live under these filters.",
      best: true,
    },
    { label: "NPS · Assessment A", value: EMPTY, sub: a.nps.sub, best: false },
    {
      label: "Median survey time · A",
      value: minutes(a.survey.valueMs, 0),
      sub: a.survey.sub,
      best: false,
    },
    {
      label: "Median report time · A",
      value: minutes(a.report.valueMs, 1),
      sub: a.report.sub,
      best: false,
    },
  ];
  const head: Array<[string, boolean]> = [
    ["Assessment", true],
    ["NPS", false],
    ["Median survey time", false],
    ["Median report time", false],
    ["Submissions", false],
    ["Paid CVR", false],
    ["Rev. / submission", false],
    ["Cost / submission", false],
    [a.trendLabel, true],
  ];
  return (
    <section
      aria-labelledby="h-asm"
      className="flex flex-col gap-[18px] rounded-[20px] border border-ap-line bg-white p-5 shadow-ap sm:p-6"
    >
      <div className="flex flex-col gap-1.5">
        <h2 id="h-asm" className="m-0 font-serif text-2xl font-semibold text-ap-ink">
          Assessments
        </h2>
        <p className="m-0 text-sm text-ap-muted">
          How each assessment is received and how well it earns, ranked by revenue per submission.
        </p>
      </div>
      <div
        className="grid gap-3.5"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))" }}
      >
        {tiles.map((t) => (
          <div
            key={t.label}
            className={`flex flex-col gap-2 rounded-[20px] border px-[18px] py-4 ${t.best ? "border-ap-purple/25 bg-ap-purple/10" : "border-ap-line bg-white"}`}
          >
            <Eyebrow>{t.label}</Eyebrow>
            <span className="font-serif text-[28px] font-semibold leading-[1.1] tabular-nums text-ap-ink">
              {t.value}
            </span>
            <span className="text-[13px] text-ap-muted">{t.sub}</span>
          </div>
        ))}
      </div>
      <div
        tabIndex={0}
        role="region"
        aria-label="Assessments, scrolls sideways"
        className="overflow-x-auto rounded-[14px] border border-ap-line"
      >
        <div role="table" aria-label="Assessments" className="min-w-[1150px]">
          <div
            role="row"
            className="grid bg-ap-ground"
            style={{ gridTemplateColumns: ASM_COLUMNS }}
          >
            {head.map(([label, left]) => (
              <span
                key={label}
                role="columnheader"
                className={`px-3.5 py-2.5 text-[11px] font-bold uppercase leading-[1.3] tracking-[0.06em] text-ap-muted ${left ? "text-left" : "text-right"}`}
              >
                {label}
              </span>
            ))}
          </div>
          {a.rows.map((r) => {
            const cells: Array<{ v: string; sub?: string; bold?: boolean }> = [
              { v: EMPTY, sub: r.live ? "not asked yet" : "" },
              { v: minutes(r.surveyMedianMs, 0), sub: r.live ? "live" : "" },
              { v: minutes(r.reportMedianMs, 1), sub: r.reportSub },
              { v: fmt("count", r.submissions) },
              { v: fmt("pct", r.paidCvr, 2) },
              { v: fmt("eur", r.revPerSub, 2), bold: r.live },
              { v: fmt("eur", r.costPerSub, 2) },
            ];
            return (
              <div
                key={r.label}
                role="row"
                className="grid items-stretch border-t border-ap-line"
                style={{ gridTemplateColumns: ASM_COLUMNS }}
              >
                <span
                  role="rowheader"
                  className={`flex flex-col justify-center gap-px px-3.5 py-3 text-[13px] font-bold ${r.live ? "text-ap-ink" : "text-ap-muted"}`}
                >
                  {r.label}
                  <span className="text-[11px] font-medium text-ap-muted">{r.sub}</span>
                </span>
                {cells.map((c, i) => (
                  <span
                    key={i}
                    role="cell"
                    className={`flex flex-col justify-center gap-px px-3.5 py-3 text-right text-[13px] tabular-nums text-ap-ink ${c.bold ? "font-bold" : "font-medium"}`}
                  >
                    {c.v}
                    {c.sub ? (
                      <span className="text-[11px] font-medium text-ap-muted">{c.sub}</span>
                    ) : null}
                  </span>
                ))}
                <TrendCell row={r} />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** Dashboard, as Marcus drew it on 16 Oct 2026: three tiles, six charts, the assessments. */
export default function ApFocus() {
  const { params } = useApFilters();
  const { data, loading, error, refetch } = useAdminFetch<FocusPayload>(
    "/api/admin/ap/focus",
    params
  );
  return (
    <>
      <PageHeader
        crumbs={[]}
        title="Dashboard"
        description="The few numbers that decide whether LoveIQ works: submissions and what they cost and earn, the funnel rates, and how each assessment performs."
      />
      <ApFilterBar scope="overall" />
      {loading && !data && <Loading label="the dashboard" />}
      {error && <Failed message={error} onRetry={refetch} />}
      {data && (
        <Busy busy={loading}>
          <RangeLine data={data} />
          <div
            className="grid gap-3.5"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))" }}
          >
            {data.tiles.map((t) => (
              <KpiTileV2 key={t.key} tile={t} digits={t.unit === "eur" ? 0 : undefined} />
            ))}
          </div>
          <div
            className="grid gap-5"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(520px, 100%), 1fr))" }}
          >
            {data.charts.map((c) => (
              <ChartCard key={c.key} chart={c} />
            ))}
          </div>
          <Assessments a={data.assessments} />
        </Busy>
      )}
    </>
  );
}
