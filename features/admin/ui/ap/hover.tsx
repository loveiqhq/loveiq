"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import { dayCount, rangeLabel } from "@features/admin/server/ap/filters";

/**
 * Hover, tap and keyboard read-outs for AP-Analytics' charts: one card, in AP's colours, for
 * every chart. It is drawn on the page itself (a portal, fixed), so a scrolling table or a
 * card's rounded corner never cuts it off, and it stays inside the window.
 */

export interface TipRow {
  label: string;
  value: string;
  /** The series' colour, drawn as its legend mark. */
  color?: string;
  mark?: "line" | "dotted" | "dashed" | "square" | "dot";
  /** A total, set in bold. */
  strong?: boolean;
  /** A figure the point does not have ("—"), in grey. */
  muted?: boolean;
}

export interface Tip {
  title: string;
  sub?: string | null;
  rows: TipRow[];
  /** A line under the figures: why a point has none, or what it leaves out. */
  note?: string | null;
}

/**
 * A point's period as a card's title: a day with its weekday ("Tue 7 Oct 2026"), a span with
 * its ends ("6 Oct – 12 Oct 2026"); one cut short by the range says so.
 */
export function periodTitle(p: { from: string; to: string }, cutShort = false): string {
  if (p.from === p.to) {
    const day = new Date(`${p.from}T12:00:00Z`).toLocaleDateString("en-GB", {
      weekday: "short",
      timeZone: "UTC",
    });
    return `${day} ${rangeLabel(p.from, p.to)}`;
  }
  return `${rangeLabel(p.from, p.to)}${cutShort ? " (part)" : ""}`;
}

/** True when a week or month bucket is cut short by the range (its days under a whole one). */
export function isCutShort(
  p: { from: string; to: string },
  grain: "day" | "week" | "month"
): boolean {
  if (grain === "day") return false;
  const n = dayCount(p.from, p.to);
  if (grain === "week") return n < 7;
  const [y = 1970, m = 1] = p.from.split("-").map(Number);
  return !(p.from.endsWith("-01") && n === new Date(Date.UTC(y, m, 0)).getUTCDate());
}

/** The card's words in one line, for a screen reader. */
export function tipText(t: Tip): string {
  return [t.title, t.sub, ...t.rows.map((r) => `${r.label}: ${r.value}`), t.note]
    .filter((s): s is string => Boolean(s))
    .join(". ");
}

/** The index whose x (percent of the plot's width, ascending) is nearest to `pct`. */
export function nearestIndex(xs: number[], pct: number): number {
  if (xs.length === 0) return -1;
  let lo = 0;
  let hi = xs.length - 1;
  if (pct <= xs[lo]!) return lo;
  if (pct >= xs[hi]!) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid]! <= pct) lo = mid;
    else hi = mid;
  }
  return xs[hi]! - pct < pct - xs[lo]! ? hi : lo;
}

/**
 * Where the card goes, in window pixels. "side": beside the anchor, right of it or left where
 * the right has no room, centred on it; "above": over it, or under it where the top has no
 * room. Neither fitting (a phone), it is centred over the anchor. Always inside the window.
 */
export function placeTip(
  anchor: { x: number; y: number },
  size: { w: number; h: number },
  view: { w: number; h: number },
  mode: "side" | "above" = "side",
  gap = 14,
  margin = 8
): { left: number; top: number } {
  const clampX = (v: number) =>
    Math.min(Math.max(margin, v), Math.max(margin, view.w - margin - size.w));
  const clampY = (v: number) =>
    Math.min(Math.max(margin, v), Math.max(margin, view.h - margin - size.h));
  if (mode === "side") {
    if (anchor.x + gap + size.w <= view.w - margin)
      return { left: anchor.x + gap, top: clampY(anchor.y - size.h / 2) };
    if (anchor.x - gap - size.w >= margin)
      return { left: anchor.x - gap - size.w, top: clampY(anchor.y - size.h / 2) };
  }
  const left = clampX(anchor.x - size.w / 2);
  const above = anchor.y - gap - size.h;
  return { left, top: above >= margin ? above : clampY(anchor.y + gap) };
}

