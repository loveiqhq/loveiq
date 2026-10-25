"use client";

import { useMemo, useState } from "react";

import { EMPTY, fmt } from "@features/admin/server/ap/format";
import type {
  ArmRow,
  ArmStatus,
  LandingCounts,
  LandingPayload,
  PayFirstRow,
} from "@features/admin/server/ap/landing";
import type { Table, Tile } from "@features/admin/server/ap/common";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";

import ApFilterBar from "./ApFilterBar";
import { exportTables } from "./csv";
import { Info, type Worked } from "./field-info";
import { bucketTitles } from "./hover";
import {
  BlackButton,
  Busy,
  Card,
  Failed,
  FilterIcon,
  ICON_BTN,
  KpiTileV2,
  Loading,
  PageHeader,
  RangeLine,
  SectionHead,
  SortIcon,
  STANDING,
  STANDING_WORD,
  standingOf,
  TileGrid,
  useHashScroll,
} from "./kit";
import { useApFilters } from "./useApFilters";

const STATUS: Record<ArmStatus, string> = {
  Running: "bg-ap-purple/10 text-ap-violet",
  Winner: "bg-ap-good/10 text-ap-good-ink",
  Ended: "bg-ap-track text-ap-muted",
};

type MetricKey =
  | "visits"
  | "startCvr"
  | "submitCvr"
  | "preCvr"
  | "fullCvr"
  | "perVisit"
  | "bounce"
  | "medianSeconds";

/** The heat columns: unit, whether lower is better, and their info cards. */
const COLUMNS: Array<{
  key: MetricKey;
  label: string;
  heat: boolean;
  lower?: boolean;
  info: string;
}> = [
  { key: "visits", label: "Visits", heat: false, info: "landing.visits" },
  { key: "startCvr", label: "Start CVR", heat: true, info: "landing.arm-start-cvr" },
  { key: "submitCvr", label: "Submit CVR", heat: true, info: "landing.arm-submit-cvr" },
  { key: "preCvr", label: "Pre-unlock CVR", heat: true, info: "landing.arm-pre-cvr" },
  { key: "fullCvr", label: "Full-unlock CVR", heat: true, info: "landing.arm-full-cvr" },
  { key: "perVisit", label: "€ / visit", heat: true, info: "landing.arm-rev-visit" },
  { key: "bounce", label: "Bounce", heat: true, lower: true, info: "landing.bounce" },
  // A median: the average is many times the typical visit (tabs left open), so it is in the export only.
  { key: "medianSeconds", label: "Median time", heat: true, info: "landing.median-time" },
];

/** Percentages as the design writes them here: "5.4%", unlocks "0.19%", bounce "61%". */
const DIGITS: Partial<Record<MetricKey, number>> = {
  startCvr: 1,
  submitCvr: 1,
  preCvr: 2,
  fullCvr: 2,
  bounce: 0,
};

function cell(key: MetricKey, v: number | null): string {
  if (key === "visits") return fmt("count", v);
  if (key === "perVisit") return fmt("eur3", v);
  if (key === "medianSeconds") return fmt("mmss", v === null ? null : v * 1000);
  return fmt("pct", v, DIGITS[key]);
}

/** A cell's number as it reads ("5.4%" is 5.4, "5 s" is 5, "1:05" is 65): the design shades what it shows. */
function shown(text: string): number {
  const [m, s] = text.replace(/[^0-9.:]/g, "").split(":");
  return s === undefined ? Number(m) : Number(m) * 60 + Number(s);
}

/** Shaded from best (green) to worst (red) among the rows shown, as the design shades it. */
function heat(t: number) {
  const bg =
    t >= 0.5
      ? `rgba(46,125,91,${((t - 0.5) * 0.36).toFixed(3)})`
      : `rgba(214,50,0,${((0.5 - t) * 0.28).toFixed(3)})`;
  const strong = t >= 0.85 || t <= 0.15;
  return {
    background: bg,
    color: t >= 0.85 ? "#1f5c42" : t <= 0.15 ? "#a62700" : "#161021",
    fontWeight: strong ? 700 : 500,
  };
}

