"use client";

import { useState, type ReactNode } from "react";

import { shortDate } from "@features/admin/server/ap/days";
import { rangeLabel } from "@features/admin/server/ap/filters";
import { delta, deltaRel, EMPTY, fmt, type Tone } from "@features/admin/server/ap/format";
import type {
  ChangeBox,
  Parts,
  ReportPayload,
  ReportTile,
  TimeGroup,
  TourView,
} from "@features/admin/server/ap/report-page";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";

import ApFilterBar from "./ApFilterBar";
import { exportTables } from "./csv";
import { Info, type Worked } from "./field-info";
import { bucketTitles, IndexHover, ROW_HOVER, useRowTip } from "./hover";
import {
  AllTraffic,
  Bar,
  BlackButton,
  Busy,
  Card,
  Failed,
  FilterIcon,
  ICON_BTN,
  KpiTileV2,
  Loading,
  NotTracked,
  PageHeader,
  Pills,
  RangeLine,
  SectionHead,
  SectionNav,
  SortIcon,
  TileGrid,
  useHashScroll,
} from "./kit";
import { useApFilters } from "./useApFilters";

/** The reader's surveys in the Explorer, over all time. */
const userHref = (id: number | string) =>
  `/admin/ap/explorer?${new URLSearchParams({
    source: "production",
    table: "survey_submission",
    date: "",
    filters: JSON.stringify([["user_id", "eq", String(id)]]),
  })}`;

/** A whole percentage, as the design writes the wizard's; one too small for 1% reads "<1%", not "0%". */
const wholePct = (v: number | null) =>
  v !== null && v > 0 && v < 0.005 ? "<1%" : fmt("pct", v, 0);

/**
 * Continue, Skip intro and Exit in whole percents that add up to 100 (largest remainder), as the
 * note under the table promises; where Skip intro wasn't recorded, the others add up to their
 * own total. Equal shares read alike: the points left go to whole groups of equal shares, the
 * groups that fit with the most remainder; when none fit, plain largest remainder. A skip of
 * none reads "—", as the design writes it.
 */
export function wholeSplit(parts: Array<number | null>): string[] {
  const pct = parts.map((p) => (p === null ? 0 : p * 100));
  const whole = pct.map(Math.floor);
  const known = parts.flatMap((p, i) => (p === null ? [] : [i]));
  const left =
    Math.round(known.reduce((a, i) => a + pct[i]!, 0)) - known.reduce((a, i) => a + whole[i]!, 0);
  const rem = (i: number) => pct[i]! - whole[i]!;
  const groups = [...new Set(known.map((i) => parts[i]!))].map((v) =>
    known.filter((i) => parts[i] === v)
  );
  let best: number[][] | null = null;
  let bestRem = -1;
  for (let mask = 1; mask < 1 << groups.length; mask++) {
    const pick = groups.filter((_, g) => mask & (1 << g));
    const size = pick.reduce((a, g) => a + g.length, 0);
    const r = pick.reduce((a, g) => a + g.length * rem(g[0]!), 0);
    if (size === left && r > bestRem) [best, bestRem] = [pick, r];
  }
  const up = new Set(
    best ? best.flat() : [...known].sort((a, b) => rem(b) - rem(a)).slice(0, Math.max(0, left))
  );
  return parts.map((p, i) => {
    if (p === null) return wholePct(null);
    const v = whole[i]! + (up.has(i) ? 1 : 0);
    return v === 0 && p > 0 ? "<1%" : `${v}%`;
  });
}

/** At least `pct` percent as the whole percentage shows it: the design's highlights. */
const atLeast = (v: number | null, pct: number) => v !== null && Math.round(v * 100) >= pct;

/** "1 vote", "74 votes". */
const votes = (n: number) => `${fmt("count", n)} vote${n === 1 ? "" : "s"}`;

