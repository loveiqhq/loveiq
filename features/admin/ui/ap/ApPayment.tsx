"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";

import type { Column, Table, Tile } from "@features/admin/server/ap/common";
import { rangeLabel, type Grain } from "@features/admin/server/ap/filters";
import { EMPTY, fmt, quarterTop } from "@features/admin/server/ap/format";
import type {
  CheckoutPoint,
  OverTimeRow,
  PaymentPayload,
  PaymentTypeRow,
  PricingArmRow,
  SegmentRow,
  SegmentTable,
} from "@features/admin/server/ap/payment";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import { reportingDay } from "@shared/time/reporting-day";

import ApFilterBar from "./ApFilterBar";
import { exportTables } from "./csv";
import { Info, type TrendSource, type Worked } from "./field-info";
import { bucketTitles, IndexHover, periodTitle, ROW_HOVER } from "./hover";
import {
  Bar,
  BlackButton,
  Busy,
  Card,
  Eyebrow,
  Failed,
  KpiTileV2,
  Loading,
  PageHeader,
  RangeLine,
  SectionHead,
  useHashScroll,
} from "./kit";
import { useApFilters } from "./useApFilters";

const PRE = "#c0b4e6";
const FULL = "#5a42a6";
const ATTEMPTED = "#8c76d1";
const GREEN = "#2e7d5b";
const INK = "#161021";
/** Payment methods by rank, as drawn; any beyond the fifth share the palest. */
const RANK = ["#5a42a6", "#795fc8", "#9d8bd8", "#c0b4e6", "#ddd5f2"];
const LINK_ICON =
  "M10 10.5l4-5M8.5 6.5L7 8a2.5 2.5 0 0 0 3.5 3.5L12 10M15.5 9.5L17 8a2.5 2.5 0 0 0-3.5-3.5L12 6";
const CARD_ICON =
  "M3 2.5h18a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 12V4A1.5 1.5 0 0 1 3 2.5zM1.5 6h21M5 10.5h4";
const QUARTERS = [0, 0.25, 0.5, 0.75, 1];
const NOT_ON_SALE =
  "Pre-unlock figures start on 23 Oct 2026, the first whole day the €1.99 Core Archetype was on sale (from the evening of 22 Oct): earlier periods have none to count.";
const GRAIN_NAME: Record<Grain, string> = { day: "Day", week: "Week", month: "Month" };
/** The tiles' decimals as the design writes them ("€650", "1.60%", "14.0%"). */
const TILE_DIGITS: Record<string, number> = {
  revenue: 0,
  aov: 2,
  "pre-cvr": 2,
  "full-cvr": 2,
  "pay-cvr": 2,
  checkout: 1,
};

/** Each tile's info card (fields/payment.ts). */
const TILE_INFO: Record<string, { k: string }> = {
  revenue: { k: "payment.revenue" },
  sales: { k: "payment.sales" },
  pre: { k: "payment.pre" },
  "pre-cvr": { k: "payment.pre-cvr" },
  full: { k: "payment.full" },
  "full-cvr": { k: "payment.full-cvr" },
  aov: { k: "payment.aov" },
  "pay-cvr": { k: "payment.pay-cvr" },
  checkout: { k: "payment.checkout" },
};

/** Each multiplier card's info card, by the card's label. */
const MULT_INFO: Record<string, { k: string }> = {
  "Country tier": { k: "payment.mult-tier" },
  Device: { k: "payment.mult-device" },
  "Traffic source": { k: "payment.mult-source" },
  "Behaviour bucket": { k: "payment.mult-behaviour" },
  "Engagement score": { k: "payment.mult-engagement" },
  "Discount step": { k: "payment.mult-discount" },
};

/** Groups under this many finishers are left out of these segments, as drawn. */
const SMALL_GROUP = 15;
const SMALL_LEFT_OUT: ReadonlySet<string> = new Set(["relationship", "country"]);

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
/** "five" for 5, as the design writes the model's points; figures from ten. */
const inWords = (n: number) => WORDS[n] ?? String(n);

const SECTIONS = [
  { id: "over-time", label: "Over time" },
  { id: "checkout", label: "Checkout & methods" },
  { id: "segments", label: "Segments" },
  { id: "experiments", label: "Pricing tests" },
  { id: "elasticity", label: "Price elasticity" },
];

const SEGMENTS = [
  { value: "gender", label: "Gender" },
  { value: "age", label: "Age" },
  { value: "relationship", label: "Relationship" },
  { value: "country", label: "Country" },
  { value: "device", label: "Device / OS" },
  { value: "tier", label: "Country price tier" },
  { value: "source", label: "Traffic source" },
];

const ratio = (a: number | null, b: number | null) =>
  a !== null && b !== null && b > 0 ? a / b : null;

type Shade = "plain" | "good" | "bad";
const SHADE: Record<Shade, string> = {
  plain: "text-ap-ink",
  good: "bg-ap-good/[0.08] text-ap-good-ink",
  bad: "bg-ap-bad/[0.07] text-ap-bad-ink",
};
const WEIGHT = { medium: "font-medium", semibold: "font-semibold", bold: "font-bold" };

/**
 * The design's shading: the top third of a column's range green, the bottom third red (the
 * other way round where lower is better).
 */
function band(xs: Array<number | null>, v: number | null, lowerBetter = false): Shade {
  const ok = xs.filter((x): x is number => x !== null && Number.isFinite(x));
  if (v === null || !Number.isFinite(v) || ok.length < 2) return "plain";
  const lo = Math.min(...ok);
  const hi = Math.max(...ok);
  if (hi === lo) return "plain";
  const t = lowerBetter ? (hi - v) / (hi - lo) : (v - lo) / (hi - lo);
  return t >= 0.67 ? "good" : t <= 0.33 ? "bad" : "plain";
}

/** A heading with its info icon, the last word and the icon kept on one line. */
function Labelled({ label, info }: { label: string; info?: string }) {
  if (!info) return <>{label}</>;
  const cut = label.lastIndexOf(" ") + 1;
  return (
    <>
      {label.slice(0, cut)}
      <span className="whitespace-nowrap">
        {label.slice(cut)}
        <Info k={info} label={label} />
      </span>
    </>
  );
}

/**
 * The section being read: the one crossing a band across the middle of the screen, the first
 * until one does (as ApReport does it).
 */
