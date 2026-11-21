"use client";

import { fmt, quarterTop, tenths } from "@features/admin/server/ap/format";
import type { SheetFigures } from "@features/admin/server/ap/posthog";
import type { QuestionRow } from "@features/admin/server/ap/survey";
import type { SurveyPayload } from "@features/admin/server/ap/survey-page";

import { Info } from "./field-info";
import { IndexHover, type Tip } from "./hover";
import { AllTraffic, Card, Pills, SectionHead } from "./kit";
import { SHEET_NAMES, sheetBounce, sheetConversion, sheetSpots, type SheetSpot } from "./sheets";

/**
 * Marcus's "Time and drop-out per question" (Survey copy board, 10 Nov 2026): each question in
 * the order picked, its median time with the survey time so far drawn over it, and its drop-out
 * rate with those over 5% in orange. Both charts read the question funnel's own rows.
 */

/** The design's colours: a bar, a slow question's bar, the running line, a drop-out over 5%. */
const BAR = "#b9addf";
const SLOW_BAR = "#5a42a6";
const LINE = "#161021";
const OVER_BAR = "#fe6839";
/** A sheet's pin and its dashed line between two questions (Mark, 17 Nov 2026). */
const PIN = "#bf66d9";

/** "Well above average", as drawn: a median at least this many times the questions' average. */
const SLOW = 1.6;

/** The design's chapter groups under the charts: its own short names, by the id's chapter. */
export function chapterBand(id: string): string {
  if (id === "00000") return "Email";
  if (id === "00001") return "Name";
  const c = Number(id.slice(0, 2));
  if (c === 0) return "Intro";
  if (c <= 3) return "Desire & arousal";
  if (c <= 9) return "Attachment";
  if (c <= 11) return "Communication & power";
  if (c <= 14) return "Motivation";
  return c === 15 ? "About you" : "Goals & growth";
}

export interface ChartColumn {
  row: QuestionRow;
  band: string;
  /** Its median and every median before it in the order, added up: the survey time so far. */
  soFarMs: number;
  slow: boolean;
  /** Over 5% as its one-decimal figure reads: "5.0%" never is, "5.1%" always. */
  over: boolean;
  /** The sheets between this question and the next (Mark's numbered pins). */
  sheets: SheetSpot[];
}

/**
 * A drop-out over 5% as the reader sees it: its one-decimal figure above 5.0% ("5.1%" is, "5.0%"
 * isn't). The one rule for the chart here and for the question funnel's table.
 */
export const overFive = (rate: number | null) => rate !== null && tenths(rate) > 50;

export interface TimeDropChart {
  cols: ChartColumn[];
  /** Consecutive questions of one chapter group, for the bands under the charts. */
  bands: Array<{ label: string; count: number }>;
  /** The axes' tops, each with exact quarter lines: seconds, minutes so far, percent. */
  secTop: number;
  minTop: number;
  pctTop: number;
  /** Some question has a time; some question has a drop-out rate. */
  timed: boolean;
  rated: boolean;
}

/**
 * The two charts' figures from one order's funnel rows: the questions asked now, in that order
 * (one no longer asked has no place in it). A question with no time adds nothing to the time so
 * far; "well above average" is against the mean of the medians there are.
 */