/** A total reading time as h:mm:ss ("47:22:20") from an hour, m:ss below. */
const hms = (ms: number) => {
  const s = Math.round(ms / 1000);
  return s < 3600
    ? fmt("mmss", ms)
    : `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** A figure for its info card: as printed, with what it is worked out of where it has parts. */
const workedOf = (shown: string, parts?: Parts, time = false): Worked =>
  parts
    ? {
        num: time ? hms(parts.num) : fmt("count", parts.num),
        den: fmt("count", parts.den),
        value: shown,
      }
    : { value: shown };

const TONE: Record<Tone, string> = {
  good: "text-ap-good",
  bad: "text-ap-bad",
  flat: "text-ap-muted",
};

/**
 * Each tile's info card by the tile's key; a headline tile's 12-week line is read by the same
 * key (field-info finds it among the payload's `tiles`). The wizard's tiles sit in their own
 * list, which the card does not read, so theirs is not offered; nor Pre unlock's, never sold.
 */
const TILE_INFO: Record<string, { k: string; trend?: true }> = {
  opened: { k: "report.opened", trend: true },
  read: { k: "report.read", trend: true },
  median: { k: "report.median", trend: true },
  returned: { k: "report.returned", trend: true },
  initiated: { k: "report.initiated", trend: true },
  share: { k: "report.share", trend: true },
  rating: { k: "report.rating", trend: true },
  invite: { k: "report.invite", trend: true },
  pre: { k: "report.pre" },
  full: { k: "report.full", trend: true },
  intro: { k: "report.intro" },
  completed: { k: "report.completed" },
  skipped: { k: "report.skipped" },
  left: { k: "report.left" },
  "tour-started": { k: "report.tour-started" },
  "tour-completed": { k: "report.tour-completed" },
  "tour-skipped": { k: "report.tour-skipped" },
  "tour-left": { k: "report.tour-left" },
};

/** Each box's info card under Time in report and Returns, by the box's key. */
const BOX_INFO: Record<string, { k: string }> = {
  avg: { k: "report.time_avg" },
  median: { k: "report.time_median" },
  session: { k: "report.time_session" },
  readers: { k: "report.time_readers" },
  back: { k: "report.came_back" },
  days: { k: "report.days_to_return" },
  email: { k: "report.via_email" },
  visits: { k: "report.sessions_per_reader" },
};

/** The design's headline tile (KpiTileV2), at the tile's own decimals, with its info card. */
function ReportKpiTile({ tile, range }: { tile: ReportTile; range: { from: string; to: string } }) {
  const about = TILE_INFO[tile.key];
  return (
    <KpiTileV2
      tile={tile}
      digits={tile.digits}
      titles={bucketTitles(range.from, range.to)}
      info={
        about && {
          k: about.k,
          worked: tile.blocked
            ? undefined
            : workedOf(fmt(tile.unit, tile.value, tile.digits), tile.parts, tile.unit === "mmss"),
          trend: about.trend ? { route: "report", tile: tile.key, unit: tile.unit } : undefined,
        }
      }
    />
  );
}

/**
 * A box under Time in report or Returns: its value, then its change against the period before
 * as a percentage (green, red, grey when flat) or the box's note, as drawn.
 */
function ChangeBoxView({ box }: { box: ChangeBox }) {
  const d = box.note === undefined ? deltaRel(box.value, box.prev, box.goodWhen) : null;
  const shown =
    box.unit === "pct" && box.digits === 0
      ? wholePct(box.value)
      : fmt(box.unit, box.value, box.digits);
  const about = BOX_INFO[box.key];
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-[14px] bg-ap-ground p-3.5">
      <span className="text-xs text-ap-muted">
        {box.label}
        {about && (
          <>
            {" "}
            <Info
              k={about.k}
              label={box.label}
              worked={workedOf(shown, box.parts, box.unit === "mmss")}
            />
          </>
        )}
      </span>
      <span className="font-serif text-2xl font-semibold tabular-nums text-ap-ink">{shown}</span>
      <span
        className={`text-sm font-bold tabular-nums ${box.note !== undefined ? "text-ap-muted" : TONE[d?.tone ?? "flat"]}`}
      >
        {box.note ?? d?.text ?? "—"}
      </span>
    </div>
  );
}

const SECTIONS = [
  { id: "wizard", label: "Wizard" },
  { id: "tour", label: "Guided tour" },
  { id: "time", label: "Time & returns" },
  { id: "chapters", label: "Chapters" },
  { id: "feedback", label: "Feedback" },
];

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

/**
 * A header cell: the design's sort arrows on a sortable column, a funnel where one filters,
 * and a figure's info icon after its name.
 */
function Th<K extends string>({
  label,
  right = false,
  col,
  sort = null,
  onSort,
  filter,
  info,
}: {
  label: string;
  right?: boolean;
  col?: K;
  sort?: Sort<K>;
  onSort?: (key: K) => void;
  filter?: ReactNode;
  info?: string;
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
      {info && <Info k={info} label={label} />}
      {filter}
      {col !== undefined && onSort && (
        <button
          type="button"
          aria-label={`Sort by ${label}`}
          onClick={() => onSort(col)}
          className={`${ICON_BTN} ${dir ? "text-ap-violet" : "text-ap-muted"}`}
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
      className={`${ICON_BTN} ${open === k || picked[k] ? "text-ap-violet" : "text-ap-muted"}`}
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
                    ...data.tour.audiences.map((a) => ({
                      name: `Guided tour · ${a.label}`,
                      table: {
                        columns: [
                          { label: "Stop", unit: "text" as const },
                          { label: "Reached (runs)", unit: "count" as const },
                          { label: "Reached", unit: "pct" as const },
                          { label: "Median time", unit: "mmss" as const },
                          { label: "Next", unit: "pct" as const },
                          { label: "Back", unit: "pct" as const },
                          { label: "Skip tour", unit: "pct" as const },
                          { label: "Exit", unit: "pct" as const },
                        ],
                        rows: a.stops.map((s) => ({
                          label: `${s.n} · ${s.name}`,
                          values: [
                            s.reached,
                            s.reachedShare,
                            s.medianMs,
                            s.next,
                            s.back,
                            s.skip,
                            s.exit,
                          ],
                        })),
                      },
                    })),
                    {
                      name: "Chapters",
                      table: {
                        columns: [
                          { label: "Chapter", unit: "text" },
                          { label: "Reach", unit: "pct" },
                          { label: "Median time", unit: "mmss" },
                          { label: "Avg. time", unit: "mmss" },
                          { label: "Good votes (all time)", unit: "count" },
                          { label: "Bad votes (all time)", unit: "count" },
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
                            c.medianMs,
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
                      name: "Time in report and returns",
                      table: {
                        columns: [
                          { label: "Figure", unit: "text" },
                          { label: "This range", unit: "text" },
                          { label: "Period before, same age", unit: "text" },
                          { label: "Change", unit: "text" },
                        ],
                        rows: [...data.time.boxes, ...data.returns.boxes].map((b) => ({
                          label: b.label,
                          values: [
                            fmt(b.unit, b.value, b.digits),
                            fmt(b.unit, b.prev, b.digits),
                            b.note ?? deltaRel(b.value, b.prev, b.goodWhen)?.text ?? "",
                          ],
                        })),
                      },
                    },
                    {
                      name: "How far into the report readers got",
                      table: {
                        columns: [
                          { label: "Deepest point (share of chapters)", unit: "text" },
                          ...data.time.depth.groups.map((g) => ({
                            label: `Readers · ${g}`,
                            unit: "count" as const,
                          })),
                        ],
                        rows: data.time.depth.bands.map((b) => ({
                          label: b.label,
                          values: b.counts,
                        })),
                      },
                    },
                    {
                      name: "Reading time by gender and age",
                      table: {
                        columns: [
                          { label: "Group", unit: "text" },
                          { label: "Median", unit: "mmss" },
                          { label: "Benchmark median", unit: "mmss" },
                          { label: "Average", unit: "mmss" },
                          { label: "Benchmark average", unit: "mmss" },
                        ],
                        rows: [...data.time.byGender, ...data.time.byAge].map((g) => ({
                          label: g.label,
                          values: [g.medianMs, g.benchMedianMs, g.ms, g.benchMs],
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
                          { label: "Status", unit: "text" },
                          { label: "Sent", unit: "count" },
                          { label: "Send times estimated", unit: "text" },
                          { label: "Delivered (since opens)", unit: "count" },
                          { label: "Opened", unit: "count" },
                          { label: "Open rate", unit: "pct" },
                          { label: "Delivered", unit: "count" },
                          { label: "Clicked", unit: "count" },
                          { label: "Click rate", unit: "pct" },
                          { label: "Returned", unit: "count" },
                          { label: "Return rate", unit: "pct" },
                          { label: "Purchased", unit: "count" },
                        ],
                        rows: data.returns.campaigns.map((c) => ({
                          label: c.stage,
                          values: [
                            c.status,
                            c.sent,
                            c.estimated ? "yes" : "no",
                            c.deliveredOpens,
                            c.opened,
                            c.openRate,
                            c.delivered,
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
                      name: "Feedback reasons (bad votes, all time)",
                      table: {
                        columns: [
                          { label: "Reason", unit: "text" },
                          { label: "Votes", unit: "count" },
                        ],
                        rows: data.feedback.issues.map((x) => ({ label: x.label, values: [x.n] })),
                      },
                    },
                    {
                      name: "Feedback log (all time)",
                      table: {
                        columns: [
                          { label: "When", unit: "text" },
                          { label: "User ID", unit: "text" },
                          { label: "Submission", unit: "text" },
                          { label: "Chapter", unit: "text" },
                          { label: "Chapter id", unit: "text" },
                          { label: "Vote", unit: "text" },
                          { label: "Reason", unit: "text" },
                          { label: "Comment (contacts masked)", unit: "text" },
                        ],
                        rows: data.feedback.log.map((x) => ({
                          label: x.at,
                          values: [
                            x.user === null ? "" : String(x.user),
                            x.submission === null ? "" : String(x.submission),
                            x.chapter,
                            x.id,
                            x.vote,
                            x.issue ?? "",
                            x.comment ?? "",
                          ],
                        })),
                      },
                    },
                  ],
                  [
                    ...data.tiles,
                    ...data.wizard.tiles,
                    ...data.tour.audiences.flatMap((a) =>
                      a.tiles.map((t) => ({ ...t, label: `${t.label} · ${a.label}` }))
                    ),
                  ]
                )
              }
            >
              Export CSV
            </BlackButton>
          }
        />
        <SectionNav label="Report sections" sections={SECTIONS} ready={Boolean(data)} />
      </div>
      <ApFilterBar scope="assessment" />
      {loading && !data && <Loading label="the report page" />}
      {error && <Failed message={error} onRetry={refetch} />}
      {data && (
        <Busy busy={loading}>
          <RangeLine data={data} sources="Production database and PostHog" />
          <TileGrid min={180}>
            {data.tiles.map((t) => (
              <ReportKpiTile key={t.key} tile={t} range={data.range} />
            ))}
          </TileGrid>
          <WizardSection data={data} />
          <TourSection data={data} />
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
  // What Skip intro can't see in this range: a skip before it was recorded reads as an exit.
  const skipNote = !w.skipsFrom
    ? " Skip Intro is not recorded yet, so a skip counts as an exit."
    : data.range.to < w.skipsFrom
      ? ` Skip Intro is recorded from ${skipsFrom}: in this range a skip counts as an exit.`
      : data.range.from < w.skipsFrom
        ? ` Skip Intro is recorded from ${skipsFrom}: before ${skipsFrom} a skip counts as an exit.`
        : "";
  // Wider than drawn: each heading also carries its info icon.
  const gtc = "44px minmax(208px,2.6fr) 148px minmax(150px,1.2fr) 124px 140px 96px 96px";
  const head = { sort, onSort };
  return (
    <Card id="wizard" labelledBy="h-rwiz">
      <SectionHead id="h-rwiz" title="Intro wizard" />
      <TileGrid min={200}>
        {w.tiles.map((t) => (
          <ReportKpiTile key={t.key} tile={t} range={data.range} />
        ))}
      </TileGrid>
      {data.blocked ? (
        <p className="m-0 text-sm leading-relaxed text-ap-muted">{data.blocked}</p>
      ) : (
        <>
          {data.narrowed && (
            <AllTraffic note="Back and Median time are all traffic, as the slides' own events carry no funnel, source, device or tier: under any of these filters, Back is a count." />
          )}
          <div className="overflow-x-auto rounded-[14px] border border-ap-line">
            <div role="table" aria-label="Intro wizard slides" style={{ minWidth: 1040 }}>
              <div role="row" className="grid bg-ap-ground" style={{ gridTemplateColumns: gtc }}>
                <Th label="#" />
                <Th label="Slide" />
                <Th label="Median time" col="time" right info="report.wizard_time" {...head} />
                <Th label="Reached" col="reached" info="report.wizard_reached" {...head} />
                <Th label="Continue" col="cont" right info="report.wizard_continue" {...head} />
                <Th label="Skip intro" col="skip" right info="report.wizard_skip" {...head} />
                <Th label="Back" col="back" right info="report.wizard_back" {...head} />
                <Th label="Exit" col="exit" right info="report.wizard_exit" {...head} />
              </div>
              {slides.map((s) => (
                <div
                  key={s.n}
                  role="row"
                  className="grid items-center border-t border-ap-line"
                  style={{ gridTemplateColumns: gtc }}
                >
                  <span role="cell" className="px-3 py-2.5 text-xs tabular-nums text-ap-muted">
                    {s.n}
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
                    {wholeSplit([s.cont, s.skip, s.exit])[0]}
                  </span>
                  <span
                    role="cell"
                    className={`px-3 py-2.5 text-right text-[13px] tabular-nums ${atLeast(s.skip, 11) ? "font-bold text-ap-bad" : ""}`}
                  >
                    {s.skip === 0 ? "—" : wholeSplit([s.cont, s.skip, s.exit])[1]}
                  </span>
                  <span role="cell" className="px-3 py-2.5 text-right text-[13px] tabular-nums">
                    {s.n === 1
                      ? "—"
                      : s.backShare === null
                        ? fmt("count", s.back)
                        : wholePct(s.backShare)}
                  </span>
                  <span
                    role="cell"
                    className={`px-3 py-2.5 text-right text-[13px] tabular-nums ${atLeast(s.exit, 5) ? "font-bold text-ap-bad" : ""}`}
                  >
                    {wholeSplit([s.cont, s.skip, s.exit])[2]}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <p className="m-0 text-xs text-ap-muted">
            Continue + Skip intro + Exit add up to 100% of readers on each slide; Back is counted
            separately.{skipNote}
          </p>
          {data.wizardNote && <p className="m-0 text-xs text-ap-muted">{data.wizardNote}</p>}
        </>
      )}
    </Card>
  );
}

const TOUR_GRID = "44px minmax(280px,2.6fr) 74px minmax(130px,1.2fr) 80px 80px 90px 80px";

/**
 * The guided tour on a reader's first open (Marcus's "Guided tour" section): free readers' five
 * stops or paid readers' four, its four tiles, and per stop how its readers went on, back, skipped
 * or left. Drawn as the wizard above it is.
 */
function TourSection({ data }: { data: ReportPayload }) {
  const t = data.tour;
  const [key, setKey] = useState<TourView["key"]>("free");
  const a = t.audiences.find((x) => x.key === key) ?? t.audiences[0]!;
  return (
    <Card id="tour" labelledBy="h-tour">
      <SectionHead
        id="h-tour"
        title="Guided tour"
        description="Runs once when a reader first opens the report. Free readers get 5 stops, paid readers 4. Readers move with Next and Back, and can skip at any stop."
        align="end"
        right={
          <Pills
            label="Readers"
            options={t.audiences.map((x) => ({ value: x.key, label: x.label }))}
            value={a.key}
            onChange={setKey}
          />
        }
      />
      <AllTraffic note={data.narrowed} />
      {t.before && <NotTracked>Recorded from {t.from}: pick a range from that day on</NotTracked>}
      <TileGrid min={200}>
        {a.tiles.map((k) => (
          <ReportKpiTile key={k.key} tile={k} range={data.range} />
        ))}
      </TileGrid>
      <div className="overflow-x-auto rounded-[14px] border border-ap-line">
        <div role="table" aria-label="Guided tour stops" style={{ minWidth: 980 }}>
          <div role="row" className="grid bg-ap-ground" style={{ gridTemplateColumns: TOUR_GRID }}>
            <Th label="#" />
            <Th label="Stop" />
            <Th label="Time" right info="report.tour-time" />
            <Th label="Reached" info="report.tour-reached" />
            <Th label="Next" right info="report.tour-next" />
            <Th label="Back" right info="report.tour-back" />
            <Th label="Skip tour" right info="report.tour-skip" />
            <Th label="Exit" right info="report.tour-exit" />
          </div>
          {a.stops.map((s, i) => (
            <div
              key={s.id}
              role="row"
              className="grid items-center border-t border-ap-line"
              style={{ gridTemplateColumns: TOUR_GRID }}
            >
              <span role="cell" className="px-3 py-2.5 text-xs tabular-nums text-ap-muted">
                {s.n}
              </span>
              <span role="rowheader" className="flex flex-col gap-0.5 px-3 py-2.5">
                <span className="text-sm font-bold">{s.name}</span>
                <span className="text-xs leading-snug text-ap-muted">{s.purpose}</span>
                <span className="text-[11px] font-bold text-ap-purple">Spotlight: {s.target}</span>
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
              {/* Next, Skip tour and Exit are whole shares that add up to 100% (wholeShares). */}
              <span role="cell" className="px-3 py-2.5 text-right text-[13px] tabular-nums">
                {i === a.stops.length - 1 && s.next !== null ? "Finish " : ""}
                {fmt("pct", s.next, 0)}
              </span>
              <span role="cell" className="px-3 py-2.5 text-right text-[13px] tabular-nums">
                {wholePct(s.back)}
              </span>
              <span
                role="cell"
                className={`px-3 py-2.5 text-right text-[13px] tabular-nums ${atLeast(s.skip, 8) ? "font-bold text-ap-bad" : ""}`}
              >
                {s.skip === 0 ? EMPTY : fmt("pct", s.skip, 0)}
              </span>
              <span
                role="cell"
                className={`px-3 py-2.5 text-right text-[13px] tabular-nums ${atLeast(s.exit, 4) ? "font-bold text-ap-bad" : ""}`}
              >
                {fmt("pct", s.exit, 0)}
              </span>
            </div>
          ))}
        </div>
      </div>
      <details className="text-xs leading-relaxed text-ap-muted">
        <summary className="cursor-pointer font-semibold text-ap-body">
          How these are counted
        </summary>
        <p className="m-0 mt-1.5">
          Our own records of each reader&rsquo;s first run of the tour in a browser, from {t.from}
          (PostHog sees about a quarter of readers); a replay from the chapter menu is left out. All
          traffic: the runs carry no funnel, source, device or tier. Tour started: the range&rsquo;s
          readers who got the tour
          {a.share
            ? `, on this tab ${a.share}, free and paid together (an opener’s audience isn’t recorded)`
            : ""}
          . A reader who later opened it in another browser got the tour there too: that run counts
          in the rest. Completed, Skipped tour and Left the tour / bounced are shares of the runs;
          Left the tour / bounced also holds the {fmt("count", a.unended)}{" "}
          {a.unended === 1 ? "run" : "runs"} whose end was never recorded (the page went without a
          word, or the browser kept it and never brought it back), which are on no stop. The table
          is of the {fmt("count", a.placed)} {a.placed === 1 ? "run" : "runs"} whose end was
          recorded with its stops. Reached: of those, the runs that came to the stop; a stop whose
          control was not on the page is left out of that reader&rsquo;s tour. Next: went on from
          it, Finish on the last. Skip tour: Skip Tour, Escape or the browser&rsquo;s Back there.
          Exit: left the page there. A run that went back before it ended is placed on the furthest
          stop it reached. Next + Skip tour + Exit add up to 100% of the runs on each stop; Back is
          counted separately, as the share who went back from it at least once. Time: the median
          time with the stop&rsquo;s bubble up, over every visit to it. From 1280px wide the first
          stop points at the sidebar, and its text says &ldquo;the menu on the left&rdquo;. In red:
          Skip tour from 8%, Exit from 4%.
        </p>
      </details>
    </Card>
  );
}

/** The design's colours for reading time in the depth chart, shortest palest; then "not recorded". */
const DEPTH_COLOURS = ["#e3dff0", "#b7aade", "#8c7bcf", "#5a42a6", "#f5f6f8"];

/** The design's bars for the groups, darkest first. */
const GROUP_COLOURS = ["#5a42a6", "#795fc8", "#9d8bd8", "#c0b4e6", "#ddd5f2"];

function TimeSection({ data }: { data: ReportPayload }) {
  const t = data.time;
  const max = Math.max(0.0001, ...t.buckets.map((b) => Math.max(b.share, b.bench)));
  const [stat, setStat] = useState<"median" | "avg">("median");
  return (
    <Card labelledBy="h-time">
      <h2 id="h-time" className="m-0 font-serif text-[22px] font-semibold">
        Time in report
      </h2>
      {data.blocked ? (
        <p className="m-0 text-sm leading-relaxed text-ap-muted">{data.blocked}</p>
      ) : (
        <>
          <p className="m-0 text-[13px] text-ap-muted">
            Reading time is recorded for {fmt("count", t.recorded)} of {fmt("count", t.readers)}{" "}
            reader
            {t.readers === 1 ? "" : "s"}: every figure below is theirs.
          </p>
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(170px, 100%), 1fr))" }}
          >
            {t.boxes.map((b) => (
              <ChangeBoxView key={b.key} box={b} />
            ))}
          </div>
          <SubHead
            title="Share of readers by total active reading time"
            info="report.time_buckets"
            description="Readers grouped by how long they actively read in total, against all reports"
          />
          <div className="flex flex-wrap gap-4 text-xs text-ap-body">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-3 w-3 rounded-[3px] bg-ap-purple" />
              This report
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-0 w-4 border-t-2 border-dashed border-ap-ink" />
              Benchmark · all reports
            </span>
          </div>
          <div className="relative flex h-[150px] items-end border-b border-ap-line">
            {t.buckets.map((b) => (
              <div
                key={b.label}
                className="relative flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 px-[5px]"
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
            <IndexHover
              xs={t.buckets.map((_, i) => ((i + 0.5) / t.buckets.length) * 100)}
              label="Share of readers by total active reading time"
              band={(i) => ({ left: (i / t.buckets.length) * 100, width: 100 / t.buckets.length })}
              tip={(i) => {
                const b = t.buckets[i]!;
                return {
                  title: `${b.label}${b.label.includes("min") ? "" : " min"} of reading`,
                  sub: "Readers’ total active reading time",
                  rows: [
                    {
                      label: "This report",
                      value: fmt("pct", b.share, 1),
                      color: "#795fc8",
                      mark: "square",
                    },
                    {
                      label: "Benchmark · all reports",
                      value: fmt("pct", b.bench, 1),
                      color: "#161021",
                      mark: "dashed",
                    },
                    {
                      label: "Difference",
                      value: delta("pct", b.share, b.bench, "either")?.text ?? EMPTY,
                      strong: true,
                    },
                  ],
                };
              }}
            />
          </div>
          <div className="flex">
            {t.buckets.map((b) => (
              <span
                key={b.label}
                className="min-w-0 flex-1 px-[5px] text-center text-[11px] text-ap-muted"
              >
                {b.label}
              </span>
            ))}
          </div>
          <DepthChart data={data} />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ap-line pt-4">
            <span className="text-[15px] font-bold text-ap-ink">Total reading time by group</span>
            <div
              role="group"
              aria-label="Statistic"
              className="inline-flex gap-1 rounded-full bg-ap-ground p-1"
            >
              {(
                [
                  ["median", "Median"],
                  ["avg", "Average"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={stat === k}
                  onClick={() => setStat(k)}
                  className={`min-h-9 cursor-pointer rounded-full border-0 px-4 text-[13px] font-semibold ${stat === k ? "bg-ap-ink text-white" : "bg-transparent text-ap-body"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div
            className="grid gap-6"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))" }}
          >
            <TimeSplit title="gender" info="report.time_gender" rows={t.byGender} stat={stat} />
            <TimeSplit title="age" info="report.time_age" rows={t.byAge} stat={stat} />
          </div>
        </>
      )}
    </Card>
  );
}

