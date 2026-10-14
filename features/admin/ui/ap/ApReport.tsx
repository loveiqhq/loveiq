"use client";

import { useEffect, useState, type ReactNode } from "react";

import { rangeLabel } from "@features/admin/server/ap/filters";
import { delta, fmt } from "@features/admin/server/ap/format";
import type { ReportPayload } from "@features/admin/server/ap/report-page";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";

import ApFilterBar from "./ApFilterBar";
import { RangeLine } from "./ApOverview";
import { exportTables } from "./csv";
import {
  AllTraffic,
  Bar,
  BlackButton,
  Busy,
  Card,
  Failed,
  FilterIcon,
  KpiTile,
  Loading,
  NotTracked,
  PageHeader,
  Pills,
  SectionHead,
  SortIcon,
  StatBox,
  TileGrid,
  useHashScroll,
} from "./kit";
import { useApFilters } from "./useApFilters";

const SECTIONS = [
  { id: "wizard", label: "Wizard" },
  { id: "time", label: "Time & returns" },
  { id: "chapters", label: "Chapters" },
  { id: "feedback", label: "Feedback" },
];

/**
 * The section being read: the one crossing a band across the middle of the screen, so that a
 * short last section still gets there at the end of the page. The first until one does, as
 * the design draws it.
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

type Sort<K extends string> = { key: K; dir: 1 | -1 } | null;

/** A column's first press sorts it high to low (or as `first` says), the next turns it round. */
function nextSort<K extends string>(s: Sort<K>, key: K, first: 1 | -1 = -1): Sort<K> {
  return s?.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: first };
}

/** Rows in the sorted column's order, blanks last; as given while unsorted. */
function sortRows<T, K extends string>(
  rows: T[],
  sort: Sort<K>,
  value: (row: T, key: K) => number | string | null
): T[] {
  if (!sort) return rows;
  return [...rows].sort((a, b) => {
    const x = value(a, sort.key);
    const y = value(b, sort.key);
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    const d =
      typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
    return d * sort.dir;
  });
}

/** A header cell: the design's sort arrows on a sortable column, a funnel where one filters. */
function Th<K extends string>({
  label,
  right = false,
  col,
  sort = null,
  onSort,
  filter,
}: {
  label: string;
  right?: boolean;
  col?: K;
  sort?: Sort<K>;
  onSort?: (key: K) => void;
  filter?: ReactNode;
}) {
  const dir = col !== undefined && sort?.key === col ? sort.dir : null;
  return (
    <span
      role="columnheader"
      aria-sort={
        col === undefined ? undefined : dir === 1 ? "ascending" : dir === -1 ? "descending" : "none"
      }
      className={`flex items-center gap-1 px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-ap-muted ${right ? "justify-end text-right" : ""}`}
    >
      {label}
      {filter}
      {col !== undefined && onSort && (
        <button
          type="button"
          aria-label={`Sort by ${label}`}
          onClick={() => onSort(col)}
          className={`inline-flex cursor-pointer border-0 bg-transparent p-0.5 ${dir ? "text-ap-violet" : "text-ap-muted"}`}
        >
          <SortIcon dir={dir} />
        </button>
      )}
    </span>
  );
}

/**
 * The design's funnel filters on a table: a column's funnel opens a choice of that column's
 * values above the table, one column at a time, and a row must match every choice. A value
 * picked for an earlier range and gone from this one filters nothing, unless it is one of the
 * column's fixed options (a vote can be Bad with no Bad votes in the range).
 */