export function timeDropChart(
  rows: QuestionRow[],
  /** Pin the sheets between the questions: only for a range that reaches them. */
  { sheets = false }: { sheets?: boolean } = {}
): TimeDropChart {
  const asked = rows.filter((r) => r.n > 0);
  const times = asked.flatMap((r) => (r.medianMs === null ? [] : [r.medianMs]));
  const rates = asked.flatMap((r) => (r.dropRate === null ? [] : [r.dropRate * 100]));
  const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
  let run = 0;
  const spots = sheets ? sheetSpots(rows) : [];
  const cols = asked.map((row, i) => {
    run += row.medianMs ?? 0;
    return {
      row,
      band: chapterBand(row.id),
      soFarMs: run,
      slow: row.medianMs !== null && avg > 0 && row.medianMs >= SLOW * avg,
      over: overFive(row.dropRate),
      sheets: spots.filter((s) => s.after === i),
    };
  });
  const bands: TimeDropChart["bands"] = [];
  for (const c of cols) {
    const last = bands[bands.length - 1];
    if (last && last.label === c.band) last.count++;
    else bands.push({ label: c.band, count: 1 });
  }
  return {
    cols,
    bands,
    secTop: quarterTop(Math.max(1, ...times.map((t) => t / 1000))),
    minTop: quarterTop(Math.max(1, run / 60_000)),
    // At least 4%, as drawn, so a quiet range's few tenths don't fill the chart.
    pctTop: quarterTop(Math.max(4, ...rates)),
    timed: times.length > 0,
    rated: rates.length > 0,
  };
}

/** Minutes with a tenth, as the design writes the time so far ("3.2 min"). */
const minutes = (ms: number) => `${(ms / 60_000).toFixed(1)} min`;

/** The section; `order` is null while the range has no runs in the test's order. */
export default function TimeDropSection({
  data,
  rows,
  order,
  onOrder,
  onPick,
}: {
  data: SurveyPayload;
  rows: QuestionRow[];
  order: "survey" | "test" | null;
  onOrder: (o: "survey" | "test") => void;
  onPick: (id: string) => void;
}) {
  const q = data.questions;
  const chart = timeDropChart(rows, { sheets: data.sheets.seen !== null });
  const title = (c: ChartColumn) => `#${c.row.n} · ${c.row.id} · ${c.band}`;
  const seen = data.sheets.seen?.ok ? data.sheets.seen.value : null;
  const known = seen !== null;
  // Hovering a pin's question also shows the sheet after it, with its figures from the Sheets
  // section below (Mark, 17 Nov 2026).
  const withSheets = (c: ChartColumn, tip: Tip): Tip =>
    c.sheets.length === 0
      ? tip
      : {
          ...tip,
          rows: [
            ...tip.rows,
            ...c.sheets.flatMap((s) => sheetTipRows(s, seen?.bySheet[s.id], known)),
          ],
        };
  const pinKey = chart.cols.some((c) => c.sheets.length > 0)
    ? [{ label: "Sheet, numbered", color: PIN, pin: true, info: "survey.sheets" }]
    : [];
  return (
    <Card id="time-drop" labelledBy="h-td">
      <SectionHead
        id="h-td"
        title="Time and drop-out per question"
        description={`Every question in ${order === "test" ? "the new order (C13)" : "the old order"}. Hover a bar to see the question; click it to open it in Question detail.`}
      />
      {order && q?.test && (
        <div className="flex flex-wrap items-center gap-2">
          <Pills
            label="Question order for these charts"
            value={order}
            onChange={onOrder}
            options={[
              { value: "survey", label: `Old order · ${fmt("count", q.people)} runs` },
              { value: "test", label: `New order (C13) · ${fmt("count", q.test.people)} runs` },
            ]}
          />
          <Info k="survey.order" />
        </div>
      )}
      <AllTraffic
        note={
          data.narrowed &&
          "Median times are all traffic's whatever the filters: the survey's steps record no source or device. Drop-out follows the filters as the question funnel below does."
        }
      />
      {data.questionsError ? (
        <p className="m-0 text-sm text-ap-bad-ink">{data.questionsError}</p>
      ) : !chart.rated ? (
        <p className="m-0 text-sm text-ap-muted">No survey run began in this range.</p>
      ) : (
        <>
          <Figure
            title="Median time per question"
            info="survey.medianTime"
            description="Seconds on the left; running survey time in minutes on the right."
            keys={[
              { label: "Median time", color: BAR },
              { label: "Well above average", color: SLOW_BAR },
              {
                label: "Survey time so far (min)",
                color: LINE,
                line: true,
                info: "survey.timeSoFar",
              },
              ...pinKey,
            ]}
            chart={chart}
            left={(v) => `${v} s`}
            leftTop={chart.secTop}
            right={(v) => `${v} min`}
            rightTop={chart.minTop}
            bar={(c) =>
              c.row.medianMs === null
                ? null
                : {
                    h: c.row.medianMs / 1000 / chart.secTop,
                    color: c.slow ? SLOW_BAR : BAR,
                    label: c.slow ? fmt("mmss", c.row.medianMs) : "",
                  }
            }
            line={chart.timed ? (c) => c.soFarMs / 60_000 / chart.minTop : undefined}
            empty={chart.timed ? null : "No time was recorded on the questions in this range."}
            onPick={onPick}
            tip={(c): Tip =>
              withSheets(c, {
                title: title(c),
                sub: c.row.text,
                rows: [
                  {
                    label: "Median time",
                    value: fmt("mmss", c.row.medianMs),
                    color: c.slow ? SLOW_BAR : BAR,
                    mark: "square",
                    strong: true,
                    muted: c.row.medianMs === null,
                  },
                  {
                    label: "Survey time so far",
                    value: minutes(c.soFarMs),
                    color: LINE,
                    mark: "line",
                  },
                ],
                note:
                  c.row.medianMs === null
                    ? "No time recorded on it in this range: it adds nothing to the time so far."
                    : c.slow
                      ? "Well above average: 1.6 times the average question or more."
                      : null,
              })
            }
          />
          <Figure
            title="Drop-out rate per question"
            info="survey.dropRate"
            description="Share of people who reached the question and left there."
            keys={[
              { label: "Drop-out rate", color: BAR },
              { label: "Over 5%", color: OVER_BAR },
              ...pinKey,
            ]}
            chart={chart}
            left={(v) => fmt("pct", v / 100)}
            leftTop={chart.pctTop}
            bar={(c) =>
              c.row.dropRate === null
                ? null
                : {
                    h: (c.row.dropRate * 100) / chart.pctTop,
                    color: c.over ? OVER_BAR : BAR,
                    label: c.over ? fmt("pct", c.row.dropRate) : "",
                  }
            }
            onPick={onPick}
            tip={(c): Tip =>
              withSheets(c, {
                title: title(c),
                sub: c.row.text,
                rows: [
                  {
                    label: "Drop-out rate",
                    value: fmt("pct", c.row.dropRate),
                    color: c.over ? OVER_BAR : BAR,
                    mark: "square",
                    strong: true,
                    muted: c.row.dropRate === null,
                  },
                ],
                note:
                  c.row.dropRate === null
                    ? "No run in this order was put this question in the range."
                    : `${fmt("count", c.row.exits)} of ${fmt("count", c.row.shown)} left here.`,
              })
            }
          />
        </>
      )}
    </Card>
  );
}

