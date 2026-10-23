"use client";

import { Fragment, useState } from "react";

import type { Table } from "@features/admin/server/ap/common";
import { EMPTY, fmt, quarterTop } from "@features/admin/server/ap/format";
import type {
  FunnelKey,
  PtsFunnel,
  PtsMeasures,
  PtsPayload,
  PtsView,
  PtsWeek,
} from "@features/admin/server/ap/pay-to-start";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";

import ApFilterBar from "./ApFilterBar";
import { exportTables } from "./csv";
import { IndexHover, periodTitle, type TipRow } from "./hover";
import {
  Bar,
  BlackButton,
  Busy,
  Card,
  Failed,
  Loading,
  PageHeader,
  Pills,
  SectionHead,
  SectionNav,
  useHashScroll,
} from "./kit";
import { useApFilters } from "./useApFilters";

/**
 * AP-Analytics, Assessment A · Pay to start: every funnel that sells the report, side by side,
 * as Marcus drew it on 23.10 ("Funnel metrics compared"): the hard KPIs first (visit → paying
 * customer, revenue per visit, ROAS), then each funnel step by step and week by week.
 */

const FIXED_NOTE =
  "Each funnel is read whole here: source, device, country tier and visitor type don't narrow this page.";

const SECTIONS = [
  { id: "funnels", label: "Funnel metrics" },
  { id: "steps", label: "Step by step" },
  { id: "weeks", label: "Week by week" },
];

type Traffic = "all" | "ads";
type Unit = "eur0" | "eur" | "eur3" | "pct" | "count" | "x" | "net";

const NET_PLUS = "+";

/** A figure as the board writes it. */
function show(unit: Unit, v: number | null): string {
  if (v === null || !Number.isFinite(v)) return EMPTY;
  switch (unit) {
    case "eur0":
      return fmt("eur", v, 0);
    case "eur":
      return fmt("eur", v, 2);
    case "eur3":
      // Three decimals, as the step cards; a figure above 0 never reads as nothing.
      return v > 0 && v < 0.0005 ? "<€0.001" : fmt("eur", v, 3);
    case "pct":
      return v > 0 && v < 0.00005 ? "<0.01%" : fmt("pct", v, 2);
    case "count":
      return fmt("count", v);
    case "x":
      return `${v.toFixed(2)}×`;
    case "net":
      return v >= 0 ? `${NET_PLUS}${fmt("eur", v, 2)}` : fmt("eur", v, 2);
  }
}

/** The same figure for a spreadsheet: plain digits, the unit in the row's name. */
function csvValue(unit: Unit, v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "";
  if (unit === "pct") return String(Math.round(v * 10000) / 100);
  if (unit === "count") return String(Math.round(v));
  if (unit === "eur3") return String(Math.round(v * 1000) / 1000);
  return String(Math.round(v * 100) / 100);
}

const CSV_UNIT: Record<Unit, string> = {
  eur0: " (EUR)",
  eur: " (EUR)",
  eur3: " (EUR)",
  pct: " (%)",
  count: "",
  x: " (×)",
  net: " (EUR)",
};

type Figures = PtsView & { m: PtsMeasures };

interface Row {
  label: string;
  /** What it is, on hover. */
  hint: string;
  unit: Unit;
  value: (f: PtsFunnel, v: Figures) => number | null;
  better?: "high" | "low";
  core?: boolean;
}

