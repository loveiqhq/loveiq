"use client";

import { useMemo, useState } from "react";

import { rangeLabel } from "@features/admin/server/ap/filters";
import { EMPTY, fmt } from "@features/admin/server/ap/format";
import type {
  ArmRow,
  ArmStatus,
  Comparison,
  LandingPayload,
} from "@features/admin/server/ap/landing";
import type { Table } from "@features/admin/server/ap/overview";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import { getTrustpilotConfig } from "@shared/ui/trustpilot/config";

import ApFilterBar from "./ApFilterBar";
import { RangeLine } from "./ApOverview";
import { exportTables } from "./csv";
import {
  FilterIcon,
  Bar,
  BlackButton,
  Busy,
  Card,
  Failed,
  Loading,
  NotTracked,
  PageHeader,
  Pills,
  SectionHead,
  SortIcon,
  useHashScroll,
} from "./kit";
import { useApFilters } from "./useApFilters";

const STATUS: Record<ArmStatus, string> = {
  Running: "bg-ap-purple/10 text-ap-violet",
  Winner: "bg-ap-good/10 text-ap-good-ink",
  Ended: "bg-ap-track text-ap-muted",
};

type MetricKey =
  "visits" | "startCvr" | "submitCvr" | "paymentCvr" | "perVisit" | "bounce" | "meanSeconds";

/** The heat columns: unit, and whether lower is better. */
const COLUMNS: Array<{ key: MetricKey; label: string; heat: boolean; lower?: boolean }> = [
  { key: "visits", label: "Visits", heat: false },
  { key: "startCvr", label: "Start CVR", heat: true },
  { key: "submitCvr", label: "Submit CVR", heat: true },
  { key: "paymentCvr", label: "Payment CVR", heat: true },
  { key: "perVisit", label: "€ / visit", heat: true },
  { key: "bounce", label: "Bounce", heat: true, lower: true },
  { key: "meanSeconds", label: "Avg. time", heat: true },
];

function cell(key: MetricKey, v: number | null): string {
  if (key === "visits") return fmt("count", v);
  if (key === "perVisit") return fmt("eur3", v);
  if (key === "meanSeconds") return fmt("mmss", v === null ? null : v * 1000);
  return fmt("pct", v);
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
          const vs = rows.map((r) => r[c.key]).filter((v): v is number => v !== null);
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
      className={`inline-flex cursor-pointer border-0 bg-transparent p-0.5 ${
        filtering || test !== "all" || statusFilter !== "all" ? "text-ap-violet" : "text-ap-muted"
      }`}
    >
      <FilterIcon />
    </button>
  );
  const gtc = "minmax(220px, 2fr) minmax(96px, 0.8fr) repeat(7, minmax(92px, 1fr))";
  return (
    <Card id="tests" labelledBy="h-tests">
      <SectionHead
        id="h-tests"
        eyebrow="Landing page · Performance per test"
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
                  {data.rows.find((r) => r.testKey === k)?.testShort ?? k}
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
                    className={`inline-flex cursor-pointer border-0 bg-transparent p-0.5 ${sort?.key === c.key ? "text-ap-violet" : "text-ap-muted"}`}
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
                  <span className="truncate text-[13px] font-bold text-ap-ink" title={r.test}>
                    {r.testShort}
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
                  const range = ranges[c.key];
                  let style = {};
                  if (c.heat && v !== null && range) {
                    const [mn, mx] = range;
                    // Under a 5% spread (35.2% vs 35.1% bounce) there is no best or worst.
                    const flat = mx - mn <= 0.05 * Math.max(Math.abs(mx), Math.abs(mn));
                    let t = flat ? 0.5 : (v - mn) / (mx - mn);
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
                        {cell(c.key, v)}
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
              older days show no start CVR.
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

function lift(m: Comparison["metrics"][number]) {
  if (m.a === null || m.b === null || m.a === 0) return null;
  const pct = ((m.b - m.a) / m.a) * 100;
  const better = m.lowerIsBetter ? pct < 0 : pct > 0;
  return {
    text: `B ${pct > 0 ? "+" : pct < 0 ? "−" : "±"}${Math.abs(pct).toFixed(1)}%`,
    tone: Math.abs(pct) < 0.05 ? "text-ap-muted" : better ? "text-ap-good" : "text-ap-bad",
  };
}

function CompareSection({ data }: { data: LandingPayload }) {
  const [key, setKey] = useState<string | null>(null);
  if (data.comparisons.length === 0) {
    return (
      <Card id="compare" labelledBy="h-compare">
        <SectionHead
          id="h-compare"
          eyebrow="Landing page · Performance compare"
          title="No test to compare"
          description="No landing test ran in these days. Pick a range that covers one (see the tests above)."
        />
      </Card>
    );
  }
  const cmp = data.comparisons.find((c) => c.key === key) ?? data.comparisons[0]!;
  return (
    <Card id="compare" labelledBy="h-compare">
      <SectionHead
        id="h-compare"
        eyebrow="Landing page · Performance compare"
        title={cmp.name}
        description={`${cmp.window}. ${cmp.outcome}`}
        right={
          data.comparisons.length > 1 ? (
            <Pills
              label="Test to compare"
              value={cmp.key}
              onChange={setKey}
              options={data.comparisons.map((c) => ({ value: c.key, label: c.short }))}
            />
          ) : undefined
        }
      />
      <div className="flex flex-wrap gap-4 text-[13px] text-ap-body">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="h-3 w-3 rounded bg-ap-lavender" />
          {cmp.a}
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="h-3 w-3 rounded bg-ap-violet" />
          {cmp.b}
        </span>
      </div>
      <div
        className="grid gap-3.5"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))" }}
      >
        {cmp.metrics.map((m) => {
          const l = lift(m);
          const max = Math.max(m.a ?? 0, m.b ?? 0) || 1;
          return (
            <div key={m.label} className="flex flex-col gap-2.5 rounded-[14px] bg-ap-ground p-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-bold text-ap-ink">{m.label}</span>
                {l && <span className={`text-[13px] font-bold ${l.tone}`}>{l.text}</span>}
              </div>
              <div
                className="grid items-center gap-2 text-xs"
                style={{ gridTemplateColumns: "22px minmax(0, 1fr) 64px" }}
              >
                <span className="font-bold text-ap-muted">A</span>
                <Bar
                  pct={m.a === null ? null : m.a / max}
                  color="#9d8ad7"
                  height={10}
                  track="#ffffff"
                />
                <span className="text-right font-semibold tabular-nums text-ap-ink">
                  {fmt(m.unit, m.a)}
                </span>
                <span className="font-bold text-ap-muted">B</span>
                <Bar
                  pct={m.b === null ? null : m.b / max}
                  color="#4000b6"
                  height={10}
                  track="#ffffff"
                />
                <span className="text-right font-semibold tabular-nums text-ap-ink">
                  {fmt(m.unit, m.b)}
                </span>
              </div>
              <span className="text-xs text-ap-muted">{m.verdict}</span>
            </div>
          );
        })}
      </div>
      {cmp.note && <p className="m-0 text-xs leading-relaxed text-ap-muted">{cmp.note}</p>}
    </Card>
  );
}

