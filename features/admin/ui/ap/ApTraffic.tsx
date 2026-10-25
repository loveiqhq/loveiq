"use client";

import {
  Fragment,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import { type Grain } from "@features/admin/server/ap/filters";
import { EMPTY, fmt, lowerFirst } from "@features/admin/server/ap/format";
import type {
  AdSeenRow,
  AudienceDim,
  BreakdownKey,
  ChannelTrend,
  CohortRow,
  IntentRow,
  PerfRow,
  PerfTable,
  TrafficPayload,
  TrafficTiles,
} from "@features/admin/server/ap/traffic";
import {
  contribution,
  DEFAULT_ASSUMPTIONS,
  ratioOrNull as q,
  type Assumptions,
} from "@features/admin/server/ap/traffic-math";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";

import ApFilterBar from "./ApFilterBar";
import { exportTables } from "./csv";
import { Info } from "./field-info";
import { bucketTitles, IndexHover, periodTitle, PointHover, ROW_HOVER, type TipRow } from "./hover";
import {
  Bar,
  BlackButton,
  Busy,
  Card,
  Eyebrow,
  Failed,
  headWidth,
  ICON_BTN,
  InfoLabel,
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
import {
  againstAverage,
  anchorOf,
  BAD,
  band,
  buyerIndex,
  cellText,
  colsOf,
  costLine,
  TOTAL_COLS,
  GOOD,
  GROUP_LABEL,
  LEAK_STEPS,
  perfCsv,
  PLAIN,
  pointLabel,
  pooledStep,
  rankTone,
  rowValues,
  scatter,
  sortRows,
  stackChart,
  times,
  trafficTiles,
  VIEWS,
  xOf,
  type Anchor,
  type Col,
  type Dir,
  type Group,
  type RowValues,
  type Scale,
  type Shade,
  type SortKey,
  type ViewKey,
} from "./traffic-view";
import { useApFilters } from "./useApFilters";

/** In the order the design draws the sections: Cost vs quality last. */
const SECTIONS = [
  { id: "scorecard", label: "Scorecard" },
  { id: "performance", label: "Performance" },
  { id: "leakage", label: "Funnel leakage" },
  { id: "intent", label: "Creatives & intent" },
  { id: "ads-seen", label: "Ads as seen" },
  { id: "cohorts", label: "Cohorts" },
  { id: "experiments", label: "Experiments" },
  { id: "audience", label: "Audience" },
  { id: "quality", label: "Cost vs quality" },
];

type Inputs = Record<keyof Assumptions, string>;

const FIELDS: Array<{ key: keyof Assumptions; label: string; step: string; basis: number }> = [
  { key: "feePct", label: "Payment fee %", step: "0.1", basis: 180 },
  { key: "feeFix", label: "Fee per payment (€)", step: "0.01", basis: 180 },
  { key: "varCost", label: "Variable cost per report (€)", step: "0.01", basis: 220 },
  { key: "vat", label: "VAT on revenue %", step: "1", basis: 180 },
];

const START = Object.fromEntries(
  FIELDS.map((f) => [f.key, String(DEFAULT_ASSUMPTIONS[f.key])])
) as Inputs;

/** The inputs as numbers: one left blank or unreadable counts as its default, as drawn. */
function assumptionsOf(inputs: Inputs): Assumptions {
  const out = { ...DEFAULT_ASSUMPTIONS };
  for (const f of FIELDS) {
    const n = parseFloat(inputs[f.key]);
    if (Number.isFinite(n)) out[f.key] = n;
  }
  return out;
}

/** Traffic, as Marcus drew it on 16 Oct 2026. */
export default function ApTraffic() {
  const { params } = useApFilters();
  const { data, loading, error, refetch } = useAdminFetch<TrafficPayload>(
    "/api/admin/ap/traffic",
    params
  );
  useHashScroll(Boolean(data));
  const [inputs, setInputs] = useState<Inputs>(START);
  const a = useMemo(() => assumptionsOf(inputs), [inputs]);
  const [bd, setBd] = useState<BreakdownKey>("channel");
  const tiles = data ? trafficTiles(data.tiles, a) : [];

  return (
    <>
      <div className="flex flex-col gap-4">
        <PageHeader
          crumbs={["Assessments", "Assessment A", "Traffic"]}
          title="Traffic"
          description="Which sources bring people who finish the survey, unlock, read and come back, and what each of them costs."
          actions={
            <BlackButton
              disabled={!data}
              onClick={() =>
                data &&
                exportTables(
                  `ap-traffic-${data.range.from}-${data.range.to}`,
                  [
                    {
                      name: `Performance by ${data.breakdowns[bd].label.toLowerCase()}`,
                      table: perfCsv(data.breakdowns[bd], a),
                    },
                  ],
                  tiles.map((t) => t.tile)
                )
              }
            >
              Export CSV
            </BlackButton>
          }
        />
        <SectionNav label="Traffic sections" sections={SECTIONS} ready={Boolean(data)} />
      </div>
      <ApFilterBar scope="assessment" />
      {loading && !data && <Loading label="the traffic page" />}
      {error && <Failed message={error} onRetry={refetch} />}
      {data && (
        <Busy busy={loading}>
          <RangeLine data={data} sources="Production database, PostHog, Google Ads" />
          <Attribution attr={data.attribution} />
          <TileGrid min={200}>
            {tiles.map(({ tile, spec, worked }) => (
              <KpiTileV2
                key={tile.key}
                tile={tile}
                digits={spec.digits}
                suffix={spec.suffix}
                negativeBad={spec.negativeBad}
                level
                titles={bucketTitles(data.range.from, data.range.to)}
                info={{
                  k: spec.info,
                  worked,
                  trend: {
                    route: "traffic",
                    tile: tile.key,
                    unit: tile.unit,
                    digits: spec.digits,
                    suffix: spec.suffix,
                  },
                }}
              />
            ))}
          </TileGrid>
          <Note>
            Revenue / visitor, ROAS, Visitor → paid, Purchase CVR and Contribution / visitor count
            this range&apos;s finishers and what they bought so far, not payments by the day they
            were made.
          </Note>
          <Scorecard tiles={data.tiles} a={a} inputs={inputs} onInputs={setInputs} />
          <ChannelTrendSection trend={data.trend} />
          <Performance table={data.breakdowns[bd]} bd={bd} onBd={setBd} a={a} />
          <Leakage table={data.breakdowns[bd]} a={a} />
          <Intent intent={data.intent} />
          <AdsSeen ads={data.adsSeen} />
          <Cohorts cohorts={data.cohorts} />
          <Experiments experiments={data.experiments} />
          <Audience dims={data.audience.dims} />
          {/* Last, as the design draws it. */}
          <Quality quality={data.quality} />
        </Busy>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Shared pieces

const shadeStyle = (s: Shade) => ({ background: s.bg, color: s.fg });

/** A table cell as the design draws them: the figure, a grey line under it where there is one. */
function Cell({
  text,
  sub,
  shade = PLAIN,
  bold = false,
  left = false,
  pad = "py-2.5",
  header = false,
}: {
  text: ReactNode;
  sub?: string | null;
  shade?: Shade;
  bold?: boolean;
  left?: boolean;
  pad?: string;
  header?: boolean;
}) {
  return (
    // `relative` holds the shade's sr-only word, so it can't widen the page on a phone.
    <span
      role={header ? "rowheader" : "cell"}
      className={`relative flex flex-col justify-center gap-px px-3 ${pad} text-[13px] tabular-nums ${left ? "text-left" : "text-right"} ${bold ? "font-bold" : "font-medium"}`}
      style={shadeStyle(shade)}
    >
      {text}
      {(shade === GOOD || shade === BAD) && (
        <span className="sr-only"> ({shade === GOOD ? "better" : "worse"})</span>
      )}
      {sub && <span className="text-[11px] font-medium text-ap-muted">{sub}</span>}
    </span>
  );
}

/** A table's header row, as the design draws it: each figure's heading with its info icon. */
function HeadRow({
  labels,
  gtc,
}: {
  labels: Array<{ label: string; info?: string }>;
  gtc: string;
}) {
  return (
    <div role="row" className="grid bg-ap-ground" style={{ gridTemplateColumns: gtc }}>
      {labels.map((h, i) => (
        <span
          key={h.label}
          role="columnheader"
          className={`text-balance px-3 py-2.5 text-[11px] font-bold uppercase leading-[1.3] tracking-[0.06em] text-ap-muted ${i ? "text-right" : "text-left"}`}
        >
          <InfoLabel label={h.label} info={h.info ? { k: h.info } : undefined} />
        </span>
      ))}
    </div>
  );
}

/** A wide table in its own sideways-scrolling box. */
function Wide({ label, min, children }: { label: string; min: number; children: ReactNode }) {
  return (
    // A tab stop and a name, so a keyboard can scroll it sideways (nothing in it takes focus).
    <div
      tabIndex={0}
      role="region"
      aria-label={`${label}, scrolls sideways`}
      className="overflow-x-auto rounded-[14px] border border-ap-line"
    >
      <div role="table" aria-label={label} style={{ minWidth: min }}>
        {children}
      </div>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="m-0 text-xs leading-relaxed text-ap-muted">{children}</p>;
}

function Why({ children }: { children: ReactNode }) {
  return <p className="m-0 text-sm leading-relaxed text-ap-muted">{children}</p>;
}

const people = (n: number) => `${fmt("count", n)} ${n === 1 ? "person" : "people"}`;

// ---------------------------------------------------------------------------------------------
// Attribution coverage

/** The design's two figures (Marcus took the buyers' and Google's shares off on 15 Oct 2026). */
function Attribution({ attr }: { attr: TrafficPayload["attribution"] }) {
  const share = attr.why ? null : attr.visitorsWithSource;
  const un = attr.why ? null : attr.unattributed;
  const items = [
    {
      label: "Visitors with a source",
      info: "traffic.withSource",
      value: fmt("pct", share, 1),
      worked:
        un && share !== null
          ? {
              num: `≈ ${fmt("count", un.of - un.n)}`,
              den: fmt("count", un.of),
              value: fmt("pct", share, 1),
            }
          : undefined,
      red: share !== null && share < 0.5,
    },
    {
      label: "Unattributed visitors",
      info: "traffic.unattributed",
      // Direct's share of PostHog's untagged visits applied to the visit log's: an estimate.
      value: un ? `≈ ${fmt("count", un.n)} of ${fmt("count", un.of)}` : EMPTY,
      worked: un ? { value: `≈ ${fmt("count", un.n)} of ${fmt("count", un.of)}` } : undefined,
      red: false,
    },
  ];
  return (
    <section
      aria-labelledby="h-attr"
      className="flex flex-wrap items-center gap-x-7 gap-y-4 rounded-[20px] border border-ap-line bg-white px-6 py-5 shadow-ap"
    >
      <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-1">
        <span id="h-attr" className="text-[15px] font-bold text-ap-ink">
          Attribution coverage
        </span>
        <span className="text-[13px] leading-normal text-ap-muted">
          Share of visitors and purchases we can tie to a source. Paid clicks that arrive without
          UTM or gclid land in Direct, so every number below depends on this.
        </span>
      </div>
      <dl className="m-0 flex flex-wrap gap-6">
        {items.map((it) => (
          <div key={it.label} className="flex min-w-[120px] flex-col gap-0.5">
            <dt className="text-xs text-ap-muted">
              <InfoLabel label={it.label} info={{ k: it.info, worked: it.worked }} />
            </dt>
            <dd
              className={`m-0 font-serif text-2xl font-semibold tabular-nums ${it.red ? "text-ap-bad" : "text-ap-ink"}`}
            >
              {it.value}
            </dd>
          </div>
        ))}
      </dl>
      {attr.why && (
        <p className="m-0 basis-full text-xs leading-relaxed text-ap-muted">{attr.why}</p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Executive scorecard and the contribution assumptions

function Scorecard({
  tiles,
  a,
  inputs,
  onInputs,
}: {
  tiles: TrafficTiles;
  a: Assumptions;
  inputs: Inputs;
  onInputs: Dispatch<SetStateAction<Inputs>>;
}) {
  const c = tiles.now;
  // Under a filter that can't count people (tablets before they were told apart), their
  // figures are blank, as the tiles are, rather than a false zero.
  const known = tiles.blocked.people === null;
  const completes = known ? c.completes : null;
  const payers = known ? c.payers : null;
  const revenue = known ? c.revenue : null;
  const con = known ? contribution(c, a) : null;
  // Whole euros where the design writes them (spend, CAC, contribution), cents elsewhere.
  const cells: Array<{
    label: string;
    info: string;
    v: string;
    step: string;
    sub: string;
    tone?: string;
  }> = [
    {
      label: "Ad spend",
      info: "traffic.spend",
      v: fmt("eur", c.spend, 0),
      step: "",
      sub: `${fmt("eur", q(c.spend, c.clicks), 2)} per click`,
    },
    {
      label: "Visitors",
      info: "traffic.visitors",
      v: fmt("count", c.visitors),
      step: `${fmt("eur", q(c.spend, c.visitors), 2)} per visitor`,
      sub: "",
    },
    {
      label: "Survey starts",
      info: "traffic.starts",
      v: fmt("count", c.starts),
      step: `${fmt("pct", q(c.starts, c.visitors), 2)} start CVR`,
      sub: `${fmt("eur", q(c.spend, c.starts), 2)} per start`,
    },
    {
      label: "Completes",
      info: "traffic.completes",
      v: fmt("count", completes),
      step: `${fmt("pct", q(completes, c.starts), 1)} completion`,
      sub: `${fmt("eur", q(c.spend, completes), 2)} per complete`,
    },
    {
      label: "Buyers",
      info: "traffic.buyers",
      v: fmt("count", payers),
      step: `${fmt("pct", q(payers, completes), 2)} purchase CVR`,
      sub: `${known ? `${fmt("count", c.sales)} purchase${c.sales === 1 ? "" : "s"} · ` : ""}${fmt("eur", q(c.spend, payers), 0)} CAC`,
    },
    {
      label: "Revenue",
      info: "traffic.revenue",
      v: fmt("eur", revenue, 2),
      step: `${fmt("eur", q(revenue, known ? c.sales : null), 2)} AOV`,
      sub: `${times(q(revenue, c.spend))} ROAS`,
    },
    {
      label: "Contribution",
      info: "traffic.contribution",
      v: fmt("eur", con, 0),
      step: `${fmt("eur", q(con, c.visitors), 3)} per visitor`,
      sub: "after fees, report cost, ads",
      tone: con === null ? "text-ap-ink" : con < 0 ? "text-ap-bad" : "text-ap-good",
    },
  ];
  const whys = [
    ...new Set(
      [
        tiles.blocked.spend,
        tiles.blocked.visitors,
        tiles.blocked.people,
        c.starts === null && known ? tiles.blocked.starts : null,
      ].filter((w): w is string => w !== null)
    ),
  ];
  return (
    <Card id="scorecard" labelledBy="h-score">
      <SectionHead
        id="h-score"
        title="Executive scorecard"
        description="From ad spend to contribution profit for the selected period, with the conversion between each step. Buyers and revenue are the period's finishers and what they bought so far, not payments by the day they were made."
      />
      {/* The cells' own top and left lines draw the grid; the box hides those on its edges. */}
      <div className="overflow-hidden rounded-[14px] border border-ap-line">
        <div
          className="-ml-px -mt-px grid"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}
        >
          {cells.map((s, i) => (
            <div
              key={s.label}
              className={`flex flex-col gap-1 border-l border-t border-ap-line px-3.5 pb-3 pt-3.5 ${i === cells.length - 1 ? "bg-ap-ground" : "bg-white"}`}
            >
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ap-label">
                <InfoLabel
                  label={s.label}
                  info={{ k: s.info, worked: s.v === EMPTY ? undefined : { value: s.v } }}
                />
              </span>
              <span
                className={`font-serif text-2xl font-semibold tabular-nums ${s.tone ?? "text-ap-ink"}`}
              >
                {s.v}
              </span>
              <span className="text-xs font-bold tabular-nums text-ap-body">{s.step}</span>
              <span className="text-xs text-ap-muted">{s.sub}</span>
            </div>
          ))}
        </div>
      </div>
      {whys.map((w) => (
        <Note key={w}>{w}</Note>
      ))}
      <div className="flex flex-wrap items-end gap-3 border-t border-ap-line pt-3.5">
        <h3 className="m-0 basis-full text-[15px] font-bold text-ap-ink">
          Contribution assumptions
        </h3>
        {FIELDS.map((f) => (
          <label
            key={f.key}
            className="flex min-w-0 flex-col gap-1 text-xs font-bold text-ap-muted"
            style={{ flex: `0 1 ${f.basis}px` }}
          >
            {f.label}
            <input
              type="number"
              step={f.step}
              value={inputs[f.key]}
              onChange={(e) => {
                const v = e.target.value;
                onInputs((s) => ({ ...s, [f.key]: v }));
              }}
              className="min-h-11 w-full rounded-lg border border-ap-ink/[0.18] bg-white px-3 font-sans text-sm text-ap-ink"
            />
          </label>
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// Traffic and submissions by channel

/** The design's channel colours, and the ink of the figures written on each. */
const CHANNEL_COLOURS: Record<string, { fill: string; ink: string }> = {
  google_ads: { fill: "#5a42a6", ink: "#ffffff" },
  direct: { fill: "#161021", ink: "#ffffff" },
  meta_ads: { fill: "#fe6839", ink: "#ffffff" },
  organic: { fill: "#2e7d5b", ink: "#ffffff" },
  owned: { fill: "#c58b00", ink: "#161021" },
  other: { fill: "#9d8bd8", ink: "#161021" },
};
const colourOf = (key: string | undefined) =>
  (key && CHANNEL_COLOURS[key]) || { fill: "#d2c9ee", ink: "#161021" };

const GRAIN: Record<Grain, { adj: string; noun: string }> = {
  day: { adj: "Daily", noun: "day" },
  week: { adj: "Weekly", noun: "week" },
  month: { adj: "Monthly", noun: "month" },
};

/** How far a label moves from its point: flush at the ends, centred between. */
const SHIFT: Record<Anchor, string> = { start: "0px", middle: "-50%", end: "-100%" };
/** The same for a figure inside a layer, kept 6px off the plot's edges. */
const INSET: Record<Anchor, string> = {
  start: "6px",
  middle: "-50%",
  end: "calc(-100% - 6px)",
};

function ChannelTrendSection({ trend }: { trend: ChannelTrend }) {
  const [scale, setScale] = useState<Scale>("total");
  const g = GRAIN[trend.grain];
  const hasCost = trend.costPerSub.some((v) => v !== null && Number.isFinite(v));
  return (
    <Card id="channel-trend" labelledBy="h-ct">
      <SectionHead
        id="h-ct"
        title="Traffic and submissions by channel"
        description={`${g.adj} visitors and survey submissions, stacked by channel. Each layer shows the channel's count and its share of the ${g.noun}.`}
        align="end"
        right={
          <Pills
            label="Scale"
            value={scale}
            onChange={setScale}
            options={[
              { value: "total", label: "Total" },
              { value: "share", label: "Share %" },
            ]}
          />
        }
      />
      <div className="flex flex-wrap gap-x-[18px] gap-y-2 text-xs text-ap-body">
        {trend.channels.map((ch) => (
          <span key={ch.key} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-3 w-3 rounded-[3px]"
              style={{ background: colourOf(ch.key).fill }}
            />
            {ch.name}
          </span>
        ))}
        {hasCost && (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="w-[18px] border-t-2 border-dotted border-ap-ink" />
            <InfoLabel
              label="Avg. cost per survey submission (submissions chart)"
              info={{ k: "traffic.costPerSub" }}
            />
          </span>
        )}
      </div>
      <div className="flex flex-col gap-9">
        {trend.visitors ? (
          <StackFigure
            title={`Visitors per ${g.noun}`}
            info="traffic.chartVisitors"
            series={trend.visitors}
            trend={trend}
            scale={scale}
          />
        ) : (
          <figure className="m-0 flex flex-col gap-2">
            <figcaption className="text-[15px] font-bold text-ap-ink">
              <InfoLabel label={`Visitors per ${g.noun}`} info={{ k: "traffic.chartVisitors" }} />
            </figcaption>
            <Why>{trend.visitorsWhy ?? "No visitor split for this range."}</Why>
          </figure>
        )}
        {trend.submissionsWhy ? (
          <figure className="m-0 flex flex-col gap-2">
            <figcaption className="text-[15px] font-bold text-ap-ink">
              <InfoLabel
                label={`Survey submissions per ${g.noun}`}
                info={{ k: "traffic.chartSubmissions" }}
              />
            </figcaption>
            <Why>{trend.submissionsWhy}</Why>
          </figure>
        ) : (
          <StackFigure
            title={`Survey submissions per ${g.noun}`}
            info="traffic.chartSubmissions"
            series={trend.submissions}
            trend={trend}
            scale={scale}
            cost={trend.costPerSub}
          />
        )}
      </div>
      {trend.note && <Note>{trend.note}</Note>}
    </Card>
  );
}

function StackFigure({
  title,
  info,
  series,
  trend,
  scale,
  cost,
}: {
  title: string;
  /** The chart's info card key. */
  info: string;
  series: number[][];
  trend: ChannelTrend;
  scale: Scale;
  cost?: Array<number | null>;
}) {
  const n = trend.points.length;
  // The figures at the lines' end (under the chart on a phone) say which point they are.
  const caption = (
    <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[15px] font-bold text-ap-ink">
      <span>
        <InfoLabel label={title} info={{ k: info }} />
      </span>
      {n > 0 && (
        <span className="text-xs font-semibold text-ap-muted">
          <InfoLabel
            label={`${pointLabel(trend.grain, trend.points[n - 1]!)} by channel`}
            info={{ k: "traffic.chartLast" }}
          />
        </span>
      )}
    </figcaption>
  );
  if (n === 0) {
    return (
      <figure className="m-0 flex flex-col gap-2">
        {caption}
        <Why>Nothing to chart in this range.</Why>
      </figure>
    );
  }
  // Under the cost line the tallest total stays below three quarters of the plot, so the line's
  // labels (80–94%) never cover a total.
  const chart = stackChart(series, scale, cost && scale !== "share" ? 1 / 0.74 : undefined);
  const line = cost ? costLine(cost) : null;
  // A phone has room for the figures inside the chart at up to four points, and for about
  // three names under it; a wider screen for six weeks' names or nine days' or months'.
  const crowded = n > 4 ? "max-sm:hidden" : "";
  const phoneEvery = Math.ceil(n / 3);
  const wideEvery = Math.ceil(n / (trend.grain === "week" ? (scale === "share" ? 5 : 6) : 9));
  // The cost line's figures: about five across a wide screen, counted back from the last one
  // (which says what they are), so neighbours never sit on each other.
  const costEvery = Math.ceil(n / 5);
  const lastCost = line?.labels[line.labels.length - 1]?.at;
  const last = trend.points[n - 1]!;
  return (
    <figure className="m-0 flex flex-col gap-2">
      {caption}
      <div className="relative ml-[52px] mt-2 h-[280px] border-b border-ap-line sm:mr-[210px]">
        <div aria-hidden="true" className="absolute inset-0">
          {chart.grid.map((gl) => (
            <Fragment key={gl.y}>
              <span
                className="absolute inset-x-0 border-t border-ap-track"
                style={{ bottom: `${gl.y}%` }}
              />
              <span
                className="absolute -left-[52px] w-11 translate-y-1/2 text-right text-[11px] tabular-nums text-ap-muted"
                style={{ bottom: `${gl.y}%` }}
              >
                {gl.label}
              </span>
            </Fragment>
          ))}
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible"
          >
            {chart.layers.map((l, i) => (
              <polygon
                key={trend.channels[i]?.key ?? i}
                points={l.pts}
                fill={colourOf(trend.channels[i]?.key).fill}
                fillOpacity={0.88}
                stroke="#ffffff"
                strokeWidth={1.2}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          {chart.layers.map((l, i) =>
            l.marks.map((m) => (
              <span
                key={`${i}-${m.x}`}
                className={`pointer-events-none absolute whitespace-nowrap text-[11px] font-bold tabular-nums ${crowded}`}
                style={{
                  left: `${m.x}%`,
                  bottom: `${m.y}%`,
                  transform: `translate(${INSET[m.anchor]}, 50%)`,
                  color: colourOf(trend.channels[i]?.key).ink,
                }}
              >
                {m.label}
              </span>
            ))
          )}
          {chart.layers.map((l, i) => (
            <span
              key={`end-${trend.channels[i]?.key ?? i}`}
              className="absolute left-full hidden items-baseline gap-1.5 whitespace-nowrap text-xs tabular-nums sm:flex"
              style={{ bottom: `${l.endY}%`, transform: "translate(10px, 50%)" }}
            >
              <span
                className="h-2 w-2 self-center rounded-sm"
                style={{ background: colourOf(trend.channels[i]?.key).fill }}
              />
              <span className="font-bold text-ap-ink">{l.endVal}</span>
              <span className="text-ap-muted">
                {l.endShare} · {trend.channels[i]?.short}
              </span>
            </span>
          ))}
          {chart.tops.map((t, w) => (
            <span
              key={`top-${w}`}
              className={`absolute whitespace-nowrap text-xs font-bold tabular-nums text-ap-ink ${crowded}`}
              style={{
                left: `${t.x}%`,
                bottom: `${t.y}%`,
                transform: `translate(${SHIFT[t.anchor]}, -6px)`,
              }}
            >
              {t.label}
            </span>
          ))}
          {line && (
            <>
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 h-full w-full overflow-visible"
              >
                {line.segments.map((s) => (
                  <polyline
                    key={s}
                    points={s}
                    fill="none"
                    stroke="#161021"
                    strokeWidth={2}
                    strokeDasharray="2 5"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>
              {line.labels.map((l) => (
                <span
                  key={`cost-${l.x}`}
                  className={`absolute whitespace-nowrap rounded bg-white/90 px-1 text-[11px] font-bold tabular-nums text-ap-ink ${crowded} ${((lastCost ?? 0) - (l.at ?? 0)) % costEvery ? "sm:hidden" : ""}`}
                  style={{
                    left: `${l.x}%`,
                    bottom: `${l.y}%`,
                    transform: `translate(${SHIFT[l.anchor]}, -8px)`,
                  }}
                >
                  {l.label}
                  {l.at === lastCost && <span className="max-sm:hidden"> / submission</span>}
                </span>
              ))}
            </>
          )}
        </div>
        <IndexHover
          xs={trend.points.map((_, w) => xOf(w, n))}
          label={title}
          tip={(w) => {
            const p = trend.points[w]!;
            const total = chart.totals[w] ?? 0;
            const rows: TipRow[] = [...trend.channels.keys()].reverse().map((i) => {
              const v = series[i]?.[w] ?? 0;
              return {
                label: trend.channels[i]!.name,
                value: `${fmt("count", v)} · ${total ? `${((v / total) * 100).toFixed(1)}%` : EMPTY}`,
                color: colourOf(trend.channels[i]!.key).fill,
                mark: "square",
                muted: v === 0,
              };
            });
            rows.push({ label: "All channels", value: fmt("count", total), strong: true });
            if (cost) {
              const c = cost[w];
              rows.push({
                label: "Avg. cost per survey submission",
                value: fmt("eur", c ?? null, 2),
                color: "#161021",
                mark: "dotted",
                muted: c === null || c === undefined,
              });
            }
            return { title: periodTitle(p, !p.full), rows };
          }}
          markers={(w) => {
            let cum = 0;
            return trend.channels.map((ch, i) => {
              const v = series[i]?.[w] ?? 0;
              const total = chart.totals[w] ?? 0;
              cum += scale === "share" ? (total ? (v / total) * 100 : 0) : v;
              return { y: (cum / chart.max) * 100, color: colourOf(ch.key).fill };
            });
          }}
        />
      </div>
      <div aria-hidden="true" className="relative ml-[52px] h-4 sm:mr-[210px]">
        {trend.points.map((p, w) => (
          <span
            key={p.from}
            className={`absolute whitespace-nowrap text-[11px] text-ap-muted ${w % phoneEvery ? "max-sm:hidden" : ""} ${w % wideEvery ? "sm:hidden" : ""}`}
            style={{ left: `${xOf(w, n)}%`, transform: `translateX(${SHIFT[anchorOf(w, n)]})` }}
          >
            <span className="max-sm:hidden">
              {pointLabel(trend.grain, p)}
              {scale === "share" ? ` · ${fmt("count", chart.totals[w] ?? 0)}` : ""}
            </span>
            <span className="sm:hidden">{pointLabel(trend.grain, p, true)}</span>
          </span>
        ))}
      </div>
      {/* On a phone the labels at the lines' end move under the chart, the top layer first. */}
      <ul
        aria-hidden="true"
        className="m-0 flex list-none flex-col gap-1 p-0 text-xs tabular-nums sm:hidden"
      >
        <li className="text-[11px] text-ap-muted">{pointLabel(trend.grain, last)}</li>
        {[...chart.layers.keys()].reverse().map((i) => (
          <li key={trend.channels[i]?.key ?? i} className="flex items-baseline gap-1.5">
            <span
              className="h-2 w-2 self-center rounded-sm"
              style={{ background: colourOf(trend.channels[i]?.key).fill }}
            />
            <span className="font-bold text-ap-ink">{chart.layers[i]!.endVal}</span>
            <span className="text-ap-muted">
              {chart.layers[i]!.endShare} · {trend.channels[i]?.short}
            </span>
          </li>
        ))}
      </ul>
      {/* The chart as a table for screen readers; a table ignores a 1px width, its box doesn't. */}
      <div className="sr-only">
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Channel</th>
              {trend.points.map((p) => (
                <th key={p.from} scope="col">
                  {pointLabel(trend.grain, p)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trend.channels.map((ch, i) => (
              <tr key={ch.key}>
                <th scope="row">{ch.name}</th>
                {trend.points.map((p, w) => (
                  <td key={p.from}>{fmt("count", series[i]?.[w] ?? 0)}</td>
                ))}
              </tr>
            ))}
            {cost && (
              <tr>
                <th scope="row">Avg. cost per survey submission</th>
                {trend.points.map((p, w) => (
                  <td key={p.from}>{fmt("eur", cost[w] ?? null, 2)}</td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

// ---------------------------------------------------------------------------------------------
// Performance by a breakdown

const BREAKDOWNS: Array<{ value: BreakdownKey; label: string }> = [
  { value: "channel", label: "Channel" },
  { value: "funnel", label: "Funnel" },
  { value: "campaign", label: "Campaign" },
  { value: "creative", label: "Creative / message" },
  { value: "keyword", label: "Keyword" },
  { value: "audience", label: "Prospecting vs retargeting" },
  { value: "landing", label: "Landing page" },
  { value: "assessment", label: "Assessment" },
  { value: "device", label: "Device" },
  { value: "tier", label: "Country tier" },
  { value: "visitor", label: "New vs returning" },
];

const RANK_SHADES = [
  "#5a42a6",
  "#6a51b8",
  "#795fc8",
  "#8c76d1",
  "#9d8bd8",
  "#b0a1e0",
  "#c0b4e6",
  "#d2c9ee",
];

/** A row the design greys: "Not live". */
const MUTED: Shade = { bg: "transparent", fg: "#6b6678" };

/**
 * Why some rows read "—", under the table: the rows show their name alone (Marcus, 15 Oct
 * 2026: the grey line under each name was too noisy). Rows with the same reason share a line.
 */
function blankRowNotes(rows: PerfRow[]): string[] {
  const by = new Map<string, string[]>();
  for (const r of rows) if (r.blocked) by.set(r.blocked, [...(by.get(r.blocked) ?? []), r.name]);
  return [...by].map(([why, names]) => `${names.join(" and ")}: ${lowerFirst(why)}`);
}

function Performance({
  table,
  bd,
  onBd,
  a,
}: {
  table: PerfTable;
  bd: BreakdownKey;
  onBd: (k: BreakdownKey) => void;
  a: Assumptions;
}) {
  const [view, setView] = useState<ViewKey>("profit");
  const [metric, setMetric] = useState<SortKey>("cpv");
  const [dir, setDir] = useState<Dir>("desc");
  const cols = colsOf(view);
  const key: SortKey = cols.some((c) => c.key === metric) ? metric : "name";
  const lower = table.label.toLowerCase();
  const all = table.rows.map((r) => ({ r, v: rowValues(r, a) }));
  const live = all.filter((x) => !x.r.muted);
  // "Not live" rows stay at the bottom, whatever the order.
  const rows = [...sortRows(live, key, dir), ...all.filter((x) => x.r.muted)];
  // The total under more than one row only, as drawn: under one it would repeat it.
  const total = table.total && table.rows.length > 1 ? rowValues(table.total, a) : null;
  const shade = (c: Col, v: number | null) =>
    c.better
      ? band(
          live.map((x) => x.v[c.key]),
          v,
          c.better === "lo"
        )
      : PLAIN;

  const pickView = (k: ViewKey) => {
    setView(k);
    const next = colsOf(k);
    if (!next.some((c) => c.key === metric)) setMetric(next[next.length - 1]!.key);
  };
  const pickMetric = (c: Col) => {
    setMetric(c.key);
    setDir(c.better === "lo" ? "asc" : "desc");
  };
  // A header's button: the same as picking the metric; again, the other way round. The name
  // sorts Z to A first, as the design's does (its sort goes high to low unless lower is better).
  const sortBy = (k: SortKey, better: Col["better"]) => {
    if (k === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setMetric(k);
      setDir(better === "lo" ? "asc" : "desc");
    }
  };

  const ranked = cols.find((c) => c.key === key) ?? null;
  const notes = [...blankRowNotes(table.rows), ...table.notes];
  const groups: Array<{ group: Group | null; span: number }> = [{ group: null, span: 1 }];
  for (const c of cols) {
    const g = groups[groups.length - 1]!;
    if (g.group === c.group) g.span += 1;
    else groups.push({ group: c.group, span: 1 });
  }
  // Each column as wide as its heading needs (two lines at most, the last word and its two
  // buttons together): a longer word than the column would run under the next heading.
  const widths = cols.map((c) => Math.max(100, headWidth(c.label, 2)));
  const gtc = `220px ${widths.map((w) => `minmax(${w}px, 1fr)`).join(" ")}`;
  const head = (label: string, k: SortKey, better: Col["better"], i: number, info?: string) => {
    const on = k === key;
    const cut = label.lastIndexOf(" ") + 1;
    return (
      <span
        key={k}
        role="columnheader"
        aria-sort={on ? (dir === "asc" ? "ascending" : "descending") : "none"}
        className={`px-3 py-2.5 text-[11px] font-bold uppercase leading-[1.3] tracking-[0.06em] ${i ? "text-right" : "text-left"} ${on ? "text-ap-ink" : "text-ap-muted"}`}
      >
        {label.slice(0, cut)}
        {/* The last word and the buttons never part, so a button never wraps on its own. */}
        <span className="whitespace-nowrap">
          {label.slice(cut)}
          {info && <Info k={info} label={label} />}
          <button
            type="button"
            aria-label={`Sort by ${label}`}
            onClick={() => sortBy(k, better)}
            className={`ml-0.5 ${ICON_BTN} text-inherit`}
          >
            <SortIcon dir={on ? (dir === "asc" ? 1 : -1) : null} />
          </button>
        </span>
      </span>
    );
  };

  return (
    <Card id="performance" labelledBy="h-perf">
      <SectionHead
        id="h-perf"
        title={`Performance by ${lower}`}
        description={`One row per ${lower}. Pick a metric to rank the rows and sort the table by it. A user is a survey completer.`}
        align="end"
        right={
          <label className="flex min-w-[220px] flex-[0_1_260px] flex-col gap-1 text-xs font-bold text-ap-muted">
            Break down by
            <select
              value={bd}
              onChange={(e) => {
                const next = BREAKDOWNS.find((b) => b.value === e.target.value);
                if (next) onBd(next.value);
              }}
              className="min-h-11 rounded-lg border border-ap-ink/[0.18] bg-white px-3 font-sans text-sm text-ap-ink"
            >
              {BREAKDOWNS.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>
        }
      />
      {table.blocked ? (
        <Why>{table.blocked}</Why>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Eyebrow>Columns</Eyebrow>
            <Pills
              label="Column set"
              tight
              value={view}
              onChange={pickView}
              options={VIEWS.map((v) => ({ value: v.key, label: v.label }))}
            />
          </div>
          <div role="group" aria-label="Rank by" className="flex flex-wrap gap-1.5">
            {cols.map((c) => {
              const on = c.key === key;
              return (
                <button
                  key={c.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => pickMetric(c)}
                  className={`min-h-9 cursor-pointer rounded-full border px-3.5 text-[13px] font-semibold ${
                    on
                      ? "border-ap-ink bg-ap-ink text-white"
                      : "border-ap-line bg-white text-ap-body hover:bg-ap-ground"
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          <RankChart col={ranked} rows={rows.filter((x) => !x.r.muted)} lower={lower} />
          {table.rows.some((r) => r.sampleVisitors) && (
            <NotTracked>Sample split · totals are live</NotTracked>
          )}
          <div className="overflow-x-auto rounded-[14px] border border-ap-line">
            <div
              role="table"
              aria-label={`Performance by ${lower}`}
              style={{ minWidth: 220 + widths.reduce((a, w) => a + Math.max(104, w), 0) }}
            >
              <div
                aria-hidden="true"
                className="grid border-b border-ap-line bg-white"
                style={{ gridTemplateColumns: gtc }}
              >
                {groups.map((g, i) => (
                  <span
                    key={`${g.group ?? "name"}-${i}`}
                    className={`px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-ap-plum ${i ? "border-l border-ap-line" : ""}`}
                    style={{ gridColumn: `span ${g.span}` }}
                  >
                    {g.group ? GROUP_LABEL[g.group] : ""}
                  </span>
                ))}
              </div>
              <div role="row" className="grid bg-ap-ground" style={{ gridTemplateColumns: gtc }}>
                {head(table.label, "name", null, 0)}
                {cols.map((c, i) => head(c.label, c.key, c.better, i + 1, c.info))}
              </div>
              {rows.length === 0 && (
                <p className="m-0 border-t border-ap-line px-3 py-3 text-sm text-ap-muted">
                  Nothing in this range.
                </p>
              )}
              {rows.map(({ r, v }) => (
                <div
                  key={r.key}
                  role="row"
                  className="grid items-stretch border-t border-ap-line bg-white"
                  style={{ gridTemplateColumns: gtc }}
                >
                  <Cell header left bold text={r.name} shade={r.muted ? MUTED : PLAIN} />
                  {cols.map((c) => (
                    <Cell
                      key={c.key}
                      text={cellText(c, v[c.key])}
                      bold={c.key === key}
                      shade={r.muted ? MUTED : shade(c, v[c.key])}
                    />
                  ))}
                </div>
              ))}
              {table.total && total && (
                <div
                  role="row"
                  className="grid items-stretch border-t border-ap-line bg-ap-ground"
                  style={{ gridTemplateColumns: gtc }}
                >
                  <Cell header left bold text={table.total.name} />
                  {cols.map((c) => (
                    <Cell
                      key={c.key}
                      bold
                      text={TOTAL_COLS.has(c.key) ? cellText(c, total[c.key]) : ""}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
          {notes.map((note) => (
            <Note key={note}>{note}</Note>
          ))}
        </>
      )}
    </Card>
  );
}

/** The ranked bars over the table: from zero, a loss to the left of it in salmon. */
function RankChart({
  col,
  rows,
  lower,
}: {
  col: Col | null;
  rows: Array<{ r: PerfRow; v: RowValues }>;
  lower: string;
}) {
  if (!col) return <Why>Sorted by name: pick a metric to rank the rows.</Why>;
  const shown = rows.filter((x) => {
    const v = x.v[col.key];
    return v !== null && v !== undefined && Number.isFinite(v);
  });
  const vals = shown.map((x) => x.v[col.key]!);
  const lo = Math.min(0, ...vals);
  const hi = Math.max(0, ...vals);
  const span = hi - lo || 1;
  const zero = (-lo / span) * 100;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="m-0 text-[15px] font-bold text-ap-ink">
        <InfoLabel
          label={`${col.label} by ${lower}${col.better === "lo" ? " · lower is better" : ""}`}
          info={{ k: col.info }}
        />
      </h3>
      {shown.length === 0 && (
        <p className="m-0 text-[13px] text-ap-muted">
          No {lower} has a figure for {col.label} in this range.
        </p>
      )}
      {shown.map((x, i) => {
        const v = x.v[col.key]!;
        const red = v < 0 && (col.key === "contrib" || col.key === "cpv");
        return (
          <div
            key={x.r.key}
            className={`grid grid-cols-[minmax(0,110px)_minmax(0,1fr)_72px] items-center gap-3 py-0.5 text-[13px] sm:grid-cols-[220px_minmax(0,1fr)_96px] ${ROW_HOVER}`}
          >
            <span className="break-words font-semibold">{x.r.name}</span>
            <span aria-hidden="true" className="relative h-3.5 rounded-full bg-ap-ground">
              <span
                className="absolute inset-y-0 rounded-full"
                style={{
                  left: `${(((Math.min(v, 0) - lo) / span) * 100).toFixed(1)}%`,
                  width: `${Math.max(0.8, (Math.abs(v) / span) * 100).toFixed(1)}%`,
                  background: v < 0 ? "#e9a48c" : RANK_SHADES[i % RANK_SHADES.length],
                }}
              />
              <span
                className="absolute -bottom-[3px] -top-[3px] w-px"
                style={{
                  left: `${zero.toFixed(1)}%`,
                  background: lo < 0 ? "#161021" : "transparent",
                }}
              />
            </span>
            <span
              className={`text-right font-bold tabular-nums ${red ? "text-ap-bad" : "text-ap-ink"}`}
            >
              {cellText(col, v)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Funnel leakage

const LEAK_GTC = "minmax(200px, 1.3fr) repeat(3, minmax(190px, 1fr)) 130px";

function Leakage({ table, a }: { table: PerfTable; a: Assumptions }) {
  const lower = table.label.toLowerCase();
  const all = table.rows.map((r) => ({ r, v: rowValues(r, a) }));
  const live = all.filter((x) => !x.r.muted);
  const rows = [...live, ...all.filter((x) => x.r.muted)];
  const avg = LEAK_STEPS.map((s) => pooledStep(live, s.key));
  const v2p = live.map((x) => x.v.v2p);
  const heads: Array<{ label: string; info?: string }> = [
    { label: table.label },
    ...LEAK_STEPS.map((s) => ({ label: s.label, info: s.info })),
    { label: "Visitor → paid", info: "traffic.visitorToPaid" },
  ];
  const notes = blankRowNotes(table.rows);
  return (
    <Card id="leakage" labelledBy="h-leak">
      <SectionHead
        id="h-leak"
        title={`Funnel leakage by ${lower}`}
        description="Each step's conversion against the average (black tick). Red values sit more than 10% below it, green more than 10% above."
      />
      {table.blocked ? (
        <Why>{table.blocked}</Why>
      ) : (
        <Wide label={`Funnel leakage by ${lower}`} min={900}>
          <div
            role="row"
            className="grid border-b border-ap-line bg-ap-ground"
            style={{ gridTemplateColumns: LEAK_GTC }}
          >
            {heads.map((h, i) => (
              <span
                key={h.label}
                role="columnheader"
                className={`px-4 py-3 text-[11px] font-bold uppercase tracking-[0.06em] text-ap-muted ${i ? "border-l border-ap-line" : ""} ${i === heads.length - 1 ? "text-right" : "text-left"}`}
              >
                <InfoLabel label={h.label} info={h.info ? { k: h.info } : undefined} />
              </span>
            ))}
          </div>
          {rows.length === 0 && (
            <p className="m-0 border-t border-ap-line px-4 py-3 text-sm text-ap-muted">
              Nothing in this range.
            </p>
          )}
          {rows.map(({ r, v }, ri) => {
            const tone = r.muted ? MUTED : rankTone(v2p, v.v2p);
            return (
              <div
                key={r.key}
                role="row"
                className="grid items-stretch border-t border-ap-line"
                style={{
                  gridTemplateColumns: LEAK_GTC,
                  background: ri % 2 ? "#fbfbfd" : "#ffffff",
                }}
              >
                <span
                  role="rowheader"
                  className={`flex flex-col justify-center px-4 py-3.5 text-[13px] font-bold ${r.muted ? "text-ap-muted" : "text-ap-ink"}`}
                >
                  {r.name}
                </span>
                {LEAK_STEPS.map((s, i) => {
                  const x = v[s.key];
                  const m = avg[i] ?? null;
                  const at = (p: number) =>
                    `${Math.min(100, Math.max(0, (p / s.scale) * 100)).toFixed(1)}%`;
                  return (
                    <span
                      key={s.key}
                      role="cell"
                      className="flex items-center gap-2 border-l border-ap-line px-4 py-3.5"
                    >
                      <span
                        aria-hidden="true"
                        className="relative h-2.5 flex-auto rounded-full bg-[#eceaf1]"
                      >
                        <span
                          className="absolute inset-y-0 left-0 rounded-full bg-[#9d8bd8]"
                          style={{ width: at(x ?? 0) }}
                        />
                        {m !== null && (
                          <span
                            className="absolute -bottom-1 -top-1 -ml-px w-0.5 rounded-sm bg-ap-ink"
                            style={{ left: at(m) }}
                          />
                        )}
                      </span>
                      <span
                        className="min-w-11 flex-none text-[13px] font-bold tabular-nums"
                        style={{ color: r.muted ? MUTED.fg : againstAverage(x, m) }}
                      >
                        {fmt("pct", x, s.digits)}
                      </span>
                    </span>
                  );
                })}
                <span
                  role="cell"
                  className="flex items-center justify-end border-l border-ap-line px-4 py-3.5 text-right text-[13px] font-bold tabular-nums"
                  style={shadeStyle(tone)}
                >
                  {fmt("pct", v.v2p, 3)}
                </span>
              </div>
            );
          })}
        </Wide>
      )}
      {!table.blocked && notes.map((note) => <Note key={note}>{note}</Note>)}
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// Buyers against curiosity clicks

const INTENT_GTC = "minmax(240px, 2.2fr) repeat(7, minmax(88px, 1fr)) 120px";

/** The keyword table's columns, as drawn. */
const INTENT_HEADS: Array<{ label: string; info?: string }> = [
  { label: "Keyword" },
  { label: "Spend", info: "traffic.rowSpend" },
  { label: "Clicks", info: "traffic.clicks" },
  { label: "CTR", info: "traffic.ctr" },
  { label: "CPC", info: "traffic.cpc" },
  { label: "Click → complete", info: "traffic.clickToComplete" },
  { label: "Click → paid", info: "traffic.clickToPaid" },
  { label: "CAC", info: "traffic.cac" },
  { label: "Buyer index", info: "traffic.buyerIndex" },
];

function Intent({ intent }: { intent: TrafficPayload["intent"] }) {
  // Keywords first: the creatives aren't tracked (21 Oct 2026 call).
  const [tab, setTab] = useState<"creative" | "keyword">("keyword");
  const rows = intent.keyword.rows;
  const idx = buyerIndex(rows);
  const of = (f: (r: IntentRow) => number | null) => rows.map(f);
  const ctr = of((r) => q(r.counts.clicks, r.counts.impressions));
  const cpc = of((r) => q(r.counts.spend, r.counts.clicks));
  const toComplete = of((r) => q(r.counts.completes, r.counts.clicks));
  const toPaid = of((r) => q(r.counts.payers, r.counts.clicks));
  const cac = of((r) => q(r.counts.spend, r.counts.payers));
  return (
    <Card id="intent" labelledBy="h-int">
      <SectionHead
        id="h-int"
        title="Buyers vs curiosity clicks"
        description="Which messages and keywords bring people who pay, not just people who click. Buyer index: click-to-paid against the average (1.0)."
        align="end"
        right={
          <Pills
            label="Show"
            value={tab}
            onChange={setTab}
            options={[
              { value: "creative", label: "Creatives & messages" },
              { value: "keyword", label: "Keywords" },
            ]}
          />
        }
      />
      {tab === "creative" ? (
        <Why>{intent.creative.blocked}</Why>
      ) : (
        <>
          {intent.keyword.why && rows.length > 0 && <Note>{intent.keyword.why}</Note>}
          {rows.length === 0 ? (
            <Why>{intent.keyword.why ?? "No keyword had clicks or finishers in this range."}</Why>
          ) : (
            <Wide label="Buyers vs curiosity by keyword" min={1040}>
              <div
                role="row"
                className="grid bg-ap-ground"
                style={{ gridTemplateColumns: INTENT_GTC }}
              >
                {INTENT_HEADS.map((h, i) => (
                  <span
                    key={h.label}
                    role="columnheader"
                    className={`px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-ap-muted ${i && i < 8 ? "text-right" : "text-left"}`}
                  >
                    <InfoLabel label={h.label} info={h.info ? { k: h.info } : undefined} />
                  </span>
                ))}
              </div>
              {rows.map((r, i) => {
                const x = idx[i] ?? null;
                const pill =
                  x === null
                    ? null
                    : x >= 1.3
                      ? { word: "Buyers", ...GOOD, bg: "#2e7d5b1a" }
                      : x <= 0.6
                        ? { word: "Curiosity", ...BAD, bg: "#d6320014" }
                        : { word: "Mixed", bg: "#f5f6f8", fg: "#3f3a4d" };
                return (
                  <div
                    key={`${r.sub}|${r.name}|${i}`}
                    role="row"
                    className="grid items-stretch border-t border-ap-line"
                    style={{ gridTemplateColumns: INTENT_GTC }}
                  >
                    <Cell header left bold text={r.name} sub={r.sub} />
                    <Cell text={fmt("eur", r.counts.spend, 0)} />
                    <Cell text={fmt("count", r.counts.clicks)} />
                    <Cell text={fmt("pct", ctr[i] ?? null, 1)} shade={band(ctr, ctr[i] ?? null)} />
                    <Cell
                      text={fmt("eur", cpc[i] ?? null, 2)}
                      shade={band(cpc, cpc[i] ?? null, true)}
                    />
                    <Cell
                      text={fmt("pct", toComplete[i] ?? null, 1)}
                      shade={band(toComplete, toComplete[i] ?? null)}
                    />
                    <Cell
                      text={fmt("pct", toPaid[i] ?? null, 2)}
                      shade={band(toPaid, toPaid[i] ?? null)}
                    />
                    <Cell
                      text={fmt("eur", cac[i] ?? null, 0)}
                      shade={band(cac, cac[i] ?? null, true)}
                    />
                    <span role="cell" className="flex items-center px-3 py-2.5 text-[13px]">
                      {pill && x !== null ? (
                        <span
                          className="whitespace-nowrap rounded-full px-2.5 py-[3px] text-xs font-bold"
                          style={{ background: pill.bg, color: pill.fg }}
                        >
                          {x.toFixed(1)} · {pill.word}
                        </span>
                      ) : (
                        EMPTY
                      )}
                    </span>
                  </div>
                );
              })}
            </Wide>
          )}
          {rows.length > 0 && rows.every((r) => r.counts.payers === 0) && (
            <Note>No purchase came through a keyword in this range, so no buyer index.</Note>
          )}
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// Ads as searchers see them

/** How many ads show before "Show all". */
const ADS_SHOWN = 4;

const ADS_HEADS: Array<{ label: string; info?: string }> = [
  { label: "Keyword" },
  { label: "Spend", info: "traffic.rowSpend" },
  { label: "Cost / survey", info: "traffic.costPerComplete" },
  { label: "Payment CVR", info: "traffic.purchaseCvr" },
  { label: "Rev. / survey", info: "traffic.revPerUser" },
];
const ADS_GTC = "minmax(150px, 1.6fr) repeat(4, minmax(84px, 1fr))";

/** One ad (the same headlines, descriptions and address) and the keywords it was shown for. */
interface AdGroupView {
  ad: AdSeenRow["ad"];
  rows: AdSeenRow[];
  spend: number;
}

/**
 * Marcus, 15 Oct: the ads as a searcher sees them on Google, with what each keyword's clicks
 * brought: cost per finished survey, the share of finishers who paid and revenue per finished
 * survey (the Performance table's own figures for the keyword). One card per ad, by ad spend:
 * keywords that share an ad group share its ad.
 */
function AdsSeen({ ads }: { ads: TrafficPayload["adsSeen"] }) {
  const [all, setAll] = useState(false);
  const byAd = new Map<string, AdGroupView>();
  for (const r of ads.rows) {
    const key = JSON.stringify(r.ad);
    const g = byAd.get(key) ?? { ad: r.ad, rows: [], spend: 0 };
    g.rows.push(r);
    g.spend += r.counts.spend ?? 0;
    byAd.set(key, g);
  }
  const groups = [...byAd.values()].sort((a, b) => b.spend - a.spend);
  // Green and red over every keyword shown, as the other keyword tables colour.
  const of = (f: (r: AdSeenRow) => number | null) => ads.rows.map(f);
  const cost = of((r) => q(r.counts.spend, r.counts.completes));
  const paid = of((r) => q(r.counts.payers, r.counts.completes));
  const rev = of((r) => q(r.counts.revenue, r.counts.completes));
  const shown = all ? groups : groups.slice(0, ADS_SHOWN);
  return (
    <Card id="ads-seen" labelledBy="h-ads-seen">
      <SectionHead
        id="h-ads-seen"
        title="Ads as searchers see them"
        description="Each search ad as Google shows it, with the keywords it was shown for and what their clicks brought, by ad spend. Google mixes an ad's headlines, so this is one of the combinations it shows: the headlines in their slots, pinned ones in place."
      />
      {groups.length === 0 ? (
        <Why>{ads.why ?? "No keyword with a search ad had clicks or finishers in this range."}</Why>
      ) : (
        <>
          {shown.map((g, n) => (
            <article
              key={JSON.stringify(g.ad)}
              aria-label={`Ad ${n + 1}: ${g.ad.headlines.join(" | ")}`}
              className="flex flex-col gap-3 rounded-[14px] border border-ap-line p-4"
            >
              {/* As Google lays a search ad out: Sponsored, the address, the blue headline. */}
              <div className="flex max-w-[640px] flex-col gap-1 rounded-[10px] bg-white p-3 shadow-[0_1px_4px_rgba(32,33,36,0.2)]">
                <span className="text-[12px] font-bold text-[#202124]">Sponsored</span>
                <span className="break-all text-[12px] text-[#4d5156]">{g.ad.display}</span>
                <span className="text-[17px] leading-snug text-[#1a0dab]">
                  {g.ad.headlines.join(" | ")}
                </span>
                {g.ad.descriptions.length > 0 && (
                  <span className="text-[13px] leading-snug text-[#4d5156]">
                    {g.ad.descriptions.join(" ")}
                  </span>
                )}
              </div>
              <Wide label={`Keywords for ad ${n + 1}`} min={560}>
                <div
                  role="row"
                  className="grid bg-ap-ground"
                  style={{ gridTemplateColumns: ADS_GTC }}
                >
                  {ADS_HEADS.map((h, i) => (
                    <span
                      key={h.label}
                      role="columnheader"
                      className={`px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-ap-muted ${i ? "text-right" : "text-left"}`}
                    >
                      <InfoLabel label={h.label} info={h.info ? { k: h.info } : undefined} />
                    </span>
                  ))}
                </div>
                {g.rows.map((r) => {
                  const i = ads.rows.indexOf(r);
                  return (
                    <div
                      key={r.key}
                      role="row"
                      className="grid items-stretch border-t border-ap-line"
                      style={{ gridTemplateColumns: ADS_GTC }}
                    >
                      <Cell header left bold text={r.keyword} sub={r.campaign} />
                      <Cell text={fmt("eur", r.counts.spend, 0)} />
                      <Cell
                        text={fmt("eur", cost[i] ?? null, 2)}
                        shade={band(cost, cost[i] ?? null, true)}
                      />
                      <Cell
                        text={fmt("pct", paid[i] ?? null, 2)}
                        shade={band(paid, paid[i] ?? null)}
                      />
                      <Cell
                        text={fmt("eur", rev[i] ?? null, 2)}
                        shade={band(rev, rev[i] ?? null)}
                      />
                    </div>
                  );
                })}
              </Wide>
            </article>
          ))}
          {groups.length > ADS_SHOWN && (
            <button
              type="button"
              onClick={() => setAll(!all)}
              className="self-start rounded-full border border-ap-line bg-white px-4 py-2 text-[13px] font-bold text-ap-ink"
            >
              {all ? "Show fewer" : `Show all ${groups.length} ads`}
            </button>
          )}
          <Note>
            Green and red: the top and the bottom third of the range on that figure, across every
            keyword here, those under hidden ads too. A keyword counts the finishers whose ad click
            carried it, as the Performance table&apos;s keyword rows do; its spend is Google
            Ads&apos; own.
          </Note>
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// Cohorts by acquisition source

const COH_HEADS: Array<{ label: string; info?: string }> = [
  { label: "Acquisition source" },
  { label: "Rev. / user day 0", info: "traffic.cohortDay0" },
  { label: "Day 7", info: "traffic.cohortDay7" },
  { label: "Day 30", info: "traffic.cohortDay30" },
  { label: "Day 90", info: "traffic.cohortDay90" },
  { label: "Day 90 ÷ day 0", info: "traffic.cohortGrowth" },
  { label: "Repeat assessment", info: "traffic.repeat" },
  { label: "Cross-sell rate", info: "traffic.crossSell" },
  { label: "Refund rate", info: "traffic.cohortRefund" },
];
// As the experiments' columns: room for each heading with its icon ("Repeat assessment").
const COH_GTC = [
  "minmax(180px, 1.6fr)",
  ...COH_HEADS.slice(1).map((h) => `minmax(${Math.max(90, headWidth(h.label, 2))}px, 1fr)`),
].join(" ");

function Cohorts({ cohorts }: { cohorts: TrafficPayload["cohorts"] }) {
  const rows = cohorts.rows;
  const of = (f: (r: CohortRow) => number | null) => rows.map(f);
  const growth = of((r) => r.growth);
  const repeat = of((r) => r.repeat);
  const cross = of((r) => r.crossSell);
  return (
    <Card id="cohorts" labelledBy="h-coh">
      <SectionHead
        id="h-coh"
        title="Cohorts by acquisition source"
        description="Cumulative revenue per acquired user after their first finished survey, plus repeat purchases, cross-sells and refunds. Shows which sources keep paying after day 0."
      />
      {cohorts.why ? (
        <Why>{cohorts.why}</Why>
      ) : rows.length === 0 ? (
        <Why>No new users in this range.</Why>
      ) : (
        <Wide label="Cohorts by acquisition source" min={980}>
          <HeadRow gtc={COH_GTC} labels={COH_HEADS} />
          {rows.map((r) => (
            <div
              key={r.source}
              role="row"
              className="grid border-t border-ap-line"
              style={{ gridTemplateColumns: COH_GTC }}
            >
              <Cell header left bold pad="py-[9px]" text={r.source} />
              {r.rev.map((v, j) => (
                <Cell
                  key={j}
                  pad="py-[9px]"
                  bold={j === 3}
                  text={fmt("eur", v, 2)}
                  // How many people the column counts: those that many days on.
                  sub={people(r.eligible[j] ?? 0)}
                  shade={band(
                    of((x) => x.rev[j] ?? null),
                    v
                  )}
                />
              ))}
              <Cell pad="py-[9px]" text={times(r.growth)} shade={band(growth, r.growth)} />
              <Cell pad="py-[9px]" text={fmt("pct", r.repeat, 1)} shade={band(repeat, r.repeat)} />
              <Cell
                pad="py-[9px]"
                text={fmt("pct", r.crossSell, 1)}
                shade={band(cross, r.crossSell)}
              />
              <Cell pad="py-[9px]" text={fmt("pct", r.refund, 1)} />
            </div>
          ))}
        </Wide>
      )}
      <Note>{cohorts.note}</Note>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// Experiments

const EXP_HEADS: Array<{ label: string; info?: string }> = [
  { label: "Test" },
  { label: "Arm" },
  { label: "Visitors", info: "traffic.expVisitors" },
  { label: "Start CVR", info: "traffic.expStartCvr" },
  { label: "Submissions", info: "traffic.expSubmissions" },
  { label: "Payment CVR", info: "traffic.expPaymentCvr" },
  { label: "Rev. / submission", info: "traffic.expRevPerSub" },
  { label: "Rev. / visitor", info: "traffic.expRevPerVisitor" },
  { label: "Lift vs control", info: "traffic.lift" },
  { label: "Chance to beat", info: "traffic.chance" },
  { label: "Confidence", info: "traffic.confidence" },
];
// Each figure column wide enough for its heading with its info icon (two buttons' room), so the
// icon never slides under the next heading; the test and arm keep the design's widths.
const EXP_GTC = [
  "minmax(190px, 1.7fr)",
  "minmax(130px, 1.2fr)",
  ...EXP_HEADS.slice(2).map((h) => `minmax(${Math.max(86, headWidth(h.label, 2))}px, 1fr)`),
].join(" ");

function Experiments({ experiments }: { experiments: TrafficPayload["experiments"] }) {
  const arms = experiments.arms;
  return (
    <Card id="experiments" labelledBy="h-exp">
      <SectionHead
        id="h-exp"
        title="Experiments"
        description="Each arm against its control on the test's primary metric. Confidence is 1 − p from a two-sided test of the two proportions; 95% or more counts as a credible result."
      />
      {arms.length === 0 ? (
        <Why>{experiments.why ?? "No test ran in this range."}</Why>
      ) : (
        <Wide label="Experiments" min={1260}>
          <div role="row" className="grid bg-ap-ground" style={{ gridTemplateColumns: EXP_GTC }}>
            {EXP_HEADS.map((h, i) => (
              <span
                key={h.label}
                role="columnheader"
                className={`text-balance px-3 py-2.5 text-[11px] font-bold uppercase leading-[1.3] tracking-[0.06em] text-ap-muted ${i > 1 ? "text-right" : "text-left"}`}
              >
                <InfoLabel label={h.label} info={h.info ? { k: h.info } : undefined} />
              </span>
            ))}
          </div>
          {arms.map((x, i) => {
            const first = i === 0 || arms[i - 1]!.test !== x.test;
            const conf = x.confidence;
            return (
              <div
                key={`${x.test}|${x.arm}`}
                role="row"
                className={`grid items-stretch border-t border-ap-line ${first ? "" : "border-dashed"}`}
                style={{ gridTemplateColumns: EXP_GTC }}
              >
                <Cell left bold text={first ? x.test : ""} sub={first ? x.note : null} />
                <span
                  role="rowheader"
                  className="flex flex-col justify-center gap-px px-3 py-2.5 text-left text-[13px] font-semibold text-ap-ink"
                >
                  {x.arm}
                  {x.control && (
                    <span className="text-[11px] font-medium text-ap-muted">Control</span>
                  )}
                </span>
                <Cell text={fmt("count", x.visitors)} />
                <Cell text={fmt("pct", x.startCvr, 1)} />
                <Cell text={fmt("count", x.submissions)} />
                <Cell text={fmt("pct", x.paymentCvr, 2)} />
                <Cell text={fmt("eur", x.revPerSub, 2)} />
                <Cell text={fmt("eur", x.revPerVisitor, 4)} />
                <Cell
                  bold
                  text={
                    x.lift === null
                      ? EMPTY
                      : `${x.lift >= 0 ? "+" : "−"}${Math.abs(x.lift * 100).toFixed(1)}%`
                  }
                  sub={x.lift === null ? null : x.metric}
                  shade={x.lift === null ? PLAIN : x.lift > 0 ? GOOD : BAD}
                />
                <Cell text={x.chance === null ? EMPTY : `${(x.chance * 100).toFixed(0)}%`} />
                <Cell
                  bold
                  text={conf === null ? EMPTY : `${(conf * 100).toFixed(0)}%`}
                  sub={conf === null ? x.why : conf >= 0.95 ? "credible" : "not yet"}
                  shade={conf === null ? PLAIN : conf >= 0.95 ? GOOD : conf >= 0.8 ? PLAIN : BAD}
                />
              </div>
            );
          })}
        </Wide>
      )}
      <Note>{experiments.note}</Note>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// Audience by source

/** The dimensions, as drawn; `info` is the card of each one's shares. */
const AUDIENCE_GROUPS: Array<{
  label: string;
  dims: Array<{ value: string; label: string; info: string }>;
}> = [
  {
    label: "From visits",
    dims: [
      { value: "country", label: "Country", info: "traffic.audCountry" },
      { value: "device", label: "Device", info: "traffic.audDevice" },
      { value: "visitor", label: "New vs returning", info: "traffic.audVisitor" },
      { value: "daypart", label: "Time of day", info: "traffic.audDaypart" },
    ],
  },
  {
    label: "From the survey",
    dims: [
      { value: "gender", label: "Gender", info: "traffic.audGender" },
      { value: "age", label: "Age", info: "traffic.audAge" },
      { value: "relationship", label: "Relationship", info: "traffic.audRelationship" },
      { value: "archetype", label: "Archetype", info: "traffic.audArchetype" },
    ],
  },
];
const SHARE_INFO = new Map(AUDIENCE_GROUPS.flatMap((g) => g.dims.map((d) => [d.value, d.info])));
/** The by-source matrix's card: shares of each source's visits, or of its finishers. */
const BY_SOURCE: Record<AudienceDim["kind"], { info: string }> = {
  visit: { info: "traffic.audVisitsBySource" },
  survey: { info: "traffic.audFinishersBySource" },
};

const DIM_SHADES = [...RANK_SHADES, "#ddd5f2"];

function Audience({ dims }: { dims: AudienceDim[] }) {
  const [key, setKey] = useState("gender");
  const d = dims.find((x) => x.key === key) ?? null;
  return (
    <Card id="audience" labelledBy="h-aud">
      <SectionHead
        id="h-aud"
        title="Audience by source"
        description="Who each source brings. Visit data comes from the visits PostHog recorded (it sees nearly every Google Ads visit, far fewer of the rest), scaled to each source's visitors; survey data comes from the answers of people who completed it."
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {AUDIENCE_GROUPS.map((g) => (
          <div key={g.label} className="flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5">
              <Eyebrow>{g.label}</Eyebrow>
            </span>
            <Pills label={g.label} tight value={key} onChange={setKey} options={g.dims} />
          </div>
        ))}
      </div>
      {!d ? (
        <Why>Not counted for this range.</Why>
      ) : d.blocked ? (
        <Why>{d.blocked}</Why>
      ) : (
        <AudienceDetail d={d} />
      )}
    </Card>
  );
}

function AudienceDetail({ d }: { d: AudienceDim }) {
  const share = SHARE_INFO.get(d.key);
  const bySourceInfo = BY_SOURCE[d.kind].info;
  const max = Math.max(0, ...d.values.map((v) => v.share)) || 1;
  // Each source's column as wide as its heading and info icon need, so the icon stays its own.
  const mxCols = `minmax(150px, 1.6fr) ${d.bySource
    .map((s) => `minmax(${Math.max(84, headWidth(s.source, 1))}px, 1fr)`)
    .join(" ")}`;
  const perfCols = "minmax(180px, 2fr) repeat(5, minmax(100px, 1fr))";
  const complete = d.perf.map((p) => p.completeRate);
  const pre = d.perf.map((p) => p.preRate);
  const full = d.perf.map((p) => p.fullRate);
  const read = d.perf.map((p) => p.readMs);
  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex min-w-0 max-w-[640px] flex-col gap-2.5">
          <div className="flex flex-col gap-1">
            <h3 className="m-0 text-[15px] font-bold text-ap-ink">
              <InfoLabel
                label={`${d.title} · all sources`}
                info={share ? { k: share } : undefined}
              />
            </h3>
            <span className="text-[13px] text-ap-muted">{d.base}</span>
          </div>
          {d.values.map((v, i) => (
            <div
              key={v.label}
              className={`grid items-center gap-2.5 py-0.5 text-[13px] ${ROW_HOVER}`}
              style={{ gridTemplateColumns: "150px minmax(0, 1fr) 52px" }}
            >
              <span className="font-semibold leading-[1.3]">{v.label}</span>
              <Bar
                pct={v.share / max}
                color={DIM_SHADES[i % DIM_SHADES.length]}
                height={14}
                track="#f5f6f8"
              />
              <span className="text-right font-bold tabular-nums">{fmt("pct", v.share, 1)}</span>
            </div>
          ))}
        </div>

        <div className="flex min-w-0 flex-col gap-2.5 border-t border-ap-line pt-4">
          <div className="flex flex-col gap-1">
            <h3 className="m-0 text-[15px] font-bold text-ap-ink">{d.title} by source</h3>
            <span className="text-[13px] text-ap-muted">
              Share of each source&apos;s people. Green: over-represented against all sources, red:
              under-represented.
            </span>
          </div>
          <Wide label={`${d.title} by source`} min={680}>
            <div role="row" className="grid bg-ap-ground" style={{ gridTemplateColumns: mxCols }}>
              <span
                role="columnheader"
                className="px-3 py-2.5 text-left text-[11px] font-bold uppercase leading-[1.3] tracking-[0.06em] text-ap-muted"
              >
                {d.title}
              </span>
              {d.bySource.map((s) => (
                <span
                  key={s.source}
                  role="columnheader"
                  className="flex flex-col px-3 py-2.5 text-right text-[11px] font-bold uppercase leading-[1.3] tracking-[0.06em] text-ap-muted"
                >
                  <span>
                    <InfoLabel label={s.source} info={{ k: bySourceInfo }} />
                  </span>
                  <span className="font-semibold normal-case tracking-normal">
                    {fmt("count", s.n)} {d.kind === "visit" ? "visits" : "finishers"}
                  </span>
                </span>
              ))}
            </div>
            {d.values.map((v, i) => (
              <div
                key={v.label}
                role="row"
                className="grid border-t border-ap-line"
                style={{ gridTemplateColumns: mxCols }}
              >
                <Cell header left pad="py-[9px]" text={v.label} shade={PLAIN} />
                {d.bySource.map((s) => {
                  const share = s.shares[i] ?? null;
                  const r = share === null ? null : v.share ? share / v.share : 1;
                  return (
                    <Cell
                      key={s.source}
                      pad="py-[9px]"
                      text={fmt("pct", share, 1)}
                      shade={r === null ? PLAIN : r >= 1.2 ? GOOD : r <= 0.8 ? BAD : PLAIN}
                    />
                  );
                })}
              </div>
            ))}
          </Wide>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 border-t border-ap-line pt-4">
        <div className="flex flex-col gap-1">
          <h3 className="m-0 text-[15px] font-bold text-ap-ink">
            How each {d.title.toLowerCase()} group performs
          </h3>
          <span className="text-[13px] text-ap-muted">
            Across all sources: does the group finish the survey, unlock and read?
          </span>
        </div>
        <Wide label={`How each ${d.title.toLowerCase()} group performs`} min={760}>
          <HeadRow
            gtc={perfCols}
            labels={[
              { label: "Group" },
              { label: "Share", info: share },
              { label: "Complete rate", info: "traffic.audCompleteRate" },
              { label: "Pre-unlock rate", info: "traffic.preRate" },
              { label: "Full unlock rate", info: "traffic.fullRate" },
              { label: "Median read", info: "traffic.medianRead" },
            ]}
          />
          {d.perf.map((p) => (
            <div
              key={p.label}
              role="row"
              className="grid border-t border-ap-line"
              style={{ gridTemplateColumns: perfCols }}
            >
              <Cell header left pad="py-[9px]" text={p.label} />
              <Cell pad="py-[9px]" text={fmt("pct", p.share, 1)} />
              <Cell
                pad="py-[9px]"
                text={fmt("pct", p.completeRate, 1)}
                shade={band(complete, p.completeRate)}
              />
              <Cell pad="py-[9px]" text={fmt("pct", p.preRate, 1)} shade={band(pre, p.preRate)} />
              <Cell
                pad="py-[9px]"
                text={fmt("pct", p.fullRate, 1)}
                shade={band(full, p.fullRate)}
              />
              <Cell pad="py-[9px]" text={fmt("mmss", p.readMs)} shade={band(read, p.readMs)} />
            </div>
          ))}
        </Wide>
        {d.perfNote && <Note>{d.perfNote}</Note>}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Cost vs quality

/**
 * Where a bubble's name may sit, by its radius: right of it, left, above, over its top right
 * and top left corners, below, under its corners.
 */
const NAME_SIDES = (r: number) => [
  `translate(${r + 6}px, 50%)`,
  `translate(calc(-100% - ${r + 6}px), 50%)`,
  `translate(-50%, -${r + 4}px)`,
  `translate(${r * 0.7 + 2}px, -${r * 0.7 + 2}px)`,
  `translate(calc(-100% - ${r * 0.7 + 2}px), -${r * 0.7 + 2}px)`,
  `translate(-50%, calc(100% + ${r + 4}px))`,
  `translate(${r * 0.7 + 2}px, calc(100% + ${r * 0.7 + 2}px))`,
  `translate(calc(-100% - ${r * 0.7 + 2}px), calc(100% + ${r * 0.7 + 2}px))`,
];

/**
 * Keeps the scatter's words apart once drawn. A corner's word gives way to a bubble on it.
 * Each bubble's name takes the first side clear of the plot's edge, the corners, the names
 * before it and the other bubbles; failing that, the first clear of all but the corners,
 * whose words then give way (the campaigns before the decoration); failing that, it hides
 * (the card and the list under the chart still name it). An equal-CAC label takes the first
 * of its spots clear of everything, or hides.
 */
function declutter(plot: HTMLElement) {
  const box = plot.getBoundingClientRect();
  const all = (k: string) => [...plot.querySelectorAll<HTMLElement>(`[data-ap-label="${k}"]`)];
  const drawn = (el: HTMLElement) => el.getClientRects().length > 0;
  const touch = (a: DOMRect, b: DOMRect, pad = 3) =>
    a.left < b.right + pad &&
    b.left < a.right + pad &&
    a.top < b.bottom + pad &&
    b.top < a.bottom + pad;
  const inside = (r: DOMRect) =>
    r.left >= box.left - 1 &&
    r.right <= box.right + 1 &&
    r.top >= box.top - 1 &&
    r.bottom <= box.bottom + 1;
  const bubbles = [...plot.querySelectorAll<HTMLElement>("[data-ap-bubble]")].map((b) =>
    b.getBoundingClientRect()
  );
  const corners = all("corner").map((el) => ({ el, r: el.getBoundingClientRect(), on: true }));
  for (const c of corners) c.on = !bubbles.some((b) => touch(c.r, b, 0));
  const names: DOMRect[] = [];
  const clear = (r: DOMRect, others: DOMRect[], withCorners: boolean) =>
    inside(r) &&
    !names.some((p) => touch(r, p)) &&
    !others.some((b) => touch(r, b, 0)) &&
    !(withCorners && corners.some((c) => c.on && touch(r, c.r)));
  for (const el of all("name")) {
    if (!drawn(el)) continue;
    const own = Number(el.dataset.bubble);
    const others = bubbles.filter((_, i) => i !== own);
    const sides = NAME_SIDES(Number(el.dataset.r));
    let at: DOMRect | null = null;
    for (const withCorners of [true, false]) {
      for (const side of sides) {
        el.style.transform = side;
        const r = el.getBoundingClientRect();
        if (clear(r, others, withCorners)) {
          at = r;
          break;
        }
      }
      if (at) break;
    }
    el.style.visibility = at ? "" : "hidden";
    if (!at) continue;
    names.push(at);
    for (const c of corners) if (c.on && touch(at, c.r)) c.on = false;
  }
  for (const c of corners) c.el.style.visibility = c.on ? "" : "hidden";
  const words = [...names, ...corners.filter((c) => c.on).map((c) => c.r)];
  for (const el of all("iso")) {
    const spots = JSON.parse(el.dataset.spots ?? "[]") as Array<[number, number]>;
    let at: DOMRect | null = null;
    for (const [x, y] of spots) {
      el.style.left = `${x.toFixed(1)}%`;
      el.style.bottom = `${y.toFixed(1)}%`;
      const r = el.getBoundingClientRect();
      if (inside(r) && !words.some((p) => touch(r, p)) && !bubbles.some((b) => touch(r, b, 0))) {
        at = r;
        break;
      }
    }
    el.style.visibility = at ? "" : "hidden";
    if (at) words.push(at);
  }
}

function Quality({ quality }: { quality: TrafficPayload["quality"] }) {
  const s = scatter(quality.dots);
  const nobodyPaid = s.dots.every((p) => p.d.payers === 0);
  const corner = "absolute max-w-[45%] text-[11px] font-bold uppercase tracking-[0.08em]";
  const plot = useRef<HTMLDivElement>(null);
  // After every draw, and whenever the plot's size changes.
  useLayoutEffect(() => {
    const el = plot.current;
    if (!el) return;
    declutter(el);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => declutter(el));
    ro.observe(el);
    return () => ro.disconnect();
  });
  return (
    <Card id="quality" labelledBy="h-q">
      <SectionHead
        id="h-q"
        title="Cost vs quality"
        description="Paid campaigns by cost per click and click-to-paid conversion. Cheap clicks only pay off when they convert; the curves show equal CAC."
      />
      {s.dots.length === 0 ? (
        <Why>{quality.why ?? "No campaign had clicks in this range."}</Why>
      ) : (
        <div className="flex min-w-0 flex-col gap-1.5">
          <div
            ref={plot}
            className="relative ml-11 h-[340px] border-b border-l border-ap-line"
            style={{ background: "linear-gradient(to right, transparent 50%, #f5f6f8 50%)" }}
          >
            <div aria-hidden="true" className="absolute inset-0">
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 h-full w-full"
              >
                {s.iso.map((c) => (
                  <polyline
                    key={c.cac}
                    points={c.pts}
                    fill="none"
                    stroke="#c0b4e6"
                    strokeWidth={1.2}
                    strokeDasharray="4 4"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>
              {s.iso.map((c) => (
                <span
                  key={c.cac}
                  data-ap-label="iso"
                  data-spots={JSON.stringify(c.spots)}
                  className="absolute whitespace-nowrap text-[11px] font-bold text-ap-plum"
                  style={{ left: `${c.lx.toFixed(1)}%`, bottom: `${c.ly.toFixed(1)}%` }}
                >
                  CAC {fmt("eur", c.cac)}
                </span>
              ))}
              <span data-ap-label="corner" className={`${corner} left-2 top-1.5 text-ap-good`}>
                Cheap &amp; converting
              </span>
              <span
                data-ap-label="corner"
                className={`${corner} right-2 top-1.5 text-right text-ap-muted`}
              >
                Expensive &amp; converting
              </span>
              <span data-ap-label="corner" className={`${corner} bottom-1.5 left-2 text-ap-muted`}>
                Cheap curiosity
              </span>
              <span
                data-ap-label="corner"
                className={`${corner} bottom-1.5 right-2 text-right text-ap-bad`}
              >
                Expensive &amp; weak
              </span>
              {s.dots.map((p, i) => {
                // Right of the bubble, as drawn, until declutter finds it a clear side. A phone
                // names the bubbles in the list under the chart.
                return (
                  <Fragment key={`${p.name}-${i}`}>
                    <span
                      data-ap-bubble=""
                      className="absolute rounded-full opacity-90 shadow-[0_0_0_2px_#ffffff]"
                      style={{
                        left: `${p.x.toFixed(1)}%`,
                        bottom: `${p.y.toFixed(1)}%`,
                        width: p.size,
                        height: p.size,
                        transform: "translate(-50%, 50%)",
                        background: p.color,
                      }}
                    />
                    <span
                      data-ap-label="name"
                      data-bubble={i}
                      data-r={p.size / 2}
                      className="absolute whitespace-nowrap text-xs font-bold max-sm:hidden"
                      style={{
                        left: `${p.x.toFixed(1)}%`,
                        bottom: `${p.y.toFixed(1)}%`,
                        transform: NAME_SIDES(p.size / 2)[0],
                      }}
                    >
                      {p.name}
                    </span>
                  </Fragment>
                );
              })}
              {s.yTicks.map((t) => (
                <span
                  key={t}
                  className="absolute -left-11 w-[38px] translate-y-1/2 text-right text-[11px] text-ap-muted"
                  style={{ bottom: `${s.yMax ? ((t / s.yMax) * 100).toFixed(1) : 0}%` }}
                >
                  {t.toFixed(3)}%
                </span>
              ))}
            </div>
            <PointHover
              label="Cost vs quality"
              points={s.dots.map((p) => ({ x: p.x, y: p.y, size: p.size }))}
              tip={(i) => {
                const p = s.dots[i]!;
                return {
                  title: p.name,
                  rows: [
                    {
                      label: "Cost per click",
                      value: fmt("eur", p.d.cpc, 2),
                      color: p.color,
                      mark: "dot",
                    },
                    { label: "Click → paid", value: fmt("pct", p.d.clickToPaid, 3) },
                    { label: "Clicks", value: fmt("count", p.d.clicks) },
                    { label: "Buyers", value: fmt("count", p.d.payers) },
                    { label: "Spend", value: fmt("eur", p.d.spend) },
                    {
                      label: "CAC",
                      value: p.d.payers ? fmt("eur", p.d.spend / p.d.payers) : EMPTY,
                      muted: !p.d.payers,
                    },
                  ],
                  note: p.d.payers
                    ? null
                    : "No purchase from this campaign's clicks in this range.",
                };
              }}
            />
          </div>
          <div aria-hidden="true" className="relative ml-11 h-[18px]">
            {s.xTicks.map((t) => (
              // Readable where a bubble on the bottom line reaches over it.
              <span
                key={t}
                className="absolute -translate-x-1/2 rounded bg-white/90 px-1 text-[11px] text-ap-muted"
                style={{ left: `${((t / s.xMax) * 100).toFixed(1)}%` }}
              >
                {fmt("eur", t, 2)}
              </span>
            ))}
          </div>
          <div className="ml-11 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-ap-muted">
            <span>
              <InfoLabel label="Click → paid conversion" info={{ k: "traffic.qualityY" }} />{" "}
              (vertical) · bubble size ={" "}
              <InfoLabel label="spend" info={{ k: "traffic.rowSpend" }} />
            </span>
            <span>
              <InfoLabel label="Cost per click" info={{ k: "traffic.qualityX" }} /> →
            </span>
          </div>
          {/* The campaigns in words: on a phone in place of the names by the bubbles, for a
              screen reader at every width. */}
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-xs text-ap-body sm:sr-only">
            {s.dots.map((p, i) => (
              <li key={`${p.name}-${i}`} className="flex items-baseline gap-1.5">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 self-center rounded-full"
                  style={{ background: p.color }}
                />
                <span>
                  <strong className="text-ap-ink">{p.name}</strong>: {fmt("eur", p.d.cpc, 2)} per
                  click, {fmt("pct", p.d.clickToPaid, 3)} click to paid, {fmt("eur", p.d.spend)}{" "}
                  spend
                </span>
              </li>
            ))}
          </ul>
          {nobodyPaid && (
            <Note>
              No purchases from these campaigns in this range yet, so every campaign sits on the
              bottom line.
            </Note>
          )}
          {/* Under a filter the ads can't follow, the campaigns' cost is all traffic's. */}
          {quality.why && <Note>{quality.why}</Note>}
          {quality.note && <Note>{quality.note}</Note>}
        </div>
      )}
    </Card>
  );
}
