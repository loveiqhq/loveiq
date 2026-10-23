"use client";

/**
 * The building blocks of AP-Analytics, drawn as Marcus's design draws them (canvas "The
 * AP-Analytics (Admin)", 12 Oct 2026): white cards on a light ground, Lora figures, Manrope
 * text, the LoveIQ purple. Only presentation lives here; the numbers come from the server.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { Column, MiniStat, PageHead, Table, Tile } from "@features/admin/server/ap/common";
import {
  delta,
  deltaRel,
  EMPTY,
  fmt,
  sparkGeometry,
  type Tone,
  type Unit,
} from "@features/admin/server/ap/format";

import { IndexHover } from "./hover";

/**
 * A table heading's sort or filter icon: a 24 × 24 target (WCAG 2.2's minimum) around the
 * 11px icon, its margin pulled in so the heading keeps its height.
 */
export const ICON_BTN =
  "-my-[5px] inline-flex min-h-6 min-w-6 cursor-pointer items-center justify-center rounded border-0 bg-transparent p-0 align-middle";

const TONE_TEXT: Record<Tone, string> = {
  good: "text-ap-good",
  bad: "text-ap-bad",
  flat: "text-ap-muted",
};

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ap-label">
      {children}
    </span>
  );
}

export function Card({
  id,
  labelledBy,
  className = "",
  children,
}: {
  id?: string;
  labelledBy?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={`flex scroll-mt-20 lg:scroll-mt-6 flex-col gap-5 rounded-[20px] border border-ap-line bg-white p-5 shadow-ap sm:p-6 ${className}`}
    >
      {children}
    </section>
  );
}

export function SectionHead({
  id,
  eyebrow,
  title,
  description,
  right,
  level = 2,
  align = "start",
}: {
  id: string;
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  right?: ReactNode;
  level?: 2 | 3;
  /** Where the controls on the right sit: level with the eyebrow, or with the description. */
  align?: "start" | "end";
}) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <div
      className={`flex flex-wrap justify-between gap-x-6 gap-y-3 ${align === "end" ? "items-end" : "items-start"}`}
    >
      <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <Heading
          id={id}
          className={`m-0 font-serif font-semibold leading-tight text-ap-ink ${level === 2 ? "text-2xl" : "text-lg"}`}
        >
          {title}
        </Heading>
        {description && <p className="m-0 text-sm leading-relaxed text-ap-muted">{description}</p>}
      </div>
      {right}
    </div>
  );
}

/**
 * A trend line in a 120 × 36 box, broken where a point has no figure. Given each point's
 * title, it reads out its point on hover, tap or (when focusable) the arrow keys.
 */
