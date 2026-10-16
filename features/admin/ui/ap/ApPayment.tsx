"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";

import type { Column, Table } from "@features/admin/server/ap/common";
import { rangeLabel, type Grain } from "@features/admin/server/ap/filters";
import { EMPTY, fmt, niceMax } from "@features/admin/server/ap/format";
import type {
  CheckoutPoint,
  OverTimeRow,
  PaymentPayload,
  PricingArmRow,
  SegmentRow,
  SegmentTable,
} from "@features/admin/server/ap/payment";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import { reportingDay } from "@shared/time/reporting-day";

import ApFilterBar from "./ApFilterBar";
import { exportTables } from "./csv";
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
/**
 * Finer axis tops than the Dashboard's, so a top sits close over the figures: on today's they
 * come out at the design's own 16 sales, 600 submissions, 4% and €0.40.
 */
const STEPS = [1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10];
const QUARTERS = [0, 0.25, 0.5, 0.75, 1];
const NOT_ON_SALE = "The Initial plan (pre-unlock) isn't on sale yet.";
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

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
/** A count axis tops at 4 at least: an empty one reads 0 to 4, not 0, 0, 1, 1, 1. */
const countTop = (v: number) => Math.max(4, niceMax(v, STEPS));

type Shade = "plain" | "good" | "bad";
const SHADE: Record<Shade, string> = {
  plain: "text-ap-ink",
  good: "bg-ap-good/[0.08] text-ap-good-ink",
  bad: "bg-ap-bad/[0.07] text-ap-bad-ink",
};
const WEIGHT = { medium: "font-medium", semibold: "font-semibold", bold: "font-bold" };

/** The design's shading: the top third of a column's range green, the bottom third red. */
function band(xs: Array<number | null>, v: number | null): Shade {
  const ok = xs.filter((x): x is number => x !== null && Number.isFinite(x));
  if (v === null || !Number.isFinite(v) || ok.length < 2) return "plain";
  const lo = Math.min(...ok);
  const hi = Math.max(...ok);
  if (hi === lo) return "plain";
  const t = (v - lo) / (hi - lo);
  return t >= 0.67 ? "good" : t <= 0.33 ? "bad" : "plain";
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
  head: Array<{ label: string; left?: boolean }>;
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
              {h.label}
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

/** A subsection's title, as the design sets it (15px bold), kept a heading for screen readers. */
function SubHead({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="m-0 font-sans text-[15px] font-bold text-ap-ink">{title}</h3>
      <p className="m-0 text-[13px] text-ap-muted">{children}</p>
    </div>
  );
}

/** Paid sales stacked by unlock (bars, left axis) under the finishers (dotted, right axis). */
function SalesChart({ rows }: { rows: OverTimeRow[] }) {
  const n = rows.length;
  const H = 240;
  const sTop = countTop(Math.max(...rows.map((r) => r.preSales + r.fullSales)) * 1.1);
  const fTop = countTop(Math.max(...rows.map((r) => r.finishers)) * 1.1);
  const x = (i: number) => ((i + 0.5) / n) * 100;
  const fy = (v: number) => (Math.min(v, fTop) / fTop) * 100;
  const margin = "0 56px 0 40px";
  return (
    <div
      tabIndex={0}
      role="region"
      aria-label="Paid sales over time, chart"
      className="overflow-x-auto"
    >
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
                .map((r, i) => `${x(i).toFixed(2)},${(100 - fy(r.finishers)).toFixed(2)}`)
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
              style={{ left: `${x(i)}%`, bottom: `${fy(r.finishers)}%` }}
            >
              {fmt("count", r.finishers)}
            </span>
          ))}
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
  const { grain, rows, preOnSale } = d.overTime;
  const cvrs = rows.map((r) => ratio(r.preSales + r.fullSales, r.finishers));
  return (
    <Card id="over-time" labelledBy="h-time">
      <SectionHead
        id="h-time"
        title="Pre-unlock and full-unlock payments over time"
        description={`Paid sales per ${GRAIN_NAME[grain].toLowerCase()} by unlock type, against total survey submissions.`}
      />
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-ap-body">
        <Swatch color={PRE}>Pre-unlock (Initial plan)</Swatch>
        <Swatch color={FULL}>Full unlock (Full, Full All, Core)</Swatch>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-0 w-4 border-t-2 border-dotted border-ap-ink" />
          Survey submissions
        </span>
      </div>
      {rows.length > 0 && <SalesChart rows={rows} />}
      <PayTable
        label="Payments over time"
        columns="minmax(120px, 1.2fr) repeat(7, minmax(90px, 1fr))"
        minWidth={900}
        pad="py-[9px]"
        head={[
          { label: GRAIN_NAME[grain], left: true },
          { label: "Pre-unlock sales" },
          { label: "Pre-unlock avg." },
          { label: "Full-unlock sales" },
          { label: "Full-unlock avg." },
          { label: "Revenue" },
          { label: "Finishers" },
          { label: "Payment CVR" },
        ]}
        rows={rows.map((r, i) => ({
          key: r.label,
          cells: [
            { v: r.label, left: true, weight: "bold" },
            { v: preOnSale ? fmt("count", r.preSales) : EMPTY },
            { v: preOnSale ? fmt("eur", ratio(r.preRevenue, r.preSales), 2) : EMPTY },
            { v: fmt("count", r.fullSales) },
            { v: fmt("eur", ratio(r.fullRevenue, r.fullSales), 2) },
            { v: fmt("eur", r.revenue, 2) },
            { v: fmt("count", r.finishers) },
            { v: fmt("pct", cvrs[i], 2), weight: "bold", shade: band(cvrs, cvrs[i] ?? null) },
          ],
        }))}
      />
      {!preOnSale && <p className="m-0 text-xs text-ap-muted">{NOT_ON_SALE}</p>}
    </Card>
  );
}

