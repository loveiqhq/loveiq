"use client";

import { Fragment, useState } from "react";

import type { Table } from "@features/admin/server/ap/common";
import { EMPTY, fmt, quarterTop } from "@features/admin/server/ap/format";
import type {
  FunnelKey,
  FunnelPaywallPayload,
  PtsFunnel,
  PtsMeasures,
  PtsPayload,
  PtsView,
  PtsWeek,
} from "@features/admin/server/ap/pay-to-start";
import { dayCount } from "@features/admin/server/ap/filters";
import { GATE_REVEAL_START_AT } from "@shared/experiments/gateRevealArm";
import { reportingDay } from "@shared/time/reporting-day";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";

import ApFilterBar from "./ApFilterBar";
import { exportTables } from "./csv";
import { Info } from "./field-info";
import { IndexHover, periodTitle, type TipRow } from "./hover";
import {
  BlackButton,
  Busy,
  Card,
  Failed,
  InfoLabel,
  Loading,
  PageHeader,
  Pills,
  SectionHead,
  SectionNav,
  STANDING,
  STANDING_WORD,
  standingOf,
  useHashScroll,
} from "./kit";
import { useApFilters } from "./useApFilters";

/**
 * AP-Analytics, Assessment A · Funnel and paywall (the Pay to start page, renamed by Marcus on
 * 19 Nov 2026 when pay to start was paused): the running paywall test (#11) on top, then the free
 * funnel before the paywall beside the EUR 1.99 page's, as he drew them on 23.10 ("Funnel metrics
 * compared"): the hard KPIs first (visit → paying customer, revenue per visit, ROAS), then each
 * funnel step by step and week by week.
 */

const FIXED_NOTE =
  "Each funnel is read whole here: the Funnel filter, source, device, country tier and visitor type don't narrow this page.";

const SECTIONS = [
  { id: "paywall-test", label: "Paywall test" },
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
      return fmt("pct", v);
    case "count":
      return fmt("count", v);
    case "x":
      return v > 0 && v < 0.005 ? "<0.01×" : `${v.toFixed(2)}×`;
    case "net":
      return v >= 0 ? `${NET_PLUS}${fmt("eur", v, 2)}` : fmt("eur", v, 2);
  }
}

/** The same figure for a spreadsheet: plain digits, the unit in the row's name. */
function csvValue(unit: Unit, v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "";
  // Four decimals for rates, ROAS and per-visit money: a small figure is never written as 0.
  if (unit === "pct") return String(Math.round(v * 1_000_000) / 10_000);
  if (unit === "count") return String(Math.round(v));
  if (unit === "eur3" || unit === "x") return String(Math.round(v * 10_000) / 10_000);
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
  /** Its info card's key. */
  info: string;
  unit: Unit;
  value: (f: PtsFunnel, v: Figures) => number | null;
  better?: "high" | "low";
  core?: boolean;
}

/** The board's rows, in its order; "Core" are Marcus's three hard KPIs. Each has its info card. */
const GROUPS: Array<{ title: string; rows: Row[] }> = [
  {
    title: "Ads",
    rows: [
      { label: "Ad spend", info: "pts.spend", unit: "eur0", value: (f) => f.spend },
      { label: "Ad clicks", info: "pts.clicks", unit: "count", value: (f) => f.clicks },
      {
        label: "Cost per click",
        info: "pts.cpc",
        unit: "eur",
        value: (_, v) => v.m.cpc,
        better: "low",
      },
    ],
  },
  {
    title: "Conversion",
    rows: [
      { label: "Visits", info: "pts.visits", unit: "count", value: (_, v) => v.visits },
      // Mark, 23 Oct: the completions as a number between the visits and the customers.
      {
        label: "Survey completions",
        info: "pts.completions",
        unit: "count",
        value: (_, v) => v.finished,
      },
      {
        label: "Visit → survey completion",
        info: "pts.finish-rate",
        unit: "pct",
        value: (_, v) => v.m.finishRate,
        better: "high",
      },
      { label: "Paying customers", info: "pts.paying", unit: "count", value: (_, v) => v.paid },
      {
        label: "Visit → paying customer",
        info: "pts.cvr",
        unit: "pct",
        value: (_, v) => v.m.cvr,
        better: "high",
        core: true,
      },
      {
        label: "Ad click → paying customer",
        info: "pts.click-cvr",
        unit: "pct",
        value: (_, v) => v.m.clickCvr,
        better: "high",
      },
    ],
  },
  {
    title: "Money",
    rows: [
      { label: "Revenue", info: "pts.revenue", unit: "eur", value: (_, v) => v.revenue },
      {
        label: "Revenue per visit",
        info: "pts.rpv",
        unit: "eur3",
        value: (_, v) => v.m.rpv,
        better: "high",
        core: true,
      },
      {
        label: "Revenue per survey completion",
        info: "pts.rpf",
        unit: "eur",
        value: (_, v) => v.m.rpf,
        better: "high",
      },
      {
        label: "Cost per paying customer",
        info: "pts.cpp",
        unit: "eur",
        value: (_, v) => v.m.cac,
        better: "low",
      },
      {
        label: "Cost per survey completion",
        info: "pts.cpf",
        unit: "eur",
        value: (_, v) => v.m.cpf,
        better: "low",
      },
      {
        label: "ROAS",
        info: "pts.roas",
        unit: "x",
        value: (_, v) => v.m.roas,
        better: "high",
        core: true,
      },
      {
        label: "Return on ad spend (€)",
        info: "pts.net",
        unit: "net",
        value: (_, v) => v.m.net,
        better: "high",
      },
      // Mark, 23 Oct: profit (contribution) per customer and per completion, as Traffic counts it.
      {
        label: "Profit per paying customer",
        info: "pts.ppc",
        unit: "net",
        value: (_, v) => v.m.ppc,
        better: "high",
      },
      {
        label: "Profit per survey completion",
        info: "pts.ppf",
        unit: "net",
        value: (_, v) => v.m.ppf,
        better: "high",
      },
    ],
  },
];

