"use client";

import { useMemo, useState } from "react";

import type { AnswerSplit, Dimension } from "@features/admin/server/ap/answers";
import type { Table, Tile } from "@features/admin/server/ap/common";
import { delta, EMPTY, fmt } from "@features/admin/server/ap/format";
import type { QuestionRow } from "@features/admin/server/ap/survey";
import type {
  Benchmark,
  DemoCard,
  IntroCard,
  SurveyPayload,
} from "@features/admin/server/ap/survey-page";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";

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

/** Which order the funnel counts in: the survey's own, or the opening-order test's (C13). */
type Order = "survey" | "test";

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

/** A whole percentage, as the design writes the wizard's; one too small for 1% reads "<1%", not "0%". */
const wholePct = (v: number | null) =>
  v !== null && v > 0 && v < 0.005 ? "<1%" : fmt("pct", v, 0);

/** At least `pct` percent as the whole percentage shows it: the design's highlights. */
const atLeast = (v: number | null, pct: number) => v !== null && Math.round(v * 100) >= pct;

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
  const [order, setOrder] = useState<Order>("survey");

  const questions = data?.questions ?? null;
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
                  // Both orders' funnels while the opening-order test runs, each in its own order.
                  ...(questions?.test
                    ? [
                        { name: "Questions · survey order", table: questionTable(questions.rows) },
                        {
                          name: "Questions · test order (C13)",
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
              key={current.id}
              q={current}
              total={rows.filter((r) => r.n > 0).length}
              rows={rows}
              shownBoth={shownBoth.get(current.id) ?? 0}
              segmented={questions.segment !== "All traffic"}
              unfiltered={questions.blocked !== null}
            />
          )}

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
                      value: fmt("pct", r.share, 1),
                      color: DEMO_COLORS[ri % DEMO_COLORS.length],
                      mark: "square",
                    },
                    {
                      label: "Benchmark",
                      value: fmt("pct", r.bench, 1),
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
                <span className="sr-only">, benchmark {fmt("pct", r.bench, 1)}</span>
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
                <span className="text-right font-bold tabular-nums">{fmt("pct", r.share, 1)}</span>
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
  // Whole percentages, as drawn, but a tenth under 10%: 7 of 1,483 must not read "0%".
  const pct = (n: number) => {
    const v = share(n);
    return fmt("pct", v, v !== null && v < 0.1 ? 1 : 0);
  };
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
          // Whole percentages, as drawn; a share under 1% keeps a tenth so a handful never reads 0%.
          const digits =
            t.unit !== "pct"
              ? undefined
              : t.value !== null && t.value > 0 && t.value < 0.01
                ? 1
                : 0;
          const nd = parts[t.key];
          return (
            <KpiTileV2
              key={t.key}
              tile={t}
              digits={digits}
              titles={bucketTitles(data.range.from, data.range.to)}
              // No 12-week line: before the tracking day these are PostHog's, for a whole range.
              info={{
                k: TILE_INFO.find((x) => x.tile === t.key)?.k ?? `survey.${t.key}`,
                worked: workedOf(t) && {
                  ...(nd ? { num: fmt("count", nd[0]), den: fmt("count", nd[1]) } : {}),
                  value: fmt(t.unit, t.value, digits),
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
          Skip intro, Back, Exit and the intro and consent rows are recorded from{" "}
          {data.intro.recordedFrom}: pick a range from that day on
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
            <span className="text-xs font-bold tabular-nums">
              {fmt("pct", card.reachedShare, 0)}
            </span>
            <span className="text-[11px] text-ap-muted tabular-nums">
              {fmt("count", card.reached)}
            </span>
          </>
        )}
      </span>
      {/* Whole percentages; the design's red from 15% skipping and 8% leaving. */}
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
          {wholePct(v)}
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
}) {
  const { params } = useApFilters();
  const [dim, setDim] = useState<Dimension>("none");
  const answerTip = useRowTip();
  const countable = rows.filter(
    (r) => r.id !== q.id && ["scale", "single", "multiple", "country"].includes(r.type)
  );
  const [other, setOther] = useState<string>(countable[0]?.id ?? "");
  const canSplit = ["scale", "single", "multiple", "country"].includes(q.type);
  const query = useMemo(
    () => ({ ...params, q: q.id, dim, ...(dim === "question" && other ? { other } : {}) }),
    [params, q.id, dim, other]
  );
  const { data, loading, error } = useAdminFetch<AnswerSplit>(
    "/api/admin/ap/survey/answers",
    query,
    canSplit
  );
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
      <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ap-plum">
        Survey · Question detail · {q.id}
        {q.n ? ` · Step ${q.n} of ${total}` : " · not asked now"}
      </span>
      <h2 id="h-qd" className="m-0 font-serif text-2xl font-semibold leading-snug">
        {q.text}
      </h2>
      <p className="m-0 text-sm text-ap-muted">
        Select a question in the funnel above to see it here.
      </p>
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
          note={`${fmt("pct", q.dropRate, 2)} drop-out${unfiltered ? " · all traffic" : ""}`}
        />
        <Figure
          compact
          label="Skipped"
          info={{
            k: "survey.skipped",
            worked: {
              num: fmt("count", q.skipped),
              den: fmt("count", shownBoth),
              value: fmt("pct", skipShare, 1),
            },
          }}
          value={fmt("pct", skipShare, 1)}
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
          {error && (
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
                          value: fmt("pct", a.shares[i] ?? null, 1),
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
                              {fmt("pct", v, 0)}
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

const FUNNEL_GRID =
  "44px minmax(260px,3fr) 72px minmax(110px,1.2fr) 76px 76px 64px 84px 64px minmax(110px,1fr)";

/**
 * The design's "Question funnel" (16 Oct 2026): the funnel and the questions table in one.
 * Each question in its order with the people who reached it, the share of the first and of the
 * one before, the people who left there and its median time; a row opens Question detail. While
 * the opening-order test runs (`order` set), each order has its own funnel to pick.
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
  const [sort, setSort] =
    useState<Sort<"text" | "reached" | "ofStart" | "ofPrev" | "exits" | "drop" | "time">>(null);
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
        // The design's orange: more than 5% fewer than the step before.
        heavy: ofPrev !== null && ofPrev < 0.95,
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
  const shown = sortRows(
    steps.filter((x) => matches(x.r, term)),
    sort
  );
  const exitTitles = bucketTitles(data.range.from, data.range.to);
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
      {order && q?.test && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Pills
              label="Question order"
              value={order}
              onChange={onOrder}
              options={[
                { value: "survey", label: `Survey order · ${fmt("count", q.people)} runs` },
                { value: "test", label: `Test order (C13) · ${fmt("count", q.test.people)} runs` },
              ]}
            />
            <Info k="survey.order" />
          </div>
          <p className="m-0 text-xs leading-relaxed text-ap-muted">
            Since 6 Oct 2026 half of new runs are asked the opening questions in a different order
            (the C13 test). Each order has its own funnel, so the counts fall from one question to
            the next.
          </p>
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
                        value: fmt("pct", last.reached / top, 1),
                      }
                    : undefined
                }
              />
            </span>
            <span className="font-serif text-xl font-semibold tabular-nums">
              {last && top
                ? `${fmt("pct", last.reached / top, 1)} · ${fmt("count", last.reached)}`
                : "—"}
            </span>
          </span>
        </div>
      </div>
      <div className="overflow-x-auto rounded-[14px] border border-ap-line">
        <div role="table" aria-label="Survey question funnel" style={{ minWidth: 1180 }}>
          <div
            role="row"
            className="grid bg-ap-ground"
            style={{ gridTemplateColumns: FUNNEL_GRID }}
          >
            <Th label="#" />
            <Th label="Question" sortKey="text" text sort={sort} onSort={setSort} />
            <Th
              label="Reached"
              info="survey.reached"
              sortKey="reached"
              sort={sort}
              onSort={setSort}
              right
            />
            <Th label="Funnel" info="survey.funnelBar" />
            <Th
              label="% of start"
              info="survey.ofStart"
              sortKey="ofStart"
              sort={sort}
              onSort={setSort}
              right
            />
            <Th
              label="% of prev."
              info="survey.ofPrev"
              sortKey="ofPrev"
              sort={sort}
              onSort={setSort}
              right
            />
            <Th
              label="Exits"
              info="survey.exits"
              sortKey="exits"
              sort={sort}
              onSort={setSort}
              right
            />
            <Th
              label="Drop-out rate"
              info="survey.dropRate"
              sortKey="drop"
              sort={sort}
              onSort={setSort}
              right
            />
            <Th
              label="Median time"
              info="survey.medianTime"
              sortKey="time"
              sort={sort}
              onSort={setSort}
              right
            />
            <Th label={`Exits per ${q?.trendGrain ?? "week"}`} info="survey.exitsTrend" />
          </div>
          {shown.map((x) => {
            const on = x.r.id === selected;
            const dropRed = x.drop !== null && x.drop > 0.05;
            // The picked row's purple tint leaves the brighter red under 4.5:1; its ink passes.
            const red = on ? "text-ap-bad-ink" : "text-ap-bad";
            return (
              // The question's button stretches over its row, so a click anywhere on the row
              // picks it while the table keeps its rows and cells for a screen reader.
              <div
                key={x.r.id}
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
                  {fmt("pct", x.ofStart, 1)}
                </span>
                <span
                  role="cell"
                  className={`px-3 py-2 text-right text-[13px] tabular-nums ${x.heavy ? `font-bold ${red}` : "text-ap-body"}`}
                >
                  {fmt("pct", x.ofPrev, 1)}
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
                  {fmt("pct", x.drop, 2)}
                </span>
                <span role="cell" className="px-3 py-2 text-right text-[13px] tabular-nums">
                  {fmt("mmss", x.time)}
                </span>
                <span role="cell" className="px-3 py-2">
                  {/* Over the row's button, the line only: the cell's edges still open the row. */}
                  <span className="relative z-[1] block">
                    <Spark
                      values={x.r.exitsTrend}
                      height={26}
                      titles={exitTitles.length === x.r.exitsTrend.length ? exitTitles : undefined}
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
            );
          })}
        </div>
      </div>
      {term && shown.length === 0 && (
        <p className="m-0 text-sm text-ap-muted">No question matches “{search}”.</p>
      )}
      {q?.notes.map((note) => (
        <p key={note} className="m-0 text-xs leading-relaxed text-ap-muted">
          {note}
        </p>
      ))}
      <p className="m-0 text-xs leading-relaxed text-ap-muted">
        Rows in orange lose more than 5% of the previous step. A question added during the range was
        asked only from the day it was added: its drop-out and skipped rates are over the runs asked
        it. The end of the flow may differ between survey versions: worth checking before reading
        the last rows as drop-outs.
      </p>
    </Card>
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