/** a) reached, b) attempted, c) paid, side by side for each month (or week, or day). */
function CheckoutBars({ points }: { points: CheckoutPoint[] }) {
  // The top 40px of the 220 hold the counts over the bars.
  const H = 180;
  const top = countTop(Math.max(...points.flatMap((p) => [p.reached, p.attempted, p.paid])));
  return (
    <div
      tabIndex={0}
      role="region"
      aria-label="Checkouts over time, chart"
      className="overflow-x-auto"
    >
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
          <div className="absolute inset-0 flex items-end gap-6 px-3">
            {points.map((p) => (
              <div
                key={p.label}
                className="flex h-full min-w-0 flex-1 items-end justify-center gap-1"
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
        </div>
        <div className="flex gap-6 px-3" style={{ margin: "10px 0 0 40px" }}>
          {points.map((p) => {
            const s = ratio(p.paid, p.reached);
            return (
              <span
                key={p.label}
                className="min-w-0 flex-1 text-center text-xs leading-[1.4] text-ap-muted"
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
  const columns = "minmax(130px, 1.5fr) repeat(4, minmax(70px, 1fr))";
  return (
    <div className="flex min-w-0 flex-col gap-2.5 border-t border-ap-line pt-5">
      <SubHead title="Payment methods">
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
            <div role="table" aria-label="Payment methods" className="min-w-[440px]">
              <div
                role="row"
                className="grid bg-ap-ground"
                style={{ gridTemplateColumns: columns }}
              >
                {["Method", "Sales", "Share", "Revenue", "AOV"].map((h, i) => (
                  <span
                    key={h}
                    role="columnheader"
                    className={`px-3 py-[9px] text-[11px] font-bold uppercase tracking-[0.06em] text-ap-muted ${i ? "text-right" : "text-left"}`}
                  >
                    {h}
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
      n: c.reached,
      w: c.reached > 0 ? 1 : 0,
      color: PRE,
      rate: "",
      tone: "text-ap-muted",
    },
    {
      label: "b) Filled in and attempted",
      n: c.attempted,
      w: ratio(c.attempted, c.reached),
      color: ATTEMPTED,
      rate: bOfA === null ? EMPTY : `${fmt("pct", bOfA, 1)} of a`,
      tone: stepTone(bOfA, 0.5, 0.3),
    },
    {
      label: "c) Payment succeeded",
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
        <p className="m-0 text-[13px] leading-relaxed text-ap-muted">{c.why}</p>
      ) : (
        <div className="flex flex-col gap-7">
          <div className="flex min-w-0 flex-col gap-2.5">
            <SubHead title="Checkout success">
              Paid checkouts in this range: a) reached the payment page, b) filled in their details
              and attempted to pay, c) payment succeeded. Free (€0) unlocks are left out.
              {c.note ? ` ${c.note}` : ""}
            </SubHead>
            {steps.map((s) => (
              <div
                key={s.label}
                className="grid grid-cols-[minmax(0,1fr)_minmax(44px,auto)_minmax(84px,auto)] items-center gap-x-3 gap-y-1 text-[13px] sm:grid-cols-[230px_minmax(0,1fr)_70px_120px]"
              >
                <span className="col-span-3 font-semibold text-ap-ink sm:col-span-1">
                  {s.label}
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
 * The rows shown: all of them, but for countries the 12 largest and the rest added up as
 * "Other countries", from the counts behind each rate.
 */
function shownRows(t: SegmentTable): { rows: SegmentRow[]; merged: number } {
  if (t.key !== "country" || t.rows.length <= 12) return { rows: t.rows, merged: 0 };
  const sorted = [...t.rows].sort((a, b) => b.finishers - a.finishers);
  const rest = sorted.slice(12);
  const sum = (f: (r: SegmentRow) => number) => rest.reduce((n, r) => n + f(r), 0);
  const finishers = sum((r) => r.finishers);
  const fullSales = sum((r) => r.fullSales);
  const fullRevenue = Math.round(sum((r) => r.fullRevenue) * 100) / 100;
  const other: SegmentRow = {
    label: "Other countries",
    finishers,
    sales: sum((r) => r.sales),
    // Pre-unlock is not on sale: blank, or 0 for every row once it is (see buildPayment).
    preCvr: rest.some((r) => r.preCvr === null) ? null : 0,
    preAvg: null,
    fullCvr: ratio(
      sum((r) => r.fullBuyers),
      finishers
    ),
    fullAvg: ratio(fullRevenue, fullSales),
    revenue: Math.round(sum((r) => r.revenue) * 100) / 100,
    fullBuyers: sum((r) => r.fullBuyers),
    fullSales,
    fullRevenue,
  };
  return { rows: [...sorted.slice(0, 12), other], merged: rest.length };
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
  const { rows, merged } = t ? shownRows(t) : { rows: [], merged: 0 };
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
          { label: "Finishers" },
          { label: "Share of sales" },
          { label: "Pre CVR" },
          { label: "Pre avg. €" },
          { label: "Full CVR" },
          { label: "Full avg. €" },
          { label: "Revenue" },
          { label: "Rev. / finisher" },
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
        {(t?.note || merged > 0) && (
          <p className="m-0">
            {t?.note}
            {merged > 0 && ` Other countries: the ${merged} smaller countries added together.`}
          </p>
        )}
        {!d.overTime.preOnSale && <p className="m-0">{NOT_ON_SALE}</p>}
      </div>
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
        description="Every price arm with its funnel, revenue and how credible the difference is."
      />
      <PayTable
        label="Pricing tests"
        columns={PRICING_COLUMNS}
        minWidth={1240}
        rowHeaders={false}
        head={[
          { label: "Test", left: true },
          { label: "Arm", left: true },
          { label: "Base price" },
          { label: "Paywall views" },
          { label: "Checkouts" },
          { label: "Paid sales" },
          { label: "Revenue" },
          { label: "AOV" },
          { label: "Checkout → paid" },
          { label: "Rev. / paywall view" },
          { label: "AOV lift · confidence" },
        ]}
        rows={arms.map((a, i) => {
          const first = i === 0 || arms[i - 1]!.test !== a.test;
          // The arm whose sales were larger on average, where the test can compare them.
          const lift = arms.find((x) => x.test === a.test && !x.control)?.aovLift ?? null;
          const won = lift !== null && lift !== 0 && lift > 0 !== a.control;
          const stalled: Partial<Cell> =
            a.paidSales === 0 && a.checkouts > 0 ? { weight: "bold", shade: "bad" } : {};
          return {
            key: `${a.test}-${a.arm}`,
            dashed: !first,
            cells: [
              first
                ? { v: a.test, sub: a.note, left: true, weight: "bold" }
                : { v: "", left: true },
              { v: a.arm, sub: a.control ? "Control" : "", left: true, weight: "semibold" },
              basePrice(a.basePrice),
              a.paywallViews === null
                ? { v: EMPTY, sub: "not logged" }
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
                v: fmt("eur", a.paywallViews === null ? null : ratio(a.revenue, a.paywallViews), 2),
              },
              liftCell(a),
            ],
          };
        })}
      />
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
                {g.label}
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
    cvrTop: niceMax(cap * 1.1, STEPS),
    netTop: niceMax(Math.max(0, netAt(best)) * 1.1, STEPS),
  };
}

function Elasticity({ el }: { el: PaymentPayload["elasticity"] }) {
  const [probe, setProbe] = useState(15);
  const n = el.points.length;
  const model = modelOf(el);
  return (
    <Card id="elasticity" labelledBy="h-el">
      <SectionHead
        id="h-el"
        title="Price elasticity prediction"
        align="end"
        description={
          model
            ? `A constant-elasticity model fitted to ${n} month${n === 1 ? "" : "s"} of full-unlock price and payment conversion in this range. It predicts conversion and net revenue per submission at any price.`
            : "A constant-elasticity model of full-unlock price and payment conversion. It predicts conversion and net revenue per submission at any price."
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
        <ElasticityModel el={el} m={model} probe={probe} />
      ) : (
        <p className="m-0 text-[13px] leading-relaxed text-ap-muted">
          {el.why ?? "The model could not be fitted to this range."}
        </p>
      )}
    </Card>
  );
}

function ElasticityModel({
  el,
  m,
  probe,
}: {
  el: PaymentPayload["elasticity"];
  m: Model;
  probe: number;
}) {
  const { e, cvrAt, netAt, best, cvrTop, netTop } = m;
  const n = el.points.length;
  const today = el.today.find((t) => t.arm === "A3") ?? el.today[0];
  const bestNet = netAt(best);
  const tiles: Array<{ label: string; value: string; sub: string; look: string }> = [
    {
      label: "Price elasticity",
      value: fmt("ratio", e, 2),
      sub:
        e <= 0
          ? `A 10% higher price cuts paying users by about ${Math.abs(e * 10).toFixed(0)}%`
          : `A 10% higher price brings about ${(e * 10).toFixed(0)}% more paying users`,
      look: "border-ap-line bg-white",
    },
    {
      label: "Best price (net revenue)",
      value: fmt("eur", best, 2),
      sub: `Where net revenue per submission peaks: ${fmt("eur", bestNet, 3)}`,
      look: "border-ap-good/25 bg-ap-good/[0.08]",
    },
    {
      label: `At ${fmt("eur", probe, 2)}`,
      value: fmt("pct", cvrAt(probe), 2),
      sub: `Predicted payment CVR · ${fmt("eur", netAt(probe), 3)} net per submission`,
      look: "border-ap-line bg-white",
    },
    ...(today
      ? [
          {
            label: `At today’s ${fmt("eur", today.price, 2)} (${today.arm})`,
            value: fmt("pct", cvrAt(today.price), 2),
            sub: `${fmt("eur", netAt(today.price), 3)} net per submission${
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
            <Eyebrow>{t.label}</Eyebrow>
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
          Net revenue per submission
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-ap-ink" />
          Observed months
        </span>
      </div>
      <div
        tabIndex={0}
        role="region"
        aria-label="Price elasticity, chart"
        className="overflow-x-auto"
      >
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
        {`Low confidence: ${n} monthly points, and price moved together with traffic and the paywall over those months. Conversion is capped at ${fmt("pct", m.cap, 1)}, the best month observed, so the model does not promise more than we have seen. Net revenue takes off Stripe's 2.9% + €0.25. Use it to choose the next price test, not as a forecast.`}
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
  return [
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
            pre ? r.preSales : null,
            pre ? ratio(r.preRevenue, r.preSales) : null,
            r.fullSales,
            ratio(r.fullRevenue, r.fullSales),
            r.revenue,
            r.finishers,
            ratio(r.preSales + r.fullSales, r.finishers),
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

/** Assessment A · Payment, as Marcus drew it on 16 Oct 2026. */
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
              <KpiTileV2 key={t.key} tile={t} digits={TILE_DIGITS[t.key]} />
            ))}
          </div>
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