function Tag({ live, period }: { live: boolean; period?: string }) {
  return (
    <span className={`text-[11px] font-semibold ${live ? "text-ap-good-ink" : "text-ap-label"}`}>
      {live ? (period ?? "Live") : "Off"}
    </span>
  );
}

function MetricsTable({ funnels, traffic }: { funnels: PtsFunnel[]; traffic: Traffic }) {
  const running = funnels.filter((f) => f.live);
  return (
    // `relative`: the cells' sr-only words are placed absolutely, and without a placed box to
    // hold them they widen the page on a phone (round 3: 756px on a 375px screen).
    <div className="relative overflow-x-auto rounded-[14px] border border-ap-line">
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
                  <Tag live={f.live} period={f.period} />
                </span>
              </th>
            ))}
          </tr>
        </thead>
        {GROUPS.map((g) => (
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
                    // The accent on the cell: Safari paints no box-shadow on a table row.
                    className={`px-3 py-2.5 text-left ${r.core ? "text-[15px] font-bold shadow-[inset_4px_0_0_#795fc8]" : "font-medium"} text-ap-ink`}
                  >
                    <span className="flex items-center gap-2">
                      <span>
                        <InfoLabel label={r.label} info={{ k: r.info }} />
                      </span>
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
                    const tone = standingOf(values, v, r.better);
                    return (
                      <td
                        key={f.key}
                        title={tone === "plain" ? undefined : STANDING_WORD[tone]}
                        className={`px-3 py-2.5 text-right ${r.core ? "text-[15px] font-bold" : "font-medium"} ${STANDING[tone]}`}
                      >
                        {show(r.unit, v)}
                        {tone !== "plain" && (
                          <span className="sr-only"> ({STANDING_WORD[tone]})</span>
                        )}
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

/** Each step's info card, by the step's name (Visits and Survey finished share the table's). */
const STEP_INFO: Array<{ step: RegExp; info: string }> = [
  { step: /^Visits$/, info: "pts.visits" },
  { step: /^Survey started$/, info: "pts.step-started" },
  { step: /^Survey finished$/, info: "pts.completions" },
  { step: /^Report opened$/, info: "pts.step-opened" },
  { step: /^Checkout started$/, info: "pts.step-checkout" },
  { step: /^Paid( €[\d.]+)?$/, info: "pts.step-paid" },
  { step: /^Saw the €[\d.]+ page$/, info: "pts.step-gate" },
  { step: /^Pressed Unlock$/, info: "pts.step-pressed" },
  { step: /^Bought the full report$/, info: "pts.step-full" },
];
const stepInfo = (label: string) => STEP_INFO.find((x) => x.step.test(label))?.info;

const PAY = "#5a42a6";
const STEP = "#c0b4e6";

/**
 * Industry references for a step (Mark, 23 Oct: "Reference Conversion % that are market
 * standards"), each read from its source on 25 Oct 2026. Only sources that state their sample
 * and definition; `of` is the step it is a share of ("visits": the funnel's visits). A rough
 * frame: none is a paid assessment like ours.
 */
const MARKET: Array<{
  step: RegExp;
  /** As the source writes it. */
  shown: string;
  of: string;
  ofLabel: string;
  source: string;
  rough?: boolean;
}> = [
  {
    step: /^Survey started$/,
    shown: "52.7%",
    of: "visits",
    ofLabel: "of visits",
    source:
      "Riddle, State of Interactive Content 2026: personality tests, view → start (median). Short quizzes on publishers' pages.",
    rough: true,
  },
  {
    step: /^Survey finished$/,
    shown: "59.1%",
    of: "Survey started",
    ofLabel: "of starts",
    source:
      "Riddle, State of Interactive Content 2026: median completion of quizzes with 16+ questions. Ours has over 60.",
    rough: true,
  },
  {
    step: /^Paid( €[\d.]+)?$/,
    shown: "51%",
    of: "Checkout started",
    ofLabel: "of checkouts",
    source:
      "Littledata, 433 Shopify stores, 20 Jul – 17 Oct 2026: checkout completion (median), sessions that started checkout and went on to buy.",
  },
  {
    step: /^Paid( €[\d.]+)?$/,
    shown: "1.4%",
    of: "visits",
    ofLabel: "of visits",
    source:
      "Littledata, 433 Shopify stores, 20 Jul – 17 Oct 2026: sessions with a purchase (median ecommerce conversion rate).",
  },
];

/** A share as the cards write it, with a tenth like every rate. */
const pctOf = (v: number) => fmt("pct", v);

/**
 * A band's width for a share of the funnel's visits: on a log scale, each tenth narrower by a
 * quarter of the width (100% full, 10% three quarters, 1% half, 0.1% a quarter), so a funnel
 * that loses nine visitors in ten at its first step still reads as a funnel below it. Nothing
 * is no band; anything above it at least 4.
 */
export function bandWidth(share: number): number {
  if (!(share > 0)) return 0;
  return Math.max(4, Math.min(100, 100 + 25 * Math.log10(share)));
}

/**
 * One step of a card's funnel picture (Mark, 23 Oct: "Funnel illustrations"): a band for the
 * step's share of the funnel's visits, narrowing to the next step's, so the card reads as a
 * funnel. Drawn to the row's height, whatever its text takes.
 */
function FunnelBand({ top, bottom, color }: { top: number; bottom: number; color: string }) {
  // Two decimals: the points stay short and exact (no 88.71000000000001).
  const x = (v: number) => Math.round(v * 100) / 100;
  const [a, b] = [bandWidth(top), bandWidth(bottom)];
  return (
    // Out of the flow (`absolute` in its `relative` cell): in it, its square viewBox would set
    // the row's height instead of the text.
    <svg
      aria-hidden="true"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 h-full w-full"
    >
      <polygon
        points={`${x(50 - a / 2)},0 ${x(50 + a / 2)},0 ${x(50 + b / 2)},100 ${x(50 - b / 2)},100`}
        fill={color}
      />
    </svg>
  );
}

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
              // Only the funnel's name on the card (Marcus, 23 Oct): an off funnel is dimmed and
              // dashed, and says so to a screen reader.
              aria-label={f.live ? f.label : `${f.label} (off)`}
              className={`flex flex-col gap-3 rounded-[14px] border border-ap-line p-4 ${f.live ? "" : "border-dashed opacity-[0.72]"}`}
            >
              <span className="flex flex-col gap-0.5">
                <span className="text-[15px] font-bold text-ap-ink">{f.label}</span>
                {f.period && <span className="text-xs text-ap-muted">{f.period}</span>}
              </span>
              <ol className="m-0 flex list-none flex-col gap-1 p-0">
                {f.steps.map((s, i) => {
                  const shareOf = (n: number | null | undefined) =>
                    f.live && n !== null && n !== undefined && visits !== null && visits > 0
                      ? n / visits
                      : null;
                  const share = shareOf(s.n);
                  const next = shareOf(f.steps[i + 1]?.n) ?? share;
                  // The market's figure for this step, and ours on the same base.
                  const refs = f.live
                    ? MARKET.filter((m) => m.step.test(s.label)).flatMap((m) => {
                        const base =
                          m.of === "visits" ? visits : f.steps.find((x) => x.label === m.of)?.n;
                        if (base === undefined) return [];
                        const ours =
                          m.of !== "visits" && base !== null && base > 0 && s.n !== null
                            ? s.n / base
                            : null;
                        return [{ ...m, ours }];
                      })
                    : [];
                  return (
                    <li key={s.label} className="grid grid-cols-[72px_1fr] gap-3">
                      <span className="relative block min-h-[38px]">
                        {share !== null && (
                          <FunnelBand
                            top={share}
                            bottom={next ?? share}
                            color={s.pays ? PAY : STEP}
                          />
                        )}
                      </span>
                      <span className="flex min-w-0 flex-col justify-center gap-0.5 py-1">
                        <span className="flex justify-between gap-2 text-[13px]">
                          <span
                            className={
                              s.pays ? "font-bold text-ap-violet" : "font-semibold text-ap-ink"
                            }
                          >
                            <InfoLabel
                              label={s.label}
                              info={stepInfo(s.label) ? { k: stepInfo(s.label)! } : undefined}
                            />
                          </span>
                          <span className="shrink-0 tabular-nums">
                            <strong className="text-ap-ink">
                              {f.live ? fmt("count", s.n) : EMPTY}
                            </strong>{" "}
                            {share !== null && (
                              <span className="text-ap-muted">{pctOf(share)}</span>
                            )}
                          </span>
                        </span>
                        {f.live && s.detail && (
                          <span className="text-[11px] leading-snug text-ap-muted">{s.detail}</span>
                        )}
                        {refs.map((m) => (
                          <span
                            key={m.ofLabel}
                            title={m.source}
                            className="text-[11px] leading-snug text-ap-muted"
                          >
                            Market {m.rough ? "≈" : ""}
                            {m.shown} {m.ofLabel}
                            {m.ours !== null && ` · here ${pctOf(m.ours)}`}
                          </span>
                        ))}
                      </span>
                    </li>
                  );
                })}
              </ol>
              <div className="mt-auto grid grid-cols-2 gap-2.5 border-t border-ap-line pt-3">
                <span className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ap-label">
                    <InfoLabel label="Total revenue" info={{ k: "pts.revenue" }} />
                  </span>
                  <span className="font-serif text-[22px] font-semibold text-ap-ink">
                    {f.live ? show("eur", f.all.revenue) : EMPTY}
                  </span>
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ap-label">
                    <InfoLabel label="Revenue per visitor" info={{ k: "pts.rpv" }} />
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
      <p className="m-0 text-xs leading-relaxed text-ap-muted">
        Each band narrows with the step&apos;s share of the funnel&apos;s visits, on a log scale
        (each tenfold drop narrows it by the same step), so the small steps stay visible; the
        numbers beside it are exact. Market: industry medians, a rough frame only (≈: sources
        further from a paid assessment like ours). Survey started and finished:{" "}
        <a
          href="https://www.riddle.com/blog/wp-content/uploads/2026/08/State-of-Interactive-Content-2026-by-Riddle.pdf"
          target="_blank"
          rel="noopener noreferrer"
          className="font-bold text-ap-plum underline"
        >
          Riddle, State of Interactive Content 2026
        </a>{" "}
        (short quizzes on publishers&apos; pages). Paid:{" "}
        <a
          href="https://www.littledata.io/average/checkout-completion-rate"
          target="_blank"
          rel="noopener noreferrer"
          className="font-bold text-ap-plum underline"
        >
          Littledata
        </a>
        &apos;s medians of 433 Shopify stores, 20 Jul – 17 Oct 2026 (stores that ship goods).
      </p>
    </>
  );
}

type Measure = "cac" | "cvr" | "roas";
const MEASURES: Array<{ value: Measure; label: string; unit: Unit; step: number }> = [
  { value: "cac", label: "Cost per paying customer", unit: "eur0", step: 1 },
  { value: "cvr", label: "Visit → paying customer", unit: "pct", step: 0.001 },
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
        info="pts.weeks"
        description="One line per funnel, ads and organic, each customer in the week they finished the survey."
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
          <div className="pt-2" style={{ minWidth: Math.ceil(n / labelStep) * 48 + 80 }}>
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
                <span
                  key={w.from}
                  className="flex-1 whitespace-nowrap text-center text-xs text-ap-muted"
                >
                  {/* Up to 14 weeks each is named; past that every 2nd, 3rd…, the latest always. */}
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
/** What the test needs to be called (its Test Repository row, signed off at the 19 Nov sync). */
const NEEDED_PER_HALF = 170;

/**
 * Marcus's "Paywall test: Core Archetype before paying" (19 Nov 2026), the running #11: a card per
 * half with who saw the EUR 1.99 page, who paid and the pay rate (the decider: paid over free
 * finishers), how far the half is towards the readers it needs, then the facts to read it by and
 * the verdict in plain words. The same readout as AP › Payment's.
 */
function PaywallTest({ t, to }: { t: FunnelPaywallPayload["gateTest"]; to: string }) {
  // The test's day as of the range's last day: the day it began is day 1.
  const start = reportingDay(new Date(GATE_REVEAL_START_AT));
  const status = to < start ? t.note : `Running · day ${dayCount(start, to)} · ${t.note}`;
  const paid = t.arms.reduce((n, a) => n + a.paid, 0);
  const full = (i: number) => t.arms[i]?.full ?? 0;
  return (
    <Card id="paywall-test" labelledBy="h-pw">
      <SectionHead
        id="h-pw"
        title="Paywall test: Core Archetype before paying"
        description="Free finishers are split 50/50 by survey session. A keeps today’s €1.99 page; B shows the Core Archetype, its match and five aspect cards before the €1.99 step. Price, guarantee and what €1.99 opens are the same. Decided by the share of finishers who pay €1.99."
        right={
          <span className="self-start rounded-full bg-ap-good/[0.12] px-2.5 py-1 text-xs font-bold text-ap-good-ink">
            {status}
          </span>
        }
      />
      {t.why ? (
        <p className="m-0 text-sm text-ap-muted">{t.why}</p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {t.arms.map((a, i) => {
              const seen = a.reached ?? a.finishers;
              return (
                <section
                  key={a.arm}
                  aria-label={a.name}
                  className="flex flex-col gap-4 rounded-[14px] border border-ap-line p-4"
                >
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[15px] font-bold text-ap-ink">
                      {i === 0 ? "A" : "B"} · {a.name}
                    </span>
                    <span className="text-xs text-ap-muted">
                      {a.control
                        ? "Control: the archetype stays locked until €1.99"
                        : "Archetype, match and five aspect cards, then €1.99"}
                    </span>
                  </span>
                  <div className="grid grid-cols-3 gap-3">
                    <Figure
                      label="Saw €1.99 page"
                      info="payment.gt-reached"
                      value={a.reached === null ? EMPTY : fmt("count", a.reached)}
                      sub={
                        a.reached === null
                          ? "could not be read"
                          : `of ${fmt("count", a.finishers)} finishers`
                      }
                    />
                    <Figure
                      label="Paid €1.99"
                      info="payment.gt-paid"
                      value={fmt("count", a.paid)}
                    />
                    <Figure
                      label="Pay rate"
                      info="payment.gt-rate"
                      value={fmt("pct", a.finishers ? a.paid / a.finishers : null)}
                      sub="baseline 10.3%"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="flex justify-between text-xs text-ap-body">
                      <span>Sample so far</span>
                      <span className="tabular-nums">
                        {fmt("count", seen)} of ~{NEEDED_PER_HALF} readers
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className="block h-1.5 overflow-hidden rounded-full bg-ap-track"
                    >
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${Math.min(100, (seen / NEEDED_PER_HALF) * 100).toFixed(1)}%`,
                          background: a.control ? "#9c95a3" : "#5a42a6",
                        }}
                      />
                    </span>
                  </div>
                </section>
              );
            })}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Fact
              label="Paid €1.99 since switch-on"
              value={`${fmt("count", paid)} ${paid === 1 ? "reader" : "readers"}`}
              sub="Both halves together. Gift unlocks (€0) left out."
            />
            <Fact
              label="Baseline before the test"
              value="10.3% pay €1.99"
              sub="19 of 185 finishers, 27 Oct–17 Nov (173 saw the page)."
            />
            <Fact
              label="Needed to call it"
              value="~155–185 per half"
              sub="To see a doubling (10% → 21%): about 5 weeks at ~35 finishers per half a week."
            />
            <Fact
              label="Read alongside"
              value={`Full report bought: A ${fmt("count", full(0))} · B ${fmt("count", full(1))}`}
              sub="And the halfway sheet's exits, on AP › Survey's Sheets."
            />
          </div>
          <p className="m-0 text-[13px] leading-relaxed text-ap-ink">{t.verdict}</p>
        </>
      )}
    </Card>
  );
}

function Figure({
  label,
  info,
  value,
  sub,
}: {
  label: string;
  info: string;
  value: string;
  sub?: string;
}) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs text-ap-muted">
        {label} <Info k={info} label={label} />
      </span>
      <span className="font-serif text-xl font-semibold tabular-nums text-ap-ink">{value}</span>
      {sub && <span className="text-[11px] leading-snug text-ap-muted">{sub}</span>}
    </span>
  );
}

function Fact({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-ap-line bg-ap-ground/60 px-3.5 py-3">
      <span className="text-xs font-semibold text-ap-muted">{label}</span>
      <span className="text-sm font-bold text-ap-ink">{value}</span>
      <span className="text-xs leading-snug text-ap-muted">{sub}</span>
    </div>
  );
}

function toCsv(d: FunnelPaywallPayload): Array<{ name: string; table: Table }> {
  const head = [
    { label: "Measure", unit: "text" as const },
    ...d.funnels.map((f) => ({ label: f.label, unit: "text" as const })),
  ];
  const metrics = (traffic: Traffic): Table => ({
    columns: head,
    rows: GROUPS.flatMap((g) =>
      g.rows.map((r) => ({
        label: `${g.title}: ${r.label}${CSV_UNIT[r.unit]}`,
        values: d.funnels.map((f) => (f.live ? csvValue(r.unit, r.value(f, f[traffic])) : "")),
      }))
    ),
  });
  const test: Table = {
    columns: [
      { label: "Half", unit: "text" },
      { label: "Free finishers", unit: "count" },
      { label: "Saw the €1.99 page", unit: "count" },
      { label: "Paid €1.99", unit: "count" },
      { label: "Pay rate", unit: "pct" },
      { label: "Bought the full report", unit: "count" },
    ],
    rows: d.gateTest.arms.map((a) => ({
      label: a.name,
      values: [a.finishers, a.reached, a.paid, a.finishers ? a.paid / a.finishers : null, a.full],
    })),
  };
  return [
    ...(d.gateTest.arms.length ? [{ name: `Paywall test · ${d.gateTest.test}`, table: test }] : []),
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
  const { data, loading, error, refetch } = useAdminFetch<FunnelPaywallPayload>(
    "/api/admin/ap/pay-to-start",
    params
  );
  const [traffic, setTraffic] = useState<Traffic>("all");
  useHashScroll(Boolean(data));
  return (
    <>
      <div className="flex flex-col gap-4">
        <PageHeader
          crumbs={["Assessments", "Assessment A", "Funnel and paywall"]}
          title="Funnel and paywall"
          description="The free survey and its €1.99 paywall, from the ad click to the money, with the running paywall test on top. Pay to start is paused and no longer shown."
          actions={
            <BlackButton
              disabled={!data}
              onClick={() =>
                data &&
                exportTables(
                  `ap-funnel-and-paywall-${data.range.from}-${data.range.to}`,
                  toCsv(data)
                )
              }
            >
              Export CSV
            </BlackButton>
          }
        />
        <SectionNav label="Funnel and paywall sections" sections={SECTIONS} ready={Boolean(data)} />
      </div>
      <ApFilterBar
        scope="assessment"
        fixed={["funnel", "source", "device", "tier", "visitor"]}
        fixedNote={FIXED_NOTE}
      />
      {loading && !data && <Loading label="the funnel and paywall page" />}
      {error && <Failed message={error} onRetry={refetch} />}
      {data && (
        <Busy busy={loading}>
          <PaywallTest t={data.gateTest} to={data.range.to} />
          <Card id="funnels" labelledBy="pts-funnels">
            <SectionHead
              id="pts-funnels"
              title="Funnel metrics compared"
              description="Ads, conversion and money for the free survey before and since the €1.99 paywall. Green is the better of the two on that line, red the worse."
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
            {traffic === "ads" ? (
              <p className="m-0 text-xs leading-snug text-ap-muted">
                Paid traffic only: visits are the ad clicks; customers, finished surveys and revenue
                are the people whose survey or purchase came through a Google Ads click. Ad spend is
                the same in both views.
              </p>
            ) : (
              <p className="m-0 text-xs leading-snug text-ap-muted">
                Visits are everyone who came to the funnel&apos;s pages each day, from ads and every
                other source, so there are usually more of them than ad clicks. Paid traffic only
                counts the ad clicks.
              </p>
            )}
          </Card>
          <Card id="steps" labelledBy="pts-steps">
            <SectionHead
              id="pts-steps"
              title="Step by step"
              description="Each funnel in its own order, every step as a share of the funnel's visits."
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
