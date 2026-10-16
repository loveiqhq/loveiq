"use client";

import { useMemo, useState } from "react";

import { rangeLabel } from "@features/admin/server/ap/filters";
import { fmt } from "@features/admin/server/ap/format";
import type { ArmRow, ArmStatus, LandingPayload } from "@features/admin/server/ap/landing";
import type { Table } from "@features/admin/server/ap/common";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";

import ApFilterBar from "./ApFilterBar";
import { exportTables } from "./csv";
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
  | "meanSeconds";

/** The heat columns: unit, and whether lower is better. */
const COLUMNS: Array<{ key: MetricKey; label: string; heat: boolean; lower?: boolean }> = [
  { key: "visits", label: "Visits", heat: false },
  { key: "startCvr", label: "Start CVR", heat: true },
  { key: "submitCvr", label: "Submit CVR", heat: true },
  { key: "preCvr", label: "Pre-unlock CVR", heat: true },
  { key: "fullCvr", label: "Full-unlock CVR", heat: true },
  { key: "perVisit", label: "€ / visit", heat: true },
  { key: "bounce", label: "Bounce", heat: true, lower: true },
  { key: "meanSeconds", label: "Avg. time", heat: true },
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
  if (key === "meanSeconds") return fmt("mmss", v === null ? null : v * 1000);
  return fmt("pct", v, DIGITS[key]);
}

/** A cell's number as it reads ("5.4%" is 5.4, "0:41" is 41): the design shades what it shows. */
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
          <div role="table" aria-label="Landing tests and variants" style={{ minWidth: 1080 }}>
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
                  <span className="text-xs text-ap-muted">
                    {r.label} · {rangeLabel(r.from, r.to)}
                  </span>
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
      <div className="flex flex-col gap-1.5 text-xs leading-relaxed text-ap-muted">
        {data.unread.map((u) => (
          <p key={u} className="m-0 text-ap-bad-ink">
            {u}
          </p>
        ))}
        {data.outside.length > 0 && (
          <p className="m-0">Not in this range: {data.outside.join(" · ")}.</p>
        )}
        <details>
          <summary className="cursor-pointer font-semibold text-ap-body">
            How these are counted
          </summary>
          <div className="mt-1.5 flex flex-col gap-1.5">
            <p className="m-0">
              Bounce (left without a click) and avg. time come from PostHog, and only for the
              video-or-question tests: before 7 Oct 2026 PostHog did not reliably know which version
              a visitor saw. Avg. time counts each view up to 30 minutes; the export has the median
              too. Start CVR needs to know which version each unfinished starter saw; only their
              saved progress records it (from 20 Sep 2026), and that is deleted after 30 days, so
              older days show no start CVR. Unlocks are per visit: Full unlock counts Full, Full All
              and Core; the Initial plan (pre-unlock) isn&rsquo;t on sale yet, so its column is
              blank.
            </p>
            {data.footnotes.map((n) => (
              <p key={n} className="m-0">
                {n}
              </p>
            ))}
          </div>
        </details>
      </div>
    </Card>
  );
}

/** The design's engagement columns: Bounce, Avg. time, CTA clicks, then scroll depth. */
const ENG_COLUMNS = ["Bounce", "Avg. time", "CTA clicks", "25%", "50%", "75%", "100%"];

/** One row's values in those columns: shares 0..1, seconds for the time; null where unread. */
function engagementValues(r: ArmRow): Array<number | null> {
  return [r.bounce, r.meanSeconds, r.cta, ...(r.scroll ?? [null, null, null, null])];
}

/** As the design writes them: "61%", "0:41", "8.6%", "80%" (the average row a tenth more). */
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
      ? [e.value.bounce, e.value.meanSeconds, e.value.cta, ...e.value.scroll.map((x) => x.share)]
      : null;
  const gtc = "minmax(220px, 2fr) repeat(7, minmax(80px, 1fr))";
  const tests = [...new Set(rows.map((r) => r.testKey))];
  const unreadArms = rows.filter((r) => r.phSessions === null).length;
  return (
    <Card labelledBy="h-engage">
      <SectionHead
        id="h-engage"
        title="Engagement per landing page"
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
              {["Landing page · variant", ...ENG_COLUMNS].map((label, i) => (
                <span
                  key={label}
                  role="columnheader"
                  className={`px-3 py-2.5 text-[11px] font-bold uppercase leading-[1.3] tracking-[0.06em] text-ap-muted ${i ? "text-right" : "text-left"}`}
                >
                  {label}
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
                        key={ENG_COLUMNS[i]}
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
                <span className="text-xs text-ap-muted">Weighted average</span>
              </span>
              {ENG_COLUMNS.map((label, i) => (
                <span
                  key={label}
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
      <div className="flex flex-col gap-1.5 text-xs leading-relaxed text-ap-muted">
        {e && !e.ok && <p className="m-0 text-ap-bad-ink">{e.error}</p>}
        <p className="m-0">
          From PostHog, which records about half of all visits.
          {e && e.ok
            ? ` The average row is all ${fmt("count", e.value.sessions)} landing visits it recorded in the range.`
            : ""}{" "}
          Bounce: left without a click or another page. CTA clicks: pressed a button to the survey.
          Time and scroll: until the page was left or the next page opened; time counts each view up
          to 30 minutes.
          {unreadArms > 0
            ? " A version shows no figures where PostHog saw too few of its visits (under 30), or, before 7 Oct 2026, could not tell the versions apart."
            : ""}
        </p>
      </div>
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
      { label: "Avg. time (PostHog)", unit: "mmss" },
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
  out.push({
    name: "Engagement per landing page (PostHog)",
    table: {
      columns: [
        { label: "Landing page · variant", unit: "text" },
        ...ENG_COLUMNS.map((label) => ({ label, unit: "text" as const })),
      ],
      rows: [
        ...data.rows.map((r) => ({
          label: `${r.test} · ${r.label}`,
          values: engagementValues(r).map((v, i) => engagementText(i, v)),
        })),
        ...(data.engagement && data.engagement.ok
          ? [
              {
                label: "All landing pages · weighted average",
                values: [
                  data.engagement.value.bounce,
                  data.engagement.value.meanSeconds,
                  data.engagement.value.cta,
                  ...data.engagement.value.scroll.map((x) => x.share),
                ].map((v, i) => engagementText(i, v, true)),
              },
            ]
          : []),
      ],
    },
  });
  return out;
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
                digits={t.key === "rev-visit" ? 4 : t.key === "rev-sub" ? 2 : undefined}
                titles={bucketTitles(data.range.from, data.range.to)}
              />
            ))}
          </TileGrid>
          <TestsTable data={data} />
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
