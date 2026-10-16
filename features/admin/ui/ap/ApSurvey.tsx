"use client";

import { useMemo, useState, type ReactNode } from "react";

import type { AnswerSplit, Dimension } from "@features/admin/server/ap/answers";
import { rangeLabel, SURVEY_TRACKING_FROM } from "@features/admin/server/ap/filters";
import { fmt } from "@features/admin/server/ap/format";
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
import {
  AllTraffic,
  Bar,
  BlackButton,
  Busy,
  Card,
  Failed,
  KpiTileV2,
  LiveBadge,
  Loading,
  NotTracked,
  PageHeader,
  SectionHead,
  SortIcon,
  Spark,
  TileGrid,
  useHashScroll,
  RangeLine,
} from "./kit";
import { useApFilters } from "./useApFilters";

const SEGMENT_COLORS = ["#4000b6", "#fe6839", "#9d8ad7", "#2e7d5b"];

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

  const rows = data?.questions?.rows ?? [];
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
                  {
                    name: "Questions",
                    table: {
                      columns: [
                        { label: "Question", unit: "text" },
                        { label: "Reached", unit: "count" },
                        { label: "Exits", unit: "count" },
                        { label: "Drop-out rate", unit: "pct" },
                        { label: "Median time", unit: "mmss" },
                        { label: "Went back", unit: "count" },
                      ],
                      rows: rows.map((r) => ({
                        label: `${r.id} · ${r.text}`,
                        values: [r.reached, r.exits, r.dropRate, r.medianMs, r.wentBack],
                      })),
                    },
                  },
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
              <KpiTileV2 key={t.key} tile={t} />
            ))}
          </TileGrid>

          <FunnelSection
            data={data}
            rows={rows}
            selected={current?.id ?? null}
            onSelect={setSelected}
          />

          {current && data.questions && (
            <QuestionDetail
              key={current.id}
              q={current}
              total={data.questions.rows.filter((r) => r.n > 0).length}
              rows={rows}
            />
          )}

          <Card id="demographics" labelledBy="h-demo">
            <SectionHead
              id="h-demo"
              title="Core demographics"
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
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-ap-body">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="h-2.5 w-3.5 rounded-[3px] bg-ap-purple" />
                This survey · {fmt("count", data.demographics.n)} completed
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="h-3.5 w-[3px] rounded-sm bg-ap-ink" />
                Benchmark · {fmt("count", data.demographics.benchN)} completed
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
          </Card>

          <IntroSection data={data} />
        </Busy>
      )}
    </>
  );
}