function EngagementCard({ data }: { data: LandingPayload }) {
  const e = data.engagement;
  return (
    <Card labelledBy="h-engage">
      <SectionHead
        id="h-engage"
        title="Engagement"
        level={3}
        description="Everyone on the landing page in the range, both arms (PostHog)."
      />
      {!e ? (
        <NotTracked>PostHog starts on 23 Aug 2026</NotTracked>
      ) : !e.ok ? (
        <p className="m-0 text-sm text-ap-bad-ink">{e.error}</p>
      ) : (
        <>
          <div
            className="grid gap-2.5"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100px, 100%), 1fr))" }}
          >
            {[
              { label: "Bounce", value: fmt("pct", e.value.bounce, 1) },
              {
                label: "Avg. time",
                value: fmt(
                  "mmss",
                  e.value.meanSeconds === null ? null : e.value.meanSeconds * 1000
                ),
              },
              { label: "CTA clicks", value: fmt("pct", e.value.cta, 1) },
            ].map((s) => (
              <div
                key={s.label}
                className="flex min-w-0 flex-col gap-1 rounded-[14px] bg-ap-ground p-3"
              >
                <span className="text-xs text-ap-muted">{s.label}</span>
                <span className="font-serif text-[22px] font-semibold tabular-nums text-ap-ink">
                  {s.value}
                </span>
              </div>
            ))}
          </div>
          <span className="text-[13px] font-bold text-ap-body">Scroll depth reached</span>
          <div className="flex h-[120px] items-end gap-3 border-b border-ap-line">
            {e.value.scroll.map((d) => (
              <div
                key={d.label}
                className="flex h-full flex-1 flex-col items-center justify-end gap-1"
              >
                <span className="text-xs font-bold tabular-nums">{fmt("pct", d.share, 0)}</span>
                <span
                  className="w-full max-w-[56px] rounded-t-md rounded-b-sm bg-ap-purple"
                  style={{ height: `${Math.round((d.share ?? 0) * 90)}px` }}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            {e.value.scroll.map((d) => (
              <span key={d.label} className="flex-1 text-center text-xs text-ap-muted">
                {d.label}
              </span>
            ))}
          </div>
          <p className="m-0 text-xs leading-relaxed text-ap-muted">
            {fmt("count", e.value.sessions)} PostHog visits. Bounce: left without a click or another
            page. CTA clicks: pressed a button to the survey. Time and scroll: until the page was
            left or the next page opened. Avg. time counts each view up to 30 minutes; median{" "}
            {fmt("mmss", e.value.medianSeconds === null ? null : e.value.medianSeconds * 1000)}.
          </p>
        </>
      )}
    </Card>
  );
}

