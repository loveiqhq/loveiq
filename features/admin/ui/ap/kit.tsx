"use client";

/**
 * The building blocks of AP-Analytics, drawn as Marcus's design draws them (canvas "The
 * AP-Analytics (Admin)", 12 Oct 2026): white cards on a light ground, Lora figures, Manrope
 * text, the LoveIQ purple. Only presentation lives here; the numbers come from the server.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { Column, MiniStat, Table, Tile } from "@features/admin/server/ap/overview";
import {
  delta,
  EMPTY,
  fmt,
  sparkPoints,
  type Tone,
  type Unit,
} from "@features/admin/server/ap/format";

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

/** A trend line in a 120 × 36 box. */
export function Spark({
  values,
  color = "#795fc8",
  height = 36,
}: {
  values: Array<number | null>;
  color?: string;
  height?: number;
}) {
  const points = sparkPoints(values, height);
  if (!points) return <div aria-hidden="true" style={{ height }} />;
  return (
    <svg
      viewBox={`0 0 120 ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      className="w-full"
      style={{ height }}
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * A headline tile, in the design's two layouts. "lg" (Overview): the change beside the value,
 * the trend line, then the note. "md" (Assessment, Survey, Report): the value, the change and
 * the note on one line, the trend line, then what the line covers.
 */
export function KpiTile({ tile, size = "lg" }: { tile: Tile; size?: "lg" | "md" }) {
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
  const body =
    size === "lg" ? (
      <>
        <Eyebrow>{tile.label}</Eyebrow>
        <span className="flex items-baseline justify-between gap-2">
          {value}
          {d && <span className={`text-[13px] font-bold ${TONE_TEXT[d.tone]}`}>{d.text}</span>}
        </span>
        <Spark values={tile.blocked ? [] : tile.spark} />
        <span className="text-xs leading-normal text-ap-muted">{tile.blocked ?? tile.foot}</span>
      </>
    ) : (
      <>
        <Eyebrow>{tile.label}</Eyebrow>
        {value}
        <span className="text-xs leading-normal text-ap-muted">
          {d && <strong className={TONE_TEXT[d.tone]}>{d.text}</strong>}
          {d ? " " : ""}
          {tile.blocked ?? tile.foot}
        </span>
        <Spark values={tile.blocked ? [] : tile.spark} />
        {!tile.blocked && tile.trend && (
          <span className="text-[11px] text-ap-muted">{tile.trend}</span>
        )}
      </>
    );
  const cls = `flex flex-col rounded-[20px] border border-ap-line bg-white text-ap-ink no-underline shadow-ap ${
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

/** A grey box with a label, a value and a line under it (Revenue, Costs, Survey card). */
export function StatBox({ stat, tone = "grey" }: { stat: MiniStat; tone?: "grey" | "white" }) {
  const d =
    stat.prev !== undefined
      ? delta(stat.unit, stat.value, stat.prev ?? null, stat.goodWhen ?? "up", stat.deltaAs)
      : null;
  return (
    <div
      className={`flex min-w-0 flex-col gap-1 rounded-[14px] p-3.5 ${tone === "grey" ? "bg-ap-ground" : "bg-white"}`}
    >
      <span className="text-xs text-ap-muted">{stat.label}</span>
      <span className="font-serif text-2xl font-semibold tabular-nums text-ap-ink">
        {fmt(stat.unit, stat.value)}
      </span>
      {d ? (
        <span className="text-xs text-ap-muted">
          <strong className={TONE_TEXT[d.tone]}>{d.text}</strong>
          {stat.prev !== null && stat.prev !== undefined
            ? ` · prev. ${fmt(stat.unit, stat.prev)}`
            : ""}
        </span>
      ) : null}
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
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  label: string;
  onWhite?: boolean;
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
            className={`min-h-10 cursor-pointer rounded-full border-0 px-3.5 text-[13px] font-semibold ${
              on ? "bg-ap-ink text-white" : "bg-transparent text-ap-body hover:bg-white/70"
            }`}
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

export function cellText(unit: Column["unit"], v: number | string | null): string {
  if (typeof v === "string") return v;
  if (unit === "text") return v === null ? EMPTY : String(v);
  return fmt(unit as Unit, v);
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
 * A table from the server's Table: the first column is the row's name, the rest are
 * numbers. Every column sorts, the first also filters (as the design draws them); "Not
 * launched" rows stay at the bottom.
 */
export function DataTable({ table, minWidth = 460 }: { table: Table; minWidth?: number }) {
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  const [filtering, setFiltering] = useState(false);
  const [filter, setFilter] = useState("");
  // The design's columns: the name at least 150px, each number at least 88px (headers wrap),
  // so a five-column table fits beside a chart at 1440px.
  const hasBar = table.rows.some((r) => r.bar !== undefined);
  const gtc = [
    "minmax(150px, 1.5fr)",
    ...table.columns.slice(1).map(() => "minmax(88px, 1fr)"),
    ...(hasBar ? ["minmax(120px, 1.2fr)"] : []),
  ].join(" ");
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
        <div role="table" aria-label={table.columns[0]?.label} style={{ minWidth }}>
          <div role="row" className="grid bg-ap-ground" style={{ gridTemplateColumns: gtc }}>
            {table.columns.map((c, i) => (
              <span
                key={c.label}
                role="columnheader"
                aria-sort={sort?.col === i ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                className={`flex items-center gap-1 px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-ap-muted ${
                  i ? "justify-end text-right" : ""
                }`}
              >
                {c.label}
                {i === 0 && (
                  <button
                    type="button"
                    aria-label={`Filter ${c.label}`}
                    aria-expanded={filtering}
                    onClick={() => {
                      if (filtering) setFilter("");
                      setFiltering(!filtering);
                    }}
                    className={`inline-flex cursor-pointer border-0 bg-transparent p-0.5 ${filtering || filter ? "text-ap-violet" : "text-ap-muted"}`}
                  >
                    <FilterIcon />
                  </button>
                )}
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
                  className={`inline-flex cursor-pointer border-0 bg-transparent p-0.5 ${sort?.col === i ? "text-ap-violet" : "text-ap-muted"}`}
                >
                  <SortIcon dir={sort?.col === i ? sort.dir : null} />
                </button>
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
              <span
                role="rowheader"
                title={r.label.endsWith("(not launched)") ? "Not launched yet" : undefined}
                className="px-3.5 py-3 text-sm font-semibold text-ap-ink"
              >
                {r.label.replace(" (not launched)", "")}
              </span>
              {r.values.map((v, i) => (
                <span
                  key={i}
                  role="cell"
                  className={`px-3.5 py-3 text-right text-sm font-medium tabular-nums ${
                    r.muted || v === null || typeof v === "string" ? "text-ap-muted" : "text-ap-ink"
                  }`}
                >
                  {cellText(table.columns[i + 1]?.unit ?? "text", v)}
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

/** "Sample split" in the design; here the plain reason a part has no data. */
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
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="m-0 text-balance font-serif text-[28px] font-semibold leading-tight tracking-[-0.01em] text-ap-ink sm:text-[34px]">
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

export function LiveBadge() {
  return (
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