/** The board's rows, in its order; "Core" are Marcus's three hard KPIs. */
const GROUPS = (traffic: Traffic): Array<{ title: string; rows: Row[] }> => [
  {
    title: "Ads",
    rows: [
      {
        label: "Ad spend",
        hint: "Google Ads, by the page the ad lands on",
        unit: "eur0",
        value: (f) => f.spend,
      },
      { label: "Ad clicks", hint: "Google Ads", unit: "count", value: (f) => f.clicks },
      {
        label: "Cost per click",
        hint: "Ad spend ÷ ad clicks. Lower is better",
        unit: "eur",
        value: (_, v) => v.m.cpc,
        better: "low",
      },
    ],
  },
  {
    title: "Conversion",
    rows: [
      {
        label: "Visits",
        hint:
          traffic === "ads"
            ? "Paid traffic only: the ad clicks"
            : "Unique visitors per day on the funnel's pages, ads and organic",
        unit: "count",
        value: (_, v) => v.visits,
      },
      {
        label: "Visit → survey completion",
        hint: "Surveys finished ÷ visits",
        unit: "pct",
        value: (_, v) => v.m.finishRate,
        better: "high",
      },
      {
        label: "Paying customers",
        hint: "People whose payment took money and stands",
        unit: "count",
        value: (_, v) => v.paid,
      },
      {
        label: "Visit → paying customer",
        hint: "Paying customers ÷ visits",
        unit: "pct",
        value: (_, v) => v.m.cvr,
        better: "high",
        core: true,
      },
      {
        label: "Ad click → paying customer",
        hint: "Paying customers ÷ ad clicks",
        unit: "pct",
        value: (_, v) => v.m.clickCvr,
        better: "high",
      },
    ],
  },
  {
    title: "Money",
    rows: [
      {
        label: "Revenue",
        hint: "Everything its customers paid, upgrades included, refunds left out",
        unit: "eur",
        value: (_, v) => v.revenue,
      },
      {
        label: "Revenue per visit",
        hint: "Revenue ÷ visits",
        unit: "eur3",
        value: (_, v) => v.m.rpv,
        better: "high",
        core: true,
      },
      {
        label: "Revenue per survey completion",
        hint: "Revenue ÷ surveys finished. Compare with cost per survey completion",
        unit: "eur",
        value: (_, v) => v.m.rpf,
        better: "high",
      },
      {
        label: "Cost per paying customer",
        hint: "Ad spend ÷ paying customers. Lower is better",
        unit: "eur",
        value: (_, v) => v.m.cac,
        better: "low",
      },
      {
        label: "Cost per survey completion",
        hint: "Ad spend ÷ surveys finished. Lower is better",
        unit: "eur",
        value: (_, v) => v.m.cpf,
        better: "low",
      },
      {
        label: "ROAS",
        hint: "Revenue ÷ ad spend: what €1 of ads brings back",
        unit: "x",
        value: (_, v) => v.m.roas,
        better: "high",
        core: true,
      },
      {
        label: "Return on ad spend (€)",
        hint: "Revenue − ad spend. Above €0 means the ads paid for themselves",
        unit: "net",
        value: (_, v) => v.m.net,
        better: "high",
      },
    ],
  },
];

type Tone = "plain" | "good" | "bad";
const TONE: Record<Tone, string> = {
  plain: "text-ap-ink",
  good: "bg-ap-good/[0.08] text-ap-good-ink",
  bad: "bg-ap-bad/[0.07] text-ap-bad-ink",
};

/** What the colour says, for a screen reader and on hover (colour alone is no answer). */
const TONE_WORD: Record<Exclude<Tone, "plain">, string> = {
  good: "best of the running funnels",
  bad: "worst of the running funnels",
};

/** Green for the best of the running funnels on a line, red for the worst; none for a tie. */
function toneOf(row: Row, v: number | null, values: Array<number | null>): Tone {
  const xs = values.filter((x): x is number => x !== null && Number.isFinite(x));
  if (!row.better || v === null || !Number.isFinite(v) || xs.length < 2) return "plain";
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  if (lo === hi) return "plain";
  const best = row.better === "high" ? hi : lo;
  const worst = row.better === "high" ? lo : hi;
  return v === best ? "good" : v === worst ? "bad" : "plain";
}

function Tag({ live }: { live: boolean }) {
  return (
    <span className={`text-[11px] font-semibold ${live ? "text-ap-good-ink" : "text-ap-label"}`}>
      {live ? "Live" : "Off"}
    </span>
  );
}