function useColumnFilters<T, F extends string>(
  rows: T[],
  labels: Record<F, string>,
  valueOf: (row: T, key: F) => string,
  { fixed = {}, onPick }: { fixed?: Partial<Record<F, string[]>>; onPick?: () => void } = {}
) {
  const [chosen, setChosen] = useState<Partial<Record<F, string>>>({});
  const [open, setOpen] = useState<F | null>(null);
  const options = (k: F) =>
    fixed[k] ??
    [...new Set(rows.map((r) => valueOf(r, k)).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "en", { numeric: true })
    );
  const keys = Object.keys(labels) as F[];
  const picked = Object.fromEntries(
    keys.map((k) => [k, chosen[k] && options(k).includes(chosen[k]) ? chosen[k] : ""])
  ) as Record<F, string>;
  const pick = (k: F, v: string) => {
    setChosen((c) => ({ ...c, [k]: v }));
    onPick?.();
  };
  const matches = rows.filter((r) => keys.every((k) => !picked[k] || valueOf(r, k) === picked[k]));
  const funnel = (k: F) => (
    <button
      type="button"
      aria-label={`Filter ${labels[k]}`}
      aria-expanded={open === k}
      onClick={() => setOpen(open === k ? null : k)}
      className={`inline-flex cursor-pointer border-0 bg-transparent p-0.5 ${open === k || picked[k] ? "text-ap-violet" : "text-ap-muted"}`}
    >
      <FilterIcon />
    </button>
  );
  const choice = open && (
    <label className="flex items-center gap-2 text-xs font-semibold text-ap-body">
      <span>Filter {labels[open].toLowerCase()}</span>
      <select
        autoFocus
        value={picked[open]}
        onChange={(e) => pick(open, e.target.value)}
        className="min-h-9 max-w-full rounded-full border border-ap-line bg-white px-3.5 font-sans text-[13px] text-ap-ink"
      >
        <option value="">All</option>
        {options(open).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
  return { picked, pick, matches, funnel, choice };
}

export default function ApReport() {
  const { params } = useApFilters();
  const { data, loading, error, refetch } = useAdminFetch<ReportPayload>(
    "/api/admin/ap/report",
    params
  );
  useHashScroll(Boolean(data));
  const current = useSectionInView(Boolean(data));
  return (
    <>
      <div className="flex flex-col gap-4">
        <PageHeader
          crumbs={["Assessments", "Assessment A", "Report"]}
          title="Report"
          description="How people get into their report, what they read, when they come back and what they tell us."
          actions={
            <BlackButton
              disabled={!data}
              onClick={() =>
                data &&
                exportTables(
                  `ap-report-${data.range.from}-${data.range.to}`,
                  [
                    {
                      name: "Pre-report wizard",
                      table: {
                        columns: [
                          { label: "Slide", unit: "text" },
                          { label: "Reached", unit: "count" },
                          { label: "Continue", unit: "pct" },
                          { label: "Skip intro", unit: "pct" },
                          { label: "Back", unit: "count" },
                          { label: "Back, of the slide's readers", unit: "pct" },
                          { label: "Exit", unit: "pct" },
                          { label: "Median time", unit: "mmss" },
                          { label: "Stepped through the deep dives", unit: "pct" },
                        ],
                        rows: data.wizard.slides.map((s) => ({
                          label: `${s.n} · ${s.name}`,
                          values: [
                            s.reached,
                            s.cont,
                            s.skip,
                            s.back,
                            s.backShare,
                            s.exit,
                            s.medianMs,
                            s.engaged,
                          ],
                        })),
                      },
                    },
                    {
                      name: "Chapters",
                      table: {
                        columns: [
                          { label: "Chapter", unit: "text" },
                          { label: "Reach", unit: "pct" },
                          { label: "Avg. time", unit: "mmss" },
                          { label: "Good votes", unit: "count" },
                          { label: "Bad votes", unit: "count" },
                          { label: "Show more CTR", unit: "pct" },
                          { label: "Paywall CTR", unit: "pct" },
                          { label: "Saw the paywall (readers)", unit: "count" },
                          { label: "Clicked it (readers)", unit: "count" },
                          { label: "Learn more CTR", unit: "pct" },
                          { label: "Exercise CTR", unit: "pct" },
                          { label: "Paywall clicks (readers)", unit: "count" },
                        ],
                        rows: data.chapters.map((c) => ({
                          label: `${c.n} · ${c.name} (${c.id})`,
                          values: [
                            c.reach,
                            c.avgMs,
                            c.up,
                            c.down,
                            c.showMore,
                            c.paywall,
                            c.paywallSeen,
                            c.paywallClicked,
                            c.learnMore,
                            c.exercise,
                            c.paywallReaders,
                          ],
                        })),
                      },
                    },
                    {
                      name: "Time in report",
                      table: {
                        columns: [
                          { label: "Reading time", unit: "text" },
                          { label: "Readers", unit: "pct" },
                          { label: "Benchmark", unit: "pct" },
                        ],
                        rows: data.time.buckets.map((b) => ({
                          label: b.label,
                          values: [b.share, b.bench],
                        })),
                      },
                    },
                    {
                      name: "Reading time by gender and age (mean)",
                      table: {
                        columns: [
                          { label: "Group", unit: "text" },
                          { label: "Reading time", unit: "mmss" },
                          { label: "Benchmark", unit: "mmss" },
                        ],
                        rows: [...data.time.byGender, ...data.time.byAge].map((g) => ({
                          label: g.label,
                          values: [g.ms, g.benchMs],
                        })),
                      },
                    },
                    {
                      name: "Days until coming back",
                      table: {
                        columns: [
                          { label: "Came back after", unit: "text" },
                          { label: "Readers", unit: "pct" },
                          { label: "Cumulative", unit: "pct" },
                        ],
                        rows: data.returns.days.map((d) => ({
                          label: d.label,
                          values: [d.share, d.cumulative],
                        })),
                      },
                    },
                    ...(data.returns.sources && data.returns.sources.ok
                      ? [
                          {
                            name: "How people came back (PostHog)",
                            table: {
                              columns: [
                                { label: "Came back through", unit: "text" as const },
                                { label: "Visits", unit: "count" as const },
                                { label: "Share", unit: "pct" as const },
                              ],
                              rows: data.returns.sources.value.map((r) => ({
                                label: r.source,
                                values: [r.sessions, r.share],
                              })),
                            },
                          },
                        ]
                      : []),
                    {
                      name: "Email campaigns",
                      table: {
                        columns: [
                          { label: "Campaign", unit: "text" },
                          { label: "Sent", unit: "count" },
                          { label: "Opened", unit: "count" },
                          { label: "Open rate", unit: "pct" },
                          { label: "Clicked", unit: "count" },
                          { label: "Click rate", unit: "pct" },
                          { label: "Returned", unit: "count" },
                          { label: "Return rate", unit: "pct" },
                          { label: "Purchased", unit: "count" },
                        ],
                        rows: data.returns.campaigns.map((c) => ({
                          label: c.stage,
                          values: [
                            c.sent,
                            c.opened,
                            c.openRate,
                            c.clicked,
                            c.clickRate,
                            c.returned,
                            c.returnRate,
                            c.purchased,
                          ],
                        })),
                      },
                    },
                    {
                      name: "Feedback reasons (bad votes)",
                      table: {
                        columns: [
                          { label: "Reason", unit: "text" },
                          { label: "Votes", unit: "count" },
                        ],
                        rows: data.feedback.issues.map((x) => ({ label: x.label, values: [x.n] })),
                      },
                    },
                    {
                      name: "Feedback log (latest 200)",
                      table: {
                        columns: [
                          { label: "When", unit: "text" },
                          { label: "Submission", unit: "text" },
                          { label: "Chapter", unit: "text" },
                          { label: "Vote", unit: "text" },
                          { label: "Reason", unit: "text" },
                          { label: "Comment left", unit: "text" },
                        ],
                        rows: data.feedback.log.map((x) => ({
                          label: x.at,
                          values: [
                            x.submission === null ? "" : String(x.submission),
                            x.chapter,
                            x.vote,
                            x.issue ?? "",
                            x.commented ? "yes" : "no",
                          ],
                        })),
                      },
                    },
                  ],
                  [...data.tiles, ...data.wizard.tiles]
                )
              }
            >
              Export CSV
            </BlackButton>
          }
        />
        <nav
          aria-label="Report sections"
          className="flex max-w-full flex-wrap gap-1.5 self-start rounded-full border border-ap-line bg-white p-1"
        >
          {SECTIONS.map((s) => {
            const on = s.id === current;
            return (
              <a
                key={s.id}
                href={`#${s.id}`}
                aria-current={on ? "true" : undefined}
                className={`inline-flex min-h-10 items-center rounded-full px-4 text-[13px] font-semibold no-underline ${
                  on ? "bg-ap-ink text-white" : "text-ap-body hover:bg-ap-ground"
                }`}
              >
                {s.label}
              </a>
            );
          })}
        </nav>
      </div>
      <ApFilterBar scope="assessment" />
      {loading && !data && <Loading label="the report page" />}
      {error && <Failed message={error} onRetry={refetch} />}
      {data && (
        <Busy busy={loading}>
          <RangeLine data={data} sources="Production database and PostHog" />
          <TileGrid min={180}>
            {data.tiles.map((t) => (
              <KpiTile key={t.key} tile={t} size="md" />
            ))}
          </TileGrid>
          <WizardSection data={data} />
          <section
            id="time"
            aria-labelledby="h-time"
            className="flex scroll-mt-20 lg:scroll-mt-6 flex-col gap-5"
          >
            <TimeSection data={data} />
            <ReturnsSection data={data} />
          </section>
          <ChaptersSection data={data} />
          <FeedbackSection data={data} />
        </Busy>
      )}
    </>
  );
}

type WizardKey = "time" | "reached" | "cont" | "skip" | "back" | "exit";

function WizardSection({ data }: { data: ReportPayload }) {
  const w = data.wizard;
  const [sort, setSort] = useState<Sort<WizardKey>>(null);
  const onSort = (k: WizardKey) => setSort((s) => nextSort(s, k));
  const slides = sortRows(w.slides, sort, (s, k) =>
    k === "time"
      ? s.medianMs
      : k === "reached"
        ? s.reached
        : k === "cont"
          ? s.cont
          : k === "skip"
            ? s.skip
            : k === "back"
              ? (s.backShare ?? s.back)
              : s.exit
  );
  const skipsFrom = w.skipsFrom ? rangeLabel(w.skipsFrom, w.skipsFrom) : null;
  const gtc =
    "44px minmax(220px,2.2fr) 74px minmax(110px,1fr) 80px 80px 80px 70px minmax(150px,1.3fr)";
  const head = { sort, onSort };
  return (
    <Card id="wizard" labelledBy="h-rwiz">
      <SectionHead
        id="h-rwiz"
        title="Intro wizard"
        description="The six slides between the finished survey and the report."
      />
      <TileGrid min={200}>
        {w.tiles.map((t) => (
          <KpiTile key={t.key} tile={t} size="md" />
        ))}
      </TileGrid>
      <div className="overflow-x-auto rounded-[14px] border border-ap-line">
        <div role="table" aria-label="Intro wizard slides" style={{ minWidth: 980 }}>
          <div role="row" className="grid bg-ap-ground" style={{ gridTemplateColumns: gtc }}>
            <Th label="#" />
            <Th label="Slide" />
            <Th label="Time" col="time" right {...head} />
            <Th label="Reached" col="reached" {...head} />
            <Th label="Continue" col="cont" right {...head} />
            <Th label="Skip intro" col="skip" right {...head} />
            <Th label="Back" col="back" right {...head} />
            <Th label="Exit" col="exit" right {...head} />
            <Th label="Engagement on slide" />
          </div>
          {slides.map((s) => (
            <div
              key={s.n}
              role="row"
              className="grid items-center border-t border-ap-line"
              style={{ gridTemplateColumns: gtc }}
            >
              <span role="cell" className="px-3 py-2.5">
                <span className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-full bg-ap-purple text-xs font-bold text-white">
                  {s.n}
                </span>
              </span>
              <span role="rowheader" className="flex flex-col gap-0.5 px-3 py-2.5">
                <span className="text-sm font-bold">{s.name}</span>
                <span className="text-xs leading-snug text-ap-muted">{s.purpose}</span>
              </span>
              <span role="cell" className="px-3 py-2.5 text-right text-[13px] tabular-nums">
                {fmt("mmss", s.medianMs)}
              </span>
              <span role="cell" className="flex items-center gap-2 px-3 py-2.5">
                <span className="flex-1">
                  <Bar pct={s.reachedShare} height={8} />
                </span>
                <span className="text-xs font-bold tabular-nums">
                  {fmt("pct", s.reachedShare, 0)}
                </span>
              </span>
              <span role="cell" className="px-3 py-2.5 text-right text-[13px] tabular-nums">
                {fmt("pct", s.cont, 1)}
              </span>
              <span role="cell" className="px-3 py-2.5 text-right text-[13px] tabular-nums">
                {fmt("pct", s.skip, 1)}
              </span>
              <span role="cell" className="px-3 py-2.5 text-right text-[13px] tabular-nums">
                {s.n === 1
                  ? "—"
                  : s.backShare === null
                    ? fmt("count", s.back)
                    : fmt("pct", s.backShare, 1)}
              </span>
              <span
                role="cell"
                className={`px-3 py-2.5 text-right text-[13px] tabular-nums ${(s.exit ?? 0) >= 0.05 ? "font-bold text-ap-bad" : ""}`}
              >
                {fmt("pct", s.exit, 1)}
              </span>
              <span
                role="cell"
                className={`px-3 py-2.5 text-xs leading-snug ${s.engaged === null ? "text-ap-muted" : "text-ap-body"}`}
              >
                {s.engaged === null
                  ? "—"
                  : `${fmt("pct", s.engaged, 0)} stepped through the deep dives`}
              </span>
            </div>
          ))}
        </div>
      </div>
      <p className="m-0 text-xs leading-relaxed text-ap-muted">
        Reached, Continue, Skip intro, Exit and Engagement follow the filters; Back and Time are all
        traffic, as the slides&rsquo; own events carry no source or device. Continue on slide 6 =
        opened the report.{" "}
        {skipsFrom
          ? `Skip intro = pressed Skip Intro on the slide, of its readers who finished from ${skipsFrom}, when it began to be recorded. Exit = did not go on and did not skip (closed, or still on it); before ${skipsFrom} a skip counts as an exit.`
          : "Skip intro is not recorded yet. Exit = did not go on (closed, skipped, or still on it)."}{" "}
        Back = went back from the slide, of those who reached it
        {data.narrowed ? "; with a filter on it is a count, since back clicks carry no source" : ""}
        . Time: median from arriving on a slide to going on; none on slide 6, as there is no end
        time on the last slide. Engagement: on slide 2, readers who stepped through the deep dives
        with its arrows, of those who reached it since 6 Oct 2026 (opening the deep dives does not
        count); no other slide records any.
      </p>
    </Card>
  );
}

function TimeSection({ data }: { data: ReportPayload }) {
  const t = data.time;
  const max = Math.max(0.0001, ...t.buckets.map((b) => Math.max(b.share, b.bench)));
  const vs = delta("mmss", t.avgMs, t.benchAvgMs);
  return (
    <Card labelledBy="h-time">
      <h2 id="h-time" className="m-0 font-serif text-[22px] font-semibold">
        Time in report
      </h2>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(170px, 100%), 1fr))" }}
      >
        {/* StatBox's comparison reads "prev."; this one is with the benchmark. */}
        <div className="flex min-w-0 flex-col gap-1 rounded-[14px] bg-ap-ground p-3.5">
          <span className="text-xs text-ap-muted">Avg. total time</span>
          <span className="font-serif text-2xl font-semibold tabular-nums text-ap-ink">
            {fmt("mmss", t.avgMs)}
          </span>
          <span className="text-xs text-ap-muted">
            {vs ? (
              <>
                <strong
                  className={
                    vs.tone === "good"
                      ? "text-ap-good"
                      : vs.tone === "bad"
                        ? "text-ap-bad"
                        : "text-ap-muted"
                  }
                >
                  {vs.text}
                </strong>{" "}
                vs all reports ({fmt("mmss", t.benchAvgMs)})
              </>
            ) : (
              "all sessions per reader"
            )}
          </span>
        </div>
        <StatBox
          stat={{
            label: "Median total time",
            unit: "mmss",
            value: t.medianMs,
            note: "all sessions per reader",
          }}
        />
        <StatBox
          stat={{
            label: "Avg. per session",
            unit: "mmss",
            value: t.perSessionMs,
            note: "closed sessions under 4 hours",
          }}
        />
        <StatBox
          stat={{
            label: "Readers",
            unit: "count",
            value: t.readers,
            note: `reading time recorded for ${fmt("count", t.recorded)}`,
          }}
        />
      </div>
      <span className="text-[13px] text-ap-muted">
        Share of readers by total reading time (minutes)
      </span>
      <div className="flex flex-wrap gap-4 text-xs text-ap-body">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3 w-3 rounded-[3px] bg-ap-purple" />
          This range
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-0 w-4 border-t-2 border-dashed border-ap-ink" />
          Benchmark · all readers since 18 Sep 2026
        </span>
      </div>
      <div className="flex h-[150px] items-end gap-2.5 border-b border-ap-line">
        {t.buckets.map((b) => (
          <div
            key={b.label}
            className="relative flex h-full flex-1 flex-col items-center justify-end gap-1"
          >
            <span className="text-xs font-bold">
              {fmt("pct", b.share, 0)}{" "}
              <span className="font-medium text-ap-muted">· {fmt("pct", b.bench, 0)}</span>
            </span>
            <span
              className="w-full max-w-12 rounded-t-md rounded-b-sm bg-ap-purple"
              style={{ height: `${Math.round((b.share / max) * 110)}px` }}
            />
            <span
              aria-hidden="true"
              className="absolute left-[4%] right-[4%] border-t-2 border-dashed border-ap-ink"
              style={{ bottom: `${Math.round((b.bench / max) * 110)}px` }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2.5">
        {t.buckets.map((b) => (
          <span key={b.label} className="flex-1 text-center text-[11px] text-ap-muted">
            {b.label}
          </span>
        ))}
      </div>
      <div
        className="grid gap-6 border-t border-ap-line pt-4"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))" }}
      >
        <TimeSplit title="gender" rows={t.byGender} />
        <TimeSplit title="age" rows={t.byAge} />
      </div>
      <span className="text-xs leading-relaxed text-ap-muted">
        Reading time counts sessions whose end was recorded (saved since 18 Sep 2026, for about half
        of the sessions), each under 4 hours. Bars: this range · tick: the benchmark for the same
        group · right: the difference. Gender from question 15010, age from 15003.
      </span>
    </Card>
  );
}

function TimeSplit({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; ms: number | null; benchMs: number | null }>;
}) {
  const shown = rows.filter((r) => r.ms !== null || r.benchMs !== null);
  const max = Math.max(1, ...shown.map((r) => Math.max(r.ms ?? 0, r.benchMs ?? 0)));
  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-[13px] font-bold text-ap-body">Avg. total time by {title}</span>
      {shown.map((r) => {
        const d = r.ms !== null && r.benchMs !== null ? r.ms - r.benchMs : null;
        return (
          <div
            key={r.label}
            className="grid items-center gap-2.5 text-[13px]"
            style={{ gridTemplateColumns: "110px minmax(0,1fr) 48px 56px" }}
          >
            <span className="font-semibold">{r.label}</span>
            <span className="relative h-3 rounded-full bg-ap-track">
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-ap-purple"
                style={{ width: `${((r.ms ?? 0) / max) * 100}%` }}
              />
              {r.benchMs !== null && (
                <span
                  aria-hidden="true"
                  className="absolute -bottom-[3px] -top-[3px] w-0.5 rounded-sm bg-ap-ink"
                  style={{ left: `${(r.benchMs / max) * 100}%` }}
                />
              )}
            </span>
            <span className="text-right font-bold tabular-nums">{fmt("mmss", r.ms)}</span>
            <span
              className={`text-right text-xs font-bold tabular-nums ${d === null ? "text-ap-muted" : d >= 0 ? "text-ap-good" : "text-ap-bad"}`}
            >
              {d === null ? "—" : `${d >= 0 ? "+" : "−"}${fmt("mmss", Math.abs(d))}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** The design's colours for the ways back; bookmarks and direct visits keep the purple. */
const SOURCE_COLOURS: Record<string, string> = {
  "Email link": "#fe6839",
  "Share link from a friend": "#9d8ad7",
  "Another tagged link": "#d6cff0",
};

type CampaignKey = "sent" | "opened" | "clicked" | "returned" | "rate" | "purchased";
type CampaignFilter = "campaign" | "status";
type CampaignRow = ReportPayload["returns"]["campaigns"][number];

const CAMPAIGN_FILTERS: Record<CampaignFilter, string> = { campaign: "Campaign", status: "Status" };

/** "72h_no_unlock" reads "72 hours on, not unlocked". */
const campaignName = (stage: string) =>
  stage
    .replace(
      /^(\d+)h_no_(view|unlock)$/,
      (_m, h: string, w: string) =>
        `${h} hours on, ${w === "view" ? "report not opened" : "not unlocked"}`
    )
    .replace(/_/g, " ");
const campaignValue = (c: CampaignRow, k: CampaignFilter) =>
  k === "campaign" ? campaignName(c.stage) : c.status;

/** A count with its share of the emails sent under it; "—" while it is not counted. */
function CountAndRate({ n, rate }: { n: number | null; rate: number | null }) {
  return (
    <span
      role="cell"
      className={`flex flex-col items-end px-3 py-2.5 text-[13px] tabular-nums ${n === null ? "text-ap-muted" : ""}`}
    >
      {fmt("count", n)}
      {n !== null && rate !== null && (
        <span className="text-xs text-ap-muted">{fmt("pct", rate, 1)}</span>
      )}
    </span>
  );
}

function ReturnsSection({ data }: { data: ReportPayload }) {
  const r = data.returns;
  const maxBand = Math.max(0.0001, ...r.days.map((d) => d.share));
  const [sort, setSort] = useState<Sort<CampaignKey>>(null);
  const head = { sort, onSort: (k: CampaignKey) => setSort((s) => nextSort(s, k)) };
  const filters = useColumnFilters(r.campaigns, CAMPAIGN_FILTERS, campaignValue);
  const campaigns = sortRows(
    filters.matches,
    sort,
    (c, k) =>
      ({
        sent: c.sent,
        opened: c.opened,
        clicked: c.clicked,
        returned: c.returned,
        rate: c.returnRate,
        purchased: c.purchased,
      })[k]
  );
  const gtc = "minmax(220px,2fr) 90px repeat(6, minmax(84px,1fr))";
  return (
    <Card labelledBy="h-returns">
      <h2 id="h-returns" className="m-0 font-serif text-[22px] font-semibold">
        Returns
      </h2>
      {data.narrowed && (
        <AllTraffic note="How people came back and the email campaigns are all traffic: those records carry no source, device or tier." />
      )}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(170px, 100%), 1fr))" }}
      >
        <StatBox
          stat={{
            label: "Came back",
            unit: "pct",
            value: r.cameBack,
            note: "of readers, 30+ minutes after their last visit",
          }}
        />
        <StatBox
          stat={{
            label: "Median days to return",
            unit: "days",
            value: r.medianDays,
            note: "first visit to the second",
          }}
        />
        <StatBox
          stat={{
            label: "Returned via email",
            unit: "pct",
            value: r.viaEmail,
            note: "of return visits, from any email link (PostHog)",
          }}
        />
        <StatBox
          stat={{
            label: "Visits per reader",
            unit: "ratio",
            value: r.sessionsPerReader,
            note: "average",
          }}
        />
      </div>
      <div className="flex max-w-[880px] flex-col gap-6">
        <div className="flex flex-col gap-2.5">
          <span className="text-[13px] font-bold text-ap-body">
            Days until first return · % of all readers
          </span>
          <div
            className="grid items-end gap-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-ap-muted"
            style={{ gridTemplateColumns: "110px minmax(0,1fr) 56px 80px" }}
          >
            <span>Time to return</span>
            <span />
            <span className="text-right">In this band</span>
            <span className="text-right">Returned by then</span>
          </div>
          {r.days.map((d) => (
            <div
              key={d.label}
              className="grid items-center gap-2.5 text-[13px]"
              style={{ gridTemplateColumns: "110px minmax(0,1fr) 56px 80px" }}
            >
              <span>{d.label}</span>
              <Bar
                pct={d.share / maxBand}
                color={d.cumulative === null ? "#d6cff0" : "#795fc8"}
                height={12}
              />
              <span className="text-right font-bold tabular-nums">{fmt("pct", d.share, 1)}</span>
              <span className="text-right text-xs tabular-nums text-ap-muted">
                {d.cumulative === null ? "—" : fmt("pct", d.cumulative, 1)}
              </span>
            </div>
          ))}
          <span className="text-xs leading-normal text-ap-muted">
            <strong>In this band</strong> = readers whose first return fell in that window.{" "}
            <strong>Returned by then</strong> = all readers who had come back by the end of it.
          </span>
        </div>
        <div className="flex flex-col gap-2.5">
          <span className="text-[13px] font-bold text-ap-body">
            What brought readers back · % of return visits
          </span>
          {r.sources === null || !r.sources.ok ? (
            <p className="m-0 text-sm text-ap-muted">
              PostHog could not be read{r.sources && !r.sources.ok ? `: ${r.sources.error}` : ""}.
            </p>
          ) : (
            r.sources.value.map((s) => (
              <div
                key={s.source}
                className="grid items-center gap-2.5 text-[13px]"
                style={{ gridTemplateColumns: "180px minmax(0,1fr) 56px" }}
              >
                <span>{s.source}</span>
                <Bar pct={s.share} color={SOURCE_COLOURS[s.source] ?? "#795fc8"} height={12} />
                <span className="text-right font-bold tabular-nums">{fmt("pct", s.share, 0)}</span>
              </div>
            ))
          )}
          <NotTracked>From PostHog: return visits whose first page it saw</NotTracked>
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        <span className="text-[13px] font-bold text-ap-body">
          Email campaigns that bring readers back
        </span>
        {filters.choice}
        <div className="overflow-x-auto rounded-[14px] border border-ap-line">
          <div role="table" aria-label="Email campaigns" style={{ minWidth: 900 }}>
            <div role="row" className="grid bg-ap-ground" style={{ gridTemplateColumns: gtc }}>
              <Th label="Campaign" filter={filters.funnel("campaign")} />
              <Th label="Status" filter={filters.funnel("status")} />
              <Th label="Sent" col="sent" right {...head} />
              <Th label="Opened" col="opened" right {...head} />
              <Th label="Clicked" col="clicked" right {...head} />
              <Th label="Returned" col="returned" right {...head} />
              <Th label="Return rate" col="rate" right {...head} />
              <Th label="Purchased" col="purchased" right {...head} />
            </div>
            {campaigns.length === 0 && (
              <p className="m-0 border-t border-ap-line px-3 py-3 text-sm text-ap-muted">
                {r.campaigns.length
                  ? "No campaign matches the filters."
                  : "No campaign email was sent in this range."}
              </p>
            )}
            {campaigns.map((c) => (
              <div
                key={c.stage}
                role="row"
                className="grid items-center border-t border-ap-line"
                style={{ gridTemplateColumns: gtc }}
              >
                <span role="rowheader" className="flex flex-col gap-0.5 px-3 py-2.5">
                  <span className="text-sm font-bold">{campaignName(c.stage)}</span>
                  <span className="text-xs text-ap-muted">
                    {c.status === "Live"
                      ? "Sent 72 h after the report if not unlocked, with a 50% code"
                      : "Retired with Pricing 2.0"}
                  </span>
                </span>
                <span role="cell" className="px-3 py-2.5">
                  <span
                    className={`rounded-full px-2.5 py-[3px] text-xs font-bold ${c.status === "Live" ? "bg-ap-good/10 text-ap-good" : "bg-ap-track text-ap-muted"}`}
                  >
                    {c.status}
                  </span>
                </span>
                <span role="cell" className="px-3 py-2.5 text-right text-[13px] tabular-nums">
                  {fmt("count", c.sent)}
                </span>
                <CountAndRate n={c.opened} rate={c.openRate} />
                <CountAndRate n={c.clicked} rate={c.clickRate} />
                <span
                  role="cell"
                  className="px-3 py-2.5 text-right text-[13px] font-bold tabular-nums"
                >
                  {fmt("count", c.returned)}
                </span>
                <span role="cell" className="px-3 py-2.5 text-right text-[13px] tabular-nums">
                  {fmt("pct", c.returnRate, 1)}
                </span>
                <span role="cell" className="px-3 py-2.5 text-right text-[13px] tabular-nums">
                  {fmt("count", c.purchased)}
                </span>
              </div>
            ))}
          </div>
        </div>
        <span className="text-xs leading-relaxed text-ap-muted">
          Sent: emails sent in the range (marked just before sending, so a failed send still
          counts). Opened and Clicked: of those, readers whose email was opened, or a link in it
          clicked, as Resend reports each email; under the count, the share of the emails Resend
          reported delivered. {r.emailEvents} Opens are inflated by Apple Mail, which loads images
          for privacy, so clicks are the surer signal. Returned: of those sent, readers who opened
          their report from the email&rsquo;s link after it was sent, as the report records every
          such arrival since 18 Sep 2026. It replaces PostHog&rsquo;s count, which saw only about a
          quarter of visits. Return rate = returned ÷ sent. Purchased: sales in the range that used
          the email&rsquo;s code.
        </span>
      </div>
    </Card>
  );
}

type ChapterKey =
  "name" | "reach" | "time" | "votes" | "showMore" | "paywall" | "learnMore" | "exercise";
type ChapterRow = ReportPayload["chapters"][number];

/** The design's "Sort chapters by", after Report order. */
const CHAPTER_SORTS: Array<{ value: Exclude<ChapterKey, "name">; label: string }> = [
  { value: "reach", label: "Reach" },
  { value: "time", label: "Time" },
  { value: "votes", label: "Feedback" },
  { value: "showMore", label: "Show more" },
  { value: "paywall", label: "Paywall" },
  { value: "learnMore", label: "Learn more" },
  { value: "exercise", label: "Exercise" },
];

function ChaptersSection({ data }: { data: ReportPayload }) {
  const reading = data.chapterReading;
  const [sort, setSort] = useState<Sort<ChapterKey>>(null);
  const filters = useColumnFilters(data.chapters, { name: "Chapter" }, (c) => c.name);
  // A range with no reading per chapter shows the readers who clicked a paywall, as before.
  const paywallOf = (c: ChapterRow) => (reading.recorded ? c.paywall : c.paywallReaders || null);
  const rows = sortRows(filters.matches, sort, (c, k) =>
    k === "name"
      ? c.name
      : k === "reach"
        ? c.reach
        : k === "time"
          ? c.avgMs
          : k === "votes"
            ? c.up + c.down
            : k === "showMore"
              ? c.showMore
              : k === "paywall"
                ? paywallOf(c)
                : k === "learnMore"
                  ? c.learnMore
                  : c.exercise
  );
  const head = {
    sort,
    onSort: (k: ChapterKey) => setSort((s) => nextSort(s, k, k === "name" ? 1 : -1)),
  };
  const maxVotes = Math.max(1, ...data.chapters.map((c) => c.up + c.down));
  const gtc =
    "40px minmax(220px,2fr) minmax(120px,1fr) 80px minmax(190px,1.5fr) repeat(4, minmax(96px,0.7fr))";
  const from = reading.from ? rangeLabel(reading.from, reading.from) : null;
  return (
    <Card id="chapters" labelledBy="h-ch">
      <SectionHead
        id="h-ch"
        title="Chapters"
        right={
          <Pills<"order" | ChapterKey>
            label="Sort chapters by"
            options={[{ value: "order", label: "Report order" }, ...CHAPTER_SORTS]}
            value={sort?.key ?? "order"}
            onChange={(v) => setSort(v === "order" ? null : { key: v, dir: -1 })}
          />
        }
      />
      <AllTraffic note={data.narrowed} />
      <NotTracked>{from ? `Recorded from ${from}` : "Not recorded yet"}</NotTracked>
      <p className="m-0 text-[13px] leading-relaxed text-ap-muted">
        All {data.chapters.length} chapters, in the live report&rsquo;s order, then chapters of
        earlier report versions that were voted on. Reach: of the range&rsquo;s{" "}
        {fmt("count", reading.readers)} readers whose reading per chapter was recorded (those who
        finished from {from ?? "the day it starts"}), the ones who spent a second or more in the
        chapter or used anything in it. Avg. time: their mean time with it as the chapter on screen,
        up to 30 minutes each. Show more, Learn more and Exercise CTR: of those readers, the share
        who opened its Show all, Learn More &amp; Go Deeper or Try This &amp; See What Shifts; a
        dash where nobody did or the chapter has none. Paywall CTR: of the readers who saw a paywall
        in the chapter, the share who clicked one (under it, how many clicked of how many saw).
        Feedback: votes given in the range; the bar is relative to the most-voted chapter, green
        good and red bad.
        {reading.recorded
          ? ""
          : " With no reading recorded in this range, Paywall shows the readers who clicked a paywall or lock button in the chapter, as a count."}
      </p>
      {filters.choice}
      <div className="overflow-x-auto rounded-[14px] border border-ap-line">
        <div role="table" aria-label="Chapters" style={{ minWidth: 1150 }}>
          <div role="row" className="grid bg-ap-ground" style={{ gridTemplateColumns: gtc }}>
            <Th label="#" />
            <Th label="Chapter" col="name" filter={filters.funnel("name")} {...head} />
            <Th label="Reach" col="reach" {...head} />
            <Th label="Avg. time" col="time" right {...head} />
            <Th label="Feedback · good / bad" col="votes" {...head} />
            <Th label="Show more CTR" col="showMore" right {...head} />
            <Th label="Paywall CTR" col="paywall" right {...head} />
            <Th label="Learn more CTR" col="learnMore" right {...head} />
            <Th label="Exercise CTR" col="exercise" right {...head} />
          </div>
          {rows.map((c) => (
            <div
              key={c.id}
              role="row"
              className="grid items-center border-t border-ap-line"
              style={{ gridTemplateColumns: gtc }}
            >
              <span role="cell" className="px-3 py-2 text-xs tabular-nums text-ap-muted">
                {c.n}
              </span>
              <span role="rowheader" className="flex flex-col gap-px px-3 py-2">
                <span className="text-[13px] font-bold">{c.name}</span>
                <span className="font-mono text-[11px] text-ap-muted">
                  {c.part} · {c.id}
                </span>
              </span>
              <span role="cell" className="flex items-center gap-2 px-3 py-2">
                <span className="flex-1">
                  <Bar pct={c.reach} height={8} />
                </span>
                <span className="min-w-[34px] text-right text-xs font-bold tabular-nums">
                  {fmt("pct", c.reach, 0)}
                </span>
              </span>
              <span role="cell" className="px-3 py-2 text-right text-[13px] tabular-nums">
                {fmt("mmss", c.avgMs)}
              </span>
              <span role="cell" className="flex items-center gap-2 px-3 py-2">
                <span className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-ap-track">
                  <span
                    className="block h-full bg-ap-good"
                    style={{ width: `${(c.up / maxVotes) * 100}%` }}
                  />
                  <span
                    className="block h-full bg-ap-bad"
                    style={{ width: `${(c.down / maxVotes) * 100}%` }}
                  />
                </span>
                {c.up + c.down > 0 ? (
                  <>
                    <span className="min-w-[26px] text-right text-xs font-bold tabular-nums">
                      {c.up + c.down}
                    </span>
                    <span className="min-w-[44px] text-[11px] tabular-nums">
                      <span className="font-bold text-ap-good-ink">{c.up}</span> /{" "}
                      <span className="font-bold text-ap-bad-ink">{c.down}</span>
                    </span>
                  </>
                ) : (
                  <span className="min-w-[74px] text-right text-xs text-ap-muted">no votes</span>
                )}
              </span>
              <span role="cell" className="px-3 py-2 text-right text-[13px] tabular-nums">
                {fmt("pct", c.showMore, 1)}
              </span>
              <span role="cell" className="px-3 py-2 text-right text-[13px] tabular-nums">
                {reading.recorded ? (
                  <>
                    {fmt("pct", c.paywall, 1)}
                    {c.paywallSeen > 0 && (
                      <span className="block text-[11px] text-ap-muted">
                        {fmt("count", c.paywallClicked)} of {fmt("count", c.paywallSeen)}
                      </span>
                    )}
                  </>
                ) : c.paywallReaders ? (
                  `${fmt("count", c.paywallReaders)} clicked`
                ) : (
                  "—"
                )}
              </span>
              <span role="cell" className="px-3 py-2 text-right text-[13px] tabular-nums">
                {fmt("pct", c.learnMore, 1)}
              </span>
              <span role="cell" className="px-3 py-2 text-right text-[13px] tabular-nums">
                {fmt("pct", c.exercise, 1)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

type LogKey = "at" | "chapter";
type LogFilter = "submission" | "chapter" | "vote" | "issue";
type LogRow = ReportPayload["feedback"]["log"][number];

const LOG_FILTERS: Record<LogFilter, string> = {
  submission: "Submission",
  chapter: "Chapter",
  vote: "Vote",
  issue: "Issue",
};
const logValue = (r: LogRow, k: LogFilter) =>
  k === "submission"
    ? r.submission === null
      ? ""
      : `#${r.submission}`
    : k === "chapter"
      ? r.chapter
      : k === "vote"
        ? r.vote
        : (r.issue ?? "");

function FeedbackSection({ data }: { data: ReportPayload }) {
  const fb = data.feedback;
  const [sort, setSort] = useState<Sort<LogKey>>({ key: "at", dir: -1 });
  const [all, setAll] = useState(false);
  const {
    picked,
    pick,
    matches: kept,
    funnel,
    choice,
  } = useColumnFilters(fb.log, LOG_FILTERS, logValue, {
    fixed: { vote: ["Good", "Bad"] },
    onPick: () => setAll(false),
  });
  const matches = sortRows(kept, sort, (r, k) => (k === "at" ? Date.parse(r.at) : r.chapter));
  const shown = all ? matches : matches.slice(0, 8);
  const head = {
    sort,
    onSort: (k: LogKey) => setSort((s) => nextSort(s, k, k === "chapter" ? 1 : -1)),
  };
  const goodShare = fb.good + fb.bad ? fb.good / (fb.good + fb.bad) : null;
  const gtc = "170px 100px minmax(220px,2fr) 90px 140px 110px";
  return (
    <Card id="feedback" labelledBy="h-fb">
      <SectionHead
        id="h-fb"
        eyebrow="Report · Engagement"
        title="Feedback"
        description="Chapter votes (report_section_feedback) given in the range."
        right={
          <a
            href="/admin/ap/explorer?table=report_section_feedback"
            className="text-[13px] font-bold text-ap-plum hover:text-ap-violet"
          >
            All comments in the explorer →
          </a>
        }
      />
      <AllTraffic note={data.narrowed} />
      <div
        className="grid items-start gap-5"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))" }}
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline gap-2.5">
            <span className="font-serif text-[40px] font-semibold leading-none">
              {fmt("pct", goodShare, 0)}
            </span>
            <span className="text-[13px] text-ap-muted">
              good · {fb.good} good / {fb.bad} bad · {fb.total} votes
            </span>
          </div>
          <div className="flex h-3.5 overflow-hidden rounded-full bg-ap-track" aria-hidden="true">
            <span style={{ width: `${(goodShare ?? 0) * 100}%`, background: "#2e7d5b" }} />
            <span
              style={{
                width: `${goodShare === null ? 0 : (1 - goodShare) * 100}%`,
                background: "#d63200",
              }}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-bold text-ap-body">
            Issues reported with a bad vote
          </span>
          {fb.issues.map((i) => (
            <div
              key={i.label}
              className="flex justify-between gap-2 border-b border-ap-line py-2 text-[13px]"
            >
              <span>{i.label}</span>
              <strong className="tabular-nums">{i.n}</strong>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <span className="text-[13px] font-bold text-ap-body">
            Feedback log · {shown.length} of {matches.length}
          </span>
          <Pills
            label="Filter feedback"
            options={[
              { value: "", label: `All · ${fb.log.length}` },
              { value: "Good", label: `Good · ${fb.log.filter((r) => r.vote === "Good").length}` },
              { value: "Bad", label: `Bad · ${fb.log.filter((r) => r.vote === "Bad").length}` },
            ]}
            value={picked.vote}
            onChange={(v) => pick("vote", v)}
          />
        </div>
        {choice}
        <div className="overflow-x-auto rounded-[14px] border border-ap-line">
          <div role="table" aria-label="Feedback log" style={{ minWidth: 860 }}>
            <div role="row" className="grid bg-ap-ground" style={{ gridTemplateColumns: gtc }}>
              <Th label="Date & time (Berlin)" col="at" {...head} />
              <Th label="Submission" filter={funnel("submission")} />
              <Th label="Chapter" col="chapter" filter={funnel("chapter")} {...head} />
              <Th label="Vote" filter={funnel("vote")} />
              <Th label="Issue" filter={funnel("issue")} />
              <Th label="Comment" />
            </div>
            {shown.length === 0 && (
              <p className="m-0 border-t border-ap-line px-3 py-3 text-sm text-ap-muted">
                {fb.log.length ? "No votes match the filters." : "No votes in this range."}
              </p>
            )}
            {shown.map((r, i) => (
              <div
                key={`${r.at}-${i}`}
                role="row"
                className="grid items-center border-t border-ap-line text-[13px]"
                style={{ gridTemplateColumns: gtc }}
              >
                <span role="cell" className="px-3 py-2 tabular-nums">
                  {new Date(r.at).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Europe/Berlin",
                  })}
                </span>
                <span role="cell" className="px-3 py-2">
                  {r.submission ? (
                    <a
                      href={`/admin/submissions/${r.submission}`}
                      className="font-mono text-xs text-ap-violet"
                    >
                      #{r.submission}
                    </a>
                  ) : (
                    "—"
                  )}
                </span>
                <span role="cell" className="px-3 py-2 font-semibold">
                  {r.chapter}
                </span>
                <span role="cell" className="px-3 py-2">
                  <span
                    className={`rounded-full px-2.5 py-[3px] text-xs font-bold ${r.vote === "Good" ? "bg-ap-good/10 text-ap-good-ink" : "bg-ap-bad/10 text-ap-bad-ink"}`}
                  >
                    {r.vote}
                  </span>
                </span>
                <span role="cell" className="px-3 py-2 text-ap-muted">
                  {r.issue ?? "—"}
                </span>
                <span
                  role="cell"
                  className={`px-3 py-2 font-serif italic ${r.commented ? "text-ap-body" : "text-ap-muted"}`}
                >
                  {r.commented ? "left a comment" : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
        {matches.length > 8 && (
          <button
            type="button"
            onClick={() => setAll((a) => !a)}
            aria-expanded={all}
            className="min-h-11 cursor-pointer self-center rounded-full border border-ap-line bg-white px-[22px] text-sm font-bold text-ap-ink"
          >
            {all ? "Show fewer" : `Show all ${matches.length}`}
          </button>
        )}
        <span className="text-xs text-ap-muted">
          The comment text stays in the explorer and the submission&rsquo;s own page; this log shows
          whether one was left.
        </span>
      </div>
    </Card>
  );
}