/** A figure's title and its line of description, as the design sets them under a section. */
function SubHead({
  title,
  info,
  description,
}: {
  title: string;
  info: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-1 border-t border-ap-line pt-4">
      <span className="text-[15px] font-bold text-ap-ink">
        {title} <Info k={info} label={title} />
      </span>
      <span className="text-[13px] text-ap-muted">{description}</span>
    </div>
  );
}

/**
 * The design's "How far into the report readers got": a column per band of the report's
 * length, stacked by the readers' total reading time, with its total on top.
 */
function DepthChart({ data }: { data: ReportPayload }) {
  const d = data.time.depth;
  const totals = d.bands.map((b) => b.counts.reduce((a, n) => a + n, 0));
  const top = Math.max(1, ...totals);
  // "Time not recorded" only where some reader has it.
  const shown = d.groups
    .map((g, i) => ({ g, i }))
    .filter(({ i }) => i < 4 || d.bands.some((b) => b.counts[i]));
  const from = d.from ? rangeLabel(d.from, d.from) : null;
  return (
    <figure className="m-0 flex flex-col gap-3 border-t border-ap-line pt-4">
      <figcaption className="flex flex-col gap-1">
        <span className="text-[15px] font-bold text-ap-ink">
          How far into the report readers got{" "}
          <Info k="report.depth" label="How far into the report readers got" />
        </span>
        <span className="text-[13px] text-ap-muted">
          Readers by the deepest chapter they reached, as a share of the report&rsquo;s {d.chapters}{" "}
          chapters, split by their total reading time
        </span>
      </figcaption>
      {d.readers === 0 ? (
        <NotTracked>
          {from
            ? `No reader in this range had their reading per chapter recorded (from ${from})`
            : "Reading per chapter is not recorded yet"}
        </NotTracked>
      ) : (
        <>
          <div className="relative h-[260px] border-b border-ap-line">
            <div
              role="img"
              aria-label={`Readers by how far they got: ${d.bands.map((b, i) => `${b.label} ${totals[i]}`).join(", ")}`}
              className="absolute inset-0 flex items-end"
            >
              {d.bands.map((b, i) => (
                <div
                  key={b.label}
                  className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1.5 px-2"
                >
                  <span className="text-center text-[15px] font-bold tabular-nums text-ap-ink">
                    {totals[i]}
                  </span>
                  <div className="flex flex-col gap-0.5">
                    {[...b.counts.keys()]
                      .reverse()
                      .filter((g) => b.counts[g]! > 0)
                      .map((g) => (
                        <span
                          key={g}
                          className="block rounded"
                          style={{
                            height: `${Math.max(3, Math.round((b.counts[g]! / top) * 200))}px`,
                            background: DEPTH_COLOURS[g],
                            ...(g === 4 ? { border: "1px dashed #9c95a3" } : {}),
                          }}
                        />
                      ))}
                  </div>
                </div>
              ))}
            </div>
            <IndexHover
              xs={d.bands.map((_, i) => ((i + 0.5) / d.bands.length) * 100)}
              label="How far into the report readers got"
              band={(i) => ({ left: (i / d.bands.length) * 100, width: 100 / d.bands.length })}
              tip={(i) => {
                const b = d.bands[i]!;
                const total = totals[i] ?? 0;
                return {
                  title: `${b.label}${b.label.endsWith("%") ? "" : "%"} of the report`,
                  sub: "Readers whose deepest chapter is in this band",
                  // Top first, as the column stacks them.
                  rows: [
                    ...[...shown].reverse().map(({ g, i: k }) => {
                      const c = b.counts[k] ?? 0;
                      return {
                        label: g,
                        value: `${fmt("count", c)} · ${total ? fmt("pct", c / total, 1) : EMPTY}`,
                        color: DEPTH_COLOURS[k],
                        ...(k === 4 ? { outline: "#9c95a3" } : {}),
                        mark: "square" as const,
                        muted: c === 0,
                      };
                    }),
                    { label: "Readers", value: fmt("count", total), strong: true },
                  ],
                };
              }}
            />
          </div>
          <div className="flex">
            {d.bands.map((b) => (
              <span key={b.label} className="min-w-0 flex-1 px-2 text-center text-xs text-ap-muted">
                {b.label}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-ap-body">
            {shown.map(({ g, i }) => (
              <span key={g} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="h-3 w-3 rounded-[3px]"
                  style={{
                    background: DEPTH_COLOURS[i],
                    ...(i === 4 ? { border: "1px dashed #9c95a3" } : {}),
                  }}
                />
                {g}
              </span>
            ))}
          </div>
          <span className="text-xs text-ap-muted">
            {fmt("count", d.readers)} {d.readers === 1 ? "reader" : "readers"} whose reading per
            chapter was recorded (those who finished from {from}).
          </span>
        </>
      )}
    </figure>
  );
}

function TimeSplit({
  title,
  info,
  rows,
  stat,
}: {
  title: string;
  info: string;
  rows: TimeGroup[];
  stat: "median" | "avg";
}) {
  const pick = (r: TimeGroup) =>
    stat === "median" ? { v: r.medianMs, b: r.benchMedianMs } : { v: r.ms, b: r.benchMs };
  const max = Math.max(1, ...rows.map((r) => Math.max(pick(r).v ?? 0, pick(r).b ?? 0)));
  const rowTip = useRowTip();
  const word = stat === "median" ? "Median" : "Average";
  return (
    <div className="flex flex-col gap-2.5">
      {rowTip.card}
      <span className="text-[13px] font-bold text-ap-body">
        {stat === "median" ? "Median" : "Avg."} total time by {title}{" "}
        <Info k={info} label={`Total time by ${title}`} />
      </span>
      {rows.map((r, i) => {
        const { v, b } = pick(r);
        // As the boxes above: no difference reads "±0:00.0", grey.
        const d = delta("mmss", v, b);
        return (
          <div
            key={r.label}
            className={`grid items-center gap-2.5 py-0.5 text-[13px] ${ROW_HOVER}`}
            style={{ gridTemplateColumns: "110px minmax(0,1fr) 48px 56px" }}
            {...rowTip.bind(() => ({
              title: r.label,
              sub: `${word} total reading time`,
              rows: [
                {
                  label: "This report",
                  value: fmt("mmss", v),
                  color: GROUP_COLOURS[i % GROUP_COLOURS.length],
                  mark: "square",
                  muted: v === null,
                },
                {
                  label: "All reports",
                  value: fmt("mmss", b),
                  color: "#161021",
                  mark: "line",
                  muted: b === null,
                },
                { label: "Difference", value: d?.text ?? EMPTY, strong: d !== null, muted: !d },
              ],
            }))}
          >
            <span className="font-semibold">
              {r.label}
              {b !== null && <span className="sr-only">, all reports {fmt("mmss", b)}</span>}
            </span>
            <span className="relative h-3.5 rounded-full bg-ap-ground">
              <span
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${((v ?? 0) / max) * 100}%`,
                  background: GROUP_COLOURS[i % GROUP_COLOURS.length],
                }}
              />
              {b !== null && (
                <span
                  aria-hidden="true"
                  className="absolute -bottom-1 -top-1 -ml-px w-[3px] rounded-sm bg-ap-ink shadow-[0_0_0_1px_#ffffff]"
                  style={{ left: `${(b / max) * 100}%` }}
                />
              )}
            </span>
            <span className="text-right font-bold tabular-nums">{fmt("mmss", v)}</span>
            <span
              className={`text-right text-xs font-bold tabular-nums ${TONE[d?.tone ?? "flat"]}`}
            >
              {d?.text ?? "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Days until first return's columns; its two figures' headings each carry an info icon. */
const DAYS_GTC = "110px minmax(0,1fr) 72px 96px";

/** The design's colours for the ways back; bookmarks and direct visits keep the purple. */
const SOURCE_COLOURS: Record<string, string> = {
  "Email campaign": "#fe6839",
  "Report or invite email": "#ffb59e",
  "Share link from a friend": "#9d8ad7",
  Other: "#d6cff0",
};

type CampaignKey = "sent" | "opened" | "clicked" | "returned" | "rate" | "purchased";
type CampaignFilter = "campaign" | "status";
type CampaignRow = ReportPayload["returns"]["campaigns"][number];

const CAMPAIGN_FILTERS: Record<CampaignFilter, string> = { campaign: "Campaign", status: "Status" };

/** "72h_no_unlock" reads "72h no unlock", as the design names it. */
const campaignName = (stage: string) => stage.replace(/_/g, " ");
const campaignValue = (c: CampaignRow, k: CampaignFilter) =>
  k === "campaign" ? campaignName(c.stage) : c.status;

/**
 * A count with its share of the emails Resend reported delivered under it, and that base
 * ("of 18 delivered"); "—" while it is not counted.
 */
function CountAndRate({
  n,
  rate,
  of,
}: {
  n: number | null;
  rate: number | null;
  of: number | null;
}) {
  return (
    <span
      role="cell"
      className={`flex flex-col items-end px-3 py-2.5 text-[13px] tabular-nums ${n === null ? "text-ap-muted" : ""}`}
    >
      {fmt("count", n)}
      {n !== null && rate !== null && (
        <span className="text-xs text-ap-muted">
          {fmt("pct", rate, 1)}
          {of !== null && ` of ${fmt("count", of)} delivered`}
        </span>
      )}
    </span>
  );
}

function ReturnsSection({ data }: { data: ReportPayload }) {
  const r = data.returns;
  const maxBand = Math.max(0.0001, ...r.days.map((d) => d.share));
  // The ways back against the largest one, as the design draws them.
  const topSource = Math.max(0.0001, ...(r.sources?.ok ? r.sources.value : []).map((s) => s.share));
  const [sort, setSort] = useState<Sort<CampaignKey>>(null);
  const head = { sort, onSort: (k: CampaignKey) => setSort((s) => nextSort(s, k)) };
  const sourceTip = useRowTip();
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
        <AllTraffic note="What brought readers back, Returned via email and the email campaigns are all traffic: those records carry no funnel, source, device or tier. The rest follows the filters." />
      )}
      {data.blocked && <p className="m-0 text-sm leading-relaxed text-ap-muted">{data.blocked}</p>}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(170px, 100%), 1fr))" }}
      >
        {r.boxes.map((b) => (
          <ChangeBoxView key={b.key} box={b} />
        ))}
      </div>
      <div className="flex max-w-[880px] flex-col gap-6">
        {!data.blocked && (
          <div className="flex flex-col gap-2.5">
            <span className="flex flex-col gap-1">
              <span className="text-[15px] font-bold text-ap-ink">
                Days until first return{" "}
                <Info k="report.return_days" label="Days until first return" />
              </span>
              <span className="text-[13px] text-ap-muted">
                Share of all readers, by days between first read and first return
              </span>
            </span>
            <div
              className="grid items-end gap-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-ap-muted"
              style={{ gridTemplateColumns: DAYS_GTC }}
            >
              <span>Time to return</span>
              <span />
              <span className="text-right">
                In this band <Info k="report.return_band" label="In this band" />
              </span>
              <span className="text-right">
                Returned by then <Info k="report.return_by_then" label="Returned by then" />
              </span>
            </div>
            {r.days.map((d) => (
              <div
                key={d.label}
                className={`grid items-center gap-2.5 py-0.5 text-[13px] ${ROW_HOVER}`}
                style={{ gridTemplateColumns: DAYS_GTC }}
              >
                <span>{d.label}</span>
                <Bar
                  pct={d.share / maxBand}
                  color={d.cumulative === null ? "#d6cff0" : "#795fc8"}
                  height={12}
                />
                <span className="text-right font-bold tabular-nums">{wholePct(d.share)}</span>
                <span className="text-right text-xs tabular-nums text-ap-muted">
                  {wholePct(d.cumulative)}
                </span>
              </div>
            ))}
            <span className="text-xs leading-normal text-ap-muted">
              <strong>In this band</strong> = readers whose first return fell in that window.{" "}
              <strong>Returned by then</strong> = all readers who had come back by the end of it.
            </span>
          </div>
        )}
        <div className="flex flex-col gap-2.5">
          <span className="flex flex-col gap-1">
            <span className="text-[15px] font-bold text-ap-ink">
              What brought readers back{" "}
              <Info k="report.return_sources" label="What brought readers back" />
            </span>
            {sourceTip.card}
            <span className="text-[13px] text-ap-muted">
              Share of the return visits PostHog saw, by how each one arrived
            </span>
          </span>
          {r.sources === null || !r.sources.ok ? (
            <p className="m-0 text-sm text-ap-muted">
              {r.sources && !r.sources.ok
                ? r.sources.error
                : "PostHog could not be read just now. Try again in a minute."}
            </p>
          ) : (
            r.sources.value.map((s) => (
              <div
                key={s.source}
                className={`grid items-center gap-2.5 py-0.5 text-[13px] ${ROW_HOVER}`}
                style={{ gridTemplateColumns: "180px minmax(0,1fr) 56px" }}
                {...sourceTip.bind(() => ({
                  title: s.source,
                  sub: "Return visits PostHog saw",
                  rows: [
                    {
                      label: "Share",
                      value: fmt("pct", s.share, 1),
                      color: SOURCE_COLOURS[s.source] ?? "#795fc8",
                      mark: "square",
                    },
                    { label: "Return visits", value: fmt("count", s.sessions), strong: true },
                  ],
                }))}
              >
                <span>
                  {s.source}
                  <span className="sr-only">, {fmt("count", s.sessions)} return visits</span>
                </span>
                <Bar
                  pct={s.share / topSource}
                  color={SOURCE_COLOURS[s.source] ?? "#795fc8"}
                  height={12}
                />
                <span className="text-right font-bold tabular-nums">{fmt("pct", s.share, 0)}</span>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        <span className="flex flex-col gap-1">
          <span className="text-[15px] font-bold text-ap-ink">
            Email campaigns that bring readers back
          </span>
          <span className="text-[13px] text-ap-muted">
            Every nurture email that was sent, with the returns and sales it brought
          </span>
        </span>
        {filters.choice}
        <div className="overflow-x-auto rounded-[14px] border border-ap-line">
          <div role="table" aria-label="Email campaigns" style={{ minWidth: 1000 }}>
            <div role="row" className="grid bg-ap-ground" style={{ gridTemplateColumns: gtc }}>
              <Th label="Campaign" filter={filters.funnel("campaign")} />
              <Th label="Status" filter={filters.funnel("status")} />
              <Th label="Sent" col="sent" right info="report.campaign_sent" {...head} />
              <Th label="Opened" col="opened" right info="report.campaign_opened" {...head} />
              <Th label="Clicked" col="clicked" right info="report.campaign_clicked" {...head} />
              <Th label="Returned" col="returned" right info="report.campaign_returned" {...head} />
              <Th label="Return rate" col="rate" right info="report.campaign_rate" {...head} />
              <Th
                label="Purchased"
                col="purchased"
                right
                info="report.campaign_purchased"
                {...head}
              />
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
                    {c.what}
                    {c.estimated && c.sent > 0 ? " · send times estimated" : ""}
                  </span>
                </span>
                <span role="cell" className="px-3 py-2.5">
                  <span
                    className={`rounded-full px-2.5 py-[3px] text-xs font-bold ${c.status === "Live" ? "bg-ap-good/10 text-ap-good-ink" : "bg-ap-track text-ap-muted"}`}
                  >
                    {c.status}
                  </span>
                </span>
                <span role="cell" className="px-3 py-2.5 text-right text-[13px] tabular-nums">
                  {fmt("count", c.sent)}
                </span>
                <CountAndRate n={c.opened} rate={c.openRate} of={c.deliveredOpens} />
                <CountAndRate n={c.clicked} rate={c.clickRate} of={c.delivered} />
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
        <p className="m-0 text-xs leading-relaxed text-ap-muted">
          {r.emailEvents} Opens are inflated by Apple Mail, which loads images for privacy, so
          clicks are the surer signal.
        </p>
        {r.campaignNote && <p className="m-0 text-xs text-ap-muted">{r.campaignNote}</p>}
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
  // The live report's own chapters (its nav), as the depth section counts them.
  const liveChapters = data.chapters.filter(
    (c) => c.part !== "Earlier report versions" && c.id !== "summary"
  ).length;
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
          ? c.medianMs
          : k === "votes"
            ? // The design's order: most votes first, a tie by the larger good share (under 1).
              c.up + c.down + (c.up + c.down ? c.up / (c.up + c.down) / 2 : 0)
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
  // Wider than drawn: each heading also carries its info icon.
  const gtc =
    "40px minmax(220px,2fr) minmax(130px,1fr) 132px minmax(200px,1.5fr) repeat(4, minmax(120px,0.7fr))";
  const from = reading.from ? rangeLabel(reading.from, reading.from) : null;
  return (
    <Card id="chapters" labelledBy="h-ch">
      <SectionHead
        id="h-ch"
        title="Chapters"
        right={
          // One row on a phone: the pills scroll sideways rather than wrap.
          <div className="min-w-0 max-w-full overflow-x-auto">
            <div className="w-max">
              <Pills<"order" | ChapterKey>
                label="Sort chapters by"
                options={[{ value: "order", label: "Report order" }, ...CHAPTER_SORTS]}
                value={sort?.key ?? "order"}
                onChange={(v) => setSort(v === "order" ? null : { key: v, dir: -1 })}
              />
            </div>
          </div>
        }
      />
      <AllTraffic note={data.narrowed} />
      <NotTracked>{from ? `Recorded from ${from}` : "Not recorded yet"}</NotTracked>
      <p className="m-0 text-[13px] leading-relaxed text-ap-muted">
        The live report&rsquo;s {liveChapters} chapters in its order, its Summary, then the{" "}
        {data.chapters.length - liveChapters - 1} chapters of earlier report versions that were
        voted on or read in this range (one read here is a share of the readers who read the report
        while it was in it). Feedback (live, all time): bar length = number of votes relative to the
        most-voted chapter, split into good (green) and bad (red). Reach, median time and the
        click-through rates are of the {fmt("count", reading.readers)}{" "}
        {reading.readers === 1 ? "reader" : "readers"} in this range whose reading per chapter was
        recorded (those who finished from {from ?? "the day it starts"}); &ldquo;—&rdquo; = nobody
        did it, or the chapter has no such button.
        {reading.recorded
          ? ""
          : " With no reading recorded in this range, Paywall shows the readers who clicked a paywall or lock button in the chapter, as a count."}
      </p>
      {filters.choice}
      <div className="overflow-x-auto rounded-[14px] border border-ap-line">
        <div role="table" aria-label="Chapters" style={{ minWidth: 1300 }}>
          <div role="row" className="grid bg-ap-ground" style={{ gridTemplateColumns: gtc }}>
            <Th label="#" />
            <Th label="Chapter" col="name" filter={filters.funnel("name")} {...head} />
            <Th label="Reach" col="reach" info="report.chapter_reach" {...head} />
            <Th label="Median time" col="time" right info="report.chapter_time" {...head} />
            <Th
              label="Feedback · good / bad"
              col="votes"
              info="report.chapter_feedback"
              {...head}
            />
            <Th
              label="Show more CTR"
              col="showMore"
              right
              info="report.chapter_show_more"
              {...head}
            />
            <Th label="Paywall CTR" col="paywall" right info="report.chapter_paywall" {...head} />
            <Th
              label="Learn more CTR"
              col="learnMore"
              right
              info="report.chapter_learn_more"
              {...head}
            />
            <Th
              label="Exercise CTR"
              col="exercise"
              right
              info="report.chapter_exercise"
              {...head}
            />
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
              {/* The name alone, as redrawn on 16 Oct; the CSV keeps its id. */}
              <span role="rowheader" className="min-w-0 px-3 py-2 text-[13px] font-bold">
                {c.name}
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
                {fmt("mmss", c.medianMs)}
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
                {/* As drawn, a chapter nobody voted on reads 0 and 0 / 0; "—" unread. */}
                {data.feedback.error ? (
                  <span className="min-w-[74px] text-right text-xs text-ap-muted">—</span>
                ) : (
                  <>
                    <span className="min-w-[26px] text-right text-xs font-bold tabular-nums">
                      {c.up + c.down}
                    </span>
                    <span className="min-w-[44px] text-[11px] tabular-nums">
                      <span className="font-bold text-ap-good-ink">{c.up}</span> /{" "}
                      <span className="font-bold text-ap-bad-ink">{c.down}</span>
                    </span>
                  </>
                )}
              </span>
              {/* Whole percentages, as drawn, and the highlights by the figure shown. */}
              <span
                role="cell"
                className={`px-3 py-2 text-right text-[13px] tabular-nums ${
                  c.showMore === null
                    ? ""
                    : atLeast(c.showMore, 18)
                      ? "font-bold text-ap-good-ink"
                      : !atLeast(c.showMore, 5)
                        ? "text-ap-bad-ink"
                        : ""
                }`}
              >
                {wholePct(c.showMore)}
              </span>
              <span role="cell" className="px-3 py-2 text-right text-[13px] tabular-nums">
                {reading.recorded ? (
                  <>
                    <span
                      className={
                        c.paywall !== null && c.paywall >= 0.05 ? "font-bold text-ap-good-ink" : ""
                      }
                    >
                      {fmt("pct", c.paywall, 1)}
                    </span>
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
                {wholePct(c.learnMore)}
              </span>
              <span role="cell" className="px-3 py-2 text-right text-[13px] tabular-nums">
                {wholePct(c.exercise)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

type LogKey = "at" | "chapter";
type LogFilter = "user" | "chapter" | "vote" | "issue";
type LogRow = ReportPayload["feedback"]["log"][number];

const LOG_FILTERS: Record<LogFilter, string> = {
  user: "User ID",
  chapter: "Chapter",
  vote: "Vote",
  issue: "Issue",
};
/** A vote's time, Berlin, as the log writes it ("14 Oct 2026, 09:36"). */
const when = (at: string) => {
  const d = new Date(at);
  const day = d.toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  });
  return `${shortDate(day)} ${day.slice(0, 4)}, ${time}`;
};

const logValue = (r: LogRow, k: LogFilter) =>
  k === "user"
    ? r.user === null
      ? ""
      : `#${r.user}`
    : k === "chapter"
      ? r.chapter
      : k === "vote"
        ? r.vote
        : (r.issue ?? "");

function FeedbackSection({ data }: { data: ReportPayload }) {
  const fb = data.feedback;
  const [sort, setSort] = useState<Sort<LogKey>>({ key: "at", dir: -1 });
  const [all, setAll] = useState(false);
  const [search, setSearch] = useState("");
  const {
    matches: kept,
    funnel,
    choice,
  } = useColumnFilters(fb.log, LOG_FILTERS, logValue, {
    fixed: { vote: ["Good", "Bad"] },
    onPick: () => setAll(false),
  });
  // The design's search: the user ID, the date, the chapter by name or id, the vote or the issue.
  const term = search.trim().toLowerCase();
  const found = term
    ? kept.filter((r) =>
        [when(r.at), `#${r.user ?? ""}`, r.chapter, r.id, r.vote, r.issue ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(term)
      )
    : kept;
  const matches = sortRows(found, sort, (r, k) => (k === "at" ? Date.parse(r.at) : r.chapter));
  const shown = all ? matches : matches.slice(0, 8);
  const head = {
    sort,
    onSort: (k: LogKey) => setSort((s) => nextSort(s, k, k === "chapter" ? 1 : -1)),
  };
  const goodShare = fb.good + fb.bad ? fb.good / (fb.good + fb.bad) : null;
  // The comment takes the room left over, as in the design (the issue keeps 140px: our
  // reasons, as "Not relevant to me", are longer than the design's).
  const gtc = "170px 124px minmax(220px,2fr) 90px 140px minmax(160px,1.6fr)";
  if (fb.error)
    return (
      <Card id="feedback" labelledBy="h-fb">
        <SectionHead
          id="h-fb"
          title="Feedback"
          description="Every chapter vote (report_section_feedback), live, all time."
        />
        <p className="m-0 text-sm leading-relaxed text-ap-muted">{fb.error}</p>
      </Card>
    );
  return (
    <Card id="feedback" labelledBy="h-fb">
      <SectionHead
        id="h-fb"
        title="Feedback"
        description={`Every chapter vote (report_section_feedback), live, all time${
          fb.from ? ` since ${rangeLabel(fb.from, fb.from)}` : ""
        }: the period filter doesn't apply here.`}
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
              good · {fb.good} good / {fb.bad} bad · {votes(fb.total)} (live, all time){" "}
              <Info
                k="report.feedback_good"
                label="Good votes"
                worked={{
                  num: fmt("count", fb.good),
                  den: fmt("count", fb.total),
                  value: fmt("pct", goodShare, 0),
                }}
              />
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
            Issues reported <Info k="report.feedback_issues" label="Issues reported" />
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
          <label className="flex min-w-[220px] flex-[0_1_320px]">
            <span className="sr-only">Search feedback</span>
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setAll(false);
              }}
              placeholder="Search user ID, chapter, issue, good/bad"
              className="min-h-10 w-full rounded-full border border-ap-ink/[0.18] bg-white px-4 text-sm text-ap-ink"
            />
          </label>
        </div>
        {choice}
        <div className="overflow-x-auto rounded-[14px] border border-ap-line">
          <div role="table" aria-label="Feedback log" style={{ minWidth: 880 }}>
            <div role="row" className="grid bg-ap-ground" style={{ gridTemplateColumns: gtc }}>
              <Th label="Date & time (Berlin)" col="at" {...head} />
              <Th label="User ID" filter={funnel("user")} />
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
                  {when(r.at)}
                </span>
                <span role="cell" className="px-3 py-2">
                  {r.user ? (
                    <a href={userHref(r.user)} className="font-mono text-xs text-ap-violet">
                      #{r.user}
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
                  className={`min-w-0 break-words px-3 py-2 ${r.comment ? "font-serif italic text-ap-body" : "text-ap-muted"}`}
                >
                  {r.comment ?? "—"}
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
      </div>
    </Card>
  );
}
