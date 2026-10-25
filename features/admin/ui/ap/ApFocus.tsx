"use client";

import { Fragment, useCallback, useState } from "react";

import { addDays } from "@features/admin/server/ap/days";
import { rangeLabel, type Grain } from "@features/admin/server/ap/filters";
import type {
  AssessmentRow,
  ChartColor,
  ChartSeries,
  FocusChart,
  FocusPayload,
  FunnelRow,
} from "@features/admin/server/ap/focus";
import {
  EMPTY,
  fmt,
  linearFit,
  quarterTop,
  type Tone,
  type Unit,
} from "@features/admin/server/ap/format";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";

import ApFilterBar from "./ApFilterBar";
import { Info, type Worked } from "./field-info";
import {
  bucketTitles,
  GapBands,
  gapSpans,
  IndexHover,
  isCutShort,
  periodTitle,
  type Tip,
} from "./hover";
import {
  Busy,
  Eyebrow,
  Failed,
  KpiTileV2,
  Loading,
  PageHeader,
  RangeLine,
  STANDING,
  STANDING_WORD,
  standingOf,
} from "./kit";
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
 * A series' trend as the design words it (Focus.dc.html, chart()): the least-squares line's
 * change over its start, "→ flat" when the line starts at nothing or doesn't move, grey under
 * 3%, else green or red by which way is good (down, for a cost).
 */
export function trendText(
  from: number,
  to: number,
  lowerBetter = false
): { text: string; tone: Tone } {
  const base = Math.abs(from) > 1e-9 ? Math.abs(from) : null;
  const change = base === null ? null : ((to - from) / base) * 100;
  if (change === null || Math.abs(to - from) < 1e-9) return { text: "→ flat", tone: "flat" };
  const up = change > 0;
  return {
    text: `${up ? "↗ +" : "↘ −"}${Math.abs(change).toFixed(0)}% trend`,
    tone: Math.abs(change) < 3 ? "flat" : up !== lowerBetter ? "good" : "bad",
  };
}

function trendOf(s: ChartSeries): { text: string; tone: Tone } {
  const f = linearFit(s.values);
  if (!f) return { text: "", tone: "flat" };
  return trendText(f.from, f.to, Boolean(s.lowerBetter));
}

/** A series' decimals: its own where the design fixes them, else cents for euros and ratios. */
const digitsOf = (s: ChartSeries) =>
  s.digits ?? (s.unit === "eur" || s.unit === "ratio" ? 2 : undefined);

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

/** An axis top whose quarter lines read exactly as axisLabel writes them (never 12.5 as "13"). */
function axisTop(unit: Unit, v: number, wholeEuros: boolean): number {
  if (unit === "pct") {
    const t = quarterTop(v, 0.1);
    return t < 10 ? t : quarterTop(v, 1);
  }
  return quarterTop(v, (unit === "eur" && !wholeEuros) || unit === "ratio" ? 0.01 : 1);
}

/**
 * The x labels that fit a row `width` px wide without touching: the first (from the left
 * edge) and the last (to the right edge) always, one every so many points between (centred),
 * each at least 8px clear of the next.
 */
export function xTicks(labels: string[], width: number): number[] {
  const n = labels.length;
  if (n <= 1) return n ? [0] : [];
  // About 6.6px a character at 11px: never narrower than drawn.
  const w = (i: number) => labels[i]!.length * 6.6;
  const widest = Math.max(...labels.map((_, i) => w(i)));
  // No room for both ends: the last alone.
  if (w(0) + w(n - 1) + 8 > width) return [n - 1];
  const px = (i: number) => (i / (n - 1)) * width;
  // Far enough apart for two centred labels, and for the first (it reaches right of its x).
  const step = Math.max(1, Math.ceil(((1.5 * widest + 8) / width) * (n - 1)));
  const out = [0];
  for (let i = step; i < n - 1; i += step) {
    // Clear of the last label, which reaches left of its x.
    if (px(i) + w(i) / 2 + 8 <= width - w(n - 1)) out.push(i);
  }
  out.push(n - 1);
  return out;
}