export function Spark({
  values,
  color = "#795fc8",
  height = 36,
  titles,
  name = "Value",
  unit = "count",
  digits,
  suffix = "",
  focusable = true,
  onPick,
  tapReads,
}: {
  values: Array<number | null>;
  color?: string;
  height?: number;
  /** Each point's period ("5 Oct – 11 Oct 2026"), for the read-out; none, no read-out. */
  titles?: string[];
  /** The figure in the read-out ("Revenue"). */
  name?: string;
  unit?: Unit;
  digits?: number;
  /** After each value, as the tile writes it ("0.02×"). */
  suffix?: string;
  /** Off inside a link or a picked row, which keep the keyboard. */
  focusable?: boolean;
  onPick?: (i: number) => void;
  /** A tap only reads, where picking takes the reader away. */
  tapReads?: boolean;
}) {
  const g = sparkGeometry(values, height);
  if (!g) return <div aria-hidden="true" style={{ height }} />;
  const n = values.length;
  const read = Boolean(titles && titles.length === n && n > 0);
  const xs = values.map((_, i) => (g.x(i) / 120) * 100);
  const yPct = (v: number) => ((height - g.y(v)) / height) * 100;
  // The tile's decimals, unless they round a point to nothing ("0%" for 0.4%): fmt's own then.
  const show = (v: number) => {
    if (digits === undefined || v === 0) return fmt(unit, v, digits);
    const scaled = Math.abs(v) * (unit === "pct" ? 100 : 1) * 10 ** digits;
    return fmt(unit, v, Math.round(scaled) === 0 ? undefined : digits);
  };
  return (
    <div className="relative" style={{ height }}>
      <svg
        viewBox={`0 0 120 ${height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        className="absolute inset-0 h-full w-full overflow-visible"
      >
        {g.runs.map((points) => (
          <polyline
            key={points}
            points={points}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      {read && (
        <IndexHover
          xs={xs}
          label={`${name}, trend`}
          focusable={focusable}
          onPick={onPick}
          tapReads={tapReads}
          tip={(i) => {
            const v = values[i];
            const has = v !== null && v !== undefined && Number.isFinite(v);
            return {
              title: titles![i]!,
              rows: [
                {
                  label: name,
                  value: has ? show(v) + suffix : EMPTY,
                  color,
                  mark: "line",
                  muted: !has,
                },
              ],
              note: has ? null : "No figure for this period.",
            };
          }}
          markers={(i) => {
            const v = values[i];
            return v !== null && v !== undefined && Number.isFinite(v)
              ? [{ y: yPct(v), color }]
              : [];
          }}
        />
      )}
    </div>
  );
}

/**
 * A headline tile, in the design's two layouts. "lg" (Overview): the change beside the value,
 * the trend line, then the note. "md" (Assessment, Survey, Report): the value, the change and
 * the note on one line, the trend line, then what the line covers. `level`: the tile's parts sit
 * on its grid's shared rows (subgrid), so a label that wraps moves the whole row's values down
 * together; every tile in that grid must set it.
 */
export function KpiTile({
  tile,
  size = "lg",
  level = false,
  titles,
}: {
  tile: Tile;
  size?: "lg" | "md";
  level?: boolean;
  /** Each trend point's period, for its read-out. */
  titles?: string[];
}) {
  const d = tile.blocked
    ? null
    : delta(tile.unit, tile.value, tile.prev, tile.goodWhen, tile.deltaAs);
  const value = (
    <span
      className={`font-serif font-semibold leading-none tabular-nums text-ap-ink ${size === "lg" ? "text-[32px]" : "text-[28px]"}`}
    >
      {tile.blocked ? EMPTY : fmt(tile.unit, tile.value)}
    </span>
  );
  // A change never breaks inside itself ("+€3,986" may break after its sign otherwise).
  const body =
    size === "lg" ? (
      <>
        <Eyebrow>{tile.label}</Eyebrow>
        <span className="flex items-baseline justify-between gap-2">
          {value}
          {d && (
            <span className={`whitespace-nowrap text-[13px] font-bold ${TONE_TEXT[d.tone]}`}>
              {d.text}
            </span>
          )}
        </span>
        <Spark
          values={tile.blocked ? [] : tile.spark}
          titles={titles}
          name={tile.line ?? tile.label}
          unit={tile.unit}
          focusable={!tile.href}
        />
        <span className="text-xs leading-normal text-ap-muted">{tile.blocked ?? tile.foot}</span>
      </>
    ) : (
      <>
        <Eyebrow>{tile.label}</Eyebrow>
        {value}
        <span className="text-xs leading-normal text-ap-muted">
          {d && <strong className={`whitespace-nowrap ${TONE_TEXT[d.tone]}`}>{d.text}</strong>}
          {d ? " " : ""}
          {tile.blocked ?? tile.foot}
        </span>
        <Spark
          values={tile.blocked ? [] : tile.spark}
          titles={titles}
          name={tile.line ?? tile.label}
          unit={tile.unit}
          focusable={!tile.href}
        />
        {!tile.blocked && tile.trend && (
          <span className="text-[11px] text-ap-muted">{tile.trend}</span>
        )}
      </>
    );
  const layout = level
    ? `grid grid-rows-subgrid ${size === "lg" ? "row-span-4" : "row-span-5"}`
    : "flex flex-col";
  const cls = `${layout} rounded-[20px] border border-ap-line bg-white text-ap-ink no-underline shadow-ap ${
    size === "lg" ? "gap-2.5 px-5 py-[18px]" : "gap-2 px-[18px] py-4"
  }`;
  return tile.href ? (
    <a href={tile.href} className={`${cls} transition-colors hover:border-ap-purple/40`}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/**
 * The design's headline tile since 16 Oct 2026 (Dashboard, Traffic, Payment, Landing, Survey,
 * Report): the label, the value, the change against the period before as a percentage (green,
 * red, or grey when flat) or the tile's own grey line, then the trend line. A blank value says
 * why in place of the change. `level`: the parts sit on the grid's shared rows (subgrid).
 */
export function KpiTileV2({
  tile,
  level = false,
  digits,
  suffix = "",
  negativeBad = false,
  titles,
  foot = false,
}: {
  tile: Tile;
  level?: boolean;
  /** Decimals for the value, where the design fixes them. */
  digits?: number;
  /** After the value, where the design writes one ("0.02×"). */
  suffix?: string;
  /** A value below zero in red, as the design draws a loss. */
  negativeBad?: boolean;
  /** Each trend point's period, for its read-out. */
  titles?: string[];
  /**
   * The tile's own grey line after the change, where the design writes one under every value
   * ("96.6% of 1,240 sent") and the page compares too (Unlock feedback).
   */
  foot?: boolean;
}) {
  const d =
    tile.blocked || tile.note !== undefined ? null : deltaRel(tile.value, tile.prev, tile.goodWhen);
  const value = tile.blocked ? EMPTY : fmt(tile.unit, tile.value, digits);
  const red = negativeBad && !tile.blocked && tile.value !== null && tile.value < 0;
  return (
    <div
      className={`${level ? "row-span-4 grid grid-rows-subgrid" : "flex flex-col"} gap-2 rounded-[20px] border border-ap-line bg-white px-[18px] py-4 text-ap-ink shadow-ap`}
    >
      <Eyebrow>{tile.label}</Eyebrow>
      <span
        className={`font-serif text-[28px] font-semibold leading-none tabular-nums ${red ? "text-ap-bad" : "text-ap-ink"}`}
      >
        {value === EMPTY ? value : value + suffix}
      </span>
      {tile.blocked ? (
        <span className="text-xs leading-snug text-ap-muted">{tile.blocked}</span>
      ) : tile.note !== undefined ? (
        <span
          className={`text-sm font-bold leading-[1.4] tabular-nums ${TONE_TEXT[tile.noteTone ?? "flat"]}`}
        >
          {tile.note}
        </span>
      ) : foot ? (
        <span className="text-sm font-bold leading-[1.4] tabular-nums text-ap-muted">
          {d && <span className={`whitespace-nowrap ${TONE_TEXT[d.tone]}`}>{d.text} · </span>}
          {tile.foot}
        </span>
      ) : (
        <span
          className={`whitespace-nowrap text-sm font-bold leading-[1.4] tabular-nums ${TONE_TEXT[d?.tone ?? "flat"]}`}
        >
          {d?.text ?? EMPTY}
        </span>
      )}
      {tile.share && !tile.blocked && (
        <span className="text-xs leading-snug text-ap-muted">{tile.share}</span>
      )}
      <Spark
        values={tile.blocked ? [] : tile.spark}
        titles={titles}
        name={tile.line ?? tile.label}
        unit={tile.unit}
        digits={digits}
        suffix={suffix}
      />
    </div>
  );
}

export function TileGrid({ children, min = 196 }: { children: ReactNode; min?: number }) {
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))` }}
    >
      {children}
    </div>
  );
}