function Mark({ row }: { row: TipRow }) {
  if (!row.color) return <span aria-hidden="true" className="w-3.5" />;
  if (row.mark === "square" || row.mark === "dot")
    return (
      <span
        aria-hidden="true"
        className={`h-2.5 w-2.5 justify-self-center ${row.mark === "dot" ? "rounded-full" : "rounded-[3px]"}`}
        style={{ background: row.color }}
      />
    );
  return (
    <span
      aria-hidden="true"
      className="h-0 w-3.5 border-t-[3px]"
      style={{
        borderTopColor: row.color,
        borderTopStyle:
          row.mark === "dotted" ? "dotted" : row.mark === "dashed" ? "dashed" : "solid",
      }}
    />
  );
}

/**
 * The card itself. Read aloud through the chart's live line, so hidden from the tree. It
 * places itself once drawn (it has to know its own size), straight on the element.
 */
export function TipCard({
  tip,
  anchor,
  mode = "side",
}: {
  tip: Tip;
  anchor: { x: number; y: number };
  mode?: "side" | "above";
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Keyed on the words, not the object: a page builds a new one on every render.
  const words = tipText(tip);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const at = placeTip(
      { x: anchor.x, y: anchor.y },
      { w: r.width, h: r.height },
      { w: window.innerWidth, h: window.innerHeight },
      mode
    );
    el.style.left = `${at.left}px`;
    el.style.top = `${at.top}px`;
    el.style.visibility = "visible";
  }, [anchor.x, anchor.y, mode, words]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={ref}
      aria-hidden="true"
      data-ap-tip=""
      className="pointer-events-none fixed left-0 top-0 z-[60] w-max max-w-[min(300px,calc(100vw-16px))] rounded-xl border border-ap-line bg-white px-3 py-2.5 font-sans text-ap-ink shadow-[0_10px_28px_-14px_rgba(20,15,33,0.25)]"
      style={{ visibility: "hidden" }}
    >
      <div className="text-xs font-bold leading-snug">{tip.title}</div>
      {tip.sub && <div className="text-[11px] leading-snug text-ap-muted">{tip.sub}</div>}
      {tip.rows.length > 0 && (
        <div className="mt-1.5 grid grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1">
          {tip.rows.map((r) => (
            <div key={r.label} className="contents">
              <Mark row={r} />
              <span className={`text-xs ${r.muted ? "text-ap-muted" : "text-ap-body"}`}>
                {r.label}
              </span>
              <span
                className={`text-right text-xs tabular-nums ${r.muted ? "text-ap-muted" : r.strong ? "font-bold text-ap-ink" : "font-semibold text-ap-ink"}`}
              >
                {r.value}
              </span>
            </div>
          ))}
        </div>
      )}
      {tip.note && (
        <p className="m-0 mt-1.5 max-w-[260px] text-[11px] leading-snug text-ap-muted">
          {tip.note}
        </p>
      )}
    </div>,
    document.body
  );
}

/** Calls `measure` on scroll and resize while something is open: the chart moves under it. */
function useReflow(on: boolean, measure: () => void) {
  const latest = useRef(measure);
  useEffect(() => {
    latest.current = measure;
  });
  useEffect(() => {
    if (!on) return;
    const run = () => latest.current();
    window.addEventListener("scroll", run, { capture: true, passive: true });
    window.addEventListener("resize", run);
    return () => {
      window.removeEventListener("scroll", run, { capture: true });
      window.removeEventListener("resize", run);
    };
  }, [on]);
}

/** Closes a tapped card when the next tap lands elsewhere (a phone has no "mouse leaves"). */
function useTapAway(on: boolean, box: RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!on) return;
    const away = (e: globalThis.PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) close();
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [on, box, close]);
}

export interface Marker {
  /** Height from the plot's bottom, in percent. */
  y: number;
  color: string;
}

type Open = { i: number; relY: number; x: number; y: number };

/**
 * The read-out for a chart read left to right (lines, areas, columns): it sits over the plot
 * (the box the drawing fills) and follows the pointer to the nearest point, drawing a guide
 * line (or a column's band) and a dot on each line, with the card beside it. A tap shows it
 * on a phone; focused, the left and right arrow keys step through the points, and a screen
 * reader hears each one.
 */