/** A sheet's lines in its question's card: which sheet, then its figures as the Sheets section. */
export function sheetTipRows(
  spot: SheetSpot,
  f: SheetFigures | undefined,
  /** PostHog could be read: blanks otherwise, rather than noughts. */
  known = true
): Tip["rows"] {
  const meta = SHEET_NAMES[spot.id];
  if (!known)
    return [
      {
        label: `Then sheet ${spot.n} · ${meta.name}`,
        value: "—",
        color: PIN,
        mark: "dashed",
        strong: true,
        muted: true,
      },
    ];
  return [
    {
      label: `Then sheet ${spot.n} · ${meta.name}`,
      value: `${fmt("count", f ? f.saw : 0)} saw it`,
      color: PIN,
      mark: "dashed",
      strong: true,
    },
    { label: "Bounce rate", value: fmt("pct", sheetBounce(f)), muted: !f },
    { label: "Median time open", value: fmt("mmss", f?.medianMs ?? null), muted: !f?.medianMs },
    ...(meta.tap
      ? [
          {
            label: "Conversion",
            value: `${fmt("pct", sheetConversion(f))} · ${fmt("count", f?.ticked ?? 0)} ${f?.ticked === 1 ? "click" : "clicks"}`,
            muted: !f,
          },
        ]
      : []),
  ];
}