/**
 * The line under a box's value, by the stat's `foot` (see MiniStat): the change alone, the
 * previous value grey or coloured by the change, or (unset) the change and the previous value.
 */
function StatFoot({ stat }: { stat: MiniStat }) {
  const d =
    stat.prev !== undefined
      ? delta(stat.unit, stat.value, stat.prev ?? null, stat.goodWhen ?? "up", stat.deltaAs)
      : null;
  const prev =
    stat.prev !== null && stat.prev !== undefined ? `prev. ${fmt(stat.unit, stat.prev)}` : null;
  if (stat.foot === "change") {
    if (!d) return null;
    return d.tone === "flat" ? (
      <span className="text-xs text-ap-muted">flat vs prev.</span>
    ) : (
      <span className={`whitespace-nowrap text-xs font-bold ${TONE_TEXT[d.tone]}`}>{d.text}</span>
    );
  }
  if (stat.foot === "prev")
    return prev ? <span className="text-xs text-ap-muted">{prev}</span> : null;
  if (stat.foot === "prev-toned") {
    return prev ? (
      <span className={`text-xs font-bold ${TONE_TEXT[d?.tone ?? "flat"]}`}>{prev}</span>
    ) : null;
  }
  return d ? (
    <span className="text-xs text-ap-muted">
      <strong className={`whitespace-nowrap ${TONE_TEXT[d.tone]}`}>{d.text}</strong>
      {prev ? ` · ${prev}` : ""}
    </span>
  ) : null;
}