function TestsTable({ data }: { data: LandingPayload }) {
  const [sort, setSort] = useState<{ key: MetricKey; dir: 1 | -1 } | null>(null);
  const [filtering, setFiltering] = useState(false);
  const [testFilter, setTestFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ArmStatus>("all");
  const tests = [...new Set(data.rows.map((r) => r.testKey))];
  // A test chosen for an earlier range, and gone from this one, filters nothing.
  const test = tests.includes(testFilter) ? testFilter : "all";
  const rows = useMemo(() => {
    const kept = data.rows.filter(
      (r) =>
        (test === "all" || r.testKey === test) &&
        (statusFilter === "all" || r.status === statusFilter)
    );
    if (!sort) return kept;
    return [...kept].sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      if (x === null) return 1;
      if (y === null) return -1;
      return (x - y) * sort.dir;
    });
  }, [data.rows, sort, test, statusFilter]);
  // Shaded among the variants shown, as the heading says: a filter re-shades the rest.
  const ranges = useMemo(
    () =>
      Object.fromEntries(
        COLUMNS.map((c) => {
          const vs = rows
            .map((r) => r[c.key])
            .filter((v): v is number => v !== null)
            .map((v) => shown(cell(c.key, v)));
          return [c.key, vs.length ? [Math.min(...vs), Math.max(...vs)] : null];
        })
      ) as Record<MetricKey, [number, number] | null>,
    [rows]
  );
  const filterButton = (label: string) => (
    <button
      type="button"
      aria-label={`Filter ${label}`}
      aria-expanded={filtering}
      onClick={() => setFiltering(!filtering)}
      className={`${ICON_BTN} ${
        filtering || test !== "all" || statusFilter !== "all" ? "text-ap-violet" : "text-ap-muted"
      }`}
    >
      <FilterIcon />
    </button>
  );
  // The design's columns: on a phone the test and status leave part of Visits in view.
  const gtc = "minmax(200px, 2fr) minmax(90px, 0.8fr) repeat(8, minmax(84px, 1fr))";
  return (
    <Card id="tests" labelledBy="h-tests">
      <SectionHead
        id="h-tests"
        title="Tests and variants"
        info="landing.tests"
        description="Each column is shaded from best (green) to worst (red) among the variants shown. Lower is better for bounce."
      />
      {filtering && data.rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-ap-body">
          <label className="flex items-center gap-2">
            Test
            <select
              value={test}
              onChange={(e) => setTestFilter(e.target.value)}
              className="min-h-9 rounded-full border border-ap-line bg-white px-3 text-[13px] text-ap-ink"
            >
              <option value="all">All tests</option>
              {tests.map((k) => (
                <option key={k} value={k}>
                  {data.rows.find((r) => r.testKey === k)?.test ?? k}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            Status
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | ArmStatus)}
              className="min-h-9 rounded-full border border-ap-line bg-white px-3 text-[13px] text-ap-ink"
            >
              <option value="all">All</option>
              <option value="Running">Running</option>
              <option value="Winner">Winner</option>
              <option value="Ended">Ended</option>
            </select>
          </label>
        </div>
      )}
      {data.rows.length === 0 ? (
        <p className="m-0 text-sm text-ap-muted">No landing test ran in this range.</p>
      ) : (
        <div className="overflow-x-auto rounded-[14px] border border-ap-line">
          <div role="table" aria-label="Landing tests and variants" style={{ minWidth: 1040 }}>
            <div role="row" className="grid bg-ap-ground" style={{ gridTemplateColumns: gtc }}>
              <span
                role="columnheader"
                className="flex items-center gap-1 px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-ap-muted"
              >
                Test · variant
                {filterButton("Test · variant")}
              </span>
              <span
                role="columnheader"
                className="flex items-center gap-1 px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-ap-muted"
              >
                Status
                {filterButton("Status")}
              </span>
              {COLUMNS.map((c) => (
                <span
                  key={c.key}
                  role="columnheader"
                  aria-sort={
                    sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"
                  }
                  className="flex items-center justify-end gap-1 px-3.5 py-2.5 text-right text-[11px] font-bold uppercase tracking-[0.08em] text-ap-muted"
                >
                  {c.label}
                  <Info k={c.info} label={c.label} />
                  <button
                    type="button"
                    aria-label={`Sort by ${c.label}`}
                    onClick={() =>
                      setSort((s) =>
                        s?.key === c.key
                          ? { key: c.key, dir: s.dir === 1 ? -1 : 1 }
                          : { key: c.key, dir: -1 }
                      )
                    }
                    className={`${ICON_BTN} ${sort?.key === c.key ? "text-ap-violet" : "text-ap-muted"}`}
                  >
                    <SortIcon dir={sort?.key === c.key ? sort.dir : null} />
                  </button>
                </span>
              ))}
            </div>
            {rows.length === 0 && (
              <p className="m-0 border-t border-ap-line px-3.5 py-3 text-sm text-ap-muted">
                No variant matches the filters.
              </p>
            )}
            {rows.map((r) => (
              <div
                key={`${r.testKey}-${r.arm}`}
                role="row"
                className={`grid items-center border-t border-ap-line ${tests.indexOf(r.testKey) % 2 ? "bg-white" : "bg-[#fcfbfe]"}`}
                style={{ gridTemplateColumns: gtc }}
              >
                <span role="cell" className="flex min-w-0 flex-col gap-0.5 px-3.5 py-2.5">
                  <span className="truncate text-sm font-semibold text-ap-ink" title={r.test}>
                    {r.test}
                  </span>
                  <span className="text-xs text-ap-muted">{r.label}</span>
                </span>
                <span role="cell" className="flex items-center px-3.5 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS[r.status]}`}
                  >
                    {r.status}
                  </span>
                </span>
                {COLUMNS.map((c) => {
                  const v = r[c.key];
                  const text = cell(c.key, v);
                  const range = ranges[c.key];
                  let style = {};
                  if (c.heat && v !== null && range) {
                    const [mn, mx] = range;
                    let t = mx === mn ? 0.5 : (shown(text) - mn) / (mx - mn);
                    if (c.lower) t = 1 - t;
                    style = heat(t);
                  }
                  return (
                    <span
                      key={c.key}
                      role="cell"
                      className={`flex items-center justify-end px-2.5 py-2 text-right text-sm tabular-nums ${v === null ? "text-ap-muted" : "text-ap-ink"}`}
                    >
                      <span className="rounded-lg px-2 py-1.5" style={style}>
                        {text}
                      </span>
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
      {data.unread.length > 0 && (
        <div className="flex flex-col gap-1.5 text-xs leading-relaxed">
          {data.unread.map((u) => (
            <p key={u} className="m-0 text-ap-bad-ink">
              {u}
            </p>
          ))}
        </div>
      )}
    </Card>
  );
}

/**
 * The design's pay-first landing pages (the price before the survey): each page's Step by step
 * figures on the Pay to start page, so the two pages agree, the better page green and the other
 * red where higher is better. "Saw the price" is no step on these pages: the price is on screen
 * from the first moment on every device, as the note under the table says.
 */
const PAY_FIRST_COLUMNS: Array<{
  label: string;
  info?: string;
  cell: (r: PayFirstRow) => string;
  value?: (r: PayFirstRow) => number | null;
}> = [
  { label: "Visitors", info: "landing.pf-visitors", cell: (r) => fmt("count", r.visitors) },
  { label: "Saw the price", cell: () => EMPTY },
  {
    label: "Started checkout",
    info: "landing.pf-checkout",
    cell: (r) => fmt("count", r.checkout),
    value: (r) => r.checkout,
  },
  {
    label: "Paid",
    info: "landing.pf-paid",
    cell: (r) => fmt("count", r.paid),
    value: (r) => r.paid,
  },
  {
    label: "Visitor → paid",
    info: "landing.pf-v2p",
    cell: (r) => fmt("pct", r.v2p, 2),
    value: (r) => r.v2p,
  },
  // A count, not coloured: as drawn (the page with more buyers starts more surveys).
  { label: "Started survey", info: "landing.pf-started", cell: (r) => fmt("count", r.started) },
  {
    label: "Paid → completed",
    info: "landing.pf-p2c",
    cell: (r) => fmt("pct", r.p2c, 0),
    value: (r) => r.p2c,
  },
];

function PayToStart({ data }: { data: LandingPayload }) {
  const gtc = "minmax(230px, 2fr) repeat(7, minmax(96px, 1fr))";
  const pf = data.payFirst;
  return (
    <Card id="pay-first" labelledBy="h-pay-first">
      <SectionHead
        id="h-pay-first"
        title="Pay-to-start landing pages"
        description="Landing pages with the price shown before the survey. The visitor pays first, then takes the survey. The same figures as the Pay to start page, step by step."
      />
      {pf && pf.rows.length === 0 ? null : pf ? (
        <div tabIndex={0} className="overflow-x-auto rounded-[14px] border border-ap-line">
          <div role="table" aria-label="Pay-to-start landing pages" className="min-w-[980px]">
            <div role="row" className="grid bg-ap-ground" style={{ gridTemplateColumns: gtc }}>
              <span
                role="columnheader"
                className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-ap-muted"
              >
                Landing page
              </span>
              {PAY_FIRST_COLUMNS.map((c) => (
                <span
                  key={c.label}
                  role="columnheader"
                  className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-[0.06em] text-ap-muted"
                >
                  {c.label}
                  {c.info && <Info k={c.info} label={c.label} />}
                </span>
              ))}
            </div>
            {pf.rows.map((r) => (
              <div
                key={r.key}
                role="row"
                className="grid border-t border-ap-line"
                style={{ gridTemplateColumns: gtc }}
              >
                <span role="rowheader" className="flex flex-col gap-0.5 px-3 py-2.5">
                  <span className="text-[13px] font-bold">{r.name}</span>
                  <span className="text-[11px] text-ap-muted">{r.sub}</span>
                </span>
                {PAY_FIRST_COLUMNS.map((c) => {
                  const tone = c.value
                    ? standingOf(pf.rows.map(c.value), c.value(r), "high")
                    : "plain";
                  return (
                    <span
                      key={c.label}
                      role="cell"
                      title={tone === "plain" ? undefined : STANDING_WORD[tone]}
                      className={`px-3 py-2.5 text-right text-[13px] tabular-nums ${STANDING[tone]}`}
                    >
                      {c.cell(r)}
                      {tone !== "plain" && (
                        <span className="sr-only"> ({STANDING_WORD[tone]})</span>
                      )}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="m-0 text-sm text-ap-muted">
          Pay to start&rsquo;s figures could not be read just now. Try again in a minute.
        </p>
      )}
      {pf && pf.rows.length > 0 && (
        <p className="m-0 text-xs text-ap-muted">
          Saw the price: the price is on screen from the first moment on every device (the card
          beside the text on a computer, the bar at the bottom on a phone), so it is no step of its
          own here. Green is the better of the two pages in a column, red the other.
        </p>
      )}
      {(pf?.notes ?? []).map((x) => (
        <p key={x} className="m-0 text-xs text-ap-muted">
          {x}
        </p>
      ))}
    </Card>
  );
}

/** The design's engagement columns: Bounce, the median time, CTA clicks, then scroll depth. */
const ENG_COLUMNS: Array<{ label: string; info: string }> = [
  { label: "Bounce", info: "landing.bounce" },
  { label: "Median time", info: "landing.median-time" },
  { label: "CTA clicks", info: "landing.cta" },
  { label: "25%", info: "landing.scroll-25" },
  { label: "50%", info: "landing.scroll-50" },
  { label: "75%", info: "landing.scroll-75" },
  { label: "100%", info: "landing.scroll-100" },
];

/**
 * The all-pages row: every landing visit together, its time the median of every view (medians
 * don't average across versions), so never "Weighted average".
 */
const ALL_PAGES = "Every visit together · median time";

/** One row's values in those columns: shares 0..1, seconds for the time; null where unread. */
function engagementValues(r: ArmRow): Array<number | null> {
  return [r.bounce, r.medianSeconds, r.cta, ...(r.scroll ?? [null, null, null, null])];
}

/** As the design writes them: "61%", "5 s", "8.6%", "80%" (the all-pages row a tenth more). */
function engagementText(i: number, v: number | null, average = false): string {
  if (i === 1) return fmt("mmss", v === null ? null : v * 1000);
  return fmt("pct", v, i === 2 || (average && i === 0) ? 1 : 0);
}

function EngagementTable({ data }: { data: LandingPayload }) {
  const rows = data.rows;
  // Shaded among the variants, best green to worst red; lower is better for bounce.
  const ranges = ENG_COLUMNS.map((_, i) => {
    const vs = rows
      .map((r) => engagementValues(r)[i])
      .filter((v): v is number => v !== null && v !== undefined)
      .map((v) => shown(engagementText(i, v)));
    return vs.length ? ([Math.min(...vs), Math.max(...vs)] as const) : null;
  });
  const e = data.engagement;
  const avg: Array<number | null> | null =
    e && e.ok
      ? [e.value.bounce, e.value.medianSeconds, e.value.cta, ...e.value.scroll.map((x) => x.share)]
      : null;
  const gtc = "minmax(220px, 2fr) repeat(7, minmax(80px, 1fr))";
  const tests = [...new Set(rows.map((r) => r.testKey))];
  const unreadArms = rows.filter((r) => r.phSessions === null).length;
  return (
    <Card labelledBy="h-engage">
      <SectionHead
        id="h-engage"
        title="Engagement per landing page"
        info="landing.engagement"
        description="Bounce, time on page, CTA clicks and how far visitors scroll. Each column is shaded from best (green) to worst (red)."
      />
      {rows.length === 0 && !avg ? (
        <p className="m-0 text-sm text-ap-muted">No landing test ran in this range.</p>
      ) : (
        <div
          tabIndex={0}
          role="region"
          aria-label="Engagement per landing page, scrolls sideways"
          className="overflow-x-auto rounded-[14px] border border-ap-line"
        >
          <div role="table" aria-label="Engagement per landing page" style={{ minWidth: 900 }}>
            <div
              role="row"
              className="grid border-b border-ap-line bg-white"
              style={{ gridTemplateColumns: gtc }}
            >
              <span role="columnheader" className="col-span-4 px-3 py-2" aria-hidden="true" />
              <span
                role="columnheader"
                className="col-span-4 border-l border-ap-line px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-ap-plum"
              >
                Scroll depth reached
              </span>
            </div>
            <div role="row" className="grid bg-ap-ground" style={{ gridTemplateColumns: gtc }}>
              <span
                role="columnheader"
                className="px-3 py-2.5 text-left text-[11px] font-bold uppercase leading-[1.3] tracking-[0.06em] text-ap-muted"
              >
                Landing page · variant
              </span>
              {ENG_COLUMNS.map((c) => (
                <span
                  key={c.label}
                  role="columnheader"
                  className="flex items-center justify-end gap-1 px-3 py-2.5 text-right text-[11px] font-bold uppercase leading-[1.3] tracking-[0.06em] text-ap-muted"
                >
                  {c.label}
                  <Info k={c.info} label={c.label} />
                </span>
              ))}
            </div>
            {rows.map((r) => {
              const values = engagementValues(r);
              return (
                <div
                  key={`${r.testKey}-${r.arm}`}
                  role="row"
                  className={`grid border-t border-ap-line ${tests.indexOf(r.testKey) % 2 ? "bg-white" : "bg-[#fcfbfe]"}`}
                  style={{ gridTemplateColumns: gtc }}
                >
                  <span role="cell" className="flex min-w-0 flex-col gap-0.5 px-3 py-2.5">
                    <span className="truncate text-[13px] font-bold text-ap-ink" title={r.test}>
                      {r.test}
                    </span>
                    <span className="text-xs text-ap-muted">{r.label}</span>
                  </span>
                  {values.map((v, i) => {
                    const text = engagementText(i, v);
                    const range = ranges[i];
                    let style = {};
                    if (v !== null && range) {
                      const [mn, mx] = range;
                      let t = mx === mn ? 0.5 : (shown(text) - mn) / (mx - mn);
                      if (i === 0) t = 1 - t;
                      style = heat(t);
                    }
                    return (
                      <span
                        key={ENG_COLUMNS[i]!.label}
                        role="cell"
                        className={`flex items-center justify-end px-2 py-1.5 text-[13px] tabular-nums ${v === null ? "text-ap-muted" : "text-ap-ink"}`}
                      >
                        <span className="rounded-lg px-2 py-1.5" style={style}>
                          {text}
                        </span>
                      </span>
                    );
                  })}
                </div>
              );
            })}
            <div
              role="row"
              className="grid border-t border-ap-line bg-ap-ground"
              style={{ gridTemplateColumns: gtc }}
            >
              <span role="cell" className="flex flex-col gap-0.5 px-3 py-2.5">
                <span className="text-[13px] font-bold text-ap-ink">All landing pages</span>
                <span className="text-xs text-ap-muted">{ALL_PAGES}</span>
              </span>
              {ENG_COLUMNS.map((c, i) => (
                <span
                  key={c.label}
                  role="cell"
                  className="flex items-center justify-end px-2 py-1.5 text-[13px] font-bold tabular-nums text-ap-ink"
                >
                  <span className="px-2 py-1.5">
                    {engagementText(i, avg ? (avg[i] ?? null) : null, true)}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* What each column counts is in its info card (the call moved the explanations there). */}
      {e && !e.ok && <p className="m-0 text-xs text-ap-bad-ink">{e.error}</p>}
      {unreadArms > 0 && (
        <p className="m-0 text-xs text-ap-muted">
          A version shows no figures where PostHog saw too few of its visits (under 30).
        </p>
      )}
    </Card>
  );
}

function toCsv(data: LandingPayload): Array<{ name: string; table: Table }> {
  const tests: Table = {
    columns: [
      { label: "Test · variant", unit: "text" },
      { label: "Days", unit: "text" },
      { label: "Status", unit: "text" },
      { label: "Visits", unit: "count" },
      { label: "Starts", unit: "count" },
      { label: "Submissions", unit: "count" },
      { label: "Payments", unit: "count" },
      { label: "Revenue", unit: "eur" },
      { label: "Start CVR", unit: "pct" },
      { label: "Submit CVR", unit: "pct" },
      { label: "Payment CVR (anyone who paid)", unit: "pct" },
      { label: "Pre-unlock CVR", unit: "pct" },
      { label: "Full-unlock CVR", unit: "pct" },
      { label: "€ / visit", unit: "eur3" },
      { label: "Bounce (PostHog)", unit: "pct" },
      { label: "Avg. time (PostHog, each view up to 30 min)", unit: "mmss" },
      { label: "Median time (PostHog)", unit: "mmss" },
    ],
    rows: data.rows.map((r: ArmRow) => ({
      label: `${r.test} · ${r.label}`,
      values: [
        r.from === r.to ? r.from : `${r.from} to ${r.to}`,
        r.status,
        r.visits,
        r.starts,
        r.subs,
        r.paid,
        r.revenue,
        r.startCvr,
        r.submitCvr,
        r.paymentCvr,
        r.preCvr,
        r.fullCvr,
        r.perVisit,
        r.bounce,
        r.meanSeconds === null ? null : r.meanSeconds * 1000,
        r.medianSeconds === null ? null : r.medianSeconds * 1000,
      ],
    })),
  };
  const out = [
    {
      name: "Headline figures",
      table: {
        columns: [
          { label: "Figure", unit: "text" as const },
          { label: "Value", unit: "text" as const },
          { label: "Previous period", unit: "text" as const },
        ],
        rows: data.tiles.map((t) => ({
          label: t.label,
          values: [
            t.blocked ? `blank: ${t.blocked}` : fmt(t.unit, t.value),
            t.note ?? fmt(t.unit, t.prev),
          ],
        })),
      },
    },
    { name: "Tests and variants", table: tests },
  ];
  // The page shows the median time; the export keeps the average beside it.
  const avgTime = (s: number | null) => fmt("mmss", s === null ? null : s * 1000);
  out.push({
    name: "Engagement per landing page (PostHog)",
    table: {
      columns: [
        { label: "Landing page · variant", unit: "text" },
        ...ENG_COLUMNS.map((c) => ({ label: c.label, unit: "text" as const })),
        { label: "Avg. time (each view up to 30 min)", unit: "text" },
      ],
      rows: [
        ...data.rows.map((r) => ({
          label: `${r.test} · ${r.label}`,
          values: [
            ...engagementValues(r).map((v, i) => engagementText(i, v)),
            avgTime(r.meanSeconds),
          ],
        })),
        ...(data.engagement && data.engagement.ok
          ? [
              {
                label: `All landing pages · ${ALL_PAGES.toLowerCase()}`,
                values: [
                  ...[
                    data.engagement.value.bounce,
                    data.engagement.value.medianSeconds,
                    data.engagement.value.cta,
                    ...data.engagement.value.scroll.map((x) => x.share),
                  ].map((v, i) => engagementText(i, v, true)),
                  avgTime(data.engagement.value.meanSeconds),
                ],
              },
            ]
          : []),
      ],
    },
  });
  return out;
}

/** Each headline tile's info card: its field key, and what its worked line divides. */
const TILE_INFO: Record<
  string,
  { k: string; num?: (c: LandingCounts) => string; den?: (c: LandingCounts) => string }
> = {
  "start-cvr": {
    k: "landing.start-cvr",
    num: (c) => fmt("count", c.starts),
    den: (c) => fmt("count", c.visits),
  },
  "complete-cvr": {
    k: "landing.complete-cvr",
    num: (c) => fmt("count", c.subs),
    den: (c) => fmt("count", c.starts),
  },
  "pre-cvr": { k: "landing.pre-cvr" },
  "full-cvr": {
    k: "landing.full-cvr",
    num: (c) => fmt("count", c.fullBuyers),
    den: (c) => fmt("count", c.subs),
  },
  "rev-visit": {
    k: "landing.rev-visit",
    num: (c) => fmt("eur", c.revenue, 2),
    den: (c) => fmt("count", c.visits),
  },
  "rev-sub": {
    k: "landing.rev-sub",
    num: (c) => fmt("eur", c.revenue, 2),
    den: (c) => fmt("count", c.subs),
  },
};

/** The design's decimals: revenue per visitor to a hundredth of a cent, per survey to the cent. */
const tileDigits = (t: Tile) => (t.key === "rev-visit" ? 4 : t.key === "rev-sub" ? 2 : undefined);

/** A tile's info card, with this range's numbers when it shows a figure, and its 12 weeks. */
function tileInfo(t: Tile, c: LandingCounts) {
  const i = TILE_INFO[t.key];
  if (!i) return undefined;
  const worked: Worked | undefined =
    !t.blocked && t.value !== null && i.num && i.den
      ? { num: i.num(c), den: i.den(c), value: fmt(t.unit, t.value, tileDigits(t)) }
      : undefined;
  // A tile with a weekly line (every one but the Initial plan's) shows its last 12 weeks.
  const trend = t.spark.length ? { route: "landing", tile: t.key, unit: t.unit } : undefined;
  return { k: i.k, worked, trend };
}

export default function ApLanding() {
  const { params } = useApFilters();
  const { data, loading, error, refetch } = useAdminFetch<LandingPayload>(
    "/api/admin/ap/landing",
    params
  );
  useHashScroll(Boolean(data));
  return (
    <>
      <PageHeader
        crumbs={["Assessments", "Assessment A", "Landing page"]}
        title="Landing & assessment page"
        description="Which page version turns visits into survey starts, submissions and payments."
        actions={
          <BlackButton
            disabled={!data}
            onClick={() =>
              data && exportTables(`ap-landing-${data.range.from}-${data.range.to}`, toCsv(data))
            }
          >
            Export CSV
          </BlackButton>
        }
      />
      <ApFilterBar
        scope="assessment"
        fixed={["source", "device", "tier", "visitor"]}
        fixedNote="This page compares test arms over all traffic: the visit log has no source, device, tier or visitor history, and arms are compared with each other, not with another period."
      />
      {loading && !data && <Loading label="the landing page" />}
      {error && <Failed message={error} onRetry={refetch} />}
      {data && (
        <Busy busy={loading}>
          <RangeLine data={data} sources="Production database and PostHog" />
          <TileGrid min={170}>
            {data.tiles.map((t) => (
              <KpiTileV2
                key={t.key}
                tile={t}
                digits={tileDigits(t)}
                titles={bucketTitles(data.range.from, data.range.to)}
                info={tileInfo(t, data.counts)}
              />
            ))}
          </TileGrid>
          <TestsTable data={data} />
          <PayToStart data={data} />
          {/* Assessment A starts on the landing page: its assessment page is this page. */}
          <section
            id="assessment-page"
            aria-labelledby="h-engage"
            className="flex scroll-mt-20 flex-col gap-4 lg:scroll-mt-6"
          >
            <EngagementTable data={data} />
          </section>
        </Busy>
      )}
    </>
  );
}
