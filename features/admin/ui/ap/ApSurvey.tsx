"use client";

import { Fragment, useMemo, useState } from "react";

import type { AnswerSplit, Dimension } from "@features/admin/server/ap/answers";
import type { Table, Tile } from "@features/admin/server/ap/common";
import { delta, EMPTY, fmt, rateRank, tenths } from "@features/admin/server/ap/format";
import type { SheetFigures } from "@features/admin/server/ap/posthog";
import type { QuestionRow } from "@features/admin/server/ap/survey";
import type {
  Benchmark,
  DemoCard,
  IntroCard,
  SurveyPayload,
} from "@features/admin/server/ap/survey-page";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import { QUESTION_ORDER_TEST_END } from "@shared/experiments/questionOrderArm";
import { reportingDay } from "@shared/time/reporting-day";

import ApFilterBar from "./ApFilterBar";
import { exportTables } from "./csv";
import { Info, type Worked } from "./field-info";
import { bucketTitles, useRowTip } from "./hover";
import {
  AllTraffic,
  Bar,
  BlackButton,
  Busy,
  Card,
  Failed,
  ICON_BTN,
  KpiTileV2,
  LiveBadge,
  Loading,
  NotTracked,
  PageHeader,
  Pills,
  RangeLine,
  SectionHead,
  SortIcon,
  Spark,
  TileGrid,
  useHashScroll,
} from "./kit";
import { SHEET_NAMES, sheetBounce, sheetConversion, sheetSpots, type SheetSpot } from "./sheets";
import SheetsSection, { clicks, SheetBadge, sheetsCsvTable } from "./SurveySheets";
import TimeDropSection, { chapterBand, overFive } from "./SurveyTimeDrop";
import { useApFilters } from "./useApFilters";

/** The design's three colours, one per group (at most three). */
const SEGMENT_COLORS = ["#4000b6", "#fe6839", "#9d8ad7"];

/** Each tile's info card: the headline three and the intro's four. */
const TILE_INFO: Array<{ tile: string; k: string }> = [
  { tile: "starts", k: "survey.starts" },
  { tile: "subs", k: "survey.subs" },
  { tile: "completion", k: "survey.completion" },
  { tile: "intro-saw", k: "survey.introSaw" },
  { tile: "intro-agreed", k: "survey.introAgreed" },
  { tile: "intro-skipped", k: "survey.introSkipped" },
  { tile: "intro-left", k: "survey.introLeft" },
];

/** Each demographic card's info card. */
const DEMO_INFO: Array<{ title: string; k: string }> = [
  { title: "Country", k: "survey.demoCountry" },
  { title: "Gender", k: "survey.demoGender" },
  { title: "Age", k: "survey.demoAge" },
  { title: "Device", k: "survey.demoDevice" },
];

/** Which order the funnel counts in: the survey's old one, or the opening-order test's (C13). */
type Order = "survey" | "test";

/**
 * The Berlin day the opening-order test ended: every run begun since is asked the new order,
 * so a range reaching it opens on that order's funnel.
 */
const ORDER_TEST_END_DAY = reportingDay(new Date(QUESTION_ORDER_TEST_END));

/** A tile's figure as the card's "This period" line writes it; nothing while it is blank. */
const workedOf = (t: Tile): Worked | undefined =>
  t.blocked || t.value === null ? undefined : { value: fmt(t.unit, t.value) };

/** Completion as the design works it out: submissions ÷ survey starts. */
function completionWorked(tiles: Tile[], t: Tile): Worked | undefined {
  const value = workedOf(t);
  const subs = tiles.find((x) => x.key === "subs")?.value ?? null;
  const starts = tiles.find((x) => x.key === "starts")?.value ?? null;
  return value && subs !== null && starts !== null
    ? { num: fmt("count", subs), den: fmt("count", starts), value: value.value }
    : value;
}

/** One order's funnel for the CSV, its questions in that order. */
const questionTable = (list: QuestionRow[]): Table => ({
  columns: [
    { label: "Question", unit: "text" },
    { label: "Reached", unit: "count" },
    { label: "Exits", unit: "count" },
    { label: "Drop-out rate", unit: "pct" },
    { label: "Median time", unit: "mmss" },
    { label: "Went back", unit: "count" },
  ],
  rows: list.map((r) => ({
    label: `${r.id} · ${r.text}`,
    values: [r.reached, r.exits, r.dropRate, r.medianMs, r.wentBack],
  })),
});

/** The design's bars in a demographic card, darkest first. */
const DEMO_COLORS = ["#5a42a6", "#795fc8", "#9d8bd8", "#c0b4e6", "#ddd5f2"];

/** At least `pct` percent as the figure shows it: the design's highlights. */
const atLeast = (v: number | null, pct: number) => v !== null && tenths(v) >= pct * 10;

/** A question matches a search by its Q-id or its text. */
const matches = (r: QuestionRow, term: string) =>
  !term || r.id.includes(term) || r.text.toLowerCase().includes(term);

/**
 * A card's Continue as the table and the CSV show it: before the consent recorded itself,
 * PostHog's share of survey sessions that agreed.
 */
function introCont(data: SurveyPayload, card: IntroCard): number | null {
  const c = data.intro.clicks;
  if (card.cont !== null || !data.intro.recordedFrom || card.step !== "consent_view")
    return card.cont;
  return c && c.ok && c.value.opened ? c.value.agreed / c.value.opened : null;
}