/**
 * A grey box with a label, a value and a line under it (Revenue, Costs, Survey card), sized by
 * its grid. The value is 24px as drawn, smaller in a narrower box (three across a phone, or two
 * cards side by side on a small laptop) so that a figure up to "€12,345" stays inside it.
 * `level`: the box's lines sit on its grid's shared rows (subgrid), so a label that wraps moves
 * the whole row's values down together; every box in that grid must set it.
 */
export function StatBox({
  stat,
  tone = "grey",
  level = false,
}: {
  stat: MiniStat;
  tone?: "grey" | "white";
  level?: boolean;
}) {
  return (
    <div
      className={`${level ? "row-span-4 grid grid-rows-subgrid" : "flex flex-col"} min-w-0 gap-1 rounded-[14px] p-3.5 [container-type:inline-size] ${tone === "grey" ? "bg-ap-ground" : "bg-white"}`}
    >
      <span className="text-xs text-ap-muted">{stat.label}</span>
      {/* 23% of the box: Lora's "€12,345" is about 4.2em wide, so it fits at any width. */}
      <span className="font-serif text-[length:min(24px,23cqi)] font-semibold leading-[1.33] tabular-nums text-ap-ink">
        {fmt(stat.unit, stat.value)}
      </span>
      <StatFoot stat={stat} />
      {stat.note && <span className="text-xs leading-snug text-ap-muted">{stat.note}</span>}
    </div>
  );
}