function MetricsTable({ funnels, traffic }: { funnels: PtsFunnel[]; traffic: Traffic }) {
  const running = funnels.filter((f) => f.live);
  return (
    <div className="overflow-x-auto rounded-[14px] border border-ap-line">
      <table className="w-full min-w-[920px] border-collapse text-[13px] tabular-nums">
        <caption className="sr-only">
          Funnel metrics compared, {traffic === "ads" ? "paid traffic only" : "paid and organic"}
        </caption>
        <thead>
          <tr className="bg-ap-ground">
            <th scope="col" className="w-[24%] px-3 py-3 text-left align-bottom">
              <span className="text-[13px] font-bold text-ap-ink">Measure</span>
            </th>
            {funnels.map((f) => (
              <th key={f.key} scope="col" className="px-3 py-3 text-right align-bottom">
                <span className="flex flex-col items-end gap-1">
                  <span className="text-[13px] font-bold leading-tight text-ap-ink">{f.label}</span>
                  <Tag live={f.live} />
                </span>
              </th>
            ))}
          </tr>
        </thead>
        {GROUPS(traffic).map((g) => (
          <tbody key={g.title}>
            <tr className="border-t border-ap-line bg-[#faf9fc]">
              <th
                scope="rowgroup"
                colSpan={funnels.length + 1}
                className="px-3 py-2.5 text-left text-[13px] font-bold text-ap-ink"
              >
                {g.title}
              </th>
            </tr>
            {g.rows.map((r) => {
              const values = running.map((f) => r.value(f, f[traffic]));
              return (
                <tr
                  key={r.label}
                  className={`border-t border-ap-line ${r.core ? "bg-[#f7f3ff]" : ""}`}
                >
                  <th
                    scope="row"
                    title={r.hint}
                    // The accent on the cell: Safari paints no box-shadow on a table row.
                    className={`px-3 py-2.5 text-left ${r.core ? "text-[15px] font-bold shadow-[inset_4px_0_0_#795fc8]" : "font-medium"} text-ap-ink`}
                  >
                    <span className="flex items-center gap-2">
                      {r.label}
                      {r.core && (
                        <span className="rounded-full bg-ap-purple px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-white">
                          Core
                        </span>
                      )}
                    </span>
                  </th>
                  {funnels.map((f) => {
                    if (!f.live)
                      return (
                        <td key={f.key} className="px-3 py-2.5 text-right text-ap-quiet">
                          {EMPTY}
                        </td>
                      );
                    const v = r.value(f, f[traffic]);
                    const tone = toneOf(r, v, values);
                    return (
                      <td
                        key={f.key}
                        title={tone === "plain" ? undefined : TONE_WORD[tone]}
                        className={`px-3 py-2.5 text-right ${r.core ? "text-[15px] font-bold" : "font-medium"} ${TONE[tone]}`}
                      >
                        {show(r.unit, v)}
                        {tone !== "plain" && <span className="sr-only"> ({TONE_WORD[tone]})</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}

const PAY = "#5a42a6";
const STEP = "#c0b4e6";

function StepCards({ funnels }: { funnels: PtsFunnel[] }) {
  return (
    <>
      <div
        className="grid gap-[18px]"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))" }}
      >
        {funnels.map((f) => {
          const visits = f.all.visits;
          return (
            <section
              key={f.key}
              aria-label={f.label}
              className={`flex flex-col gap-3 rounded-[14px] border border-ap-line p-4 ${f.live ? "" : "border-dashed opacity-[0.72]"}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-[15px] font-bold text-ap-ink">{f.label}</span>
                {!f.live && <Tag live={false} />}
              </span>
              <ol className="m-0 flex list-none flex-col gap-3 p-0">
                {f.steps.map((s) => {
                  const share =
                    f.live && s.n !== null && visits !== null && visits > 0 ? s.n / visits : null;
                  return (
                    <li key={s.label} className="flex flex-col gap-1">
                      <span className="flex justify-between gap-2 text-[13px]">
                        <span
                          className={
                            s.pays ? "font-bold text-ap-violet" : "font-semibold text-ap-ink"
                          }
                        >
                          {s.label}
                        </span>
                        <span className="tabular-nums">
                          <strong className="text-ap-ink">
                            {f.live ? fmt("count", s.n) : EMPTY}
                          </strong>{" "}
                          {share !== null && (
                            <span className="text-ap-muted">
                              {fmt("pct", share, share < 0.01 ? 2 : 1)}
                            </span>
                          )}
                        </span>
                      </span>
                      <Bar pct={share} color={s.pays ? PAY : STEP} minWidth={3} track="#f5f6f8" />
                    </li>
                  );
                })}
              </ol>
              <div className="mt-auto grid grid-cols-2 gap-2.5 border-t border-ap-line pt-3">
                <span className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ap-label">
                    Total revenue
                  </span>
                  <span className="font-serif text-[22px] font-semibold text-ap-ink">
                    {f.live ? show("eur", f.all.revenue) : EMPTY}
                  </span>
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ap-label">
                    Revenue per visitor
                  </span>
                  <span className="font-serif text-[22px] font-semibold text-ap-ink">
                    {f.live ? show("eur3", f.all.m.rpv) : EMPTY}
                  </span>
                </span>
              </div>
            </section>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-ap-body">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3 w-3 rounded-[3px]" style={{ background: PAY }} />A
          payment step
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3 w-3 rounded-[3px]" style={{ background: STEP }} />
          Every other step
        </span>
      </div>
    </>
  );
}

type Measure = "cac" | "cvr" | "roas";
const MEASURES: Array<{ value: Measure; label: string; unit: Unit; step: number }> = [
  { value: "cac", label: "Cost per paying customer", unit: "eur0", step: 1 },
  { value: "cvr", label: "Visit → paying customer", unit: "pct", step: 0.0001 },
  { value: "roas", label: "ROAS", unit: "x", step: 0.01 },
];

/** Each funnel's line, as the board draws it: pay after the report dotted, the gate dashed. */
const LINE: Record<FunnelKey, { color: string; dash: string; mark: TipRow["mark"] }> = {
  after: { color: "#161021", dash: "2 5", mark: "dotted" },
  full: { color: "#5a42a6", dash: "", mark: "line" },
  pre: { color: "#c2650a", dash: "", mark: "line" },
  gate: { color: "#2e7d5b", dash: "6 4", mark: "dashed" },
};

const QUARTERS = [0, 0.25, 0.5, 0.75, 1];

function LineKey({ k }: { k: FunnelKey }) {
  return (
    <svg aria-hidden="true" width="18" height="6" className="overflow-visible">
      <line
        x1="0"
        y1="3"
        x2="18"
        y2="3"
        stroke={LINE[k].color}
        strokeWidth={2}
        strokeDasharray={LINE[k].dash || undefined}
        strokeLinecap="round"
      />
    </svg>
  );
}

function WeekChart({ weeks, funnels }: { weeks: PtsWeek[]; funnels: PtsFunnel[] }) {
  const [measure, setMeasure] = useState<Measure>("cac");
  const m = MEASURES.find((x) => x.value === measure)!;
  const n = weeks.length;
  const values = weeks.flatMap((w) => funnels.map((f) => w.funnels[f.key][measure]));
  const real = values.filter((v): v is number => v !== null && Number.isFinite(v));
  const top = quarterTop(Math.max(...real, 0) * 1.1 || m.step * 4, m.step);
  const x = (i: number) => ((i + 0.5) / Math.max(1, n)) * 100;
  const y = (v: number) => (Math.min(v, top) / top) * 100;
  // A line per run of weeks with a figure: a week without one breaks it, never bridged.
  const runs = (k: FunnelKey) => {
    const out: string[][] = [[]];
    weeks.forEach((w, i) => {
      const v = w.funnels[k][measure];
      if (v === null || !Number.isFinite(v)) out.push([]);
      else out[out.length - 1]!.push(`${x(i).toFixed(2)},${(100 - y(v)).toFixed(2)}`);
    });
    return out.filter((r) => r.length);
  };
  const H = 240;
  const labelStep = Math.max(1, Math.ceil(n / 14));
  return (
    <>
      <SectionHead
        id="pts-weeks"
        title="Week by week"
        description="One line per funnel, ads and organic, each customer in the week they came in (finished the free survey, or paid to start), so a funnel that is paid later is not undercounted."
        align="end"
        right={
          <Pills
            label="Measure"
            options={MEASURES.map(({ value, label }) => ({ value, label }))}
            value={measure}
            onChange={setMeasure}
          />
        }
      />
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-ap-body">
        {funnels.map((f) => (
          <span key={f.key} className="inline-flex items-center gap-1.5">
            <LineKey k={f.key} />
            {f.live ? f.label : `${f.label} · off, line starts when switched on`}
          </span>
        ))}
      </div>
      {real.length === 0 ? (
        <p className="m-0 rounded-[14px] bg-ap-ground px-4 py-10 text-center text-sm text-ap-muted">
          No funnel has a figure for this in the range.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <div className="pt-2" style={{ minWidth: n * 36 + 80 }}>
            <div
              className="relative border-b border-ap-line"
              style={{ height: H, margin: "0 12px 0 56px" }}
            >
              {QUARTERS.map((q) => (
                <Fragment key={q}>
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 border-t border-ap-track"
                    style={{ bottom: `${q * 100}%` }}
                  />
                  <span
                    className="absolute -left-14 w-[50px] translate-y-1/2 text-right text-[11px] tabular-nums text-ap-muted"
                    style={{ bottom: `${q * 100}%` }}
                  >
                    {show(m.unit, q * top)}
                  </span>
                </Fragment>
              ))}
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
                className="absolute inset-0 h-full w-full overflow-visible"
              >
                {funnels.map((f) =>
                  runs(f.key).map((r, j) => (
                    <polyline
                      key={`${f.key}-${j}`}
                      points={r.length === 1 ? `${r[0]} ${r[0]}` : r.join(" ")}
                      fill="none"
                      stroke={LINE[f.key].color}
                      strokeWidth={2}
                      strokeDasharray={LINE[f.key].dash || undefined}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))
                )}
              </svg>
              {/* A lone week with a figure is a dot: a line needs two. */}
              {funnels.flatMap((f) =>
                runs(f.key)
                  .filter((r) => r.length === 1)
                  .map((r) => {
                    const [px, py] = r[0]!.split(",").map(Number);
                    return (
                      <span
                        key={`${f.key}-${r[0]}`}
                        aria-hidden="true"
                        className="absolute -mb-1 -ml-1 h-2 w-2 rounded-full shadow-[0_0_0_2px_#ffffff]"
                        style={{
                          left: `${px}%`,
                          bottom: `${100 - py!}%`,
                          background: LINE[f.key].color,
                        }}
                      />
                    );
                  })
              )}
              <IndexHover
                xs={weeks.map((_, i) => x(i))}
                label={`${m.label} per week, per funnel`}
                markers={(i) =>
                  funnels.flatMap((f) => {
                    const v = weeks[i]!.funnels[f.key][measure];
                    return v === null || !Number.isFinite(v)
                      ? []
                      : [{ y: y(v), color: LINE[f.key].color }];
                  })
                }
                tip={(i) => {
                  const w = weeks[i]!;
                  return {
                    title: periodTitle(w, w.from !== w.to && !isWholeWeek(w)),
                    sub: m.label,
                    rows: funnels.map((f) => {
                      const v = w.funnels[f.key][measure];
                      return {
                        label: f.label,
                        value: f.live ? show(m.unit, v) : "off",
                        color: LINE[f.key].color,
                        mark: LINE[f.key].mark,
                        muted: !f.live || v === null,
                      };
                    }),
                  };
                }}
              />
            </div>
            <div className="flex" style={{ margin: "6px 12px 0 56px" }}>
              {weeks.map((w, i) => (
                <span key={w.from} className="flex-1 text-center text-xs text-ap-muted">
                  {/* Every week named up to 14 weeks; past that, every other one (the latest always). */}
                  {(n - 1 - i) % labelStep === 0 ? w.label : ""}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* sr-only on the wrapper: a table sized 1px still lays out its columns, and widens the page. */}
      <div className="sr-only">
        <table>
          <caption>{m.label} per week, per funnel</caption>
          <thead>
            <tr>
              <th scope="col">Week</th>
              {funnels.map((f) => (
                <th key={f.key} scope="col">
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.from}>
                <th scope="row">{periodTitle(w)}</th>
                {funnels.map((f) => (
                  <td key={f.key}>{f.live ? show(m.unit, w.funnels[f.key][measure]) : "off"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const isWholeWeek = (w: { from: string; to: string }) =>
  (Date.parse(`${w.to}T12:00:00Z`) - Date.parse(`${w.from}T12:00:00Z`)) / 86_400_000 === 6;

/** The page as a spreadsheet: both traffic views, the steps, and the weeks. */
function toCsv(d: PtsPayload): Array<{ name: string; table: Table }> {
  const head = [
    { label: "Measure", unit: "text" as const },
    ...d.funnels.map((f) => ({ label: f.label, unit: "text" as const })),
  ];
  const metrics = (traffic: Traffic): Table => ({
    columns: head,
    rows: GROUPS(traffic).flatMap((g) =>
      g.rows.map((r) => ({
        label: `${g.title}: ${r.label}${CSV_UNIT[r.unit]}`,
        values: d.funnels.map((f) => (f.live ? csvValue(r.unit, r.value(f, f[traffic])) : "")),
      }))
    ),
  });
  return [
    { name: "Funnel metrics, paid + organic", table: metrics("all") },
    { name: "Funnel metrics, paid traffic only", table: metrics("ads") },
    {
      name: "Step by step",
      table: {
        columns: [
          { label: "Funnel", unit: "text" },
          { label: "Step", unit: "text" },
          { label: "People", unit: "count" },
          { label: "Of visits", unit: "pct" },
        ],
        rows: d.funnels
          .filter((f) => f.live)
          .flatMap((f) =>
            f.steps.map((s) => ({
              label: f.label,
              values: [s.label, s.n, s.n !== null && f.all.visits ? s.n / f.all.visits : null],
            }))
          ),
      },
    },
    {
      name: "Week by week (ads and organic)",
      table: {
        columns: [
          { label: "Week from", unit: "text" },
          ...d.funnels.flatMap((f) =>
            MEASURES.map((m) => ({
              label: `${f.label}: ${m.label}${CSV_UNIT[m.unit]}`,
              unit: "text" as const,
            }))
          ),
        ],
        rows: d.weeks.map((w) => ({
          label: w.from,
          values: d.funnels.flatMap((f) =>
            MEASURES.map((m) => (f.live ? csvValue(m.unit, w.funnels[f.key][m.value]) : ""))
          ),
        })),
      },
    },
  ];
}

export default function ApPayToStart() {
  const { params } = useApFilters();
  const { data, loading, error, refetch } = useAdminFetch<PtsPayload>(
    "/api/admin/ap/pay-to-start",
    params
  );
  const [traffic, setTraffic] = useState<Traffic>("all");
  useHashScroll(Boolean(data));
  return (
    <>
      <div className="flex flex-col gap-4">
        <PageHeader
          crumbs={["Assessments", "Assessment A", "Pay to start"]}
          title="Pay to start"
          description="Does paying before the survey bring more paying customers per euro of ads than paying after the report? Every funnel is counted the same way, from the ad click to the money."
          actions={
            <BlackButton
              disabled={!data}
              onClick={() =>
                data &&
                exportTables(`ap-pay-to-start-${data.range.from}-${data.range.to}`, toCsv(data))
              }
            >
              Export CSV
            </BlackButton>
          }
        />
        <SectionNav label="Pay to start sections" sections={SECTIONS} ready={Boolean(data)} />
      </div>
      <ApFilterBar
        scope="assessment"
        fixed={["source", "device", "tier", "visitor"]}
        fixedNote={FIXED_NOTE}
      />
      {loading && !data && <Loading label="the pay-to-start page" />}
      {error && <Failed message={error} onRetry={refetch} />}
      {data && (
        <Busy busy={loading}>
          <Card id="funnels" labelledBy="pts-funnels">
            <SectionHead
              id="pts-funnels"
              title="Funnel metrics compared"
              description="Ads, conversion and money metrics for each funnel, side by side: pay after the report vs both pay-to-start versions. Green is the best of the running funnels on that line, red the worst."
              align="end"
              right={
                <Pills
                  label="Traffic"
                  options={[
                    { value: "all", label: "Paid + organic" },
                    { value: "ads", label: "Paid traffic only" },
                  ]}
                  value={traffic}
                  onChange={setTraffic}
                />
              }
            />
            <MetricsTable funnels={data.funnels} traffic={traffic} />
            {traffic === "ads" && (
              <p className="m-0 text-xs leading-snug text-ap-muted">
                Paid traffic only: visits are the ad clicks; customers, finished surveys and revenue
                are the people whose survey or purchase came through a Google Ads click. Ad spend is
                the same in both views.
              </p>
            )}
          </Card>
          <Card id="steps" labelledBy="pts-steps">
            <SectionHead
              id="pts-steps"
              title="Step by step"
              description="Each funnel in its own order. Pay to start takes the money first; pay after the report takes it last. Every step is a share of the funnel's own visits, so the payment step can be read across."
            />
            <StepCards funnels={data.funnels} />
          </Card>
          <Card id="weeks" labelledBy="pts-weeks">
            <WeekChart weeks={data.weeks} funnels={data.funnels} />
          </Card>
          {data.notes.length > 0 && (
            <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-xs leading-snug text-ap-muted">
              {data.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </Busy>
      )}
    </>
  );
}