export function IndexHover({
  xs,
  tip,
  markers,
  band,
  label,
  focusable = true,
  onPick,
  className = "absolute inset-0",
}: {
  /** Each point's x, in percent of the box's width, ascending. */
  xs: number[];
  tip: (i: number) => Tip | null;
  markers?: (i: number) => Marker[];
  /** A column's slot, in percent, to tint in place of the guide line. */
  band?: (i: number) => { left: number; width: number } | null;
  /** What the chart is, for a screen reader. */
  label: string;
  /** Off where the chart sits inside something focusable already (a link, a picked row). */
  focusable?: boolean;
  /** A click on a point (test that price, open that row). */
  onPick?: (i: number) => void;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const [live, setLive] = useState("");
  const [touch, setTouch] = useState(false);
  // A click focuses the box too: that focus must not jump to the last point.
  const pressed = useRef(false);
  const n = xs.length;

  const place = (i: number, relY: number): Open | null => {
    const el = box.current;
    if (!el || i < 0 || i >= n) return null;
    const r = el.getBoundingClientRect();
    return { i, relY, x: r.left + (xs[i]! / 100) * r.width, y: r.top + relY * r.height };
  };
  const show = (i: number, relY: number) => setOpen(place(i, relY));
  useReflow(open !== null, () => setOpen((o) => (o ? place(o.i, o.relY) : o)));
  const close = useCallback(() => {
    setOpen(null);
    setTouch(false);
  }, []);
  useTapAway(touch && open !== null, box, close);

  const at = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width <= 0 || n === 0) return;
    const i = nearestIndex(xs, ((e.clientX - r.left) / r.width) * 100);
    const relY = Math.min(0.9, Math.max(0.1, (e.clientY - r.top) / Math.max(1, r.height)));
    if (open && open.i === i && Math.abs(open.relY - relY) < 0.02) return;
    show(i, relY);
  };
  const step = (i: number) => {
    const k = Math.max(0, Math.min(n - 1, i));
    show(k, 0.25);
    const t = tip(k);
    setLive(t ? tipText(t) : "");
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (n === 0) return;
    const now = open?.i ?? n - 1;
    // Left and right only: up and down still scroll the page.
    const moves: Record<string, number> = {
      ArrowLeft: now - 1,
      ArrowRight: now + 1,
      Home: 0,
      End: n - 1,
    };
    if (e.key in moves) {
      e.preventDefault();
      step(moves[e.key]!);
    } else if (e.key === "Escape") {
      close();
      setLive("");
    } else if ((e.key === "Enter" || e.key === " ") && onPick && open) {
      e.preventDefault();
      onPick(open.i);
    }
  };

  const t = open ? tip(open.i) : null;
  const slot = open && band ? band(open.i) : null;
  return (
    <div
      ref={box}
      data-ap-hover=""
      tabIndex={focusable ? 0 : undefined}
      role={focusable ? "group" : undefined}
      aria-roledescription={focusable ? "chart" : undefined}
      aria-label={
        focusable ? `${label}. Use the left and right arrow keys to read each point.` : undefined
      }
      aria-hidden={focusable ? undefined : true}
      className={`${className} z-[2] cursor-crosshair touch-pan-y`}
      onPointerMove={(e) => {
        if (e.pointerType === "mouse" || e.buttons) at(e);
      }}
      onPointerDown={(e) => {
        pressed.current = true;
        at(e);
        setTouch(e.pointerType !== "mouse");
      }}
      onPointerUp={() => {
        pressed.current = false;
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") close();
      }}
      onPointerCancel={close}
      onClick={() => {
        if (onPick && open) onPick(open.i);
      }}
      onKeyDown={focusable ? onKey : undefined}
      onFocus={() => {
        if (!pressed.current && !open && n) step(n - 1);
      }}
      onBlur={() => {
        close();
        setLive("");
      }}
    >
      {open && slot && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 rounded-md bg-ap-purple/[0.08]"
          style={{ left: `${slot.left}%`, width: `${slot.width}%` }}
        />
      )}
      {open && !slot && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-px -translate-x-1/2 bg-ap-ink/25"
          style={{ left: `${xs[open.i]}%` }}
        />
      )}
      {open &&
        markers?.(open.i).map((m, k) => (
          <span
            key={k}
            aria-hidden="true"
            className="pointer-events-none absolute -mb-[5px] -ml-[5px] h-2.5 w-2.5 rounded-full shadow-[0_0_0_2px_#ffffff]"
            style={{ left: `${xs[open.i]}%`, bottom: `${m.y}%`, background: m.color }}
          />
        ))}
      {focusable && (
        <span className="sr-only" aria-live="polite">
          {live}
        </span>
      )}
      {open && t && <TipCard tip={t} anchor={{ x: open.x, y: open.y }} />}
    </div>
  );
}