/** Quarter lines from the bottom, in percent of the plot, with what each writes. */
const quarters = (top: number, write: (v: number) => string) =>
  [0, 1, 2, 3, 4].map((k) => ({ at: k * 25, text: write((top * k) / 4) }));

/**
 * One chart as drawn: a column per question with a scale on the left (and one on the right for
 * a line), the questions' numbers under it, then their chapter groups. Wider than a phone, it
 * scrolls sideways in its own box.
 */
function Figure({
  title,
  info,
  description,
  keys,
  chart,
  left,
  leftTop,
  right,
  rightTop,
  bar,
  line,
  empty = null,
  onPick,
  tip,
}: {
  title: string;
  info: string;
  description: string;
  keys: Array<{ label: string; color: string; line?: boolean; pin?: boolean; info?: string }>;
  chart: TimeDropChart;
  left: (v: number) => string;
  leftTop: number;
  right?: (v: number) => string;
  rightTop?: number;
  /** A column's bar: its height as a share of the scale, its colour and the label above it. */
  bar: (c: ChartColumn) => { h: number; color: string; label: string } | null;
  /** The line's height at each column, as a share of the right scale. */
  line?: (c: ChartColumn) => number;
  /** Why the chart is blank, if it is. */
  empty?: string | null;
  onPick: (id: string) => void;
  tip: (c: ChartColumn) => Tip;
}) {
  const { cols } = chart;
  const n = cols.length;
  const xs = cols.map((_, i) => ((i + 0.5) / n) * 100);
  // The scales' columns, as drawn: 48px left, 60px right, the plot between.
  const grid = "grid grid-cols-[48px_minmax(0,1fr)_60px] gap-x-1.5";
  return (
    <figure className="m-0 flex flex-col gap-3">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
        <span className="flex flex-col gap-1">
          <span className="font-serif text-lg font-semibold text-ap-ink">
            {title} <Info k={info} label={title} />
          </span>
          <span className="text-[13px] text-ap-muted">{description}</span>
        </span>
        <span className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-xs text-ap-body">
          {keys.map((k) => (
            <span key={k.label} className="inline-flex items-center gap-1.5">
              {k.pin ? (
                <span
                  aria-hidden="true"
                  className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-gradient-to-br from-[#bf66d9] to-[#795fc8] text-[8px] font-bold text-white"
                >
                  1
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className={k.line ? "h-0.5 w-4" : "h-2.5 w-2.5 rounded-sm"}
                  style={{ background: k.color }}
                />
              )}
              {k.label}
              {k.info && <Info k={k.info} label={k.label} />}
            </span>
          ))}
        </span>
      </figcaption>
      {empty ? (
        <p className="m-0 text-sm text-ap-muted">{empty}</p>
      ) : (
        // Room above the plot for the top scale label and a full bar's label (cut off, 10 Nov 2026).
        <div className="overflow-x-auto pb-1 pt-2.5">
          <div className="flex min-w-[900px] flex-col gap-1.5">
            <div className={grid}>
              <Scale ticks={quarters(leftTop, left)} side="left" />
              <div className="relative h-[220px] border-b border-[#d8d4e0]">
                {quarters(leftTop, left).map((t) => (
                  <span
                    key={t.at}
                    aria-hidden="true"
                    className="absolute inset-x-0 border-t border-dashed border-[#ece9f1]"
                    style={{ bottom: `${t.at}%` }}
                  />
                ))}
                <div aria-hidden="true" className="absolute inset-0 flex items-stretch gap-0.5">
                  {cols.map((c) => {
                    const b = bar(c);
                    return (
                      <span
                        key={c.row.id}
                        data-q={c.row.id}
                        className="relative flex min-w-0 flex-1 flex-col items-stretch justify-end"
                      >
                        {c.sheets.map((sh, k) => (
                          <span key={sh.id} data-sheet={sh.id}>
                            {/* The gap after the question, dashed, with the sheet's number on top. */}
                            <span
                              className="absolute inset-y-0 -right-[2px] z-[2] border-l-[1.5px] border-dashed"
                              style={{ borderColor: PIN }}
                            />
                            <span
                              className="absolute -right-[10px] z-[3] flex h-[18px] w-[18px] items-center justify-center rounded-full bg-gradient-to-br from-[#bf66d9] to-[#795fc8] text-[10px] font-bold text-white shadow-[0_0_0_2px_#fff]"
                              style={{ top: `${-9 + k * 20}px` }}
                            >
                              {sh.n}
                            </span>
                          </span>
                        ))}
                        {b?.label && (
                          // Wider than its column: drawn over the next bars, haloed so it reads.
                          <span className="relative z-[1] mb-0.5 whitespace-nowrap text-center text-[9px] font-bold text-ap-ink [text-shadow:0_0_2px_#fff,0_0_2px_#fff]">
                            {b.label}
                          </span>
                        )}
                        <span
                          className="block min-h-px rounded-t-[3px]"
                          style={{
                            height: `${(Math.min(1, b?.h ?? 0) * 100).toFixed(1)}%`,
                            background: b?.color ?? "transparent",
                          }}
                        />
                      </span>
                    );
                  })}
                </div>
                {line && (
                  <svg
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
                  >
                    <polyline
                      points={cols
                        .map((c, i) => `${xs[i]!.toFixed(2)},${(100 - line(c) * 100).toFixed(2)}`)
                        .join(" ")}
                      fill="none"
                      stroke={LINE}
                      strokeWidth={2}
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                )}
                <IndexHover
                  xs={xs}
                  label={title}
                  band={(i) => ({ left: (i / n) * 100, width: 100 / n })}
                  markers={line ? (i) => [{ y: line(cols[i]!) * 100, color: LINE }] : undefined}
                  tip={(i) => tip(cols[i]!)}
                  // A tap reads the bar; opening the question (and scrolling to it) is a click,
                  // or Enter on the chart.
                  tapReads
                  onPick={(i) => onPick(cols[i]!.row.id)}
                />
              </div>
              {right && rightTop !== undefined ? (
                <Scale ticks={quarters(rightTop, right)} side="right" />
              ) : (
                <span />
              )}
            </div>
            <div className={grid}>
              <span />
              <div aria-hidden="true" className="flex gap-0.5">
                {cols.map((c) => (
                  <span
                    key={c.row.id}
                    className="min-w-0 flex-1 text-center text-[9px] tabular-nums text-ap-muted"
                  >
                    {c.row.n}
                  </span>
                ))}
              </div>
              <span />
            </div>
            <div className={grid}>
              <span />
              <div className="flex gap-1">
                {chart.bands.map((g, i) => (
                  <span
                    key={`${i}-${g.label}`}
                    title={g.label}
                    className="flex min-w-0 flex-col items-center gap-1"
                    style={{ flex: `${g.count} 1 0` }}
                  >
                    <span
                      aria-hidden="true"
                      className="h-1 self-stretch rounded-full bg-[#e3def0]"
                    />
                    <span className="max-w-full truncate text-[11px] text-ap-body">{g.label}</span>
                  </span>
                ))}
              </div>
              <span />
            </div>
          </div>
        </div>
      )}
    </figure>
  );
}

function Scale({
  ticks,
  side,
}: {
  ticks: Array<{ at: number; text: string }>;
  side: "left" | "right";
}) {
  return (
    <div aria-hidden="true" className="relative h-[220px]">
      {ticks.map((t) => (
        <span
          key={t.at}
          className={`absolute translate-y-1/2 whitespace-nowrap text-[11px] tabular-nums ${
            side === "left" ? "right-0 text-ap-muted" : "left-1.5 text-ap-plum"
          }`}
          style={{ bottom: `${t.at}%` }}
        >
          {t.text}
        </span>
      ))}
    </div>
  );
}