/** A box's width in px as it is drawn, kept up to date; `fallback` until measured. */
function useWidth(fallback: number) {
  const [width, setWidth] = useState(0);
  const ref = useCallback((el: HTMLElement | null) => {
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setWidth(e!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width || fallback] as const;
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

function ChartCard({ chart, range }: { chart: FocusChart; range: { from: string; to: string } }) {
  const allowed = GRAINS.filter((g) => !chart.grains || chart.grains.includes(g.value));
  const [grain, setGrain] = useState<Grain>(chart.grains?.[0] ?? "day");
  const [tickRow, tickWidth] = useWidth(chart.wide ? 900 : 420);
  const id = `h-chart-${chart.key}`;
  const view = chart.views[grain];
  // Each grouping has its own days (Daily the range, Weekly 15 weeks, Monthly from May 2026),
  // so its own blank and note; a view without them takes the chart's.
  const blockedOf = (g: Grain) => {
    const v = chart.views[g];
    return v.blocked !== undefined ? v.blocked : chart.blocked;
  };
  const blocked = blockedOf(grain);
  const note = view.note !== undefined ? view.note : (chart.note ?? null);
  // The design draws the grouping on every chart, a monthly-only one too (its one option).
  const pickable = allowed.some((g) => !blockedOf(g.value));
  // Its days, where they aren't the range the filter bar shows.
  const span =
    view.window && (view.window.from !== range.from || view.window.to !== range.to)
      ? rangeLabel(view.window.from, view.window.to)
      : undefined;
  const days = span ? ` · ${span}` : "";
  const n = view.labels.length;
  const left = view.series.filter((s) => s.axis === "left");
  const right = view.series.filter((s) => s.axis === "right");
  const lUnit = left[0]?.unit ?? "count";
  const rUnit = right[0]?.unit ?? "eur";
  // Euros beside a rate are whole, as drawn on the unlock charts.
  const wholeEuros = rUnit === "eur" && lUnit === "pct";
  // The design's tops: 10% over the highest point, or the floor (a completion rate's 100%),
  // rounded up so every quarter line lands on a figure its label writes exactly.
  const lTop = axisTop(
    lUnit,
    chart.leftMin !== undefined
      ? Math.max(chart.leftMin * per(lUnit), ...finite(left))
      : Math.max(0, ...finite(left)) * 1.1,
    false
  );
  const rTop = right.length ? axisTop(rUnit, Math.max(0, ...finite(right)) * 1.1, wholeEuros) : 1;
  const topOf = (s: ChartSeries) => (s.axis === "right" ? rTop : lTop);
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * 100 : 50);
  /** Height from the bottom in %, inside the axis. */
  const h = (s: ChartSeries, v: number) =>
    (Math.max(0, Math.min(v * per(s.unit), topOf(s))) / topOf(s)) * 100;
  const axisColor = (side: ChartSeries[]) => (side.length === 1 ? COLOR[side[0]!.color] : MUTED);
  const xs = view.labels.map((_, i) => x(i));
  const gaps = gapSpans(
    view.series.map((s) => s.values),
    xs,
    view.labels.map((l) => (grain === "week" ? `the week of ${l}` : l))
  );
  const noun = { day: "day", week: "week", month: "month" }[grain];
  const has = (i: number) =>
    view.series.some((s) => s.values[i] !== null && Number.isFinite(s.values[i]!));
  // The chart's note says why the points before its first figure (or all, with none) are
  // missing; a later empty point is just one without a figure.
  const first = view.labels.findIndex((_, i) => has(i));
  const tipAt = (i: number): Tip => {
    const period = view.periods?.[i];
    const empty = !has(i);
    return {
      title: period
        ? periodTitle(period, isCutShort(period, grain))
        : grain === "week"
          ? `Week of ${view.labels[i]}`
          : view.labels[i]!,
      rows: view.series.map((s) => {
        const v = s.values[i];
        const has = v !== null && v !== undefined && Number.isFinite(v);
        return {
          label: s.name,
          value: has ? fmt(s.unit, v, digitsOf(s)) : EMPTY,
          color: COLOR[s.color],
          mark: s.dotted ? ("dotted" as const) : ("line" as const),
          muted: !has,
        };
      }),
      note: empty ? ((first < 0 || i < first) && note) || `No figure for this ${noun}.` : null,
    };
  };
  const marginRight = right.length ? 52 : 12;
  const height = chart.wide ? 280 : 220;
  const tickLabels = view.labels.map((l) => (grain === "week" ? `Wk ${l}` : l));

  return (
    <section
      aria-labelledby={id}
      className="flex min-w-0 flex-col gap-3.5 rounded-[20px] border border-ap-line bg-white p-5 shadow-ap sm:px-6 sm:py-[22px]"
      style={chart.wide ? { gridColumn: "1 / -1" } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          {/* The icon beside the heading, not in it: the card is named by the title alone. */}
          <div className="flex items-center gap-1">
            <h2 id={id} className="m-0 font-serif text-xl font-semibold text-ap-ink">
              {chart.title}
            </h2>
            {chart.info && <Info k={chart.info} label={chart.title} />}
          </div>
          <span className="text-[13px] text-ap-muted">
            {chart.sub[grain]}
            {days}
            {blocked ? "" : " · thin dashed lines show the linear trend"}
          </span>
        </div>
        {pickable && (
          <label className="flex-none">
            <span className="sr-only">Group {chart.title} by</span>
            <select
              value={grain}
              onChange={(e) => setGrain(GRAINS.find((g) => g.value === e.target.value)!.value)}
              className="min-h-9 rounded-lg border border-ap-ink/[0.18] bg-white px-2.5 font-sans text-[13px] font-semibold text-ap-ink"
            >
              {allowed.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {blocked ? (
        // In the chart's place: it fills the card, so a row's taller neighbour leaves no hole.
        <p className="m-0 flex flex-1 items-center justify-center rounded-[14px] bg-ap-ground px-6 py-8 text-center text-[13px] leading-relaxed text-ap-muted">
          {blocked}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-[22px] gap-y-2.5">
            {view.series.map((s) => {
              const t = trendOf(s);
              const figure = fmt(s.unit, s.total, digitsOf(s));
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
                    {s.info && (
                      <Info
                        k={s.info}
                        label={s.name}
                        worked={
                          s.total === null
                            ? undefined
                            : {
                                ...s.worked,
                                value: figure,
                                // The days the figure covers, where they aren't the range's own.
                                ...(s.span && (s.span.from !== range.from || s.span.to !== range.to)
                                  ? { span: s.span }
                                  : {}),
                              }
                        }
                      />
                    )}
                  </span>
                  <span className="flex items-baseline gap-2">
                    <span
                      className={`font-serif text-[22px] font-semibold tabular-nums ${s.color === "green" ? "text-ap-good" : "text-ap-ink"}`}
                    >
                      {figure}
                    </span>
                    <span className={`whitespace-nowrap text-xs font-bold ${TONE_TEXT[t.tone]}`}>
                      {t.text}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
          {/* The figures behind the lines, for a screen reader; the drawing itself is hidden. */}
          {/* In a hidden box: a table sizes to its content whatever width it is given. */}
          <div className="sr-only">
            <table>
              <caption>{chart.title}</caption>
              <thead>
                <tr>
                  <th scope="col">Period</th>
                  {view.series.map((s) => (
                    <th key={s.name} scope="col">
                      {s.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.labels.map((label, i) => (
                  <tr key={`${label}-${i}`}>
                    <th scope="row">{label}</th>
                    {view.series.map((s) => (
                      <td key={s.name}>{fmt(s.unit, s.values[i] ?? null, digitsOf(s))}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div
            className="relative mt-2 border-b border-ap-line"
            style={{ height, marginLeft: 48, marginRight }}
          >
            <div aria-hidden="true" className="absolute inset-0">
              <GapBands spans={gaps} />
              {QUARTERS.map((f) => (
                <Fragment key={f}>
                  <span
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
                  // Over the points that have a figure only: never across a stretch without.
                  const f = linearFit(s.values);
                  if (!f) return null;
                  const y = (v: number) => (100 - h(s, v)).toFixed(2);
                  return (
                    <polyline
                      key={`${s.name}-trend`}
                      data-trend={s.name}
                      points={`${x(f.i0).toFixed(2)},${y(f.from)} ${x(f.i1).toFixed(2)},${y(f.to)}`}
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
            <IndexHover
              xs={xs}
              label={chart.title}
              tip={tipAt}
              markers={(i) =>
                view.series.flatMap((s) => {
                  const v = s.values[i];
                  return v === null || v === undefined || !Number.isFinite(v)
                    ? []
                    : [{ y: h(s, v), color: COLOR[s.color] }];
                })
              }
            />
          </div>
          <div
            ref={tickRow}
            aria-hidden="true"
            data-ap-ticks=""
            className="relative h-4"
            style={{ marginLeft: 48, marginRight }}
          >
            {xTicks(tickLabels, tickWidth).map((i) => (
              <span
                key={i}
                className="absolute whitespace-nowrap text-[11px] text-ap-muted"
                style={{
                  left: `${x(i)}%`,
                  transform: `translateX(${n === 1 ? "-50%" : i === 0 ? "0" : i === n - 1 ? "-100%" : "-50%"})`,
                }}
              >
                {tickLabels[i]}
              </span>
            ))}
          </div>
          {note && <p className="m-0 text-xs leading-relaxed text-ap-muted">{note}</p>}
        </>
      )}
    </section>
  );
}

/** "14:01", "2:56": whole seconds, as agreed on the 21 Oct 2026 call (the board's "2.8 min"). */
const minutes = (ms: number | null) => fmt("mmss", ms);

const ASM_COLUMNS = "minmax(180px, 1.5fr) repeat(7, minmax(96px, 1fr)) minmax(170px, 1.4fr)";

/** The row's submissions per day, its fitted line dashed, and the change the line makes. */
function TrendCell({ row, from: first }: { row: AssessmentRow; from: string }) {
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
  const t = trendText(from, to);
  const xs = values.map((_, i) => (k > 1 ? (i / (k - 1)) * 100 : 50));
  return (
    <span role="cell" className="flex flex-col justify-center gap-0.5 px-3.5 py-2">
      <span className="relative block h-[30px]">
        <svg
          viewBox="0 0 120 32"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="absolute inset-0 h-full w-full overflow-visible"
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
        <IndexHover
          xs={xs}
          label={`${row.label}, survey submissions per day`}
          tip={(i) => ({
            title: periodTitle({ from: addDays(first, i), to: addDays(first, i) }),
            rows: [
              {
                label: "Survey submissions",
                value: fmt("count", values[i] ?? null),
                color: "#795fc8",
                mark: "line",
              },
            ],
          })}
          markers={(i) => [
            {
              y: ((32 - Number(Y(values[i] ?? 0))) / 32) * 100,
              color: "#795fc8",
            },
          ]}
        />
      </span>
      <span className={`text-[11px] font-bold ${TONE_TEXT[t.tone]}`}>
        {t.text} · {fmt("count", from)} → {fmt("count", to)} / day
      </span>
    </span>
  );
}

/** "€6.99 ÷ 435 = €0.02": a figure's parts as its info card shows them, once it has a value. */
function worked(value: string, num?: string, den?: string): Worked | undefined {
  if (value === EMPTY) return undefined;
  return num !== undefined && den !== undefined && num !== EMPTY && den !== EMPTY
    ? { num, den, value }
    : { value };
}

function Assessments({ a, from }: { a: FocusPayload["assessments"]; from: string }) {
  const live = a.rows.find((r) => r.live);
  const eur2 = (v: number | null | undefined) => fmt("eur", v ?? null, 2);
  const count = (v: number | null | undefined) => fmt("count", v ?? null);
  const surveyTime = minutes(a.survey.valueMs);
  const reportTime = minutes(a.report.valueMs);
  const tiles = [
    {
      label: "Best performing assessment",
      k: "focus.best",
      value: a.best?.label ?? EMPTY,
      sub: a.best?.sub ?? "No assessment is live under these filters.",
      best: true,
      worked: live
        ? worked(eur2(live.revPerSub), eur2(live.revenue), count(live.submissions))
        : undefined,
    },
    {
      label: "NPS · Assessment A",
      k: "focus.nps",
      value: EMPTY,
      sub: a.nps.sub,
      best: false,
      // No NPS is asked yet: its card shows "—", and the line under it is the chapter ratings'.
      worked: { value: EMPTY },
    },
    {
      label: "Median survey time · A",
      k: "focus.survey-time",
      value: surveyTime,
      sub: a.survey.sub,
      best: false,
      worked: worked(surveyTime),
    },
    {
      label: "Median report time · A",
      k: "focus.report-time",
      value: reportTime,
      sub: a.report.sub,
      best: false,
      worked: worked(reportTime),
    },
  ];
  const head: Array<{ label: string; left: boolean; k?: string; worked?: Worked }> = [
    { label: "Assessment", left: true },
    { label: "NPS", left: false, k: "focus.nps", worked: tiles[1]!.worked },
    {
      label: "Median survey time",
      left: false,
      k: "focus.survey-time",
      worked: worked(surveyTime),
    },
    {
      label: "Median report time",
      left: false,
      k: "focus.report-time",
      worked: worked(reportTime),
    },
    {
      label: "Submissions",
      left: false,
      k: "focus.subs",
      worked: live ? worked(count(live.submissions)) : undefined,
    },
    {
      label: "Paid CVR",
      left: false,
      k: "focus.paid-cvr",
      worked: live
        ? worked(fmt("pct", live.paidCvr, 2), count(live.paid), count(live.submissions))
        : undefined,
    },
    {
      label: "Rev. / submission",
      left: false,
      k: "focus.rev-per-sub",
      worked: live
        ? worked(eur2(live.revPerSub), eur2(live.revenue), count(live.submissions))
        : undefined,
    },
    {
      label: "Cost / submission",
      left: false,
      k: "focus.cost-per-sub",
      worked: live
        ? worked(eur2(live.costPerSub), eur2(live.spend), count(live.submissions))
        : undefined,
    },
    { label: a.trendLabel, left: true, k: "focus.asm-trend" },
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
            <Eyebrow>
              {t.label}
              <Info k={t.k} label={t.label} worked={t.worked} />
            </Eyebrow>
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
            {head.map((h) => (
              <span
                key={h.label}
                role="columnheader"
                className={`px-3.5 py-2.5 text-[11px] font-bold uppercase leading-[1.3] tracking-[0.06em] text-ap-muted ${h.left ? "text-left" : "text-right"}`}
              >
                {h.label}
                {h.k && <Info k={h.k} label={h.label} worked={h.worked} />}
              </span>
            ))}
          </div>
          {a.rows.map((r) => {
            const cells: Array<{ v: string; sub?: string; bold?: boolean }> = [
              { v: EMPTY, sub: r.live ? "not asked yet" : "" },
              { v: minutes(r.surveyMedianMs), sub: r.live ? "live" : "" },
              { v: minutes(r.reportMedianMs), sub: r.reportSub },
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
                <TrendCell row={r} from={from} />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// Nine figures and the funnel's name fit a 1440px screen beside the menu without scrolling.
const FC_COLUMNS = "minmax(190px, 1.6fr) repeat(8, minmax(88px, 1fr)) minmax(124px, 1.1fr)";

/** "0.01×", as the design writes ROAS. */
const times = (v: number | null) => (v === null ? EMPTY : `${fmt("ratio", v, 2)}×`);

/**
 * The design's funnel comparison: the free survey against pay to start, per visitor and per
 * euro of ad spend, with the Pay to start page's own figures (so the two pages agree). The
 * column cards work out the free survey's row, the reference.
 */
function Funnels({ f }: { f: FocusPayload["funnels"] }) {
  const live = f.rows.find((r) => r.key === "after");
  const n = (v: number | null) => fmt("count", v);
  const eur = (v: number | null, digits: number) => fmt("eur", v, digits);
  // As drawn: the running funnels' best green and worst red, where higher (or lower) is better.
  const cols: Array<{
    label: string;
    k: string;
    cell: (r: FunnelRow) => string;
    value?: (r: FunnelRow) => number | null;
    better?: "high" | "low";
  }> = [
    { label: "Visitors", k: "focus.fc-visitors", cell: (r) => n(r.visitors) },
    { label: "Ad spend", k: "focus.fc-spend", cell: (r) => eur(r.spend, 0) },
    {
      label: "Paying customers",
      k: "focus.fc-paying",
      cell: (r) => n(r.paying),
      value: (r) => r.paying,
      better: "high",
    },
    {
      label: "Visitor → paid",
      k: "focus.fc-v2p",
      cell: (r) => fmt("pct", r.v2p, 2),
      value: (r) => r.v2p,
      better: "high",
    },
    {
      label: "Revenue / visitor",
      k: "focus.fc-rpv",
      cell: (r) => eur(r.rpv, 3),
      value: (r) => r.rpv,
      better: "high",
    },
    {
      label: "Cost / paying customer",
      k: "focus.fc-cpp",
      cell: (r) => eur(r.cpp, 2),
      value: (r) => r.cpp,
      better: "low",
    },
    {
      label: "ROAS",
      k: "focus.fc-roas",
      cell: (r) => times(r.roas),
      value: (r) => r.roas,
      better: "high",
    },
    {
      label: "Refund rate",
      k: "focus.fc-refund",
      cell: (r) => fmt("pct", r.refundRate, 1),
      value: (r) => r.refundRate,
      better: "low",
    },
  ];
  const running = f.rows.filter((r) => r.live);
  // Each column's card shows the free survey's figures, the one live row.
  const parts: Record<string, [string, string] | undefined> = live
    ? {
        "focus.fc-v2p": [n(live.paying), n(live.visitors)],
        "focus.fc-rpv": [eur(live.revenue, 2), n(live.visitors)],
        "focus.fc-cpp": [eur(live.spend, 2), n(live.paying)],
        "focus.fc-roas": [eur(live.revenue, 2), eur(live.spend, 2)],
        ...(live.refunds && {
          "focus.fc-refund": [n(live.refunds.refunded), n(live.refunds.payers)],
        }),
      }
    : {};
  return (
    <section
      id="funnels"
      aria-labelledby="h-funnels"
      className="flex scroll-mt-20 flex-col gap-[18px] rounded-[20px] border border-ap-line bg-white p-5 shadow-ap sm:p-6 lg:scroll-mt-6"
    >
      <div className="flex flex-col gap-1.5">
        <h2 id="h-funnels" className="m-0 font-serif text-2xl font-semibold text-ap-ink">
          Funnel comparison
        </h2>
        <p className="m-0 text-sm text-ap-muted">
          Free survey vs pay to start, compared per visitor and per euro of ad spend. Step rates are
          not comparable because payment happens at a different point.
        </p>
      </div>
      {/* `relative`: the cells' sr-only words are placed absolutely, and without a placed box
          to hold them they widen the page on a phone. */}
      <div
        tabIndex={0}
        role="region"
        aria-label="Funnel comparison, scrolls sideways"
        className="relative overflow-x-auto rounded-[14px] border border-ap-line"
      >
        <div role="table" aria-label="Funnel comparison" className="min-w-[1030px]">
          <div role="row" className="grid bg-ap-ground" style={{ gridTemplateColumns: FC_COLUMNS }}>
            <span
              role="columnheader"
              className="px-3 py-2.5 text-left text-[11px] font-bold uppercase leading-[1.3] tracking-[0.06em] text-ap-muted"
            >
              Funnel
            </span>
            {cols.map((c) => {
              const value = live ? c.cell(live) : EMPTY;
              const [num, den] = parts[c.k] ?? [];
              return (
                <span
                  key={c.label}
                  role="columnheader"
                  className="px-3 py-2.5 text-right text-[11px] font-bold uppercase leading-[1.3] tracking-[0.06em] text-ap-muted"
                >
                  {c.label}
                  <Info k={c.k} label={c.label} worked={worked(value, num, den)} />
                </span>
              );
            })}
            <span
              role="columnheader"
              className="px-3 py-2.5 text-left text-[11px] font-bold uppercase leading-[1.3] tracking-[0.06em] text-ap-muted"
            >
              Valid yet
            </span>
          </div>
          {f.rows.map((r) => (
            <div
              key={r.key}
              role="row"
              className="grid items-stretch border-t border-ap-line"
              style={{ gridTemplateColumns: FC_COLUMNS }}
            >
              <span
                role="rowheader"
                className={`flex flex-col justify-center gap-0.5 px-3 py-2.5 text-[13px] font-bold ${r.live ? "text-ap-ink" : "text-ap-muted"}`}
              >
                {r.label}
                <span className="text-[11px] font-medium text-ap-muted">{r.sub}</span>
              </span>
              {cols.map((c) => {
                const tone =
                  r.live && c.value
                    ? standingOf(running.map(c.value), c.value(r), c.better)
                    : "plain";
                return (
                  <span
                    key={c.label}
                    role="cell"
                    title={tone === "plain" ? undefined : STANDING_WORD[tone]}
                    className={`flex flex-col justify-center px-3 py-2.5 text-right text-[13px] font-medium tabular-nums ${STANDING[tone]}`}
                  >
                    {c.cell(r)}
                    {tone !== "plain" && <span className="sr-only"> ({STANDING_WORD[tone]})</span>}
                  </span>
                );
              })}
              <span
                role="cell"
                className={`flex flex-col justify-center px-3 py-2.5 text-[13px] font-bold ${r.live ? "text-ap-ink" : "text-ap-muted"}`}
              >
                {r.valid}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <p className="m-0 text-xs leading-relaxed text-ap-muted">
          The Pay to start page&apos;s figures for this range, all traffic: step by step and week by
          week there. Green is the best of the running funnels in a column, red the worst. Valid
          yet: enough paying customers for a 95% read against the free survey.
        </p>
        {f.notes.map((x) => (
          <p key={x} className="m-0 text-xs leading-relaxed text-ap-muted">
            {x}
          </p>
        ))}
      </div>
    </section>
  );
}

/** The headline tiles' info cards, and the whole euros the design writes for money. */
const TILE_INFO: Record<string, { k: string; digits?: number }> = {
  revenue: { k: "focus.revenue", digits: 0 },
  spend: { k: "focus.spend", digits: 0 },
  "new-users": { k: "focus.new-users" },
};

/**
 * Dashboard, as Marcus drew it (16 Oct 2026, synced 21 Oct): three tiles, the funnel comparison,
 * six charts, the assessments.
 */
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
            {data.tiles.map((t) => {
              const i = TILE_INFO[t.key];
              return (
                <KpiTileV2
                  key={t.key}
                  tile={t}
                  digits={i?.digits}
                  titles={bucketTitles(data.range.from, data.range.to)}
                  info={
                    i && {
                      k: i.k,
                      worked: t.blocked ? undefined : worked(fmt(t.unit, t.value, i.digits)),
                      trend: { route: "focus", tile: t.key, unit: t.unit, digits: i.digits },
                    }
                  }
                />
              );
            })}
          </div>
          <Funnels f={data.funnels} />
          <div
            className="grid gap-5"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(520px, 100%), 1fr))" }}
          >
            {data.charts.map((c) => (
              <ChartCard key={c.key} chart={c} range={data.range} />
            ))}
          </div>
          <Assessments a={data.assessments} from={data.range.from} />
        </Busy>
      )}
    </>
  );
}
