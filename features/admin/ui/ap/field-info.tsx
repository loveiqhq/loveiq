"use client";

/**
 * Marcus's field info card (board "Field info cards", 21 Oct 2026): a small "i" beside every
 * figure's label, chart title and column heading. Hovering it gives one line; a click (or Enter)
 * opens the card: what the figure means, how it is counted, its formula with this range's
 * numbers, its last 12 weeks, what to watch out for, the query behind it and the tables it
 * reads. One card for the whole page, a native modal dialog: Escape and the dimmed backdrop
 * close it, and focus goes back to the icon.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { SourceKey } from "@features/admin/server/ap/catalog";
import { addDays } from "@features/admin/server/ap/days";
import { filterParams, grainOf, rangeLabel, trendBuckets } from "@features/admin/server/ap/filters";
import { fmt, type Unit } from "@features/admin/server/ap/format";

import { FIELDS } from "./fields";
import {
  DEFINITIONS_OWNER,
  DEFINITIONS_WRITTEN,
  SOURCE_OWNER,
  SOURCE_PATH,
  type FieldDef,
} from "./fields/types";
import { useApStatus } from "./status";
import { useApFilters } from "./useApFilters";

/** This range's figures, as the page shows them: "502 ÷ 12,608 = 3.98%". */
export interface Worked {
  num?: string;
  den?: string;
  value: string;
  /** The days they cover when not the range's own (a chart's weekly window). */
  span?: { from: string; to: string };
}

/** Where the card finds the figure's last 12 weeks: a headline tile of a page's API. */
export interface TrendSource {
  route: string;
  tile: string;
  unit: Unit;
  /** The tile's own decimals and suffix ("0.00×"), so the card reads the figure as the tile does. */
  digits?: number;
  suffix?: string;
}

interface Open {
  k: string;
  label: string;
  worked?: Worked;
  trend?: TrendSource;
  from: HTMLElement | null;
}

const Ctx = createContext<((o: Open) => void) | null>(null);

function firstSentence(s: string): string {
  const m = /^.*?[.!?](\s|$)/.exec(s);
  return (m ? m[0] : s).trim();
}

/** The design's "i": a 12px ring in a 24px target. */
function Glyph() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" strokeWidth="1.1" />
      <path d="M8 7.3v3.9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="8" cy="5" r="0.8" fill="currentColor" />
    </svg>
  );
}

/**
 * The info icon. `k` names the field in the registry; `label` is the page's own words, used when
 * the registry has none. `worked` fills the card's "This period" line and result preview;
 * `trend` lets it fetch the last 12 weeks.
 */
export function Info({
  k,
  label,
  worked,
  trend,
}: {
  k: string;
  label?: string;
  worked?: Worked;
  trend?: TrendSource;
}) {
  const open = useContext(Ctx);
  const ref = useRef<HTMLButtonElement>(null);
  const def = FIELDS[k];
  // The page's own words name the card; the registry's label only where the page gives none.
  const name = label ?? def?.label ?? k;
  return (
    <button
      ref={ref}
      type="button"
      aria-haspopup="dialog"
      aria-label={`About ${name}`}
      title={def ? `${firstSentence(def.what)} Click for details.` : "Not defined yet."}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        open?.({ k, label: name, worked, trend, from: ref.current });
      }}
      className={`-mx-[3px] -my-[6px] inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 align-middle normal-case tracking-normal ${
        def ? "text-[#b8b2c4] hover:text-ap-purple data-[open]:text-ap-purple" : "text-ap-line"
      }`}
    >
      <Glyph />
    </button>
  );
}

/** The card's own white boxes, with the design's purple eyebrow. */
function Box({
  title,
  right,
  children,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-[14px] border border-ap-line bg-white px-[18px] py-4">
      <div className="flex items-baseline justify-between gap-2.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ap-plum">
          {title}
        </span>
        {right}
      </div>
      {children}
    </div>
  );
}

const trendCache = new Map<string, Promise<unknown>>();