/** Two to five buttons, one pressed: splits, tabs, sort orders. */
export function Pills<T extends string>({
  options,
  value,
  onChange,
  label,
  onWhite = false,
  tight = false,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  label: string;
  onWhite?: boolean;
  /** 14px sides instead of 16px: the Overview's split, as that artboard draws it. */
  tight?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`flex flex-wrap gap-0.5 rounded-full p-0.5 ${onWhite ? "border border-ap-line bg-white" : "bg-ap-ground"}`}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`min-h-10 cursor-pointer rounded-full border-0 text-[13px] font-semibold ${
              tight ? "px-3.5" : "px-4"
            } ${on ? "bg-ap-ink text-white" : "bg-transparent text-ap-body hover:bg-white/70"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A horizontal bar on a track; `pct` is 0..1. */
export function Bar({
  pct,
  color = "#795fc8",
  height = 10,
  minWidth = 0,
  track,
}: {
  pct: number | null;
  color?: string;
  height?: number;
  minWidth?: number;
  /** The track's colour, where the default would vanish into a grey card. */
  track?: string;
}) {
  const w = pct === null || !Number.isFinite(pct) ? 0 : Math.max(0, Math.min(1, pct));
  return (
    <span
      className={`block overflow-hidden rounded-full ${track ? "" : "bg-ap-track"}`}
      style={{ height, background: track }}
    >
      <span
        className="block h-full rounded-full"
        style={{
          width: `${(w * 100).toFixed(2)}%`,
          minWidth: w > 0 ? minWidth : 0,
          background: color,
        }}
      />
    </span>
  );
}

export function cellText(unit: Column["unit"], v: number | string | null, digits?: number): string {
  if (typeof v === "string") return v;
  if (unit === "text") return v === null ? EMPTY : String(v);
  return fmt(unit as Unit, v, digits);
}

/** Both arrows while unsorted; the one arrow of the direction once sorted. */
export function SortIcon({ dir }: { dir?: 1 | -1 | null }) {
  const d =
    dir === 1
      ? "M3.5 7L6 4.5L8.5 7"
      : dir === -1
        ? "M3.5 5L6 7.5L8.5 5"
        : "M3.5 4.5L6 2l2.5 2.5M3.5 7.5L6 10l2.5-2.5";
  return (
    <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
      <path
        d={d}
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The design's funnel, for the filter button in a table's header. */
export function FilterIcon() {
  return (
    <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
      <path
        d="M1.8 2.5h8.4L7 6.3v3.4L5 10.6V6.3z"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A filter text box opened from a table header's funnel. */
export function HeaderFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs font-semibold text-ap-body">
      <span>Filter {label.toLowerCase()}</span>
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type to filter"
        className="min-h-9 w-52 rounded-full border border-ap-line bg-white px-3.5 font-sans text-[13px] text-ap-ink outline-none"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="min-h-9 cursor-pointer rounded-full border-0 bg-transparent px-2 text-xs font-semibold text-ap-muted"
        >
          Clear
        </button>
      )}
    </label>
  );
}

/**
 * The least width of a column for its heading: the label in at most two lines, its last word
 * and its buttons (15px each) on one line, inside the 14px sides. A capital at 11px bold runs
 * about 8.2px (SUBMISSIONS measures 83px). ponytail: a letter count, not the font's metrics;
 * a label of wide letters (M, W) may need a few pixels more.
 */
function headWidth(label: string, buttons: number): number {
  const w = (s: string) => s.length * 8.2;
  const words = label.split(" ");
  let need = w(label) + buttons * 15;
  for (let i = 1; i < words.length; i++) {
    const [head, tail] = [words.slice(0, i).join(" "), words.slice(i).join(" ")];
    need = Math.min(need, Math.max(w(head), w(tail) + buttons * 15));
  }
  return Math.ceil(need) + 28;
}

/**
 * A table from the server's Table: the first column is the row's name, the rest are
 * numbers. Every column sorts, the first also filters (as the design draws them); muted
 * rows ("Not launched", "Unknown source") stay at the bottom.
 */
export function DataTable({
  table,
  minWidth = 460,
  sortFirst = true,
}: {
  table: Table;
  minWidth?: number;
  /** False where the design gives the name column a filter only (the dashboard's Sources). */
  sortFirst?: boolean;
}) {
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  const [filtering, setFiltering] = useState(false);
  const [filter, setFilter] = useState("");
  // The design's columns: the name at least 150px, each number at least 88px, and each wide
  // enough for its heading in two lines (headWidth). Narrower than all of them, it scrolls.
  const hasBar = table.rows.some((r) => r.bar !== undefined);
  const widths = table.columns.map((c, i) =>
    Math.max(i ? 88 : 150, headWidth(c.label, i ? 1 : sortFirst ? 2 : 1))
  );
  const gtc = [
    ...widths.map((w, i) => `minmax(${w}px, ${i ? 1 : 1.5}fr)`),
    ...(hasBar ? ["minmax(120px, 1.2fr)"] : []),
  ].join(" ");
  const least = widths.reduce((a, b) => a + b, hasBar ? 120 : 0);
  const rows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const shown = needle
      ? table.rows.filter((r) => r.label.toLowerCase().includes(needle))
      : table.rows;
    if (!sort) return shown;
    const live = shown.filter((r) => !r.muted);
    const muted = shown.filter((r) => r.muted);
    const key = (r: (typeof live)[number]) => (sort.col === 0 ? r.label : r.values[sort.col - 1]);
    live.sort((a, b) => {
      const x = key(a);
      const y = key(b);
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * sort.dir;
      return String(x).localeCompare(String(y)) * sort.dir;
    });
    return [...live, ...muted];
  }, [table.rows, sort, filter]);
  const first = table.columns[0]?.label ?? "";
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      {filtering && <HeaderFilter label={first} value={filter} onChange={setFilter} />}
      <div className="overflow-x-auto rounded-[14px] border border-ap-line">
        <div
          role="table"
          aria-label={table.columns[0]?.label}
          style={{ minWidth: Math.max(minWidth, least) }}
        >
          <div role="row" className="grid bg-ap-ground" style={{ gridTemplateColumns: gtc }}>
            {table.columns.map((c, i) => (
              // Text with its buttons inline, as drawn; the last word and the buttons never
              // part, so a button never wraps onto a line of its own.
              <span
                key={c.label}
                role="columnheader"
                aria-sort={sort?.col === i ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                className={`px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-ap-muted ${
                  i ? "text-right" : "text-left"
                }`}
              >
                {c.label.slice(0, c.label.lastIndexOf(" ") + 1)}
                <span className="whitespace-nowrap">
                  {c.label.slice(c.label.lastIndexOf(" ") + 1)}
                  {i === 0 && (
                    <button
                      type="button"
                      aria-label={`Filter ${c.label}`}
                      aria-expanded={filtering}
                      onClick={() => {
                        if (filtering) setFilter("");
                        setFiltering(!filtering);
                      }}
                      className={`ml-0.5 ${ICON_BTN} ${filtering || filter ? "text-ap-violet" : "text-ap-muted"}`}
                    >
                      <FilterIcon />
                    </button>
                  )}
                  {(i > 0 || sortFirst) && (
                    <button
                      type="button"
                      aria-label={`Sort by ${c.label}`}
                      onClick={() =>
                        setSort((s) =>
                          s?.col === i
                            ? { col: i, dir: s.dir === 1 ? -1 : 1 }
                            : { col: i, dir: i ? -1 : 1 }
                        )
                      }
                      className={`ml-0.5 ${ICON_BTN} ${sort?.col === i ? "text-ap-violet" : "text-ap-muted"}`}
                    >
                      <SortIcon dir={sort?.col === i ? sort.dir : null} />
                    </button>
                  )}
                </span>
              </span>
            ))}
            {hasBar && (
              <span
                role="columnheader"
                className="px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-ap-muted"
              >
                {table.barLabel ?? ""}
              </span>
            )}
          </div>
          {rows.length === 0 && (
            <p className="m-0 border-t border-ap-line px-3.5 py-3 text-sm text-ap-muted">
              {filter.trim() ? "No rows match the filter." : "Nothing in this range."}
            </p>
          )}
          {rows.map((r) => (
            <div
              key={r.label}
              role="row"
              className="grid border-t border-ap-line"
              style={{ gridTemplateColumns: gtc }}
            >
              <span role="rowheader" className="px-3.5 py-3 text-sm font-semibold text-ap-ink">
                {r.label}
              </span>
              {r.values.map((v, i) => (
                <span
                  key={i}
                  role="cell"
                  className={`px-3.5 py-3 text-right text-sm font-medium tabular-nums ${
                    r.muted || v === null || typeof v === "string" ? "text-ap-muted" : "text-ap-ink"
                  }`}
                >
                  {cellText(table.columns[i + 1]?.unit ?? "text", v, table.columns[i + 1]?.digits)}
                </span>
              ))}
              {hasBar && (
                <span aria-hidden="true" className="flex items-center px-3.5">
                  <span className="w-full">
                    <Bar pct={r.bar ?? 0} height={8} />
                  </span>
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
      {table.note && <p className="m-0 text-xs leading-relaxed text-ap-muted">{table.note}</p>}
    </div>
  );
}

/** Under a part the source, device and tier filters cannot reach, while one is on. */
export function AllTraffic({ note }: { note: string | null }) {
  return note ? <p className="m-0 text-xs font-semibold text-ap-plum">{note}</p> : null;
}

/**
 * Scrolls to the section the address names (#traffic) once the page's sections exist: they
 * render only after the figures arrive, so the browser's own jump finds nothing.
 */
export function useHashScroll(ready: boolean) {
  useEffect(() => {
    const id = ready ? decodeURIComponent(window.location.hash.slice(1)) : "";
    if (!id) return;
    const frame = requestAnimationFrame(() =>
      document.getElementById(id)?.scrollIntoView({ block: "start" })
    );
    return () => cancelAnimationFrame(frame);
  }, [ready]);
}

/**
 * The section being read: the one crossing a band across the middle of the screen, so that a
 * short last section still gets there at the end of the page. The first until one does, as
 * the design draws it.
 */
function useSectionInView(ids: string[], ready: boolean): string {
  const [current, setCurrent] = useState(ids[0] ?? "");
  // The ids as one value, so a new array with the same ids doesn't observe them again.
  const key = ids.join(" ");
  useEffect(() => {
    if (!ready || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setCurrent(e.target.id);
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    for (const id of key.split(" ")) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [ready, key]);
  return current;
}

/**
 * The design's pill bar of a page's sections, the one in view pressed. One row on a phone:
 * the pills scroll sideways rather than wrap.
 */
export function SectionNav({
  label,
  sections,
  ready,
}: {
  label: string;
  sections: Array<{ id: string; label: string }>;
  /** The sections exist (the page's figures have arrived). */
  ready: boolean;
}) {
  const current = useSectionInView(
    sections.map((s) => s.id),
    ready
  );
  return (
    <div className="max-w-full self-start overflow-x-auto">
      <nav
        aria-label={label}
        className="flex w-max gap-1.5 rounded-full border border-ap-line bg-white p-1"
      >
        {sections.map((s) => {
          const on = s.id === current;
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              aria-current={on ? "true" : undefined}
              className={`inline-flex min-h-10 items-center rounded-full px-4 text-[13px] no-underline ${
                on
                  ? "bg-ap-ink font-bold text-white"
                  : "font-semibold text-ap-body hover:bg-ap-ground"
              }`}
            >
              {s.label}
            </a>
          );
        })}
      </nav>
    </div>
  );
}

/**
 * A page's figures while the next ones load after a filter change: kept on screen, dimmed and
 * marked busy, so nobody reads the old figures as the answer to the new filters.
 */
export function Busy({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <div
      aria-busy={busy}
      className={`flex flex-col gap-6 transition-opacity ${busy ? "opacity-50" : ""}`}
    >
      {children}
    </div>
  );
}

/** The design's small purple pill ("Sample split · totals are live"): what a part's figures are. */
export function NotTracked({ children }: { children: ReactNode }) {
  return (
    <span className="self-start rounded-full bg-ap-purple/10 px-2.5 py-1 text-xs font-bold text-ap-plum">
      {children}
    </span>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <div
      role="status"
      className="rounded-[20px] border border-ap-line bg-white p-6 text-sm text-ap-muted shadow-ap"
    >
      Loading {label}…
    </div>
  );
}

export function Failed({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-[20px] border border-ap-bad/30 bg-white p-5 text-sm text-ap-bad-ink shadow-ap"
    >
      <span>Could not load: {message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-10 cursor-pointer rounded-full border border-ap-line bg-white px-4 font-semibold text-ap-ink"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function PageHeader({
  crumbs,
  title,
  badge,
  description,
  actions,
}: {
  crumbs: string[];
  title: string;
  badge?: ReactNode;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-2">
        {/* No crumbs, no trail: the Dashboard is drawn without one. */}
        {crumbs.length > 0 && (
          <nav
            aria-label="Breadcrumb"
            className="flex flex-wrap items-center gap-1.5 text-[13px] text-ap-muted"
          >
            {crumbs.map((c, i) => (
              <span key={c} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden="true">/</span>}
                <span className={i === crumbs.length - 1 ? "font-semibold text-ap-ink" : ""}>
                  {c}
                </span>
              </span>
            ))}
          </nav>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="m-0 text-balance font-serif text-[34px] font-semibold leading-tight tracking-[-0.01em] text-ap-ink">
            {title}
          </h1>
          {badge}
        </div>
        <p className="m-0 text-[15px] leading-relaxed text-ap-body">{description}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </header>
  );
}

/**
 * "Live". With `dot`, the range line's pill: a green dot and 13px text (the design's
 * Overview); the text keeps the darker green, which reads on the pale fill.
 */
export function LiveBadge({ dot = false }: { dot?: boolean }) {
  return dot ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-ap-good/10 px-2.5 py-1 text-[13px] font-bold text-ap-good-ink">
      <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-ap-good" />
      Live
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-ap-good/10 px-2.5 py-1 text-xs font-bold text-ap-good-ink">
      Live
    </span>
  );
}

export function BlackButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-h-11 cursor-pointer rounded-full border-0 bg-black px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

/** The line over a page's figures: their range, comparison, sources and update time, then the notes. */
export function RangeLine({
  data,
  sources = "Production database, ad spend from GA4",
  trend,
  withRange = true,
}: {
  data: Pick<PageHead, "range" | "compare" | "generatedAt" | "notes">;
  sources?: string;
  /** What the tiles' trend lines cover, said once here instead of under every tile. */
  trend?: string;
  /** Off where the header already shows the Live badge and the filter bar the range. */
  withRange?: boolean;
}) {
  const at = new Date(data.generatedAt).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-ap-muted">
        {withRange && <LiveBadge dot />}
        <span>
          {withRange &&
            `Figures below: ${data.range.label}${data.compare ? ` vs ${data.compare.label}` : ""} · `}
          {sources} · updated {at}
          {trend ? ` · trend lines: ${trend.charAt(0).toLowerCase()}${trend.slice(1)}` : ""}
        </span>
      </div>
      {data.notes.map((n) => (
        <p
          key={n}
          className="m-0 rounded-[14px] bg-ap-lilac px-3.5 py-2.5 text-[13px] leading-relaxed text-ap-body"
        >
          {n}
        </p>
      ))}
    </div>
  );
}