function useSectionInView(ready: boolean): string {
  const [current, setCurrent] = useState(SECTIONS[0]!.id);
  useEffect(() => {
    if (!ready || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setCurrent(e.target.id);
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [ready]);
  return current;
}

interface Cell {
  v: string;
  sub?: string;
  left?: boolean;
  weight?: keyof typeof WEIGHT;
  shade?: Shade;
}

/** A table as the design draws them here: grey uppercase headings, 13px figures, shaded cells. */
function PayTable({
  label,
  columns,
  minWidth,
  head,
  rows,
  pad = "py-2.5",
  group,
  rowHeaders = true,
}: {
  label: string;
  columns: string;
  minWidth: number;
  head: Array<{ label: string; left?: boolean; info?: string }>;
  rows: Array<{ key: string; cells: Cell[]; dashed?: boolean }>;
  pad?: string;
  group?: ReactNode;
  rowHeaders?: boolean;
}) {
  return (
    // A tab stop and a name, so a keyboard can scroll it sideways (nothing in it takes focus).
    <div
      tabIndex={0}
      role="region"
      aria-label={`${label}, scrolls sideways`}
      className="overflow-x-auto rounded-[14px] border border-ap-line"
    >
      <div role="table" aria-label={label} style={{ minWidth }}>
        {group}
        <div role="row" className="grid bg-ap-ground" style={{ gridTemplateColumns: columns }}>
          {head.map((h) => (
            <span
              key={h.label}
              role="columnheader"
              className={`px-3 py-2.5 text-[11px] font-bold uppercase leading-[1.3] tracking-[0.06em] text-ap-muted ${h.left ? "text-left" : "text-right"}`}
            >
              <Labelled label={h.label} info={h.info} />
            </span>
          ))}
        </div>
        {rows.length === 0 && (
          <p className="m-0 border-t border-ap-line px-3 py-3 text-sm text-ap-muted">
            Nothing in this range.
          </p>
        )}
        {rows.map((r) => (
          <div
            key={r.key}
            role="row"
            className={`grid border-t border-ap-line ${r.dashed ? "border-dashed" : ""}`}
            style={{ gridTemplateColumns: columns }}
          >
            {r.cells.map((c, i) => (
              <span
                key={i}
                role={i === 0 && rowHeaders ? "rowheader" : "cell"}
                className={`flex flex-col justify-center gap-px px-3 ${pad} text-[13px] tabular-nums ${c.left ? "text-left" : "text-right"} ${WEIGHT[c.weight ?? "medium"]} ${SHADE[c.shade ?? "plain"]}`}
              >
                {c.v}
                {c.sub ? (
                  <span className="text-[11px] font-medium text-ap-muted">{c.sub}</span>
                ) : null}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Swatch({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className="h-3 w-3 rounded-[3px]" style={{ background: color }} />
      {children}
    </span>
  );
}

/** A section left blank, and why. */
function Why({ children }: { children: ReactNode }) {
  return <p className="m-0 text-[13px] leading-relaxed text-ap-muted">{children}</p>;
}

/** A subsection's title, as the design sets it (15px bold), kept a heading for screen readers. */
function SubHead({ title, info, children }: { title: string; info?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="m-0 font-sans text-[15px] font-bold text-ap-ink">
        <Labelled label={title} info={info} />
      </h3>
      <p className="m-0 text-[13px] text-ap-muted">{children}</p>
    </div>
  );
}

/** A point's period as its read-out's title: its days where the server sent them. */
const pointTitle = (p: { label: string; from?: string; to?: string; partial: boolean }) =>
  p.from && p.to ? periodTitle({ from: p.from, to: p.to }, p.partial) : p.label;

/** Paid sales stacked by unlock (bars, left axis) under the survey submissions (dotted, right). */
function SalesChart({ rows, preOnSale }: { rows: OverTimeRow[]; preOnSale: boolean }) {
  const n = rows.length;
  const H = 240;
  const sTop = quarterTop(Math.max(...rows.map((r) => r.preSales + r.fullSales)) * 1.1);
  const fTop = quarterTop(Math.max(...rows.map((r) => r.submissions)) * 1.1);
  const x = (i: number) => ((i + 0.5) / n) * 100;
  const fy = (v: number) => (Math.min(v, fTop) / fTop) * 100;
  const margin = "0 56px 0 40px";
  // Scrolls sideways where narrow: the chart inside takes the keys and scrolls each point in.
  return (
    <div className="overflow-x-auto">
      <div className="pt-2" style={{ minWidth: n * 56 + 96 }}>
        <div className="relative border-b border-ap-line" style={{ height: H, margin }}>
          {QUARTERS.map((f) => (
            <Fragment key={f}>
              <span
                aria-hidden="true"
                className="absolute inset-x-0 border-t border-ap-track"
                style={{ bottom: `${f * 100}%` }}
              />
              <span
                className="absolute -left-10 w-[34px] translate-y-1/2 text-right text-[11px] tabular-nums text-[#5a42a6]"
                style={{ bottom: `${f * 100}%` }}
              >
                {fmt("count", f * sTop)}
              </span>
              <span
                className="absolute left-full ml-1.5 translate-y-1/2 text-[11px] tabular-nums text-ap-ink"
                style={{ bottom: `${f * 100}%` }}
              >
                {fmt("count", f * fTop)}
              </span>
            </Fragment>
          ))}
          {/* Equal slots, so each bar's middle is where the line's point is. */}
          <div className="absolute inset-0 flex items-end">
            {rows.map((r) => (
              <div
                key={r.label}
                className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 px-[9px]"
              >
                <span className="text-xs font-bold tabular-nums text-ap-ink">
                  {fmt("count", r.preSales + r.fullSales)}
                </span>
                <div className="flex w-full max-w-[56px] flex-col overflow-hidden rounded-b-[2px] rounded-t-md">
                  <span style={{ height: (r.preSales / sTop) * H, background: PRE }} />
                  <span style={{ height: (r.fullSales / sTop) * H, background: FULL }} />
                </div>
              </div>
            ))}
          </div>
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
            className="absolute inset-0 h-full w-full overflow-visible"
          >
            <polyline
              points={rows
                .map((r, i) => `${x(i).toFixed(2)},${(100 - fy(r.submissions)).toFixed(2)}`)
                .join(" ")}
              fill="none"
              stroke={INK}
              strokeWidth={2}
              strokeDasharray="2 5"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {rows.map((r, i) => (
            <span
              key={r.label}
              className="absolute -translate-x-1/2 -translate-y-2 rounded bg-white/90 px-[3px] text-[11px] font-bold tabular-nums text-ap-ink"
              style={{ left: `${x(i)}%`, bottom: `${fy(r.submissions)}%` }}
            >
              {fmt("count", r.submissions)}
            </span>
          ))}
          <IndexHover
            xs={rows.map((_, i) => x(i))}
            label="Paid sales over time"
            band={(i) => ({ left: (i / n) * 100, width: 100 / n })}
            markers={(i) => [{ y: fy(rows[i]!.submissions), color: INK }]}
            tip={(i) => {
              const r = rows[i]!;
              const paid = r.preSales + r.fullSales;
              return {
                title: pointTitle(r),
                rows: [
                  {
                    label: "Pre-unlock sales",
                    value:
                      preOnSale && r.preOn !== false ? fmt("count", r.preSales) : "not on sale",
                    color: PRE,
                    mark: "square",
                    muted: !preOnSale || r.preOn === false,
                  },
                  {
                    label: "Full-unlock sales",
                    value: fmt("count", r.fullSales),
                    color: FULL,
                    mark: "square",
                  },
                  { label: "Paid sales", value: fmt("count", paid), strong: true },
                  { label: "Revenue", value: fmt("eur", r.revenue, 2) },
                  {
                    label: "Survey submissions",
                    value: fmt("count", r.submissions),
                    color: INK,
                    mark: "dotted",
                  },
                  { label: "Finishers (each person once)", value: fmt("count", r.finishers) },
                  {
                    label: "Payment CVR",
                    value: fmt("pct", ratio(r.payers, r.finishers), 2),
                    muted: !r.finishers,
                  },
                ],
              };
            }}
          />
        </div>
        <div className="flex" style={{ margin: "18px 56px 0 40px" }}>
          {rows.map((r) => (
            <span
              key={r.label}
              className="min-w-0 flex-1 px-[9px] text-center text-xs text-ap-muted"
            >
              {r.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function OverTime({ d }: { d: PaymentPayload }) {
  const { grain, rows, preOnSale, note } = d.overTime;
  const cvrs = rows.map((r) => ratio(r.payers, r.finishers));
  return (
    <Card id="over-time" labelledBy="h-time">
      <SectionHead
        id="h-time"
        title="Pre-unlock and full-unlock payments over time"
        info="payment.over-time"
        description={`Paid sales per ${GRAIN_NAME[grain].toLowerCase()} by unlock type, against total survey submissions.`}
      />
      {d.blocked ? (
        <Why>{d.blocked}</Why>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-ap-body">
            <Swatch color={PRE}>Pre-unlock (Initial plan)</Swatch>
            <Swatch color={FULL}>Full unlock (Full, Full All, Core)</Swatch>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-0 w-4 border-t-2 border-dotted border-ap-ink" />
              Survey submissions
            </span>
          </div>
          {rows.length > 0 && <SalesChart rows={rows} preOnSale={preOnSale} />}
          <PayTable
            label="Payments over time"
            columns="minmax(120px, 1.2fr) repeat(7, minmax(90px, 1fr))"
            minWidth={900}
            pad="py-[9px]"
            head={[
              { label: GRAIN_NAME[grain], left: true },
              { label: "Pre-unlock sales", info: "payment.ot-pre-sales" },
              { label: "Pre-unlock avg.", info: "payment.ot-pre-avg" },
              { label: "Full-unlock sales", info: "payment.ot-full-sales" },
              { label: "Full-unlock avg.", info: "payment.ot-full-avg" },
              { label: "Revenue", info: "payment.ot-revenue" },
              { label: "Finishers", info: "payment.ot-finishers" },
              { label: "Payment CVR", info: "payment.ot-cvr" },
            ]}
            rows={rows.map((r, i) => ({
              key: r.label,
              cells: [
                { v: r.label, left: true, weight: "bold" },
                { v: preOnSale && r.preOn !== false ? fmt("count", r.preSales) : EMPTY },
                {
                  v:
                    preOnSale && r.preOn !== false
                      ? fmt("eur", ratio(r.preRevenue, r.preSales), 2)
                      : EMPTY,
                },
                { v: fmt("count", r.fullSales) },
                { v: fmt("eur", ratio(r.fullRevenue, r.fullSales), 2) },
                { v: fmt("eur", r.revenue, 2) },
                { v: fmt("count", r.finishers) },
                { v: fmt("pct", cvrs[i], 2), weight: "bold", shade: band(cvrs, cvrs[i] ?? null) },
              ],
            }))}
          />
          {(note || !preOnSale || rows.some((r) => r.preOn === false)) && (
            <p className="m-0 text-xs text-ap-muted">
              {[
                note,
                preOnSale && rows.every((r) => r.preOn !== false)
                  ? null
                  : (d.overTime.preWhy ?? NOT_ON_SALE),
              ]
                .filter(Boolean)
                .join(" ")}
            </p>
          )}
        </>
      )}
    </Card>
  );
}

/** Every way a reader pays, live or not yet (the design's "Payment types"). */
function PaymentTypes({ d }: { d: PaymentPayload }) {
  const { rows, refundsWhy } = d.types;
  const live = rows.filter((r) => r.live);
  const total = live.reduce((n, r) => n + (r.revenue ?? 0), 0);
  // Of the sales made, refunded: a sale refunded in full left the sales, so it is counted back.
  const rate = (r: PaymentTypeRow) =>
    r.refunds === null || r.sales === null || r.fullRefunds === null
      ? null
      : ratio(r.refunds, r.sales + r.fullRefunds);
  // Shaded only across the live rows, as drawn: sales and revenue up, the refund rate down.
  const sales = live.map((r) => r.sales);
  const revenue = live.map((r) => r.revenue);
  const rates = live.map(rate);
  return (
    <Card id="payment-types" labelledBy="h-payment-types">
      <SectionHead
        id="h-payment-types"
        title="Payment types"
        description="Every way a reader pays, across both funnels, each sale in one row: pay to start's are the purchases made on its pages, what a pay-to-start reader later buys on their report has its own row, and an upgrade after €1.99 is a full unlock bought after paying for the €1.99 Core Archetype."
      />
      {d.blocked ? (
        <Why>{d.blocked}</Why>
      ) : (
        <>
          <PayTable
            label="Payment types"
            columns="minmax(240px, 2fr) repeat(6, minmax(96px, 1fr))"
            minWidth={1000}
            head={[
              { label: "Payment type", left: true },
              { label: "Sales", info: "payment.type-sales" },
              { label: "Average price", info: "payment.type-avg" },
              { label: "Revenue", info: "payment.type-revenue" },
              { label: "Share of revenue", info: "payment.type-share" },
              { label: "Refunds", info: "payment.type-refunds" },
              { label: "Refund rate", info: "payment.type-refund-rate" },
            ]}
            rows={rows.map((r) => ({
              key: r.key,
              cells: [
                { v: r.name, sub: r.line, left: true, weight: "bold" },
                { v: fmt("count", r.sales), shade: r.live ? band(sales, r.sales) : "plain" },
                { v: fmt("eur", ratio(r.revenue, r.sales), 2) },
                { v: fmt("eur", r.revenue, 2), shade: r.live ? band(revenue, r.revenue) : "plain" },
                { v: fmt("pct", r.live ? ratio(r.revenue, total) : null, 1) },
                { v: fmt("count", r.refunds) },
                { v: fmt("pct", rate(r), 1), shade: r.live ? band(rates, rate(r), true) : "plain" },
              ],
            }))}
          />
          <p className="m-0 text-xs leading-relaxed text-ap-muted">
            {`Refunds come from the payment records (refunded in full or in part).${refundsWhy ? ` ${refundsWhy}` : ""} Pay to start is live from 22 Oct 2026; the report's €1.99 gate only while it is switched on.`}
          </p>
        </>
      )}
    </Card>
  );
}

/** a) reached, b) attempted, c) paid, side by side for each month (or week, or day). */
function CheckoutBars({ points }: { points: CheckoutPoint[] }) {
  // The top 40px of the 220 hold the counts over the bars.
  const H = 180;
  const top = quarterTop(Math.max(...points.flatMap((p) => [p.reached, p.attempted, p.paid])));
  // Scrolls sideways where narrow: the chart inside takes the keys and scrolls each point in.
  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: points.length * 96 + 40 }}>
        <div
          className="relative border-b border-ap-line"
          style={{ height: 220, margin: "4px 0 0 40px" }}
        >
          {QUARTERS.map((f) => (
            <Fragment key={f}>
              <span
                aria-hidden="true"
                className="absolute inset-x-0 border-t border-ap-track"
                style={{ bottom: `${((f * H) / 220) * 100}%` }}
              />
              <span
                className="absolute -left-10 w-[34px] translate-y-1/2 text-right text-[11px] tabular-nums text-ap-muted"
                style={{ bottom: `${((f * H) / 220) * 100}%` }}
              >
                {fmt("count", f * top)}
              </span>
            </Fragment>
          ))}
          <div className="absolute inset-0 flex items-end">
            {points.map((p) => (
              <div
                key={p.label}
                className="flex h-full min-w-0 flex-1 items-end justify-center gap-1 px-3"
              >
                {[
                  { v: p.reached, color: PRE },
                  { v: p.attempted, color: ATTEMPTED },
                  { v: p.paid, color: GREEN },
                ].map((b) => (
                  <div
                    key={b.color}
                    className="flex h-full min-w-0 max-w-[26px] flex-1 flex-col items-center justify-end gap-[3px]"
                  >
                    <span className="text-[11px] font-bold tabular-nums text-ap-ink">
                      {fmt("count", b.v)}
                    </span>
                    <span
                      className="w-full rounded-b-[1px] rounded-t"
                      style={{ height: Math.max(1, (b.v / top) * H), background: b.color }}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
          <IndexHover
            xs={points.map((_, i) => ((i + 0.5) / points.length) * 100)}
            label="Checkouts over time"
            band={(i) => ({ left: (i / points.length) * 100, width: 100 / points.length })}
            tip={(i) => {
              const p = points[i]!;
              return {
                title: pointTitle(p),
                rows: [
                  {
                    label: "Reached payment page",
                    value: fmt("count", p.reached),
                    color: PRE,
                    mark: "square",
                  },
                  {
                    label: "Attempted payment",
                    value: fmt("count", p.attempted),
                    color: ATTEMPTED,
                    mark: "square",
                  },
                  { label: "Succeeded", value: fmt("count", p.paid), color: GREEN, mark: "square" },
                  {
                    label: "Checkout success",
                    value: fmt("pct", ratio(p.paid, p.reached), 0),
                    strong: Boolean(p.reached),
                    muted: !p.reached,
                  },
                ],
              };
            }}
          />
        </div>
        <div className="flex" style={{ margin: "10px 0 0 40px" }}>
          {points.map((p) => {
            const s = ratio(p.paid, p.reached);
            return (
              <span
                key={p.label}
                className="min-w-0 flex-1 px-3 text-center text-xs leading-[1.4] text-ap-muted"
              >
                {p.label}
                <br />
                <strong
                  className={
                    s === null ? "text-ap-muted" : s >= 0.3 ? "text-ap-good" : "text-ap-bad"
                  }
                >
                  {fmt("pct", s, 0)}
                </strong>{" "}
                success
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Green from `ok`, ink from `warn`, red below: how the design colours a step's rate. */
const stepTone = (v: number | null, ok: number, warn: number) =>
  v === null
    ? "text-ap-muted"
    : v >= ok
      ? "text-ap-good"
      : v >= warn
        ? "text-ap-ink"
        : "text-ap-bad";

function Methods({ c }: { c: PaymentPayload["checkout"] }) {
  const total = c.methods.reduce((n, m) => n + m.sales, 0);
  const color = (i: number) => RANK[Math.min(i, RANK.length - 1)]!;
  // The method's name and kind stay on one line beside its swatch and card icon: room for
  // "Mastercard card" (the longest), so it never runs into the sales.
  const columns = "minmax(190px, 1.5fr) repeat(4, minmax(78px, 1fr))";
  return (
    <div className="flex min-w-0 flex-col gap-2.5 border-t border-ap-line pt-5">
      <SubHead title="Payment methods" info="payment.methods">
        {fmt("count", c.sales)} paid sale{c.sales === 1 ? "" : "s"} in this range, via Stripe
      </SubHead>
      {total === 0 ? (
        <p className="m-0 text-[13px] text-ap-muted">No paid sale in this range.</p>
      ) : (
        <>
          <div aria-hidden="true" className="flex h-[18px] overflow-hidden rounded-full">
            {c.methods.map((m, i) => (
              <span
                key={m.key}
                style={{ width: `${(m.sales / total) * 100}%`, background: color(i) }}
              />
            ))}
          </div>
          <div
            tabIndex={0}
            role="region"
            aria-label="Payment methods, scrolls sideways"
            className="overflow-x-auto rounded-[14px] border border-ap-line"
          >
            <div role="table" aria-label="Payment methods" className="min-w-[510px]">
              <div
                role="row"
                className="grid bg-ap-ground"
                style={{ gridTemplateColumns: columns }}
              >
                {[
                  { label: "Method" },
                  { label: "Sales", info: "payment.m-sales" },
                  { label: "Share", info: "payment.m-share" },
                  { label: "Revenue", info: "payment.m-revenue" },
                  { label: "AOV", info: "payment.m-aov" },
                ].map((h, i) => (
                  <span
                    key={h.label}
                    role="columnheader"
                    className={`px-3 py-[9px] text-[11px] font-bold uppercase tracking-[0.06em] text-ap-muted ${i ? "text-right" : "text-left"}`}
                  >
                    <Labelled label={h.label} info={h.info} />
                  </span>
                ))}
              </div>
              {c.methods.map((m, i) => (
                <div
                  key={m.key}
                  role="row"
                  className="grid border-t border-ap-line text-[13px] tabular-nums"
                  style={{ gridTemplateColumns: columns }}
                >
                  <span
                    role="rowheader"
                    className="flex items-center gap-2.5 px-3 py-[9px] font-semibold text-ap-ink"
                  >
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 flex-none rounded-[3px]"
                      style={{ background: color(i) }}
                    />
                    <span
                      aria-hidden="true"
                      className="inline-flex h-[22px] w-[34px] flex-none items-center justify-center rounded-[5px] border border-ap-line bg-white text-ap-body"
                    >
                      <svg viewBox="0 0 24 16" width="22" height="14">
                        <path
                          d={m.key === "link" ? LINK_ICON : CARD_ICON}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    {m.name}
                    <span className="text-[11px] font-medium text-ap-muted">{m.kind}</span>
                  </span>
                  <span role="cell" className="px-3 py-[9px] text-right">
                    {fmt("count", m.sales)}
                  </span>
                  <span role="cell" className="px-3 py-[9px] text-right font-bold">
                    {fmt("pct", ratio(m.sales, total), 0)}
                  </span>
                  <span role="cell" className="px-3 py-[9px] text-right">
                    {fmt("eur", m.revenue, 0)}
                  </span>
                  <span role="cell" className="px-3 py-[9px] text-right">
                    {fmt("eur", ratio(m.revenue, m.sales), 2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Checkout({ d }: { d: PaymentPayload }) {
  const c = d.checkout;
  const bOfA = ratio(c.attempted, c.reached);
  const cOfB = ratio(c.paid, c.attempted);
  const steps = [
    {
      label: "a) Reached payment page",
      k: "payment.co-reached",
      n: c.reached,
      w: c.reached > 0 ? 1 : 0,
      color: PRE,
      rate: "",
      tone: "text-ap-muted",
    },
    {
      label: "b) Filled in and attempted",
      k: "payment.co-attempted",
      n: c.attempted,
      w: ratio(c.attempted, c.reached),
      color: ATTEMPTED,
      rate: bOfA === null ? EMPTY : `${fmt("pct", bOfA, 1)} of a`,
      tone: stepTone(bOfA, 0.5, 0.3),
    },
    {
      label: "c) Payment succeeded",
      k: "payment.co-paid",
      n: c.paid,
      w: ratio(c.paid, c.reached),
      color: GREEN,
      rate: cOfB === null ? EMPTY : `${fmt("pct", cOfB, 1)} of b`,
      tone: stepTone(cOfB, 0.85, 0.7),
    },
  ];
  return (
    <Card id="checkout" labelledBy="h-co">
      <SectionHead
        id="h-co"
        title="Checkout and payment methods"
        description="How many checkouts turn into a payment, and how people pay."
      />
      {c.why ? (
        <Why>{c.why}</Why>
      ) : (
        <div className="flex flex-col gap-7">
          <div className="flex min-w-0 flex-col gap-2.5">
            <SubHead title="Checkout success" info="payment.checkout">
              Paid checkouts in this range: a) reached the payment page, b) filled in their details
              and attempted to pay, c) payment succeeded. Free (€0) unlocks are left out.
              {c.note ? ` ${c.note}` : ""}
            </SubHead>
            {steps.map((s) => (
              <div
                key={s.label}
                className={`grid grid-cols-[minmax(0,1fr)_minmax(44px,auto)_minmax(84px,auto)] items-center gap-x-3 gap-y-1 py-0.5 text-[13px] sm:grid-cols-[230px_minmax(0,1fr)_70px_120px] ${ROW_HOVER}`}
              >
                <span className="col-span-3 font-semibold text-ap-ink sm:col-span-1">
                  <Labelled label={s.label} info={s.k} />
                </span>
                <Bar pct={s.w} color={s.color} height={18} track="#f5f6f8" />
                <span className="text-right font-bold tabular-nums text-ap-ink">
                  {fmt("count", s.n)}
                </span>
                <span className={`text-right text-xs font-bold tabular-nums ${s.tone}`}>
                  {s.rate}
                </span>
              </div>
            ))}
            <div className="flex flex-wrap gap-x-5 gap-y-2 pt-2.5 text-xs text-ap-body">
              <Swatch color={PRE}>a) Reached payment page</Swatch>
              <Swatch color={ATTEMPTED}>b) Attempted payment</Swatch>
              <Swatch color={GREEN}>c) Succeeded</Swatch>
            </div>
            {c.points.length > 0 && <CheckoutBars points={c.points} />}
          </div>
          <Methods c={c} />
        </div>
      )}
    </Card>
  );
}

/**
 * The rows shown: all of them, but relationships and countries with fewer than SMALL_GROUP
 * finishers are left out, as drawn (the CSV keeps every row).
 */
function shownRows(t: SegmentTable): { rows: SegmentRow[]; leftOut: number } {
  if (!SMALL_LEFT_OUT.has(t.key)) return { rows: t.rows, leftOut: 0 };
  const rows = t.rows.filter((r) => r.finishers >= SMALL_GROUP);
  return { rows, leftOut: t.rows.length - rows.length };
}

const SEGMENT_COLUMNS = "minmax(200px, 1.8fr) repeat(8, minmax(92px, 1fr))";

function Segments({
  d,
  segKey,
  onSegKey,
}: {
  d: PaymentPayload;
  segKey: string;
  onSegKey: (k: string) => void;
}) {
  const t = d.segments.find((s) => s.key === segKey);
  const { rows, leftOut } = t ? shownRows(t) : { rows: [], leftOut: 0 };
  const allSales = (t?.rows ?? []).reduce((n, r) => n + r.sales, 0);
  const cv = rows.map((r) => r.fullCvr);
  const av = rows.map((r) => r.fullAvg);
  const rf = rows.map((r) => ratio(r.revenue, r.finishers));
  return (
    <Card id="segments" labelledBy="h-seg">
      <SectionHead
        id="h-seg"
        title="Who pays"
        align="end"
        description="Payment conversion and revenue by segment, split into pre-unlock and full unlock. Every segment here can be targeted in ads or priced differently."
        right={
          <label className="flex min-w-[200px] flex-[0_1_240px] flex-col gap-1 text-xs font-bold text-ap-muted">
            Segment by
            <select
              value={segKey}
              onChange={(e) => onSegKey(e.target.value)}
              className="min-h-11 rounded-lg border border-ap-ink/[0.18] bg-white px-3 font-sans text-sm font-normal text-ap-ink"
            >
              {SEGMENTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        }
      />
      {d.blocked ? (
        <Why>{d.blocked}</Why>
      ) : (
        <>
          <PayTable
            label={`Who pays by ${t?.label ?? "segment"}`}
            columns={SEGMENT_COLUMNS}
            minWidth={1040}
            group={
              <div
                aria-hidden="true"
                className="grid border-b border-ap-line bg-white"
                style={{ gridTemplateColumns: SEGMENT_COLUMNS }}
              >
                <span className="col-span-3 px-3 py-2" />
                {["Pre-unlock", "Full unlock", "Total"].map((g) => (
                  <span
                    key={g}
                    className="col-span-2 border-l border-ap-line px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-ap-plum"
                  >
                    {g}
                  </span>
                ))}
              </div>
            }
            head={[
              { label: "Segment", left: true },
              { label: "Finishers", info: "payment.seg-finishers" },
              { label: "Share of sales", info: "payment.seg-share" },
              { label: "Pre CVR", info: "payment.seg-pre-cvr" },
              { label: "Pre avg. €", info: "payment.seg-pre-avg" },
              { label: "Full CVR", info: "payment.seg-full-cvr" },
              { label: "Full avg. €", info: "payment.seg-full-avg" },
              { label: "Revenue", info: "payment.seg-revenue" },
              { label: "Rev. / finisher", info: "payment.seg-rev-per" },
            ]}
            rows={rows.map((r, i) => ({
              key: r.label,
              cells: [
                { v: r.label, left: true, weight: "bold" },
                { v: fmt("count", r.finishers) },
                { v: fmt("pct", ratio(r.sales, allSales), 0) },
                { v: fmt("pct", r.preCvr, 2) },
                { v: fmt("eur", r.preAvg, 2) },
                { v: fmt("pct", r.fullCvr, 2), weight: "bold", shade: band(cv, r.fullCvr) },
                { v: fmt("eur", r.fullAvg, 2), shade: band(av, r.fullAvg) },
                { v: fmt("eur", r.revenue, 0) },
                { v: fmt("eur", rf[i], 2), shade: band(rf, rf[i] ?? null) },
              ],
            }))}
          />
          <div className="flex flex-col gap-1 text-xs leading-relaxed text-ap-muted">
            {(t?.note || leftOut > 0) && (
              <p className="m-0">
                {t?.note}
                {leftOut > 0 && " Smaller groups are left out."}
              </p>
            )}
            {!d.overTime.preOnSale && <p className="m-0">{d.overTime.preWhy ?? NOT_ON_SALE}</p>}
          </div>
        </>
      )}
    </Card>
  );
}

const PRICING_COLUMNS = "minmax(170px, 1.5fr) minmax(130px, 1.2fr) repeat(9, minmax(86px, 1fr))";

/** "€29.99 full · €39.99 all" as drawn: the price, then what it buys under it. */
function basePrice(text: string): Cell {
  if (!text.startsWith("€")) return { v: EMPTY, sub: text };
  const sp = text.indexOf(" ");
  return sp < 0 ? { v: text } : { v: text.slice(0, sp), sub: text.slice(sp + 1) };
}

function liftCell(a: PricingArmRow): Cell {
  if (a.control) return { v: EMPTY };
  if (a.aovLift === null) return { v: EMPTY, sub: a.aovWhy ?? "" };
  return {
    v: `${a.aovLift > 0 ? "+" : ""}${fmt("pct", a.aovLift, 1)}`,
    // The verdict beside the confidence, as drawn: 95% or more is credible, as on Traffic.
    sub:
      a.aovConfidence !== null
        ? `${Math.round(a.aovConfidence * 100)}% confidence · ${a.aovConfidence >= 0.95 ? "credible" : "not significant yet"}`
        : (a.aovWhy ?? ""),
    weight: "bold",
    shade: a.aovLift > 0 ? "good" : a.aovLift < 0 ? "bad" : "plain",
  };
}

/** The day a timestamp falls on, as "3 Aug 2026"; null when there is none. */
function dayOf(iso: string | null): string | null {
  const t = iso === null ? NaN : Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const day = reportingDay(new Date(t));
  return rangeLabel(day, day);
}

function Pricing({ d }: { d: PaymentPayload }) {
  const { arms, factors } = d.pricing;
  const since = dayOf(factors.since);
  const sentence =
    factors.on === null
      ? "The price switch could not be read just now."
      : factors.on
        ? "Each visitor's price is the arm's base price times these factors. These are the levers to target or test next."
        : `Switched off${since ? ` since ${since}` : ""}: everyone pays their arm's flat price. Each quote still records these factors, which the price would be multiplied by if the switch were turned on.`;
  return (
    <Card id="experiments" labelledBy="h-exp">
      <SectionHead
        id="h-exp"
        title="Pricing tests"
        description="Every price arm with its funnel, revenue and how credible the difference is. A test is one stretch of unchanged price lists: the people who finished in it, each on the list they were dealt, and their own checkouts and sales up to its end."
      />
      {d.blocked ? (
        <Why>{d.blocked}</Why>
      ) : (
        <PayTable
          label="Pricing tests"
          columns={PRICING_COLUMNS}
          minWidth={1240}
          rowHeaders={false}
          head={[
            { label: "Test", left: true },
            { label: "Arm", left: true, info: "payment.pt-arm" },
            { label: "Base price", info: "payment.pt-base" },
            { label: "Paywall views", info: "payment.pt-views" },
            { label: "Checkouts", info: "payment.pt-checkouts" },
            { label: "Paid sales", info: "payment.pt-sales" },
            { label: "Revenue", info: "payment.pt-revenue" },
            { label: "AOV", info: "payment.pt-aov" },
            { label: "Checkout → paid", info: "payment.pt-co-paid" },
            { label: "Rev. / paywall view", info: "payment.pt-rev-view" },
            { label: "AOV lift · confidence", info: "payment.pt-lift" },
          ]}
          rows={arms.map((a, i) => {
            const first = i === 0 || arms[i - 1]!.test !== a.test;
            // The arm whose sales were larger on average, where the test can compare them.
            const lift = arms.find((x) => x.test === a.test && !x.control)?.aovLift ?? null;
            const won = lift !== null && lift !== 0 && lift > 0 !== a.control;
            const stalled: Partial<Cell> =
              a.paidSales === 0 && (a.checkouts ?? 0) > 0 ? { weight: "bold", shade: "bad" } : {};
            return {
              key: `${a.test}-${a.arm}`,
              dashed: !first,
              cells: [
                first
                  ? { v: a.test, sub: a.note, left: true, weight: "bold" }
                  : { v: "", left: true },
                {
                  v: a.arm,
                  sub: [
                    a.control ? "Control" : "",
                    a.finishers === null
                      ? ""
                      : `${fmt("count", a.finishers)} finisher${a.finishers === 1 ? "" : "s"}`,
                  ]
                    .filter(Boolean)
                    .join(" · "),
                  left: true,
                  weight: "semibold",
                },
                basePrice(a.basePrice),
                a.paywallViews === null
                  ? { v: EMPTY, sub: a.finishers === null ? "" : "recorded from 6 Sep 2026" }
                  : { v: fmt("count", a.paywallViews) },
                { v: fmt("count", a.checkouts) },
                { v: fmt("count", a.paidSales), ...stalled },
                { v: fmt("eur", a.revenue, 0) },
                {
                  v: fmt("eur", ratio(a.revenue, a.paidSales), 2),
                  ...(won ? { weight: "bold" as const, shade: "good" as const } : {}),
                },
                { v: fmt("pct", ratio(a.paidSales, a.checkouts), 0), ...stalled },
                {
                  v: fmt(
                    "eur",
                    a.paywallViews === null ? null : ratio(a.revenue, a.paywallViews),
                    2
                  ),
                },
                liftCell(a),
              ],
            };
          })}
        />
      )}
      <div className="flex flex-col gap-2.5 border-t border-ap-line pt-4">
        <SubHead title="Personal price multipliers in Pricing 3.0">{sentence}</SubHead>
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))" }}
        >
          {factors.groups.map((g) => (
            <div
              key={g.label}
              className="flex flex-col gap-1.5 rounded-[14px] bg-ap-ground px-3.5 py-3"
            >
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ap-label">
                <Labelled label={g.label} info={MULT_INFO[g.label]?.k} />
              </span>
              {g.items.map((it) => (
                <span key={it.key} className="flex justify-between gap-2 text-[13px] text-ap-ink">
                  <span>{it.key}</span>
                  <strong className="tabular-nums">×{it.multiplier.toFixed(2)}</strong>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

const P0 = 3;
const P1 = 40;
/** €3 to €40 in 25-cent steps: where the best price is looked for and the lines are drawn. */
const PRICES = Array.from({ length: (P1 - P0) / 0.25 + 1 }, (_, i) => P0 + i * 0.25);
/** The prices the read-out stops at: the slider's, so a click tests the price its card shows. */
const STOPS = PRICES.filter((p) => Number.isInteger(p * 2));
/** A price's place across the chart, in %. */
const xP = (p: number) => Math.max(0, Math.min(100, ((p - P0) / (P1 - P0)) * 100));

interface Model {
  e: number;
  cap: number;
  cvrAt: (p: number) => number;
  netAt: (p: number) => number;
  best: number;
  cvrTop: number;
  netTop: number;
}

/** cvr(p) = min(cap, e^a · p^e); net(p) = cvr(p) · (p · 0.971 − 0.25), Stripe's fee taken off. */
function modelOf(el: PaymentPayload["elasticity"]): Model | null {
  const { fit, cap } = el;
  if (!fit || cap === null) return null;
  const cvrAt = (p: number) => Math.min(cap, Math.exp(fit.a) * p ** fit.e);
  const netAt = (p: number) => cvrAt(p) * (p * 0.971 - 0.25);
  const best = PRICES.reduce((b, p) => (netAt(p) > netAt(b) ? p : b), P0);
  return {
    e: fit.e,
    cap,
    cvrAt,
    netAt,
    best,
    // Quarter lines written exactly: the rate to a tenth of a point, the money to the cent.
    cvrTop: quarterTop(cap * 1.1, 0.001),
    netTop: quarterTop(Math.max(0, netAt(best)) * 1.1, 0.01),
  };
}

function Elasticity({ el }: { el: PaymentPayload["elasticity"] }) {
  const [probe, setProbe] = useState(15);
  const model = modelOf(el);
  // Per finisher: the model's conversion counts people, each once.
  return (
    <Card id="elasticity" labelledBy="h-el">
      <SectionHead
        id="h-el"
        title="Price elasticity prediction"
        info="payment.elasticity"
        align="end"
        description={
          model && el.months
            ? `A constant-elasticity model fitted to monthly full-unlock price and payment conversion, ${el.months}. It predicts conversion and net revenue per finisher at any price.`
            : "A constant-elasticity model of full-unlock price and payment conversion. It predicts conversion and net revenue per finisher at any price."
        }
        right={
          model ? (
            <label className="flex min-w-[220px] flex-[0_1_260px] flex-col gap-1 text-xs font-bold text-ap-muted">
              Test a price · {fmt("eur", probe, 2)}
              <input
                type="range"
                min={P0}
                max={P1}
                step={0.5}
                value={probe}
                onChange={(e) => setProbe(Number(e.target.value))}
                className="min-h-8 w-full accent-ap-purple"
              />
            </label>
          ) : undefined
        }
      />
      {model ? (
        <ElasticityModel el={el} m={model} probe={probe} onProbe={setProbe} />
      ) : (
        <Why>{el.why ?? "The model could not be fitted to this range."}</Why>
      )}
    </Card>
  );
}

function ElasticityModel({
  el,
  m,
  probe,
  onProbe,
}: {
  el: PaymentPayload["elasticity"];
  m: Model;
  probe: number;
  /** A click on the chart tests that price, as the slider does. */
  onProbe: (price: number) => void;
}) {
  const { e, cvrAt, netAt, best, cvrTop, netTop } = m;
  const n = el.points.length;
  const today = el.today.find((t) => t.arm === "A3") ?? el.today[0];
  const bestNet = netAt(best);
  const tiles: Array<{ label: string; k: string; value: string; sub: string; look: string }> = [
    {
      label: "Price elasticity",
      k: "payment.el-e",
      value: fmt("ratio", e, 2),
      sub:
        e <= 0
          ? `A 10% higher price cuts paying users by about ${Math.abs(e * 10).toFixed(0)}%`
          : `A 10% higher price brings about ${(e * 10).toFixed(0)}% more paying users`,
      look: "border-ap-line bg-white",
    },
    {
      label: "Best price (net revenue)",
      k: "payment.el-best",
      value: fmt("eur", best, 2),
      sub: `Where net revenue per finisher peaks: ${fmt("eur", bestNet, 3)}`,
      look: "border-ap-good/25 bg-ap-good/[0.08]",
    },
    {
      label: `At ${fmt("eur", probe, 2)}`,
      k: "payment.el-at",
      value: fmt("pct", cvrAt(probe), 2),
      sub: `Predicted payment CVR · ${fmt("eur", netAt(probe), 3)} net per finisher`,
      look: "border-ap-line bg-white",
    },
    ...(today
      ? [
          {
            label: `At today’s ${fmt("eur", today.price, 2)} (${today.arm})`,
            k: "payment.el-today",
            value: fmt("pct", cvrAt(today.price), 2),
            sub: `${fmt("eur", netAt(today.price), 3)} net per finisher${
              bestNet > 0
                ? ` · ${((1 - netAt(today.price) / bestNet) * 100).toFixed(0)}% less than at the best price`
                : ""
            }`,
            look: "border-ap-bad/[0.19] bg-ap-bad/[0.07]",
          },
        ]
      : []),
  ];
  const yC = (v: number) => (Math.min(v, cvrTop) / cvrTop) * 100;
  const yN = (v: number) => (Math.max(0, Math.min(v, netTop)) / netTop) * 100;
  const line = (y: (p: number) => number) =>
    PRICES.map((p) => `${xP(p).toFixed(2)},${(100 - y(p)).toFixed(2)}`).join(" ");
  return (
    <>
      <div
        className="grid gap-3.5"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(190px, 100%), 1fr))" }}
      >
        {tiles.map((t) => (
          <div
            key={t.label}
            className={`flex flex-col gap-1.5 rounded-[18px] border px-4 py-3.5 ${t.look}`}
          >
            <Eyebrow>
              {t.label} <Info k={t.k} label={t.label} worked={{ value: t.value }} />
            </Eyebrow>
            <span className="font-serif text-[26px] font-semibold leading-[1.1] tabular-nums text-ap-ink">
              {t.value}
            </span>
            <span className="text-xs text-ap-muted">{t.sub}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-ap-body">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-[3px] w-4 bg-ap-purple" />
          Predicted payment CVR
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-[3px] w-4 bg-ap-good" />
          Net revenue per finisher
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-ap-ink" />
          Observed months
        </span>
      </div>
      {/* Scrolls sideways where narrow: the chart inside takes the keys. */}
      <div className="overflow-x-auto">
        <div className="pt-2" style={{ minWidth: 520 }}>
          <div
            className="relative border-b border-l border-ap-line"
            style={{ height: 280, margin: "0 56px 0 44px" }}
          >
            {QUARTERS.map((f) => (
              <Fragment key={f}>
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 border-t border-ap-track"
                  style={{ bottom: `${f * 100}%` }}
                />
                <span
                  className="absolute -left-11 w-[38px] translate-y-1/2 text-right text-[11px] tabular-nums text-ap-purple"
                  style={{ bottom: `${f * 100}%` }}
                >
                  {fmt("pct", f * cvrTop, 1)}
                </span>
                <span
                  className="absolute left-full ml-1.5 translate-y-1/2 text-[11px] tabular-nums text-ap-good"
                  style={{ bottom: `${f * 100}%` }}
                >
                  {fmt("eur", f * netTop, 2)}
                </span>
              </Fragment>
            ))}
            <span
              aria-hidden="true"
              className="absolute inset-y-0 border-l-2 border-dashed border-ap-good/50"
              style={{ left: `${xP(best)}%` }}
            />
            <span
              className="absolute top-1 translate-x-1.5 whitespace-nowrap text-[11px] font-bold text-ap-good-ink"
              style={{ left: `${xP(best)}%` }}
            >
              Best ≈ {fmt("eur", best, 2)}
            </span>
            <span
              aria-hidden="true"
              className="absolute inset-y-0 border-l-2 border-ap-ink"
              style={{ left: `${xP(probe)}%` }}
            />
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
              className="absolute inset-0 h-full w-full overflow-visible"
            >
              <polyline
                points={line((p) => yC(cvrAt(p)))}
                fill="none"
                stroke="#795fc8"
                strokeWidth={2.4}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              <polyline
                points={line((p) => yN(netAt(p)))}
                fill="none"
                stroke={GREEN}
                strokeWidth={2.4}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {el.points.map((o) => (
              <Fragment key={o.label}>
                <span
                  aria-hidden="true"
                  className="absolute -mb-[5px] -ml-[5px] h-2.5 w-2.5 rounded-full bg-ap-ink shadow-[0_0_0_2px_#ffffff]"
                  style={{ left: `${xP(o.price)}%`, bottom: `${yC(o.cvr)}%` }}
                />
                <span
                  className="absolute translate-x-2 translate-y-1/2 whitespace-nowrap text-[11px] font-bold text-ap-ink"
                  style={{ left: `${xP(o.price)}%`, bottom: `${yC(o.cvr)}%` }}
                >
                  {o.label.split(" ")[0]} {fmt("eur", o.price, 0)}
                </span>
              </Fragment>
            ))}
            <IndexHover
              xs={STOPS.map(xP)}
              label="Price elasticity"
              onPick={(i) => onProbe(STOPS[i]!)}
              markers={(i) => [
                { y: yC(cvrAt(STOPS[i]!)), color: "#795fc8" },
                { y: yN(netAt(STOPS[i]!)), color: GREEN },
              ]}
              tip={(i) => {
                const p = STOPS[i]!;
                // Each observed month at the stop nearest its price.
                const seen = el.points.filter((o) => Math.round(o.price * 2) / 2 === p);
                return {
                  title: `At ${fmt("eur", p, 2)}`,
                  rows: [
                    {
                      label: "Predicted payment CVR",
                      value: fmt("pct", cvrAt(p), 2),
                      color: "#795fc8",
                      mark: "line",
                    },
                    {
                      label: "Net revenue per finisher",
                      value: fmt("eur", netAt(p), 3),
                      color: GREEN,
                      mark: "line",
                    },
                    ...seen.map((o) => ({
                      label: `Observed, ${pointTitle(o)}`,
                      value: fmt("pct", o.cvr, 2),
                      color: INK,
                      mark: "dot" as const,
                    })),
                  ],
                  note: "Click, tap or press Enter to test this price.",
                };
              }}
            />
          </div>
          <div className="relative h-4" style={{ margin: "18px 56px 0 44px" }}>
            {[5, 10, 15, 20, 25, 30, 35, 40].map((p) => (
              <span
                key={p}
                className="absolute -translate-x-1/2 text-[11px] text-ap-muted"
                style={{ left: `${xP(p)}%` }}
              >
                €{p}
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className="m-0 text-xs leading-relaxed text-ap-muted">
        {`Low confidence: ${inWords(n)} monthly points, and price moved together with traffic and the paywall over those months. Conversion is capped at ${fmt("pct", m.cap, 1)}, the best month observed, so the model does not promise more than we have seen. Net revenue takes off Stripe's 2.9% + €0.25. Use it to choose the next price test, not as a forecast.`}
      </p>
    </>
  );
}

/** The CSV: the tiles, then the tables as the page shows them (the chosen segment in full). */
function toCsv(d: PaymentPayload, segKey: string): Array<{ name: string; table: Table }> {
  const col = (label: string, unit: Column["unit"]): Column => ({ label, unit });
  const g = GRAIN_NAME[d.overTime.grain];
  const pre = d.overTime.preOnSale;
  const seg = d.segments.find((s) => s.key === segKey);
  const segSales = (seg?.rows ?? []).reduce((n, r) => n + r.sales, 0);
  const methodSales = d.checkout.methods.reduce((n, m) => n + m.sales, 0);
  const typeRevenue = d.types.rows.reduce((n, r) => n + (r.live ? (r.revenue ?? 0) : 0), 0);
  return [
    {
      name: "Payment types",
      table: {
        columns: [
          col("Payment type", "text"),
          col("Line", "text"),
          col("Sales", "count"),
          col("Average price", "eur"),
          col("Revenue", "eur"),
          col("Share of revenue", "pct"),
          col("Refunds", "count"),
          col("Refund rate", "pct"),
        ],
        rows: d.types.rows.map((r) => ({
          label: r.name,
          values: [
            r.line,
            r.sales,
            ratio(r.revenue, r.sales),
            r.revenue,
            r.live ? ratio(r.revenue, typeRevenue) : null,
            r.refunds,
            r.refunds === null || r.sales === null || r.fullRefunds === null
              ? null
              : ratio(r.refunds, r.sales + r.fullRefunds),
          ],
        })),
      },
    },
    {
      name: "Payments over time",
      table: {
        columns: [
          col(g, "text"),
          col("Pre-unlock sales", "count"),
          col("Pre-unlock avg.", "eur"),
          col("Full-unlock sales", "count"),
          col("Full-unlock avg.", "eur"),
          col("Revenue", "eur"),
          col("Finishers", "count"),
          col("Payment CVR", "pct"),
        ],
        rows: d.overTime.rows.map((r) => ({
          label: r.label,
          values: [
            // As on screen: a row from before the EUR 1.99 was on sale is blank, never 0.
            pre && r.preOn !== false ? r.preSales : null,
            pre && r.preOn !== false ? ratio(r.preRevenue, r.preSales) : null,
            r.fullSales,
            ratio(r.fullRevenue, r.fullSales),
            r.revenue,
            r.finishers,
            ratio(r.payers, r.finishers),
          ],
        })),
      },
    },
    {
      name: "Checkout success",
      table: {
        columns: [
          col(g, "text"),
          col("Reached payment page", "count"),
          col("Attempted payment", "count"),
          col("Succeeded", "count"),
          col("Success", "pct"),
        ],
        rows: d.checkout.points.map((p) => ({
          label: p.label,
          values: [p.reached, p.attempted, p.paid, ratio(p.paid, p.reached)],
        })),
      },
    },
    {
      name: "Payment methods",
      table: {
        columns: [
          col("Method", "text"),
          col("Kind", "text"),
          col("Sales", "count"),
          col("Share", "pct"),
          col("Revenue", "eur"),
          col("AOV", "eur"),
        ],
        rows: d.checkout.methods.map((m) => ({
          label: m.name,
          values: [
            m.kind,
            m.sales,
            ratio(m.sales, methodSales),
            m.revenue,
            ratio(m.revenue, m.sales),
          ],
        })),
      },
    },
    ...(seg
      ? [
          {
            name: `Who pays · ${seg.label}`,
            table: {
              columns: [
                col(seg.label, "text"),
                col("Finishers", "count"),
                col("Share of sales", "pct"),
                col("Pre CVR", "pct"),
                col("Pre avg.", "eur"),
                col("Full CVR", "pct"),
                col("Full avg.", "eur"),
                col("Revenue", "eur"),
                col("Rev. / finisher", "eur"),
              ],
              rows: seg.rows.map((r) => ({
                label: r.label,
                values: [
                  r.finishers,
                  ratio(r.sales, segSales),
                  r.preCvr,
                  r.preAvg,
                  r.fullCvr,
                  r.fullAvg,
                  r.revenue,
                  ratio(r.revenue, r.finishers),
                ],
              })),
            },
          },
        ]
      : []),
    {
      name: "Pricing tests",
      table: {
        columns: [
          col("Test · arm", "text"),
          col("Note", "text"),
          col("Base price", "text"),
          col("Finishers", "count"),
          col("Paywall views", "count"),
          col("Checkouts", "count"),
          col("Paid sales", "count"),
          col("Revenue", "eur"),
          col("AOV", "eur"),
          col("Checkout → paid", "pct"),
          col("Rev. / paywall view", "eur"),
          col("AOV lift", "pct"),
          col("AOV lift confidence", "pct"),
        ],
        rows: d.pricing.arms.map((a) => ({
          label: `${a.test} · ${a.arm}${a.control ? " (control)" : ""}`,
          values: [
            a.note,
            a.basePrice,
            a.finishers,
            a.paywallViews,
            a.checkouts,
            a.paidSales,
            a.revenue,
            ratio(a.revenue, a.paidSales),
            ratio(a.paidSales, a.checkouts),
            a.paywallViews === null ? null : ratio(a.revenue, a.paywallViews),
            a.aovLift,
            a.aovConfidence,
          ],
        })),
      },
    },
  ];
}

/**
 * A tile's info card: its field, this range's figures as the page prints them (a rate or an
 * average with what it divides), and its weekly line where it has one.
 */
function tileInfo(
  t: Tile,
  d: PaymentPayload
): { k: string; worked?: Worked; trend?: TrendSource } | undefined {
  const k = TILE_INFO[t.key]?.k;
  if (!k) return undefined;
  const c = d.counts;
  const n = (v: number | null | undefined) => fmt("count", v);
  const value = fmt(t.unit, t.value, TILE_DIGITS[t.key]);
  const of = (key: string) => d.tiles.find((x) => x.key === key)?.value;
  const parts: Record<string, Omit<Worked, "value">> = {
    "pre-cvr": { num: n(of("pre")), den: n(c.submissions) },
    "full-cvr": { num: n(c.fullSubmissions), den: n(c.submissions) },
    "pay-cvr": { num: n(c.payers), den: n(c.finishers) },
    checkout: { num: n(d.checkout.paid), den: n(d.checkout.reached) },
    aov: { num: fmt("eur", of("revenue"), 2), den: n(of("sales")) },
  };
  return {
    k,
    worked: t.blocked || t.value === null ? undefined : { ...parts[t.key], value },
    trend: t.spark.length ? { route: "payment", tile: t.key, unit: t.unit } : undefined,
  };
}

/** Assessment A · Payment, as Marcus drew it on 16 Oct 2026 and synced on 21 Oct. */
export default function ApPayment() {
  const { params } = useApFilters();
  const { data, loading, error, refetch } = useAdminFetch<PaymentPayload>(
    "/api/admin/ap/payment",
    params
  );
  const [segKey, setSegKey] = useState("gender");
  useHashScroll(Boolean(data));
  const current = useSectionInView(Boolean(data));
  return (
    <>
      <div className="flex flex-col gap-4">
        <PageHeader
          crumbs={["Assessments", "Assessment A", "Payment"]}
          title="Payment"
          description="Who pays, how, at what price, and what each pricing test did to conversion and revenue."
          actions={
            <BlackButton
              disabled={!data}
              onClick={() =>
                data &&
                exportTables(
                  `ap-payment-${data.range.from}-${data.range.to}`,
                  toCsv(data, segKey),
                  data.tiles
                )
              }
            >
              Export CSV
            </BlackButton>
          }
        />
        {/* One row on a phone: the pills scroll sideways rather than wrap. */}
        <div className="max-w-full self-start overflow-x-auto">
          <nav
            aria-label="Payment sections"
            className="flex w-max gap-1.5 rounded-full border border-ap-line bg-white p-1"
          >
            {SECTIONS.map((s) => {
              const on = s.id === current;
              return (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  aria-current={on ? "true" : undefined}
                  className={`inline-flex min-h-10 items-center rounded-full px-4 text-[13px] no-underline ${
                    on
                      ? "bg-ap-ink font-bold text-white"
                      : "font-semibold text-ap-body hover:bg-ap-ground"
                  }`}
                >
                  {s.label}
                </a>
              );
            })}
          </nav>
        </div>
      </div>
      <ApFilterBar scope="assessment" />
      {loading && !data && <Loading label="the payment page" />}
      {error && <Failed message={error} onRetry={refetch} />}
      {data && (
        <Busy busy={loading}>
          <RangeLine data={data} sources="Production database" />
          <div
            className="grid gap-3.5"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))" }}
          >
            {data.tiles.map((t) => (
              <KpiTileV2
                key={t.key}
                tile={t}
                digits={TILE_DIGITS[t.key]}
                titles={bucketTitles(data.range.from, data.range.to)}
                info={tileInfo(t, data)}
              />
            ))}
          </div>
          <PaymentTypes d={data} />
          <OverTime d={data} />
          <Checkout d={data} />
          <Segments d={data} segKey={segKey} onSegKey={setSegKey} />
          <Pricing d={data} />
          <Elasticity el={data.elasticity} />
        </Busy>
      )}
    </>
  );
}