/**
 * The read-out for a scatter: the nearest point within reach of the pointer, ringed, with
 * the card over it. Focused, the left and right arrow keys step through the points.
 */
export function PointHover({
  points,
  tip,
  label,
  reach = 28,
  className = "absolute inset-0",
}: {
  /** Each point's position in percent of the box (y from the bottom) and its size in px. */
  points: Array<{ x: number; y: number; size: number }>;
  tip: (i: number) => Tip;
  label: string;
  /** How far from a point's edge (px) the pointer still picks it. */
  reach?: number;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<{ i: number; x: number; y: number } | null>(null);
  const [live, setLive] = useState("");
  const [touch, setTouch] = useState(false);
  const pressed = useRef(false);
  const order = points
    .map((p, i) => ({ p, i }))
    .sort((a, b) => a.p.x - b.p.x || a.p.y - b.p.y)
    .map((o) => o.i);

  const place = (i: number) => {
    const el = box.current;
    const p = points[i];
    if (!el || !p) return null;
    const r = el.getBoundingClientRect();
    return {
      i,
      x: r.left + (p.x / 100) * r.width,
      y: r.top + (1 - p.y / 100) * r.height - p.size / 2,
    };
  };
  useReflow(open !== null, () => setOpen((o) => (o ? place(o.i) : o)));
  const close = useCallback(() => {
    setOpen(null);
    setTouch(false);
  }, []);
  useTapAway(touch && open !== null, box, close);

  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    let best = -1;
    let dist = Infinity;
    points.forEach((p, i) => {
      const dx = r.left + (p.x / 100) * r.width - e.clientX;
      const dy = r.top + (1 - p.y / 100) * r.height - e.clientY;
      const d = Math.hypot(dx, dy) - p.size / 2;
      if (d < dist) {
        dist = d;
        best = i;
      }
    });
    if (best < 0 || dist > reach) {
      if (open) setOpen(null);
      return;
    }
    if (open?.i !== best) setOpen(place(best));
  };
  const step = (k: number) => {
    if (!order.length) return;
    const i = order[Math.max(0, Math.min(order.length - 1, k))]!;
    setOpen(place(i));
    setLive(tipText(tip(i)));
  };
  const at = open ? order.indexOf(open.i) : -1;
  const p = open ? points[open.i] : null;
  return (
    <div
      ref={box}
      data-ap-hover=""
      tabIndex={0}
      role="group"
      aria-roledescription="chart"
      aria-label={`${label}. Use the left and right arrow keys to read each point.`}
      className={`${className} z-[2] touch-pan-y ${open ? "cursor-pointer" : ""}`}
      onPointerMove={(e) => {
        if (e.pointerType === "mouse" || e.buttons) pick(e);
      }}
      onPointerDown={(e) => {
        pressed.current = true;
        pick(e);
        setTouch(e.pointerType !== "mouse");
      }}
      onPointerUp={() => {
        pressed.current = false;
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") close();
      }}
      onPointerCancel={close}
      onKeyDown={(e) => {
        const moves: Record<string, number> = {
          ArrowLeft: at - 1,
          ArrowRight: at + 1,
          Home: 0,
          End: order.length - 1,
        };
        if (e.key in moves) {
          e.preventDefault();
          step(at < 0 && e.key === "ArrowRight" ? 0 : moves[e.key]!);
        } else if (e.key === "Escape") {
          close();
          setLive("");
        }
      }}
      onFocus={() => {
        if (!pressed.current && !open) step(0);
      }}
      onBlur={() => {
        close();
        setLive("");
      }}
    >
      {p && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute rounded-full border-2 border-ap-ink"
          style={{
            left: `${p.x}%`,
            bottom: `${p.y}%`,
            width: p.size + 8,
            height: p.size + 8,
            transform: "translate(-50%, 50%)",
          }}
        />
      )}
      <span className="sr-only" aria-live="polite">
        {live}
      </span>
      {open && <TipCard tip={tip(open.i)} anchor={{ x: open.x, y: open.y }} mode="above" />}
    </div>
  );
}