function DemographicCard({ card }: { card: DemoCard }) {
  const max = Math.max(0.0001, ...card.rows.map((r) => Math.max(r.share, r.bench ?? 0)));
  return (
    <div className="flex flex-col gap-3 rounded-[18px] bg-ap-ground p-[18px]">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="m-0 font-serif text-lg font-semibold">{card.title}</h3>
        <LiveBadge />
      </div>
      {card.rows.map((r, ri) => {
        const d = r.bench === null ? null : (r.share - r.bench) * 100;
        const big = d !== null && Math.abs(d) >= 2;
        return (
          <div
            key={r.label}
            className="grid items-center gap-2.5 text-[13px]"
            style={{ gridTemplateColumns: "minmax(70px,120px) minmax(48px,1fr) 46px 58px" }}
          >
            <span className="truncate font-semibold" title={r.label}>
              {r.label}
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

const SURVEY_TRACKING_DAY = rangeLabel(SURVEY_TRACKING_FROM, SURVEY_TRACKING_FROM);

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
          ? `${pct(ok.trust)} open the Trust Zone`
          : step === "consent_view"
            ? `Return to site ${pct(ok.returned)} · read the terms ${pct(ok.terms)}`
            : "—";
  const cards: IntroRowData[] = data.intro.cards.map((card, i) => ({
    ...card,
    n: i + 1,
    time: card.medianMs,
    cont: introCont(data, card),
    eng: eng(card.step),
  }));
  return (
    <Card id="wizard" labelledBy="h-wiz">
      <SectionHead id="h-wiz" title="Intro wizard" />
      <AllTraffic note={data.narrowed} />
      <TileGrid min={200}>
        {data.intro.tiles.map((t) => (
          // Whole percentages, as drawn; a share under 1% keeps a tenth so a handful never reads 0%.
          <KpiTileV2
            key={t.key}
            tile={t}
            digits={
              t.unit !== "pct"
                ? undefined
                : t.value !== null && t.value > 0 && t.value < 0.01
                  ? 1
                  : 0
            }
          />
        ))}
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
        <div role="table" aria-label="Intro wizard cards" style={{ minWidth: 1080 }}>
          <div role="row" className="grid bg-ap-ground" style={{ gridTemplateColumns: INTRO_GRID }}>
            <Th label="#" />
            <Th label="Card" />
            <Th label="Time" sortKey="time" sort={sort} onSort={setSort} right />
            {/* By the share the bar and the figure show, not the count beside them. */}
            <Th label="Reached" sortKey="reachedShare" sort={sort} onSort={setSort} />
            <Th label="Continue" sortKey="cont" sort={sort} onSort={setSort} right />
            <Th label="Skip intro" sortKey="skip" sort={sort} onSort={setSort} right />
            <Th label="Back" sortKey="back" sort={sort} onSort={setSort} right />
            <Th label="Exit" sortKey="exit" sort={sort} onSort={setSort} right />
            <Th label="Engagement on card" />
          </div>
          {sortRows(cards, sort).map((card) => (
            <IntroRow key={card.n} card={card} />
          ))}
        </div>
      </div>
      <details className="text-xs leading-relaxed text-ap-muted">
        <summary className="cursor-pointer font-semibold text-ap-body">
          How these are counted
        </summary>
        <p className="m-0 mt-1.5">
          The cards: our own records, for every visitor from {SURVEY_TRACKING_DAY} (before it, only
          for visitors who accepted cookies). Reached: of the visitors on the intro card (on slide 1
          for a range before {SURVEY_TRACKING_DAY}). People who start from the landing page’s
          question card skip the intro and land on the consent, so they are left out of the
          consent’s Reached share. Time: the median from a card to the next one (before{" "}
          {SURVEY_TRACKING_DAY}, slide 4’s ran to question 1, past the consent). Continue: reached
          the next card that day. Skip intro: pressed it on that slide. Back: the Back button, the
          arrow key, a swipe or the browser’s Back (slide 1 and the consent have only the
          browser’s). Exit: the furthest card that visitor reached that day. In red: Skip intro from
          15%, Exit from 8%. For a range from {SURVEY_TRACKING_DAY} on, the first two boxes are our
          own records too: visitors on the intro card, and of everyone who began (on the intro card,
          or on the consent from the landing page’s card) the share who agreed and went on to
          question 1. The other boxes and the engagement column: clicks PostHog recorded on the
          survey page, as a share of its sessions there (it sees most survey sessions), as are the
          first two boxes and the consent’s continue for an earlier range. The four boxes compare
          with the period before only when both come from the same records (both ours, or both
          PostHog&rsquo;s).
        </p>
      </details>
    </Card>
  );
}

function IntroRow({ card }: { card: IntroRowData }) {
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
          <span className="text-xs text-ap-muted">not recorded</span>
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
}: {
  q: QuestionRow;
  total: number;
  rows: QuestionRow[];
}) {
  const { params } = useApFilters();
  const [dim, setDim] = useState<Dimension>("none");
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
  const skipShare = q.reached ? q.skipped / q.reached : null;
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
        <Figure compact label="Reached" value={fmt("count", q.reached)} />
        <Figure
          compact
          label="Exits"
          value={fmt("count", q.exits)}
          note={`${fmt("pct", q.dropRate, 2)} drop-out`}
        />
        <Figure
          compact
          label="Skipped"
          value={fmt("pct", skipShare)}
          note={`${fmt("count", q.skipped)} passed without an answer`}
        />
        <Figure
          compact
          label="Median time"
          value={fmt("mmss", q.medianMs)}
          note={`${fmt("count", q.wentBack)} went back from it`}
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
          {data && (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="text-[15px] font-bold text-ap-ink">Answers</span>
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
                  </span>
                ))}
              </div>
              {data.segments.length === 0 ? (
                <p className="m-0 text-sm text-ap-muted">
                  No group has five or more answers in this range.
                </p>
              ) : (
                <div className="flex max-w-[820px] flex-col gap-3.5">
                  {data.answers.map((a) => (
                    <div
                      key={a.label}
                      className="grid items-center gap-3 text-[13px]"
                      style={{ gridTemplateColumns: "140px minmax(0,1fr)" }}
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
                .{data.gap ? ` Largest gap: ${data.gap}.` : ""}
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
 * Each question in today's order with the people who reached it, the share of the first and of
 * the one before, the people who left there and its median time; a row opens Question detail.
 */
function FunnelSection({
  data,
  rows,
  selected,
  onSelect,
}: {
  data: SurveyPayload;
  rows: QuestionRow[];
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
  // Each question against the one before it in today's order, however the table is sorted;
  // questions no longer asked come last, without a place in the funnel.
  const steps = [
    ...asked.map((r, i) => {
      const prev = i ? asked[i - 1]!.reached : null;
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
        // A question first asked during the range was asked for part of it: no one left there.
        heavy: ofPrev !== null && ofPrev < 0.95 && !r.newInRange,
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
  return (
    <Card id="funnel" labelledBy="h-funnel">
      <SectionHead
        id="h-funnel"
        title="Question funnel"
        description={
          q?.blocked
            ? `${q.blocked} Showing all traffic.`
            : `Survey sessions reaching each question, ${data.range.label}. Click a row to open it in Question detail.`
        }
      />
      {data.questionsError && <p className="m-0 text-sm text-ap-bad-ink">{data.questionsError}</p>}
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
              First step
            </span>
            <span className="font-serif text-xl font-semibold tabular-nums">
              {fmt("count", asked.length ? top : null)}
            </span>
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ap-label">
              Reached last step
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
            <Th label="Reached" sortKey="reached" sort={sort} onSort={setSort} right />
            <Th label="Funnel" />
            <Th label="% of start" sortKey="ofStart" sort={sort} onSort={setSort} right />
            <Th label="% of prev." sortKey="ofPrev" sort={sort} onSort={setSort} right />
            <Th label="Exits" sortKey="exits" sort={sort} onSort={setSort} right />
            <Th label="Drop-out rate" sortKey="drop" sort={sort} onSort={setSort} right />
            <Th label="Time" sortKey="time" sort={sort} onSort={setSort} right />
            <Th label={`Exits per ${q?.trendGrain ?? "week"}`} />
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
                  <Spark values={x.r.exitsTrend} height={26} />
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {term && shown.length === 0 && (
        <p className="m-0 text-sm text-ap-muted">No question matches “{search}”.</p>
      )}
      <p className="m-0 text-xs leading-relaxed text-ap-muted">
        Rows in orange lose more than 5% of the previous step. Exits: people whose last step was the
        question and who never finished; the drop-out rate is those exits over the people who
        reached it (red above 5%). A question reached by more people than the one before it was
        asked in a different order to some of them (the opening-order and email-question tests), and
        one first asked during the range is not shaded: it was asked for only part of it. The end of
        the flow may differ between survey versions, so check before reading the last rows as
        drop-outs. Same people as the Notion drop-off page, less our own finished test runs. Time,
        back and skipped: all traffic, staff left out.
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
 */
function Th<K extends string>({
  label,
  sortKey,
  text = false,
  sort = null,
  onSort,
  right = false,
  children,
}: {
  label: string;
  sortKey?: K;
  text?: boolean;
  sort?: Sort<K>;
  onSort?: (s: Sort<K>) => void;
  right?: boolean;
  children?: ReactNode;
}) {
  const dir = sortKey !== undefined && sort?.key === sortKey ? sort.dir : null;
  return (
    <span
      role="columnheader"
      aria-sort={dir === 1 ? "ascending" : dir === -1 ? "descending" : sortKey ? "none" : undefined}
      className={`px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-ap-muted ${right ? "text-right" : ""}`}
    >
      {label}
      {children}
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
          className={`ml-1 inline-flex cursor-pointer border-0 bg-transparent p-0 align-[-1px] ${dir ? "text-ap-violet" : "text-ap-muted"}`}
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
  value,
  note,
  compact = false,
}: {
  label: string;
  value: string;
  note?: string;
  compact?: boolean;
}) {
  const small = compact ? "text-[11px]" : "text-xs";
  return (
    <div
      className={`flex min-w-0 flex-col gap-0.5 rounded-[14px] ${compact ? "bg-white p-2.5" : "bg-ap-lilac p-3.5"}`}
    >
      <span className={`${small} text-ap-muted`}>{label}</span>
      <span
        className={`font-serif font-semibold tabular-nums text-ap-ink ${compact ? "text-xl" : "text-[22px]"}`}
      >
        {value}
      </span>
      {note && <span className={`${small} leading-snug text-ap-muted`}>{note}</span>}
    </div>
  );
}