/** The last 12 whole weeks, Monday to Sunday, ending by yesterday. */
function twelveWeeks(today: string): { from: string; to: string } {
  const yesterday = addDays(today, -1);
  const dow = new Date(`${yesterday}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  const to = addDays(yesterday, -dow);
  return { from: addDays(to, -83), to };
}

function useTwelveWeeks(src: TrendSource) {
  const { filters, today } = useApFilters();
  const range = twelveWeeks(today);
  const url = `/api/admin/ap/${src.route}?${new URLSearchParams(
    filterParams({ ...filters, period: "custom", ...range })
  ).toString()}`;
  // Null while loading; the card is a modal, so the filters can't change under it.
  const [state, setState] = useState<{
    values: Array<number | null>;
    titles: string[];
    why: string | null;
    /** What the line draws, where it isn't the figure itself ("Ad spend per submission"). */
    line: string | null;
  } | null>(null);
  useEffect(() => {
    if (!trendCache.has(url)) {
      trendCache.set(
        url,
        fetch(url, { credentials: "same-origin" }).then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.json();
        })
      );
    }
    let live = true;
    trendCache
      .get(url)!
      .then((payload) => {
        if (!live) return;
        const tiles = (payload as { tiles?: unknown }).tiles;
        const list = Array.isArray(tiles) ? tiles : tiles ? Object.values(tiles) : [];
        const tile = (
          list as Array<{
            key?: string;
            spark?: Array<number | null>;
            blocked?: string | null;
            line?: string;
          }>
        ).find((t) => t?.key === src.tile);
        const titles = trendBuckets(range.from, range.to).map((b) => rangeLabel(b.from, b.to));
        // A tile blank over the 12 weeks (its records start inside them) still has the weeks it
        // can count: they are drawn, with the reason the rest are missing.
        setState(
          tile
            ? {
                values: tile.spark ?? [],
                titles,
                why: tile.blocked ?? null,
                line: tile.line ?? null,
              }
            : { values: [], titles, why: "This figure has no weekly line.", line: null }
        );
      })
      .catch(() => {
        trendCache.delete(url);
        if (live)
          setState({
            values: [],
            titles: [],
            why: "The last 12 weeks could not be loaded.",
            line: null,
          });
      });
    return () => {
      live = false;
    };
    // range follows url: both come from the same filters and day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, src.tile]);
  return state;
}

function TrendBox({ src }: { src: TrendSource }) {
  const t = useTwelveWeeks(src);
  const values = t ? t.values : [];
  const nums = values.filter((v): v is number => v !== null && Number.isFinite(v));
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const span = hi - lo || 1;
  const pts = values
    .map((v, i) =>
      v === null || !Number.isFinite(v)
        ? null
        : `${((i * 400) / Math.max(1, values.length - 1)).toFixed(1)},${(84 - ((v - lo) / span) * 74).toFixed(1)}`
    )
    .filter((p): p is string => p !== null);
  return (
    <Box
      title="Last 12 weeks"
      right={
        <span className="text-xs text-ap-muted">
          {t?.line ? `weekly · line: ${t.line}` : "weekly · with the filters above"}
        </span>
      }
    >
      {t === null ? (
        <span className="text-[13px] text-ap-muted">Loading the last 12 weeks…</span>
      ) : pts.length < 2 ? (
        <span className="text-[13px] text-ap-muted">{t.why ?? "Too few weeks with a figure."}</span>
      ) : (
        <>
          <svg
            viewBox="0 0 400 90"
            preserveAspectRatio="none"
            aria-hidden="true"
            className="h-[90px] w-full"
          >
            <polyline points={`0,90 ${pts.join(" ")} 400,90`} fill="#795fc81a" stroke="none" />
            <polyline
              points={pts.join(" ")}
              fill="none"
              stroke="#795fc8"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <span className="sr-only">
            {values
              .map(
                (v, i) =>
                  `${t.titles[i] ?? ""}: ${`${fmt(src.unit, v, src.digits)}${v === null ? "" : (src.suffix ?? "")}`}`
              )
              .join("; ")}
          </span>
          {t.why && <span className="text-xs leading-snug text-ap-muted">{t.why}</span>}
          <span className="flex justify-between text-[11px] text-ap-muted">
            <span>{t.titles[0]}</span>
            <span>
              {t.titles.at(-1)}:{" "}
              <strong className="text-ap-ink">{`${fmt(src.unit, values.at(-1), src.digits)}${values.at(-1) == null ? "" : (src.suffix ?? "")}`}</strong>
            </span>
          </span>
        </>
      )}
    </Box>
  );
}

function catalogHref(source: SourceKey, table: string): string {
  return `/admin/ap/sources?${new URLSearchParams({ source, table }).toString()}`;
}

/** The first day of the month after `day`, or `day` itself when it is a first. */
function monthStart(day: string): string {
  if (day.endsWith("-01")) return day;
  const [y, m] = day.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

/** A chart's monthly window: from May 2026, or a range's first whole month when it starts earlier. */
function windowFrom(from: string): string {
  return from < "2026-05-01" ? monthStart(from) : "2026-05-01";
}

/**
 * The query with this range's days written in, so a copy runs as it is: a bare `:from` becomes
 * a day as the language takes one (Postgres a date literal, PostHog and Google Ads a quoted
 * day), one inside quotes or after `date` the day itself. `:window_from` is a chart's monthly
 * window (from May 2026, or a range's first whole month when it starts earlier), `:grain` the
 * range's step and `:team_visits` the team's own PostHog visits. A query in parts ("-- Part 2,
 * PostHog (HogQL):") fills each part in its own language.
 */
export function fillRange(
  text: string,
  from: string,
  to: string,
  lang: FieldDef["query"]["lang"] = "SQL",
  team: readonly string[] = [],
  /** The chart window's first day, where the figure's own days give it (a legend's span). */
  windowStart?: string
): string {
  const day: Record<string, string> = { from, to, window_from: windowStart ?? windowFrom(from) };
  const fill = (part: string, l: string) =>
    part
      .replace(/:grain\b/g, `'${grainOf(from, to)}'`)
      .replace(/:team_visits\b/g, `(${team.map((id) => `'${id}'`).join(", ") || "''"})`)
      .replace(
        /\b(date\s+):(window_from|from|to)\b/gi,
        (_m, d: string, k: string) => `${d}'${day[k]}'`
      )
      .replace(/(?<!['\w]):(window_from|from|to)\b/g, (_m, k: string) =>
        l === "SQL" ? `DATE '${day[k]}'` : `'${day[k]}'`
      )
      .replace(/:(window_from|from|to)\b/g, (_m, k: string) => day[k]!);
  return text
    .split(/(?=^-- Part \d+, [^\n]*\((?:SQL|HogQL)\):)/m)
    .map((part) => fill(part, /^-- Part \d+, [^\n]*\((SQL|HogQL)\):/.exec(part)?.[1] ?? lang))
    .join("");
}

function QueryBox({ def, worked, label }: { def: FieldDef; worked?: Worked; label: string }) {
  const { filters } = useApFilters();
  const { status } = useApStatus();
  // The days the figure covers: a chart's window where it isn't the range's own.
  const days = worked?.span ?? { from: filters.from, to: filters.to };
  // A legend's own days already start where its figure does: a monthly window too.
  const text = fillRange(
    def.query.text,
    days.from,
    days.to,
    def.query.lang,
    status?.teamVisits ?? [],
    worked?.span?.from
  );
  const first =
    !worked?.span && /:window_from\b/.test(def.query.text) ? windowFrom(days.from) : days.from;
  const written = `${worked?.span || first !== days.from ? "these days" : "this range"}, ${rangeLabel(first, days.to)}`;
  const [tab, setTab] = useState<"sql" | "res">("sql");
  const [copied, setCopied] = useState(false);
  const t = def.tables[0];
  const explorer = t
    ? `/admin/ap/explorer?${new URLSearchParams({
        source: t.source,
        table: t.table,
        from: filters.from,
        to: filters.to,
      }).toString()}`
    : "/admin/ap/explorer";
  const res: Array<[string, string]> = worked
    ? [
        ...(worked.num !== undefined ? [[def.formula.num, worked.num] as [string, string]] : []),
        ...(worked.den !== undefined && def.formula.den
          ? [[def.formula.den, worked.den] as [string, string]]
          : []),
        [label, worked.value],
      ]
    : [];
  return (
    <Box
      title={def.query.lang === "SQL" ? "Query" : `Query · ${def.query.lang}`}
      right={
        <span className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(text).then(() => setCopied(true));
            }}
            className="min-h-8 cursor-pointer rounded-full border border-ap-line bg-white px-3 font-sans text-xs font-bold text-ap-ink"
          >
            {copied ? "Copied" : "Copy query"}
          </button>
          <a
            href={explorer}
            className="inline-flex min-h-8 items-center rounded-full bg-ap-ink px-3.5 text-xs font-bold text-white no-underline"
          >
            Run in explorer
          </a>
        </span>
      }
    >
      <div
        role="group"
        aria-label="Query view"
        className="inline-flex gap-1 self-start rounded-full bg-ap-ground p-1"
      >
        {(
          [
            ["sql", "Query"],
            ["res", "Result preview"],
          ] as const
        ).map(([key, name]) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
            className={`min-h-8 cursor-pointer rounded-full border-0 px-3.5 font-sans text-[13px] font-semibold ${
              tab === key ? "bg-ap-ink text-white" : "bg-transparent text-ap-body"
            }`}
          >
            {name}
          </button>
        ))}
      </div>
      {tab === "sql" ? (
        <>
          <pre className="m-0 max-h-[300px] overflow-auto whitespace-pre rounded-[10px] bg-ap-ink px-3.5 py-3 font-mono text-xs leading-relaxed text-[#ece8f6]">
            {text}
          </pre>
          <span className="text-xs text-ap-muted">
            Written for {written}: copy it and it runs as it is.
            {/:team_visits\b/.test(def.query.text) && !status?.teamVisits
              ? " The team's own visits couldn't be read just now, so a copy counts them in."
              : ""}
          </span>
        </>
      ) : res.length ? (
        <>
          <div className="overflow-x-auto rounded-[10px] border border-ap-line">
            <div
              className="grid min-w-max"
              style={{ gridTemplateColumns: `repeat(${res.length}, minmax(120px, 1fr))` }}
            >
              {res.map(([h]) => (
                <span key={h} className="bg-ap-ground px-3 py-2 text-[11.5px] text-ap-muted">
                  {h}
                </span>
              ))}
              {res.map(([h, v]) => (
                <span
                  key={h}
                  className="border-t border-ap-line px-3 py-2.5 text-[13px] font-bold tabular-nums"
                >
                  {v}
                </span>
              ))}
            </div>
          </div>
          <span className="text-xs text-ap-muted">
            The figures for the current filters
            {worked?.span ? ` over ${rangeLabel(worked.span.from, worked.span.to)}` : ""}, as this
            page worked them out.
          </span>
        </>
      ) : (
        <span className="text-[13px] text-ap-muted">
          This figure is shown per row: Run in explorer opens the rows behind it.
        </span>
      )}
    </Box>
  );
}

function TablesBox({ def }: { def: FieldDef }) {
  const [pick, setPick] = useState(0);
  const t = def.tables[Math.min(pick, def.tables.length - 1)];
  if (!t) return null;
  const path = SOURCE_PATH[t.source];
  const meta: Array<[string, string]> = [
    ["Source", path.fed],
    ["Columns used", t.columns],
    ["Filters applied", t.filters],
    ...(t.watch ? ([["Watch out", t.watch]] as Array<[string, string]>) : []),
    ["Data owner", SOURCE_OWNER[t.source]],
  ];
  return (
    <Box title="Tables · pick one for its details">
      <div className="flex flex-col gap-1.5">
        {def.tables.map((x, i) => {
          const on = x === t;
          const p = SOURCE_PATH[x.source];
          return (
            <button
              key={`${x.source}.${x.table}`}
              type="button"
              aria-pressed={on}
              onClick={() => setPick(i)}
              className={`flex cursor-pointer flex-wrap items-center gap-2 rounded-[10px] border px-2.5 py-2 text-left font-sans text-xs text-ap-body ${
                on ? "border-ap-purple bg-[#faf8ff]" : "border-ap-line bg-white"
              }`}
            >
              <span className="font-bold text-ap-ink">{p.catalog}</span>
              <span aria-hidden="true" className="text-[#b8b2c4]">
                ›
              </span>
              <span className="text-ap-muted">{p.schema}</span>
              <span aria-hidden="true" className="text-[#b8b2c4]">
                ›
              </span>
              <span className="rounded-md bg-ap-lilac px-2 py-0.5 font-mono text-[11.5px] text-ap-violet">
                {x.table}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-2.5 border-t border-[#f0eef4] pt-1">
        <span className="text-sm font-bold">About {t.table}</span>
        <a href={catalogHref(t.source, t.table)} className="text-xs font-bold text-ap-plum">
          Open in catalog
        </a>
      </div>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-2 text-[13px] leading-normal">
        {meta.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-semibold text-ap-muted">{k}</dt>
            <dd className="m-0">{v}</dd>
          </div>
        ))}
      </dl>
    </Box>
  );
}

function CardBody({ open, go, close }: { open: Open; go: (k: string) => void; close: () => void }) {
  const def = FIELDS[open.k];
  const head = (
    // Sticky, so the ✕ stays in reach while a phone scrolls the card.
    <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-ap-line bg-white px-5 py-4 sm:px-6 sm:py-5">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <h2
          id="field-info-title"
          className="m-0 font-serif text-[28px] font-semibold leading-tight text-ap-ink"
        >
          {open.label}
        </h2>
        <p className="m-0 max-w-[680px] text-[15px] leading-relaxed text-ap-body">
          {def
            ? def.what
            : `Not defined yet. Ask ${DEFINITIONS_OWNER} to write what this figure means.`}
        </p>
      </div>
      <button
        type="button"
        onClick={close}
        aria-label="Close"
        className="h-9 w-9 shrink-0 cursor-pointer rounded-full border-0 bg-ap-ink text-base text-white"
      >
        ✕
      </button>
    </div>
  );
  if (!def) return head;
  return (
    <>
      {head}
      <div className="grid items-start gap-4 px-4 pb-6 pt-5 sm:px-6 [grid-template-columns:repeat(auto-fit,minmax(min(420px,100%),1fr))]">
        <div className="flex flex-col gap-4">
          <Box title="Formula">
            <div className="flex flex-wrap items-center gap-3">
              {def.formula.den ? (
                <span className="inline-flex flex-col items-center text-sm font-bold">
                  <span className="px-2 pb-[5px] text-center">{def.formula.num}</span>
                  <span className="h-[1.5px] self-stretch bg-ap-ink" />
                  <span className="px-2 pt-[5px] text-center">{def.formula.den}</span>
                </span>
              ) : (
                <span className="text-sm font-bold">{def.formula.num}</span>
              )}
              {def.formula.mult && (
                <span className="text-sm text-ap-muted">{def.formula.mult}</span>
              )}
            </div>
            <span className="text-[13px] text-ap-body">
              <strong>{def.stat}</strong>, counted {def.per}
            </span>
            {open.worked && (
              <span className="rounded-lg bg-ap-ground px-3 py-2 text-[13px] tabular-nums">
                {open.worked.span
                  ? `These days (${rangeLabel(open.worked.span.from, open.worked.span.to)}):`
                  : "This period:"}{" "}
                <b>
                  {open.worked.num !== undefined && open.worked.den !== undefined
                    ? `${open.worked.num} ÷ ${open.worked.den} = ${open.worked.value}`
                    : open.worked.value}
                </b>
              </span>
            )}
          </Box>
          {open.trend && <TrendBox src={open.trend} />}
          {def.caveat && (
            <Box title="Watch out">
              <span className="text-[13px] leading-relaxed text-ap-body">{def.caveat}</span>
            </Box>
          )}
          <Box title="Related fields">
            {def.related?.length ? (
              <div className="flex flex-wrap gap-2">
                {def.related.map((r) => {
                  const rel = FIELDS[r];
                  return (
                    <button
                      key={r}
                      type="button"
                      disabled={!rel}
                      onClick={() => go(r)}
                      className={`min-h-[34px] rounded-full border border-ap-line bg-white px-3.5 font-sans text-[13px] font-semibold ${
                        rel ? "cursor-pointer text-ap-violet" : "text-ap-muted"
                      }`}
                    >
                      {rel?.label ?? r}
                    </button>
                  );
                })}
              </div>
            ) : (
              <span className="text-[13px] text-ap-muted">None.</span>
            )}
            <span className="text-xs text-ap-muted">
              Definition owner: {DEFINITIONS_OWNER} · written {DEFINITIONS_WRITTEN}
            </span>
          </Box>
        </div>
        <div className="flex flex-col gap-4">
          <QueryBox def={def} worked={open.worked} label={open.label} />
          <TablesBox def={def} />
        </div>
      </div>
    </>
  );
}

/** Holds the page's one card. Wraps AP's pages (ApShell). */
export function FieldInfoProvider({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const show = useCallback((o: Open) => setOpen(o), []);
  // The open card's icon stays violet (the design: "violet only when its card is open").
  const from = open?.from ?? null;
  useEffect(() => {
    from?.setAttribute("data-open", "");
    return () => from?.removeAttribute("data-open");
  }, [from]);
  useEffect(() => {
    const d = ref.current;
    // jsdom (tests) has no showModal: an open attribute shows the card there.
    if (open && d && !d.open) {
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
    }
  }, [open]);
  const close = useCallback(() => {
    const d = ref.current;
    if (!d) return;
    if (typeof d.close === "function") d.close();
    else {
      d.removeAttribute("open");
      d.dispatchEvent(new Event("close"));
    }
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <dialog
        ref={ref}
        aria-labelledby="field-info-title"
        onClose={() => {
          open?.from?.focus();
          setOpen(null);
        }}
        // A click on the dimmed backdrop lands on the dialog element itself.
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        className="m-0 h-full max-h-none w-full border-0 max-w-none overflow-y-auto bg-ap-ground p-0 text-ap-ink backdrop:bg-[rgba(22,16,33,0.5)] sm:mx-auto sm:my-10 sm:h-auto sm:max-h-[calc(100%-80px)] sm:w-[calc(100%-32px)] sm:max-w-[1080px] sm:rounded-[22px] sm:shadow-[0_30px_80px_rgba(22,16,33,0.35)]"
      >
        {open && (
          <CardBody
            key={open.k}
            open={open}
            close={close}
            go={(k) => setOpen({ k, label: FIELDS[k]?.label ?? k, from: open.from })}
          />
        )}
      </dialog>
    </Ctx.Provider>
  );
}