/**
 * The read-out for a chart drawn as rows or separate marks (a bar per group): `bind` gives a
 * row its pointer handlers, and `card` is the card to render once. Pointer and tap only: these
 * rows show their figures as text, and what the card adds is also in the row for a screen reader.
 */
export function useRowTip() {
  const [open, setOpen] = useState<{ tip: Tip; el: HTMLElement; x: number; y: number } | null>(
    null
  );
  const [touch, setTouch] = useState(false);
  const row = useRef<HTMLElement | null>(null);
  const place = (tip: Tip, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return { tip, el, x: r.left + r.width / 2, y: r.top };
  };
  useReflow(open !== null, () => setOpen((o) => (o ? place(o.tip, o.el) : o)));
  const close = useCallback(() => {
    setOpen(null);
    setTouch(false);
  }, []);
  useTapAway(touch && open !== null, row, close);
  const bind = (tip: () => Tip) => ({
    "data-ap-row-tip": "",
    onPointerEnter: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType !== "mouse") return;
      row.current = e.currentTarget;
      setOpen(place(tip(), e.currentTarget));
    },
    onPointerLeave: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse") close();
    },
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse") return;
      row.current = e.currentTarget;
      setTouch(true);
      setOpen(place(tip(), e.currentTarget));
    },
  });
  return {
    bind,
    card: open ? <TipCard tip={open.tip} anchor={{ x: open.x, y: open.y }} mode="above" /> : null,
  };
}

/** The highlight a chart's row gets under the pointer. */
export const ROW_HOVER = "-mx-2 rounded-lg px-2 hover:bg-ap-ground";

/** A run of points with no figure at all, as a band in percent of the plot's width. */
export interface GapSpan {
  left: number;
  width: number;
  /** "No figures before 16 Sep". */
  label: string;
}

/**
 * The stretches of a chart where no line has a figure: those at either end, and inside ones of
 * three points or more (a lone missing day just breaks the line). `xs` are the points' x in
 * percent; a band reaches half way to the next point with a figure.
 */
export function gapSpans(
  series: Array<Array<number | null>>,
  xs: number[],
  labels: string[]
): GapSpan[] {
  const n = xs.length;
  if (n === 0) return [];
  const empty = Array.from({ length: n }, (_, i) =>
    series.every((s) => s[i] === null || s[i] === undefined || !Number.isFinite(s[i]!))
  );
  if (empty.every(Boolean)) return [];
  const half = (i: number, j: number) => (xs[i]! + xs[j]!) / 2;
  const out: GapSpan[] = [];
  for (let i = 0; i < n; i++) {
    if (!empty[i]) continue;
    let j = i;
    while (j + 1 < n && empty[j + 1]) j++;
    const lead = i === 0;
    const tail = j === n - 1;
    if (lead || tail || j - i + 1 >= 3) {
      const left = lead ? 0 : half(i - 1, i);
      const right = tail ? 100 : half(j, j + 1);
      out.push({
        left,
        width: right - left,
        label: lead
          ? `No figures before ${labels[j + 1] ?? ""}`.trim()
          : tail
            ? `No figures after ${labels[i - 1] ?? ""}`.trim()
            : "No figures",
      });
    }
    i = j;
  }
  return out;
}

/** The bands themselves, hatched, behind the lines, named where there is room. */
export function GapBands({ spans }: { spans: GapSpan[] }) {
  return spans.map((g): ReactNode => (
    <span
      key={`${g.left}-${g.width}`}
      aria-hidden="true"
      data-ap-gap=""
      className="pointer-events-none absolute inset-y-0 overflow-hidden rounded-md"
      style={{
        left: `${g.left}%`,
        width: `${g.width}%`,
        background:
          "repeating-linear-gradient(135deg, #f5f6f8 0 6px, rgba(245,246,248,0.35) 6px 12px)",
      }}
    >
      {g.width >= 14 && (
        <span className="absolute left-2 top-1.5 max-w-[calc(100%-16px)] text-[11px] font-semibold leading-snug text-ap-muted">
          {g.label}
        </span>
      )}
    </span>
  ));
}