function ReviewsCard({ data }: { data: LandingPayload }) {
  const s = data.sections;
  const t = s && s.ok && s.value ? s.value.testimonials : null;
  // The site's own Trustpilot numbers, shown only when both are set (never made up).
  const tp = getTrustpilotConfig();
  const rating = tp.score && tp.reviewCount ? tp : null;
  return (
    <Card labelledBy="h-reviews">
      <SectionHead id="h-reviews" title="Reviews" level={3} />
      {rating ? (
        <div className="flex flex-wrap items-baseline gap-2.5">
          <span className="font-serif text-[40px] font-semibold leading-none">{rating.score}</span>
          <span className="text-[13px] text-ap-muted">
            out of 5 · {rating.reviewCount} reviews on Trustpilot
            {rating.profileUrl && (
              <>
                {" · "}
                <a
                  href={rating.profileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold text-ap-plum hover:text-ap-violet"
                >
                  Open the profile
                </a>
              </>
            )}
          </span>
        </div>
      ) : (
        <>
          <NotTracked>No reviews collected yet</NotTracked>
          <p className="m-0 text-sm leading-relaxed text-ap-body">
            Trustpilot is switched off on the site until enough customers have reviewed us (decision
            of 13 Jun 2026), so there is no rating to show. The page shows curated field reports
            instead.
          </p>
        </>
      )}
      <div className="flex flex-col gap-1.5 border-t border-ap-line pt-3">
        <span className="text-[13px] font-bold text-ap-ink">Field reports block on the page</span>
        {t ? (
          <>
            <span className="text-[13px] text-ap-muted">
              Reached by {fmt("pct", t.seen, 1)} of landing visitors · started the survey:{" "}
              {fmt("pct", t.startedSeen, 1)} of those who reached it,{" "}
              {fmt("pct", t.startedNotSeen, 1)} of those who did not
            </span>
            <span className="text-xs leading-relaxed text-ap-muted">
              People who scroll that far are not like those who start from the top, so this is not
              the block&rsquo;s effect. The block scrolls by itself and has nothing to click.
            </span>
          </>
        ) : s && !s.ok ? (
          <span className="text-[13px] text-ap-bad-ink">{s.error}</span>
        ) : (
          <span className="text-[13px] text-ap-muted">
            Recorded from 14 Oct 2026: from then on the page reports which sections are seen.
          </span>
        )}
      </div>
    </Card>
  );
}

/** "14s", as the design writes a section's time. */
const secs = (v: number | null) => (v === null ? EMPTY : `${Math.round(v)}s`);

function SectionTime({ data }: { data: LandingPayload }) {
  const t = data.sectionTime;
  const s = data.sections;
  const time = t && t.ok ? t.value : null;
  const reach = s && s.ok ? s.value : null;
  // From the day the time in view is recorded; before it, the reach alone.
  const view =
    time ?? (reach && { ...reach, rows: reach.rows.map((r) => ({ ...r, seconds: null })) });
  const failed = t && !t.ok ? t.error : !view && s && !s.ok ? s.error : null;
  return (
    <Card labelledBy="h-sections">
      <SectionHead
        id="h-sections"
        title="Section time"
        level={3}
        description="Avg. seconds in view · share of visitors who reach the section"
      />
      {failed && <p className="m-0 text-sm text-ap-bad-ink">{failed}</p>}
      {view ? (
        <>
          {!time && !failed && (
            <NotTracked>
              Recorded from {rangeLabel(data.sectionTimeFrom, data.sectionTimeFrom)}
            </NotTracked>
          )}
          <div className="flex flex-col gap-2.5">
            {view.rows.map((r) => (
              <div
                key={r.section}
                className="grid items-center gap-3 text-[13px]"
                style={{ gridTemplateColumns: "minmax(110px, 170px) 44px minmax(0, 1fr) 84px" }}
              >
                <span className="font-semibold text-ap-ink">{r.name}</span>
                <span className="text-right font-bold tabular-nums">{secs(r.seconds)}</span>
                <Bar pct={r.reach} height={12} />
                <span className="text-right tabular-nums text-ap-muted">
                  {fmt("pct", r.reach, 0)} reach
                </span>
              </div>
            ))}
          </div>
          <p className="m-0 text-xs leading-relaxed text-ap-muted">
            {fmt("count", view.sessions)} PostHog visits, {rangeLabel(view.from, view.to)}.{" "}
            {time
              ? "In view: at least half of the section on screen, or the section filling half the screen, while the page is showing; a visit counts up to 10 minutes per section. Reach: part of it came into the top half of the screen, or it was in view."
              : "Reach: part of it came into the top half of the screen."}{" "}
            The hero is where every visit starts.
          </p>
        </>
      ) : (
        !failed && <NotTracked>Recorded from 14 Oct 2026: pick a range from that day on</NotTracked>
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
      { label: "Payment CVR", unit: "pct" },
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
        r.perVisit,
        r.bounce,
        r.meanSeconds === null ? null : r.meanSeconds * 1000,
        r.medianSeconds === null ? null : r.medianSeconds * 1000,
      ],
    })),
  };
  const out = [{ name: "Tests and variants", table: tests }];
  for (const c of data.comparisons) {
    out.push({
      name: `Compare: ${c.name} (${c.window})`,
      table: {
        columns: [
          { label: "Metric", unit: "text" },
          { label: "A", unit: "text" },
          { label: "B", unit: "text" },
          { label: "Verdict", unit: "text" },
        ],
        rows: c.metrics.map((m) => ({
          label: m.label,
          values: [fmt(m.unit, m.a), fmt(m.unit, m.b), m.verdict],
        })),
      },
    });
  }
  const e = data.engagement;
  if (e && e.ok) {
    out.push({
      name: "Engagement (PostHog)",
      table: {
        columns: [
          { label: "Figure", unit: "text" },
          { label: "Value", unit: "text" },
        ],
        rows: [
          { label: "Visits", values: [fmt("count", e.value.sessions)] },
          { label: "Bounce", values: [fmt("pct", e.value.bounce, 1)] },
          {
            label: "Avg. time",
            values: [fmt("mmss", e.value.meanSeconds === null ? null : e.value.meanSeconds * 1000)],
          },
          {
            label: "Median time",
            values: [
              fmt("mmss", e.value.medianSeconds === null ? null : e.value.medianSeconds * 1000),
            ],
          },
          { label: "CTA clicks", values: [fmt("pct", e.value.cta, 1)] },
          ...e.value.scroll.map((d) => ({
            label: `Scrolled ${d.label}`,
            values: [fmt("pct", d.share, 0)],
          })),
        ],
      },
    });
  }
  const s = data.sections;
  if (s && s.ok && s.value) {
    out.push({
      name: "Section reach (PostHog)",
      table: {
        columns: [
          { label: "Section", unit: "text" },
          { label: "Reach", unit: "pct" },
        ],
        rows: s.value.rows.map((r) => ({ label: r.name, values: [r.reach] })),
      },
    });
  }
  const t = data.sectionTime;
  if (t && t.ok && t.value) {
    out.push({
      name: "Section time (PostHog)",
      table: {
        columns: [
          { label: "Section", unit: "text" },
          { label: "Avg. time in view", unit: "mmss" },
          { label: "Reach", unit: "pct" },
        ],
        rows: t.value.rows.map((r) => ({
          label: r.name,
          values: [r.seconds === null ? null : r.seconds * 1000, r.reach],
        })),
      },
    });
  }
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
        fixed={["compare", "source", "device", "tier", "visitor"]}
        fixedNote="This page compares test arms over all traffic: the visit log has no source, device, tier or visitor history, and arms are compared with each other, not with another period."
      />
      {loading && !data && <Loading label="the landing page" />}
      {error && <Failed message={error} onRetry={refetch} />}
      {data && (
        <Busy busy={loading}>
          <RangeLine data={data} sources="Production database and PostHog" />
          <TestsTable data={data} />
          <CompareSection data={data} />
          <section
            id="assessment-page"
            aria-labelledby="h-ap"
            className="flex scroll-mt-20 lg:scroll-mt-6 flex-col gap-4"
          >
            <SectionHead
              id="h-ap"
              eyebrow="Assessment A · Assessment page"
              title="Assessment page"
              description="Assessment A starts on the landing page, so its assessment page is the landing page."
            />
            <div
              className="grid items-start gap-5"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))" }}
            >
              <ReviewsCard data={data} />
              <EngagementCard data={data} />
            </div>
            <SectionTime data={data} />
          </section>
        </Busy>
      )}
    </>
  );
}