export default function ApSurvey() {
  const { params } = useApFilters();
  const [benchmark, setBenchmark] = useState<Benchmark>("all");
  const query = useMemo(() => ({ ...params, benchmark }), [params, benchmark]);
  const { data, loading, error, refetch } = useAdminFetch<SurveyPayload>(
    "/api/admin/ap/survey",
    query
  );
  useHashScroll(Boolean(data));
  const [selected, setSelected] = useState<string | null>(null);
  const [picked, setOrder] = useState<Order | null>(null);

  const questions = data?.questions ?? null;
  // Until one is picked: the new order for a range that reaches the test's end, when every run
  // began to be asked it, and the old one for a range before it.
  const order: Order = picked ?? (data && data.range.to >= ORDER_TEST_END_DAY ? "test" : "survey");
  // The funnel in the order picked: the test's only while the range has runs in it.
  const rows = ((order === "test" ? questions?.test : null) ?? questions)?.rows ?? [];
  // Everyone a question was put to, in either order: what its skips (both orders') are a share of.
  const shownBoth = new Map<string, number>();
  for (const r of [...(questions?.rows ?? []), ...(questions?.test?.rows ?? [])])
    shownBoth.set(r.id, (shownBoth.get(r.id) ?? 0) + r.shownAll);
  // Opens on the countable question most people leave on (a free-text one has no answers to show).
  const countableRows = rows.filter((r) => ["scale", "single", "multiple"].includes(r.type));
  const current =
    rows.find((r) => r.id === selected) ??
    [...countableRows].sort((a, b) => b.exits - a.exits)[0] ??
    rows[0] ??
    null;

  return (
    <>
      <PageHeader
        crumbs={["Assessments", "Assessment A", "Survey"]}
        title="Survey"
        description="Where people slow down, engage or leave: wizard cards first, then every question."
        actions={
          <BlackButton
            disabled={!data}
            onClick={() =>
              data &&
              exportTables(
                `ap-survey-${data.range.from}-${data.range.to}`,
                [
                  ...data.demographics.cards.map((c) => ({
                    name: `Demographics · ${c.title}`,
                    table: {
                      columns: [
                        { label: c.title, unit: "text" as const },
                        { label: "This range", unit: "pct" as const },
                        { label: "Benchmark", unit: "pct" as const },
                      ],
                      rows: c.rows.map((r) => ({
                        label: r.label,
                        values: r.pending ? [null, null] : [r.share, r.bench],
                      })),
                    },
                  })),
                  // Both orders' funnels when the range has runs in the new order, each in its own.
                  ...(questions?.test
                    ? [
                        { name: "Questions · old order", table: questionTable(questions.rows) },
                        {
                          name: "Questions · new order (C13)",
                          table: questionTable(questions.test.rows),
                        },
                      ]
                    : [{ name: "Questions", table: questionTable(questions?.rows ?? []) }]),
                  {
                    name: "Intro wizard",
                    table: {
                      columns: [
                        { label: "Card", unit: "text" },
                        { label: "Median time", unit: "mmss" },
                        { label: "Reached", unit: "count" },
                        { label: "Share of the first card", unit: "pct" },
                        { label: "Continue", unit: "pct" },
                        { label: "Skip intro", unit: "pct" },
                        { label: "Back", unit: "pct" },
                        { label: "Exit", unit: "pct" },
                      ],
                      rows: data.intro.cards.map((c, i) => ({
                        label: `${i + 1} · ${c.name}`,
                        values: [
                          c.medianMs,
                          c.reached,
                          c.reachedShare,
                          introCont(data, c),
                          c.skip,
                          c.back,
                          c.exit,
                        ],
                      })),
                    },
                  },
                  // The Sheets section, in each order the range has runs in, as the funnel splits
                  // them; nothing when the range ends before the sheets or PostHog failed.
                  ...(!data.sheets.seen?.ok
                    ? []
                    : questions?.test
                      ? [
                          {
                            name: "Sheets · old order",
                            table: sheetsCsvTable(data, questions.rows, "survey"),
                          },
                          {
                            name: "Sheets · new order (C13)",
                            table: sheetsCsvTable(data, questions.test.rows, "test"),
                          },
                        ]
                      : [
                          {
                            name: "Sheets",
                            table: sheetsCsvTable(data, rows, questions ? "survey" : order),
                          },
                        ]),
                ],
                data.tiles
              )
            }
          >
            Export CSV
          </BlackButton>
        }
      />
      <ApFilterBar scope="assessment" />
      {loading && !data && <Loading label="the survey" />}
      {error && <Failed message={error} onRetry={refetch} />}
      {data && (
        <Busy busy={loading}>
          <RangeLine data={data} sources="Production database and PostHog" />
          <TileGrid min={200}>
            {data.tiles.map((t) => (
              <KpiTileV2
                key={t.key}
                tile={t}
                titles={bucketTitles(data.range.from, data.range.to)}
                info={{
                  k: TILE_INFO.find((x) => x.tile === t.key)?.k ?? `survey.${t.key}`,
                  worked: t.key === "completion" ? completionWorked(data.tiles, t) : workedOf(t),
                  trend: { route: "survey", tile: t.key, unit: t.unit },
                }}
              />
            ))}
          </TileGrid>

          {/* Marcus's Survey copy board (10 Nov 2026): above the funnel, in the order picked. */}
          <TimeDropSection
            data={data}
            rows={rows}
            order={questions?.test ? order : null}
            onOrder={setOrder}
            onPick={(id) => {
              setSelected(id);
              document
                .getElementById("question-detail")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          />

          <FunnelSection
            data={data}
            rows={rows}
            order={questions?.test ? order : null}
            onOrder={setOrder}
            selected={current?.id ?? null}
            onSelect={setSelected}
          />

          {current && questions && (
            <QuestionDetail
              q={current}
              total={rows.filter((r) => r.n > 0).length}
              rows={rows}
              shownBoth={shownBoth.get(current.id) ?? 0}
              segmented={questions.segment !== "All traffic"}
              unfiltered={questions.blocked !== null}
              onSelect={setSelected}
            />
          )}

          {/* Mark's Sheets section (Survey copy board, 17 Nov 2026): above the demographics. */}
          <SheetsSection
            data={data}
            rows={rows}
            // The funnel's order; without the questions, the order the range opens on.
            order={questions?.test ? order : questions ? "survey" : order}
          />

          <Card id="demographics" labelledBy="h-demo">
            <SectionHead
              id="h-demo"
              title="Core demographics"
              info="survey.demographics"
              align="end"
              right={
                <label className="flex min-w-[220px] flex-[0_1_280px] flex-col gap-1 text-xs font-bold text-ap-muted">
                  <span className="sr-only">Benchmark</span>
                  <select
                    value={benchmark}
                    onChange={(e) => setBenchmark(e.target.value as Benchmark)}
                    className="min-h-11 rounded-lg border border-ap-ink/[0.18] bg-white px-3 text-sm text-ap-ink"
                  >
                    <option value="all">All surveys · all time</option>
                    <option value="same">All surveys · same period</option>
                    <option value="prev">All surveys · previous period</option>
                  </select>
                </label>
              }
            />
            {data.demographics.blocked ? (
              <p className="m-0 text-sm leading-relaxed text-ap-muted">
                {data.demographics.blocked}
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-ap-body">
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true" className="h-2.5 w-3.5 rounded-[3px] bg-ap-purple" />
                    This survey · {fmt("count", data.demographics.n)} completed
                    <Info k="survey.demoN" worked={{ value: fmt("count", data.demographics.n) }} />
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true" className="h-3.5 w-[3px] rounded-sm bg-ap-ink" />
                    Benchmark · {fmt("count", data.demographics.benchN)} completed
                    <Info
                      k="survey.benchN"
                      worked={{ value: fmt("count", data.demographics.benchN) }}
                    />
                  </span>
                </div>
                <div
                  className="grid gap-4"
                  style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))" }}
                >
                  {data.demographics.cards.map((c) => (
                    <DemographicCard key={c.title} card={c} />
                  ))}
                </div>
              </>
            )}
          </Card>

          <IntroSection data={data} />
        </Busy>
      )}
    </>
  );
}

function DemographicCard({ card }: { card: DemoCard }) {
  const max = Math.max(0.0001, ...card.rows.map((r) => Math.max(r.share, r.bench ?? 0)));
  const rowTip = useRowTip();
  return (
    <div className="flex flex-col gap-3 rounded-[18px] bg-ap-ground p-[18px]">
      {rowTip.card}
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="m-0 font-serif text-lg font-semibold">
          {card.title}{" "}
          <Info k={DEMO_INFO.find((x) => x.title === card.title)?.k ?? "survey.demographics"} />
        </h3>
        <LiveBadge />
      </div>
      {card.rows.map((r, ri) => {
        const d = r.bench === null ? null : (r.share - r.bench) * 100;
        const big = d !== null && Math.abs(d) >= 2;
        return (
          <div
            key={r.label}
            className="-mx-2 grid items-center gap-2.5 rounded-lg px-2 py-0.5 text-[13px] hover:bg-white"
            style={{ gridTemplateColumns: "minmax(70px,120px) minmax(48px,1fr) 46px 58px" }}
            {...(r.pending
              ? {}
              : rowTip.bind(() => ({
                  title: `${card.title}: ${r.label}`,
                  rows: [
                    {
                      label: "This survey",
                      value: fmt("pct", r.share),
                      color: DEMO_COLORS[ri % DEMO_COLORS.length],
                      mark: "square",
                    },
                    {
                      label: "Benchmark",
                      value: fmt("pct", r.bench),
                      color: "#161021",
                      mark: "line",
                      muted: r.bench === null,
                    },
                    {
                      label: "Difference",
                      value: delta("pct", r.share, r.bench, "either")?.text ?? EMPTY,
                      strong: r.bench !== null,
                      muted: r.bench === null,
                    },
                  ],
                })))}
          >
            <span className="truncate font-semibold" title={r.label}>
              {r.label}
              {r.bench !== null && !r.pending && (
                <span className="sr-only">, benchmark {fmt("pct", r.bench)}</span>
              )}
            </span>
            {r.pending ? (
              <span className="col-span-3 text-xs text-ap-muted">{r.pending}</span>
            ) : (
              <>
                <span className="relative h-3.5 rounded-full bg-white">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${(r.share / max) * 100}%`,
                      background: DEMO_COLORS[ri % DEMO_COLORS.length],
                    }}
                  />
                  {r.bench !== null && (
                    <span
                      aria-hidden="true"
                      className="absolute -bottom-[3px] -top-[3px] -ml-px w-[3px] rounded-sm bg-ap-ink"
                      style={{ left: `${(r.bench / max) * 100}%` }}
                    />
                  )}
                </span>
                <span className="text-right font-bold tabular-nums">{fmt("pct", r.share)}</span>
                <span
                  className={`rounded-md px-1.5 py-0.5 text-right text-xs font-bold tabular-nums ${
                    big && d !== null
                      ? d > 0
                        ? "bg-ap-good/10 text-ap-good-ink"
                        : "bg-ap-bad/10 text-ap-bad-ink"
                      : "text-ap-muted"
                  }`}
                >
                  {d === null ? "—" : `${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(d).toFixed(1)}`}
                </span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

type IntroRowData = IntroCard & { n: number; time: number | null; eng: string };

const INTRO_GRID =
  "44px minmax(200px,2fr) 72px minmax(150px,1.1fr) 84px 84px 72px 72px minmax(160px,1.2fr)";

function IntroSection({ data }: { data: SurveyPayload }) {
  const [sort, setSort] =
    useState<Sort<"time" | "reachedShare" | "cont" | "skip" | "back" | "exit">>(null);
  const c = data.intro.clicks;
  const ok = c && c.ok ? c.value : null;
  const share = (n: number) => (ok && ok.opened ? n / ok.opened : null);
  const pct = (n: number) => fmt("pct", share(n));
  const eng = (step: string) =>
    !ok
      ? "—"
      : step === "intro_view"
        ? `${pct(ok.silhouette)} tap the silhouette`
        : step === "intro_slide_3"
          ? `${pct(ok.trust)} open Trust Zone`
          : step === "consent_view"
            ? `Return to site ${pct(ok.returned)} · read terms ${pct(ok.terms)}`
            : "—";
  const cards: IntroRowData[] = data.intro.cards.map((card, i) => ({
    ...card,
    n: i + 1,
    time: card.medianMs,
    cont: introCont(data, card),
    eng: eng(card.step),
  }));
  // Before the tracking day the shares are PostHog's sessions: their counts are in the payload.
  const ph = data.intro.recordedFrom && ok && ok.opened ? ok : null;
  const parts: Record<string, [number, number]> = ph
    ? {
        "intro-agreed": [ph.agreed, ph.opened],
        "intro-skipped": [ph.skipped, ph.opened],
        "intro-left": [ph.opened - ph.reachedQ1, ph.opened],
      }
    : {};
  return (
    <Card id="wizard" labelledBy="h-wiz">
      <SectionHead id="h-wiz" title="Intro wizard" info="survey.wizard" />
      <AllTraffic note={data.narrowed} />
      <TileGrid min={200}>
        {data.intro.tiles.map((t) => {
          const nd = parts[t.key];
          return (
            <KpiTileV2
              key={t.key}
              tile={t}
              titles={bucketTitles(data.range.from, data.range.to)}
              // No 12-week line: before the tracking day these are PostHog's, for a whole range.
              info={{
                k: TILE_INFO.find((x) => x.tile === t.key)?.k ?? `survey.${t.key}`,
                worked: workedOf(t) && {
                  ...(nd ? { num: fmt("count", nd[0]), den: fmt("count", nd[1]) } : {}),
                  value: fmt(t.unit, t.value),
                },
              }}
            />
          );
        })}
      </TileGrid>
      {c && !c.ok && (
        <p className="m-0 text-sm text-ap-bad-ink">The engagement column is blank: {c.error}</p>
      )}
      {data.intro.recordedFrom && (
        <NotTracked>
          Skip intro, Back, Exit, the intro and consent rows and the tiles&apos; trend lines are
          recorded from {data.intro.recordedFrom}: pick a range from that day on
        </NotTracked>
      )}
      <div className="overflow-x-auto rounded-[14px] border border-ap-line">
        <div role="table" aria-label="Intro wizard cards" style={{ minWidth: 1040 }}>
          <div role="row" className="grid bg-ap-ground" style={{ gridTemplateColumns: INTRO_GRID }}>
            <Th label="#" />
            <Th label="Card" />
            <Th
              label="Median time"
              info="survey.wizTime"
              sortKey="time"
              sort={sort}
              onSort={setSort}
              right
            />
            {/* By the share the bar and the figure show, not the count beside them. */}
            <Th
              label="Reached"
              info="survey.wizReached"
              sortKey="reachedShare"
              sort={sort}
              onSort={setSort}
            />
            <Th
              label="Continue"
              info="survey.wizContinue"
              sortKey="cont"
              sort={sort}
              onSort={setSort}
              right
            />
            <Th
              label="Skip intro"
              info="survey.wizSkip"
              sortKey="skip"
              sort={sort}
              onSort={setSort}
              right
            />
            <Th
              label="Back"
              info="survey.wizBack"
              sortKey="back"
              sort={sort}
              onSort={setSort}
              right
            />
            <Th
              label="Exit"
              info="survey.wizExit"
              sortKey="exit"
              sort={sort}
              onSort={setSort}
              right
            />
            <Th label="Engagement on card" info="survey.wizEngagement" />
          </div>
          {sortRows(cards, sort).map((card) => (
            <IntroRow key={card.n} card={card} from={data.intro.recordedFrom} />
          ))}
        </div>
      </div>
    </Card>
  );
}

function IntroRow({ card, from }: { card: IntroRowData; from: string | null }) {
  return (
    <div
      role="row"
      className="grid items-center border-t border-ap-line"
      style={{ gridTemplateColumns: INTRO_GRID }}
    >
      <span role="cell" className="px-3 py-2.5 text-xs tabular-nums text-ap-muted">
        {card.n}
      </span>
      <span role="rowheader" className="flex flex-col gap-0.5 px-3 py-2.5">
        <span className="text-sm font-bold">{card.name}</span>
        <span className="text-xs leading-snug text-ap-muted">{card.purpose}</span>
      </span>
      <span role="cell" className="px-3 py-2.5 text-right text-[13px] tabular-nums">
        {fmt("mmss", card.time)}
      </span>
      <span role="cell" className="flex items-center gap-2 px-3 py-2.5">
        {card.reached === null ? (
          <span className="text-xs text-ap-muted">
            {from ? `recorded from ${from}` : "not recorded"}
          </span>
        ) : (
          <>
            <span className="flex-1">
              <Bar pct={card.reachedShare} height={8} />
            </span>
            <span className="text-xs font-bold tabular-nums">{fmt("pct", card.reachedShare)}</span>
            <span className="text-[11px] text-ap-muted tabular-nums">
              {fmt("count", card.reached)}
            </span>
          </>
        )}
      </span>
      {/* The design's red from 15% skipping and 8% leaving. */}
      {(
        [
          [card.cont, false],
          [card.skip, atLeast(card.skip, 15)],
          [card.back, false],
          [card.exit, atLeast(card.exit, 8)],
        ] as const
      ).map(([v, red], i) => (
        <span
          key={i}
          role="cell"
          className={`px-3 py-2.5 text-right text-[13px] tabular-nums ${red ? "font-bold text-ap-bad" : ""}`}
        >
          {fmt("pct", v)}
        </span>
      ))}
      <span role="cell" className="px-3 py-2.5 text-xs leading-snug text-ap-body">
        {card.eng}
      </span>
    </div>
  );
}

function QuestionDetail({
  q,
  total,
  rows,
  shownBoth,
  segmented,
  unfiltered,
  onSelect,
}: {
  q: QuestionRow;
  total: number;
  rows: QuestionRow[];
  /** Reached it in either order, all traffic: what Skipped is a share of. */
  shownBoth: number;
  /** A source or device segment is on: Skipped, time and back stay all traffic's. */
  segmented: boolean;
  /** A filter is on that the funnel can't follow: it shows all traffic. */
  unfiltered: boolean;
  /** Picks another question (Mark's dropdown, 16–17 Nov 2026). */
  onSelect: (id: string) => void;
}) {
  const { params } = useApFilters();
  const [dim, setDim] = useState<Dimension>("none");
  const answerTip = useRowTip();
  const countable = rows.filter(
    (r) => r.id !== q.id && ["scale", "single", "multiple", "country"].includes(r.type)
  );
  const [other, setOther] = useState<string>(countable[0]?.id ?? "");
  // A new question starts unsplit, as when this block was rebuilt per question. The block itself
  // stays, so the Question dropdown in it keeps focus while it is used (review, 22 Nov 2026).
  const [shown, setShown] = useState(q.id);
  if (shown !== q.id) {
    setShown(q.id);
    setDim("none");
    setOther(countable[0]?.id ?? "");
    answerTip.close();
  }
  const canSplit = ["scale", "single", "multiple", "country"].includes(q.type);
  const query = useMemo(
    () => ({ ...params, q: q.id, dim, ...(dim === "question" && other ? { other } : {}) }),
    [params, q.id, dim, other]
  );
  const {
    data: fetched,
    loading,
    error,
  } = useAdminFetch<AnswerSplit>("/api/admin/ap/survey/answers", query, canSplit);
  // The last answers stay in the hook until the next arrive: another question's are not these
  // (review, 22 Nov 2026: the block no longer rebuilds per question, which used to clear them).
  const data = fetched && fetched.qid === q.id ? fetched : null;
  // Skips are all traffic's in both orders (the steps carry neither): a share of all it was put to.
  const skipShare = shownBoth ? q.skipped / shownBoth : null;
  // Under a filter the funnel can't follow, every figure here is all traffic's too.
  const allTraffic = segmented || unfiltered ? " · all traffic" : "";
  return (
    <section
      id="question-detail"
      aria-labelledby="h-qd"
      className="flex scroll-mt-20 lg:scroll-mt-6 flex-col gap-4 rounded-[20px] bg-ap-lilac p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ap-plum">
            Survey · Question detail · {q.id}
            {q.n ? ` · Step ${q.n} of ${total}` : " · not asked now"}
          </span>
          <h2 id="h-qd" className="m-0 font-serif text-2xl font-semibold leading-snug">
            {q.text}
          </h2>
          <p className="m-0 text-sm text-ap-muted">
            Pick a question from the list, or click one in the funnel or the charts above.
          </p>
        </div>
        <label className="flex min-w-[min(260px,100%)] flex-[0_1_380px] flex-col gap-1 text-xs font-bold text-ap-muted">
          Question
          <select
            value={q.id}
            onChange={(e) => onSelect(e.target.value)}
            className="min-h-11 w-full rounded-lg border border-ap-ink/[0.18] bg-white px-3 text-sm font-medium text-ap-ink"
          >
            {questionGroups(rows).map((g, i) => (
              <optgroup key={`${i}-${g.label}`} label={g.label}>
                {g.rows.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.n ? `#${r.n} · ` : ""}
                    {r.id} · {r.text}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
      <div
        className="grid max-w-[760px] gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(140px, 100%), 1fr))" }}
      >
        {/* The design's three boxes; the question's reach is its row in the funnel above. */}
        <Figure
          compact
          label="Exits"
          info={{ k: "survey.exits", worked: { value: fmt("count", q.exits) } }}
          value={fmt("count", q.exits)}
          note={`${fmt("pct", q.dropRate)} drop-out${unfiltered ? " · all traffic" : ""}`}
        />
        <Figure
          compact
          label="Skipped"
          info={{
            k: "survey.skipped",
            worked: {
              num: fmt("count", q.skipped),
              den: fmt("count", shownBoth),
              value: fmt("pct", skipShare),
            },
          }}
          value={fmt("pct", skipShare)}
          note={`${fmt("count", q.skipped)} passed without an answer${allTraffic}`}
        />
        <Figure
          compact
          label="Median time"
          info={{ k: "survey.medianTime", worked: { value: fmt("mmss", q.medianMs) } }}
          value={fmt("mmss", q.medianMs)}
          note={`${fmt("count", q.wentBack)} went back from it${allTraffic}`}
        />
      </div>
      {!canSplit ? (
        <p className="m-0 text-sm text-ap-muted">
          This is an open question: its answers are free text and are not counted here.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3 border-t border-ap-ink/[0.08] pt-3.5">
            <label className="flex min-w-[200px] flex-[0_1_240px] flex-col gap-1 text-xs font-bold text-ap-muted">
              Compare answers by
              <select
                value={dim}
                onChange={(e) => setDim(e.target.value as Dimension)}
                className="min-h-11 rounded-lg border border-ap-ink/[0.18] bg-white px-3 text-sm text-ap-ink"
              >
                <option value="none">No split</option>
                <option value="source">Traffic source</option>
                <option value="gender">Gender</option>
                <option value="device">Device</option>
                <option value="relationship">Relationship status</option>
                <option value="question">Answer to another question</option>
              </select>
            </label>
            {dim === "question" && (
              <label className="flex min-w-[240px] flex-[1_1_320px] flex-col gap-1 text-xs font-bold text-ap-muted">
                Other question
                <select
                  value={other}
                  onChange={(e) => setOther(e.target.value)}
                  className="min-h-11 rounded-lg border border-ap-ink/[0.18] bg-white px-3 text-sm text-ap-ink"
                >
                  {countable.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.id} · {c.text.length > 80 ? `${c.text.slice(0, 79)}…` : c.text}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {loading && !data && <p className="m-0 text-sm text-ap-muted">Loading the answers…</p>}
          {/* The hook keeps an error until a load succeeds: not while the next question's loads. */}
          {error && !loading && (
            <p className="m-0 text-sm text-ap-bad-ink">Could not load the answers: {error}</p>
          )}
          {data?.blocked && <p className="m-0 text-sm text-ap-muted">{data.blocked}</p>}
          {data && !data.blocked && (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="text-[15px] font-bold text-ap-ink">
                  Answers <Info k="survey.answers" />
                </span>
                {data.segments.map((s, i) => (
                  <span
                    key={s.name}
                    className="inline-flex items-center gap-1.5 text-xs text-ap-body"
                  >
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 rounded-[3px]"
                      style={{ background: SEGMENT_COLORS[i] }}
                    />
                    {s.name} <span className="text-ap-muted">· n={fmt("count", s.n)}</span>
                    <Info k="survey.answersN" worked={{ value: fmt("count", s.n) }} />
                  </span>
                ))}
              </div>
              {data.segments.length === 0 ? (
                <p className="m-0 text-sm text-ap-muted">
                  No group has five or more answers in this range.
                </p>
              ) : (
                <div className="flex max-w-[820px] flex-col gap-3.5">
                  {answerTip.card}
                  {data.answers.map((a) => (
                    <div
                      key={a.label}
                      className="-mx-2 grid items-center gap-3 rounded-lg px-2 py-1 text-[13px] hover:bg-white"
                      style={{ gridTemplateColumns: "140px minmax(0,1fr)" }}
                      {...answerTip.bind(() => ({
                        title: a.label,
                        rows: data.segments.map((sg, i) => ({
                          label: `${sg.name} · n=${fmt("count", sg.n)}`,
                          value: fmt("pct", a.shares[i] ?? null),
                          color: SEGMENT_COLORS[i],
                          mark: "square" as const,
                          muted: a.shares[i] === null,
                        })),
                      }))}
                    >
                      <span className="font-semibold leading-snug">{a.label}</span>
                      <div className="flex flex-col gap-[3px]">
                        {a.shares.map((v, i) => (
                          <div
                            key={i}
                            className="grid items-center gap-2.5"
                            style={{ gridTemplateColumns: "minmax(0,1fr) 52px" }}
                          >
                            <span className="block h-2.5 overflow-hidden rounded-full bg-white">
                              <span
                                className="block h-full rounded-full"
                                style={{
                                  width: `${((v ?? 0) * 100).toFixed(1)}%`,
                                  background: SEGMENT_COLORS[i],
                                }}
                              />
                            </span>
                            <span className="text-right font-bold tabular-nums">
                              {fmt("pct", v)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="m-0 text-xs text-ap-muted">
                {fmt("count", data.respondents)} of {fmt("count", data.finished)} finished surveys
                in the range answered it
                {data.multiple
                  ? "; more than one answer could be picked, so the shares add up to more than 100%"
                  : ""}
                .{data.gap ? ` Largest gap, across the groups shown: ${data.gap}.` : ""}
                {data.hidden.length > 0 &&
                  ` Not shown (under five people, or past the three largest): ${data.hidden
                    .map((h) => `${h.name} (${fmt("count", h.n)})`)
                    .join(", ")}.`}
              </p>
            </>
          )}
        </>
      )}
      <a
        href={`/admin/ap/explorer?table=survey_submission_answer`}
        className="text-[13px] font-bold"
      >
        See raw answers in survey_submission_answer →
      </a>
    </section>
  );
}

/** Median time 112px wide for its bar beside the figure (Marcus, 10 Nov 2026). */
/**
 * The Question dropdown's groups: the questions asked now in the order shown, a group per run of
 * one chapter (as under the charts), then those no longer asked.
 */
export function questionGroups(rows: QuestionRow[]): Array<{ label: string; rows: QuestionRow[] }> {
  const groups: Array<{ label: string; rows: QuestionRow[] }> = [];
  for (const r of rows.filter((x) => x.n > 0)) {
    const label = chapterBand(r.id);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.rows.push(r);
    else groups.push({ label, rows: [r] });
  }
  const gone = rows.filter((x) => x.n === 0);
  if (gone.length) groups.push({ label: "Not asked now", rows: gone });
  return groups;
}

const FUNNEL_GRID =
  "44px minmax(260px,3fr) 72px minmax(110px,1.2fr) 76px 76px 64px 84px 112px minmax(110px,1fr)";

/**
 * The design's "Question funnel" (16 Oct 2026): the funnel and the questions table in one.
 * Each question in its order with the people who reached it, the share of the first and of the
 * one before, the people who left there and its median time; a row opens Question detail. When
 * the range has runs in both opening orders (`order` set), each has its own funnel to pick.
 */
function FunnelSection({
  data,
  rows,
  order,
  onOrder,
  selected,
  onSelect,
}: {
  data: SurveyPayload;
  rows: QuestionRow[];
  /** The order shown, or null when the range has no runs in the test's order. */
  order: Order | null;
  onOrder: (o: Order) => void;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  // Mark, 17 Nov 2026: sort by two columns, e.g. the highest drop-out, then the longest median
  // time among questions with the same drop-out. None: survey order.
  const [first, setFirst] = useState<FunnelKey | null>(null);
  const [second, setSecond] = useState<FunnelKey | null>(null);
  const q = data.questions;
  const asked = rows.filter((r) => r.n > 0);
  const top = asked[0]?.reached ?? 0;
  const last = asked[asked.length - 1];
  const term = search.trim().toLowerCase();
  // Each question against the one before it in its order, however the table is sorted: the
  // runs that got at least this far, of those that got as far as the one before, never above
  // 100%. Questions no longer asked come last, without a place in the funnel.
  const steps = [
    ...asked.map((r, i) => {
      const prev = asked[i - 1]?.reached ?? null;
      const ofPrev = prev ? r.reached / prev : null;
      return {
        r,
        text: r.text,
        reached: r.reached,
        ofStart: top ? r.reached / top : null,
        ofPrev,
        exits: r.exits,
        drop: r.dropRate,
        time: r.medianMs,
        // The design's orange: more than 5% fewer than the step before, by the figure shown.
        heavy: ofPrev !== null && tenths(ofPrev) < 950,
      };
    }),
    ...rows
      .filter((r) => r.n === 0)
      .map((r) => ({
        r,
        text: r.text,
        reached: r.reached,
        ofStart: null,
        ofPrev: null,
        exits: r.exits,
        drop: r.dropRate,
        time: r.medianMs,
        heavy: false,
      })),
  ];
  const shown = sortFunnel(
    steps.filter((x) => matches(x.r, term)),
    first,
    second
  );
  // The sheets between the questions, in survey order only and not while searching (as drawn):
  // each after the question it follows.
  const asked0 = rows.filter((r) => r.n > 0);
  const sheetsAfter = new Map<string, SheetSpot[]>();
  // Only for a range that reaches the sheets (they went live on 17 Nov 2026).
  // Not under a source or device filter either: the sheets are read from PostHog, which those
  // filters (on the database's runs) don't narrow, and an all-traffic row between filtered
  // questions would read as theirs.
  const allTraffic = !q || q.segment === "All traffic";
  if (!first && !term && data.sheets.seen && allTraffic)
    for (const spot of sheetSpots(rows)) {
      const id = asked0[spot.after]!.id;
      sheetsAfter.set(id, [...(sheetsAfter.get(id) ?? []), spot]);
    }
  // The sheets' figures for this funnel's own runs: begun in the range, in the order shown.
  const sheetsSeen = data.sheets.seen?.ok ? data.sheets.seen.value[order ?? "survey"] : null;
  const sheetsKnown = sheetsSeen !== null;
  // A column clicked becomes the first sort and the first becomes the second; the first clicked
  // again goes back to survey order.
  const pick = (k: FunnelKey) => {
    if (first === k) {
      setFirst(null);
      setSecond(null);
    } else {
      setSecond(first);
      setFirst(k);
    }
  };
  const sortLabel = first
    ? `${FUNNEL_SORT[first].label}${second ? `, then ${FUNNEL_SORT[second].label}` : ""}`
    : "";
  const exitTitles = bucketTitles(data.range.from, data.range.to);
  // The median time's bar, as drawn: one scale for the table, the slowest question a full bar.
  const times = steps.flatMap((x) => (x.time === null ? [] : [x.time])).sort((a, b) => a - b);
  const slowest = times[times.length - 1] ?? null;
  const middle = times.length ? times[Math.floor(times.length / 2)]! : null;
  return (
    <Card id="funnel" labelledBy="h-funnel">
      <SectionHead
        id="h-funnel"
        title="Question funnel"
        info="survey.funnel"
        description={
          q?.blocked
            ? `${q.blocked} Showing all traffic.`
            : `Survey runs begun in the range reaching each question, ${data.range.label}. Click a row to open it in Question detail.`
        }
      />
      {data.questionsError && <p className="m-0 text-sm text-ap-bad-ink">{data.questionsError}</p>}
      {/* No note under it (Marcus, 10 Nov 2026): its info card explains the two orders. */}
      {order && q?.test && (
        <div className="flex flex-wrap items-center gap-2">
          <Pills
            label="Question order"
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
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-y border-ap-line py-3">
        <label className="relative flex max-w-[420px] flex-[1_1_320px]">
          <span className="sr-only">Search questions</span>
          <svg
            viewBox="0 0 16 16"
            width="15"
            height="15"
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ap-muted"
          >
            <circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M10.5 10.5L14 14"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by question text or Q-id"
            className="min-h-11 w-full rounded-full border border-ap-ink/[0.18] bg-white pl-[38px] pr-4 text-sm text-ap-ink"
          />
        </label>
        <div role="group" aria-label="Sort questions" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-ap-label">
            Sort by
            <select
              value={first ?? "order"}
              onChange={(e) => {
                const k = e.target.value === "order" ? null : (e.target.value as FunnelKey);
                setFirst(k);
                if (!k || k === second) setSecond(null);
              }}
              className="min-h-11 rounded-lg border border-ap-ink/[0.18] bg-white px-3 text-sm font-medium normal-case tracking-normal text-ap-ink"
            >
              <option value="order">Survey order</option>
              {FUNNEL_KEYS.map((k) => (
                <option key={k} value={k}>
                  {FUNNEL_SORT[k].option}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-ap-label">
            Then by
            <select
              value={second ?? "none"}
              disabled={!first}
              onChange={(e) =>
                setSecond(e.target.value === "none" ? null : (e.target.value as FunnelKey))
              }
              className="min-h-11 rounded-lg border border-ap-ink/[0.18] bg-white px-3 text-sm font-medium normal-case tracking-normal text-ap-ink disabled:opacity-60"
            >
              <option value="none">No second sort</option>
              {FUNNEL_KEYS.filter((k) => k !== first).map((k) => (
                <option key={k} value={k}>
                  {FUNNEL_SORT[k].option}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-baseline gap-6">
          <span className="flex flex-col gap-0.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ap-label">
              First step{" "}
              <Info
                k="survey.firstStep"
                worked={asked.length ? { value: fmt("count", top) } : undefined}
              />
            </span>
            <span className="font-serif text-xl font-semibold tabular-nums">
              {fmt("count", asked.length ? top : null)}
            </span>
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ap-label">
              Reached last step{" "}
              <Info
                k="survey.lastStep"
                worked={
                  last && top
                    ? {
                        num: fmt("count", last.reached),
                        den: fmt("count", top),
                        value: fmt("pct", last.reached / top),
                      }
                    : undefined
                }
              />
            </span>
            <span className="font-serif text-xl font-semibold tabular-nums">
              {last && top
                ? `${fmt("pct", last.reached / top)} · ${fmt("count", last.reached)}`
                : "—"}
            </span>
          </span>
        </div>
      </div>
      <div className="overflow-x-auto rounded-[14px] border border-ap-line">
        <div role="table" aria-label="Survey question funnel" style={{ minWidth: 1228 }}>
          <div
            role="row"
            className="grid bg-ap-ground"
            style={{ gridTemplateColumns: FUNNEL_GRID }}
          >
            <Th label="#" />
            <FunnelTh label="Question" k="text" first={first} second={second} onPick={pick} />
            <FunnelTh
              label="Reached"
              info="survey.reached"
              k="reached"
              first={first}
              second={second}
              onPick={pick}
              right
            />
            <Th label="Funnel" info="survey.funnelBar" />
            <FunnelTh
              label="% of start"
              info="survey.ofStart"
              k="ofStart"
              first={first}
              second={second}
              onPick={pick}
              right
            />
            <FunnelTh
              label="% of prev."
              info="survey.ofPrev"
              k="ofPrev"
              first={first}
              second={second}
              onPick={pick}
              right
            />
            <FunnelTh
              label="Exits"
              info="survey.exits"
              k="exits"
              first={first}
              second={second}
              onPick={pick}
              right
            />
            <FunnelTh
              label="Drop-out rate"
              info="survey.dropRate"
              k="drop"
              first={first}
              second={second}
              onPick={pick}
              right
            />
            <FunnelTh
              label="Median time"
              info="survey.medianTime"
              k="time"
              first={first}
              second={second}
              onPick={pick}
              right
            />
            <Th label={`Exits per ${q?.trendGrain ?? "week"}`} info="survey.exitsTrend" />
          </div>
          {shown.map((x) => {
            const on = x.r.id === selected;
            const dropRed = overFive(x.drop);
            // The picked row's purple tint leaves the brighter red under 4.5:1; its ink passes.
            const red = on ? "text-ap-bad-ink" : "text-ap-bad";
            // The question's button stretches over its row, so a click anywhere on the row
            // picks it while the table keeps its rows and cells for a screen reader.
            return (
              <Fragment key={x.r.id}>
                <div
                  role="row"
                  className={`relative grid items-center border-t border-ap-line ${
                    on
                      ? "bg-ap-purple/10 shadow-[inset_3px_0_0_#795fc8]"
                      : x.heavy
                        ? "bg-ap-orange/[0.06] hover:bg-ap-ground"
                        : "bg-white hover:bg-ap-ground"
                  }`}
                  style={{ gridTemplateColumns: FUNNEL_GRID }}
                >
                  <span role="cell" className="px-3 py-2 text-xs tabular-nums text-ap-muted">
                    {x.r.n || ""}
                  </span>
                  <span role="rowheader" className="px-3 py-2">
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        onSelect(x.r.id);
                        document
                          .getElementById("question-detail")
                          ?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                      className="flex w-full cursor-pointer flex-col gap-px border-0 bg-transparent p-0 text-left font-[inherit] after:absolute after:inset-0"
                    >
                      <span
                        className={`text-[13px] font-bold leading-snug ${on ? "text-ap-violet" : "text-ap-ink"}`}
                      >
                        {x.r.n === 0 && (
                          <span className="mr-1.5 rounded-full bg-ap-ground px-1.5 py-0.5 text-[10px] font-bold text-ap-muted">
                            not asked now
                          </span>
                        )}
                        {x.r.n > 0 && x.r.newInRange && (
                          <span className="mr-1.5 rounded-full bg-ap-ground px-1.5 py-0.5 text-[10px] font-bold text-ap-muted">
                            added during the range
                          </span>
                        )}
                        {x.text}
                      </span>
                      <span className="text-[11px] text-ap-muted">{x.r.id}</span>
                    </button>
                  </span>
                  <span role="cell" className="px-3 py-2 text-right text-[13px] tabular-nums">
                    {fmt("count", x.reached)}
                  </span>
                  <span role="cell" className="px-3 py-2">
                    <Bar pct={x.ofStart} height={12} />
                  </span>
                  <span
                    role="cell"
                    className="px-3 py-2 text-right text-[13px] font-semibold tabular-nums"
                  >
                    {fmt("pct", x.ofStart)}
                  </span>
                  <span
                    role="cell"
                    className={`px-3 py-2 text-right text-[13px] tabular-nums ${x.heavy ? `font-bold ${red}` : "text-ap-body"}`}
                  >
                    {fmt("pct", x.ofPrev)}
                  </span>
                  <span
                    role="cell"
                    className="px-3 py-2 text-right text-[13px] font-bold tabular-nums"
                  >
                    {fmt("count", x.exits)}
                  </span>
                  <span
                    role="cell"
                    className={`px-3 py-2 text-right text-[13px] tabular-nums ${dropRed ? `font-bold ${red}` : "text-ap-body"}`}
                  >
                    {fmt("pct", x.drop)}
                  </span>
                  <span
                    role="cell"
                    title={
                      x.time === null || !slowest
                        ? "No time recorded"
                        : `${fmt("mmss", x.time)} median · ${fmt("pct", x.time / slowest)} of the slowest question (${fmt("mmss", slowest)}) · median of all questions ${fmt("mmss", middle)}`
                    }
                    className="flex items-center justify-end gap-2 px-3 py-2"
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-1.5 w-12 flex-none justify-end overflow-hidden rounded-full bg-ap-track"
                    >
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${x.time !== null && slowest ? ((x.time / slowest) * 100).toFixed(0) : 0}%`,
                          background: x.time !== null && x.time === slowest ? "#5a42a6" : "#a99bd9",
                        }}
                      />
                    </span>
                    <span className="min-w-8 text-right text-[13px] tabular-nums">
                      {fmt("mmss", x.time)}
                    </span>
                  </span>
                  <span role="cell" className="px-3 py-2">
                    {/* Over the row's button, the line only: the cell's edges still open the row. */}
                    <span className="relative z-[1] block">
                      <Spark
                        values={x.r.exitsTrend}
                        height={26}
                        titles={
                          exitTitles.length === x.r.exitsTrend.length ? exitTitles : undefined
                        }
                        name="Exits"
                        focusable={false}
                        // A tap reads the line; opening the question (and scrolling to it) is
                        // the row's own tap, or a click here.
                        tapReads
                        onPick={() => {
                          onSelect(x.r.id);
                          document
                            .getElementById("question-detail")
                            ?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                      />
                    </span>
                  </span>
                </div>
                {(sheetsAfter.get(x.r.id) ?? []).map((spot) => (
                  <SheetFunnelRow
                    key={spot.id}
                    spot={spot}
                    figures={sheetsSeen?.bySheet[spot.id]}
                    known={sheetsKnown}
                    from={data.sheets.from}
                  />
                ))}
              </Fragment>
            );
          })}
        </div>
      </div>
      {/* Said aloud when the sort changes: the table's rows move without a page change. */}
      <p role="status" className="sr-only">
        {first ? `Sorted by ${sortLabel}.` : "In survey order."}
      </p>
      {first && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ap-body">
          <span>
            Sorted by <strong>{sortLabel}</strong>. Sheets show only in survey order.
          </span>
          <button
            type="button"
            onClick={() => {
              setFirst(null);
              setSecond(null);
            }}
            className="min-h-11 cursor-pointer border-0 bg-transparent p-0 font-[inherit] text-[13px] font-semibold text-ap-violet underline-offset-2 hover:underline"
          >
            Back to survey order
          </button>
        </div>
      )}
      {term && shown.length === 0 && (
        <p className="m-0 text-sm text-ap-muted">No question matches “{search}”.</p>
      )}
      {q?.notes.map((note) => (
        <p key={note} className="m-0 text-xs leading-relaxed text-ap-muted">
          {note}
        </p>
      ))}
      {data.sheets.seen && !allTraffic && (
        <p className="m-0 text-xs leading-relaxed text-ap-muted">
          The sheets show between the questions with all traffic only: they are read from PostHog,
          while the filters narrow the survey runs in our database. They are in the Sheets section
          below.
        </p>
      )}
      <p className="m-0 text-xs leading-relaxed text-ap-muted">
        Rows in orange lose more than 5% of the previous step. A question added during the range was
        asked only from the day it was added: its drop-out and skipped rates are over the runs asked
        it. The end of the flow may differ between survey versions: worth checking before reading
        the last rows as drop-outs.
      </p>
    </Card>
  );
}

/** The question funnel's sort keys, each in its one direction (Mark's Survey copy, 17 Nov 2026). */
export type FunnelKey = "drop" | "time" | "exits" | "reached" | "ofStart" | "ofPrev" | "text";

export const FUNNEL_KEYS: FunnelKey[] = [
  "drop",
  "time",
  "exits",
  "reached",
  "ofStart",
  "ofPrev",
  "text",
];

export const FUNNEL_SORT: Record<FunnelKey, { label: string; option: string }> = {
  drop: { label: "Drop-out rate", option: "Drop-out rate, highest first" },
  time: { label: "Median time", option: "Median time, longest first" },
  exits: { label: "Exits", option: "Exits, most first" },
  reached: { label: "Reached", option: "Reached, most first" },
  ofStart: { label: "% of start", option: "% of start, highest first" },
  ofPrev: { label: "% of prev. (lowest first)", option: "% of prev., lowest first" },
  text: { label: "Question (A–Z)", option: "Question, A–Z" },
};

type FunnelStep = { r: QuestionRow } & Record<FunnelKey, number | string | null>;

/**
 * A figure as the table shows it: a rate to a tenth of a percent, a time to the second. Two rows
 * that read the same are tied, so the second key decides between them (Mark: "highest bounce,
 * then highest median", 17 Nov; review, 22 Nov 2026: hidden decimals used to decide instead).
 */
const asShown = (k: FunnelKey, v: number) =>
  k === "time"
    ? Math.round(v / 1000)
    : k === "drop" || k === "ofStart" || k === "ofPrev"
      ? rateRank(v)
      : v;

/** Highest first, % of prev. lowest first, the question A to Z; a blank last whichever way. */
function byKey(k: FunnelKey) {
  return (a: FunnelStep, b: FunnelStep) => {
    const x = a[k];
    const y = b[k];
    if (x === null) return y === null ? 0 : 1;
    if (y === null) return -1;
    if (k === "text") return String(x).localeCompare(String(y));
    const [p, q] = [asShown(k, Number(x)), asShown(k, Number(y))];
    return k === "ofPrev" ? p - q : q - p;
  };
}

/**
 * The funnel's rows by the first key, then the second, then in survey order (a question no
 * longer asked last). No first key: survey order, as given.
 */
export function sortFunnel<T extends FunnelStep>(
  steps: T[],
  first: FunnelKey | null,
  second: FunnelKey | null
): T[] {
  if (!first) return steps;
  const one = byKey(first);
  const two = second && second !== first ? byKey(second) : null;
  const place = (x: T) => x.r.n || Number.POSITIVE_INFINITY;
  return [...steps].sort((a, b) => one(a, b) || (two ? two(a, b) : 0) || place(a) - place(b));
}

/**
 * A sortable heading of the question funnel: its button makes it the first sort (the old first
 * becomes the second), or, as the first already, goes back to survey order. A small 1 or 2 says
 * which sort it is.
 */
function FunnelTh({
  label,
  info,
  k,
  first,
  second,
  onPick,
  right = false,
}: {
  label: string;
  info?: string;
  k: FunnelKey;
  first: FunnelKey | null;
  second: FunnelKey | null;
  onPick: (k: FunnelKey) => void;
  right?: boolean;
}) {
  const rank = first === k ? 1 : second === k ? 2 : 0;
  const up = k === "ofPrev" || k === "text";
  return (
    <span
      role="columnheader"
      aria-sort={rank === 1 ? (up ? "ascending" : "descending") : "none"}
      className={`px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-ap-muted ${right ? "text-right" : ""}`}
    >
      {label}
      {info && (
        <>
          {" "}
          <Info k={info} label={label} />
        </>
      )}
      <button
        type="button"
        aria-pressed={rank > 0}
        aria-label={`Sort by ${label}${rank ? `, now sort ${rank}` : ""}`}
        title="Sort by this column. Click a second column to sort by it, then by this one."
        onClick={() => onPick(k)}
        className={`ml-0.5 ${ICON_BTN} ${rank === 1 ? "text-ap-violet" : rank === 2 ? "text-ap-purple" : "text-ap-muted"}`}
      >
        <SortIcon dir={rank ? (up ? 1 : -1) : null} />
        {rank > 0 && (
          <span aria-hidden="true" className="ml-px text-[10px] font-bold tabular-nums">
            {rank}
          </span>
        )}
      </button>
    </span>
  );
}

/**
 * A sheet's row between the questions (Mark, 17 Nov 2026): the sheet's own figures in the
 * question columns. Reached: it opened; Exits: left with it open; Drop-out rate: its bounce
 * rate; Median time: how long it stayed open; the last column its conversion, for the sheet
 * with something to tap. A funnel share or a share of the step before means nothing for it.
 */
function SheetFunnelRow({
  spot,
  figures,
  known,
  from,
}: {
  spot: SheetSpot;
  /** Missing: nobody met it in the range. */
  figures: SheetFigures | undefined;
  /** PostHog could be read: blanks otherwise, rather than noughts. */
  known: boolean;
  /** The day the sheets began, when the range starts earlier than they did. */
  from: string | null;
}) {
  const meta = SHEET_NAMES[spot.id];
  const bounce = sheetBounce(figures);
  const count = (n: number | undefined) => (known ? fmt("count", n ?? 0) : "—");
  return (
    <div
      role="row"
      data-sheet={spot.id}
      className="grid items-center border-t border-ap-line bg-ap-lilac/60"
      style={{ gridTemplateColumns: FUNNEL_GRID }}
    >
      <span role="cell" className="px-3 py-2">
        <SheetBadge n={spot.n} />
      </span>
      <span role="rowheader" className="flex flex-col gap-px px-3 py-2">
        <span className="text-[13px] font-bold leading-snug text-ap-ink">
          Sheet {spot.n} · {meta.name}
        </span>
        <a href="#sheets" className="text-[11px] font-semibold text-ap-violet">
          Sheet {spot.where.charAt(0).toLowerCase() + spot.where.slice(1)}
        </a>
        {from && <span className="text-[11px] text-ap-muted">Counted from {from}</span>}
      </span>
      <span
        role="cell"
        title="Saw the sheet (it opened)"
        className="px-3 py-2 text-right text-[13px] tabular-nums"
      >
        {count(figures?.saw)}
      </span>
      <span role="cell" className="px-3 py-2 text-xs text-ap-muted">
        saw the sheet
      </span>
      <span role="cell" className="px-3 py-2 text-right text-[13px] text-ap-muted">
        —
      </span>
      <span role="cell" className="px-3 py-2 text-right text-[13px] text-ap-muted">
        —
      </span>
      <span
        role="cell"
        title="Left while the sheet was open"
        className="px-3 py-2 text-right text-[13px] font-bold tabular-nums"
      >
        {count(figures?.leftOpen)}
      </span>
      <span
        role="cell"
        title="Bounce rate: left while the sheet was open, of those it opened for"
        // The ink: the brighter red reads 4.49:1 on the sheet row's lilac (review, 22 Nov 2026).
        className={`px-3 py-2 text-right text-[13px] tabular-nums ${overFive(bounce) ? "font-bold text-ap-bad-ink" : "text-ap-body"}`}
      >
        {fmt("pct", bounce)}
      </span>
      <span
        role="cell"
        title="Median time the sheet stayed open"
        className="px-3 py-2 text-right text-[13px] tabular-nums"
      >
        {fmt("mmss", figures?.medianMs ?? null)}
      </span>
      <span
        role="cell"
        title={meta.tap ? "Conversion: share and number of taps on the sheet's box" : undefined}
        className="flex flex-col gap-px px-3 py-2 text-[13px]"
      >
        {meta.tap && known && (
          <>
            <span className="font-semibold tabular-nums">
              Conversion {fmt("pct", sheetConversion(figures))}
            </span>
            <span className="text-[11px] text-ap-muted">{clicks(figures?.ticked ?? 0)}</span>
          </>
        )}
      </span>
    </div>
  );
}

type Sort<K extends string> = { key: K; dir: 1 | -1 } | null;

/** Rows sorted by one of their values, blanks last whichever way. */
function sortRows<K extends string, T extends Record<K, number | string | null>>(
  rows: T[],
  sort: Sort<K>
): T[] {
  if (!sort) return rows;
  return [...rows].sort((a, b) => {
    const x = a[sort.key];
    const y = b[sort.key];
    if (x === null) return y === null ? 0 : 1;
    if (y === null) return -1;
    return (typeof x === "string" ? x.localeCompare(String(y)) : Number(x) - Number(y)) * sort.dir;
  });
}

/**
 * A column heading. With a sort key it sorts the table, first click biggest first (A to Z for
 * a text column), as DataTable does. Inline, so a narrow column wraps its buttons under the label.
 * `info`: the column's info card.
 */
function Th<K extends string>({
  label,
  info,
  sortKey,
  text = false,
  sort = null,
  onSort,
  right = false,
}: {
  label: string;
  info?: string;
  sortKey?: K;
  text?: boolean;
  sort?: Sort<K>;
  onSort?: (s: Sort<K>) => void;
  right?: boolean;
}) {
  const dir = sortKey !== undefined && sort?.key === sortKey ? sort.dir : null;
  return (
    <span
      role="columnheader"
      aria-sort={dir === 1 ? "ascending" : dir === -1 ? "descending" : sortKey ? "none" : undefined}
      className={`px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-ap-muted ${right ? "text-right" : ""}`}
    >
      {label}
      {info && (
        <>
          {" "}
          <Info k={info} label={label} />
        </>
      )}
      {sortKey !== undefined && (
        <button
          type="button"
          aria-label={`Sort by ${label}`}
          onClick={() =>
            onSort?.({
              key: sortKey,
              dir: dir === null ? (text ? 1 : -1) : dir === 1 ? -1 : 1,
            })
          }
          className={`ml-0.5 ${ICON_BTN} ${dir ? "text-ap-violet" : "text-ap-muted"}`}
        >
          <SortIcon dir={dir} />
        </button>
      )}
    </span>
  );
}

/** A figure in a small box, as drawn: lilac in the intro, white and compact in the detail. */
function Figure({
  label,
  info,
  value,
  note,
  compact = false,
}: {
  label: string;
  /** Its info card, with this question's figures. */
  info: { k: string; worked?: Worked };
  value: string;
  note?: string;
  compact?: boolean;
}) {
  const small = compact ? "text-[11px]" : "text-xs";
  return (
    <div
      className={`flex min-w-0 flex-col gap-0.5 rounded-[14px] ${compact ? "bg-white p-2.5" : "bg-ap-lilac p-3.5"}`}
    >
      <span className={`${small} text-ap-muted`}>
        {label} <Info k={info.k} label={label} worked={info.worked} />
      </span>
      <span
        className={`font-serif font-semibold tabular-nums text-ap-ink ${compact ? "text-xl" : "text-[22px]"}`}
      >
        {value}
      </span>
      {note && <span className={`${small} leading-snug text-ap-muted`}>{note}</span>}
    </div>
  );
}
