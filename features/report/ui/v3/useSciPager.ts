"use client";

import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";

/**
 * The science deck's pager from 700px — Mark's desktop review (Notion, 28.09): "Should
 * also be a tile gallery that you can click through." Previous, Next and a dot per stop.
 *
 * A stop is a scrollLeft the deck can rest on: a tile's snap position, clamped to the
 * scroll's end. With two and a half tiles in view (Mark, 30.09: "only see 2,5") the last
 * two can only reach the end, so they share its stop, as does a stop within MERGE_PX of
 * it; the phone's geometry gives one stop a tile, the seven its own dots show. MERGE_PX is under the tile's own
 * padding: folding a stop any further from the end would let a swipe park the deck
 * there with the last tile's words still cut, while the pager said "end" (review,
 * 29.09: 34px at 1200, 38px at 1366). Positions are bounding rects against the snap
 * edge, never offsetLeft, so they hold wherever the deck sits (V3Methodology's own dot
 * tracking says why).
 *
 * A click marks its stop at once and holds it while the deck glides, so a second click
 * goes on from there; the scroll ending, the reader taking over (wheel, pointer, key) or
 * a resize lets the pager follow the deck again. `held` says which stop is held, for a
 * deck whose own focus should follow the click (V3DimensionDeck, desktop review 30.09).
 *
 * The archetype card's dimension deck pages with it too, so what a stop is measured from
 * is a parameter: the science tiles by default, the deck's slots there.
 *
 * THE END (desktop review 01.10, Mark on the deck: "lets not have this white space next to
 * the last tile when you click through… one click to the right is already okay"). With
 * `endsWhenLastShows`, a stop at which the last item already shows whole IS the end: it
 * and every stop after it fold into the scroll's end. Otherwise a deck that ends 22px
 * after its last card kept a stop one card in and then a 17px nudge to the end.
 */
export interface SciStop {
  /** The scrollLeft that lands on it. */
  left: number;
  /** The tile it brings in: the one at the snap edge; for the end stop, the last. */
  card: number;
}

const MERGE_PX = 12;

/**
 * The deck's stops, from each tile's snap position and the scroll's end. `endAt`, when
 * given, is the first scroll position at which the last tile shows whole: a stop there or
 * past it is the end.
 */
export const sciStops = (lefts: readonly number[], max: number, endAt?: number): SciStop[] =>
  lefts.reduce<SciStop[]>((stops, raw, card) => {
    // Never the first: the start stays reachable however little the deck scrolls.
    const reachesEnd = card > 0 && endAt !== undefined && raw >= endAt - 1;
    const left = Math.round(reachesEnd ? max : Math.min(max, Math.max(0, raw)));
    const last = stops[stops.length - 1];
    if (last && stops.length > 1 && left - last.left < MERGE_PX) {
      last.left = left;
      last.card = card;
    } else {
      stops.push({ left, card });
    }
    return stops;
  }, []);

/** The index of the stop nearest `x`. */
export const nearestSciStop = (stops: readonly SciStop[], x: number): number =>
  stops.reduce(
    (best, stop, k) => (Math.abs(stop.left - x) < Math.abs(stops[best]!.left - x) ? k : best),
    0
  );

/** Null before layout (jsdom, a deck not drawn); empty when every tile fits. */
const measure = (
  track: HTMLElement,
  items: string,
  endsWhenLastShows: boolean
): SciStop[] | null => {
  const cards = track.querySelectorAll<HTMLElement>(items);
  if (cards.length < 2 || track.clientWidth === 0) return null;
  const max = track.scrollWidth - track.clientWidth;
  if (max <= 0) return [];
  const pad = Number.parseFloat(getComputedStyle(track).scrollPaddingInlineStart) || 0;
  const box = track.getBoundingClientRect().left + track.clientLeft;
  const edge = box + pad;
  const last = cards[cards.length - 1]!.getBoundingClientRect();
  // The scroll at which the last tile's right edge meets the viewport's.
  const endAt = endsWhenLastShows
    ? track.scrollLeft + last.left + last.width - box - track.clientWidth
    : undefined;
  return sciStops(
    Array.from(cards, (card) => track.scrollLeft + card.getBoundingClientRect().left - edge),
    max,
    endAt
  );
};

const sameStops = (a: readonly SciStop[] | null, b: readonly SciStop[] | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.length === b.length &&
    a.every((stop, i) => stop.left === b[i]!.left && stop.card === b[i]!.card));

export default function useSciPager(
  trackRef: RefObject<HTMLElement | null>,
  count: number,
  enabled: boolean,
  /** The items a stop is measured from: each one that snaps. */
  items = ".rv3-sci__card",
  /** A stop that already shows the last item whole is the end (see THE END above). */
  { endsWhenLastShows = false }: { endsWhenLastShows?: boolean } = {}
) {
  const [stops, setStops] = useState<SciStop[] | null>(null);
  const [at, setAt] = useState(0);
  const stopsRef = useRef<SciStop[] | null>(null);
  // The stop a click is gliding to, until the deck arrives or the reader takes over;
  // `held` is the same, for the render.
  const pendingRef = useRef<number | null>(null);
  const [held, setHeld] = useState<number | null>(null);

  const remeasure = useCallback(() => {
    const next = trackRef.current ? measure(trackRef.current, items, endsWhenLastShows) : null;
    stopsRef.current = next;
    setStops((prev) => (sameStops(prev, next) ? prev : next));
    return next;
  }, [endsWhenLastShows, items, trackRef]);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!enabled || !track) return;
    let frame = 0;
    let queued = false;
    const read = () => {
      queued = false;
      const list = stopsRef.current ?? remeasure();
      if (!list?.length) return;
      const pending = pendingRef.current;
      if (pending !== null) {
        const target = list[pending]?.left;
        if (target !== undefined && Math.abs(track.scrollLeft - target) > 2) return;
        pendingRef.current = null;
        setHeld(null);
      }
      setAt(nearestSciStop(list, track.scrollLeft));
    };
    const onScroll = () => {
      // Set before scheduling: a frame callback that runs synchronously clears it.
      if (queued) return;
      queued = true;
      frame = requestAnimationFrame(read);
    };
    const release = () => {
      if (pendingRef.current === null) return;
      pendingRef.current = null;
      setHeld(null);
    };
    const settle = () => {
      release();
      read();
    };
    const onResize = () => {
      release();
      remeasure();
      read();
    };
    // The first measure waits a frame, for the deck's layout, as every later one waits
    // for a scroll, a resize or a click; the observer's own first call measures too.
    const first =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame(() => {
            remeasure();
            read();
          })
        : 0;
    track.addEventListener("scroll", onScroll, { passive: true });
    track.addEventListener("scrollend", settle);
    const takeover = ["wheel", "pointerdown", "keydown"] as const;
    takeover.forEach((type) => track.addEventListener(type, release, { passive: true }));
    const resize = typeof ResizeObserver === "function" ? new ResizeObserver(onResize) : null;
    resize?.observe(track);
    return () => {
      track.removeEventListener("scroll", onScroll);
      track.removeEventListener("scrollend", settle);
      takeover.forEach((type) => track.removeEventListener(type, release));
      resize?.disconnect();
      if (typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(frame);
        cancelAnimationFrame(first);
      }
    };
  }, [enabled, remeasure, trackRef]);

  // Before layout, a dot a tile, as the phone's row has.
  const shown: readonly SciStop[] =
    stops ?? Array.from({ length: count }, (_, card) => ({ left: Number.NaN, card }));

  const goTo = (index: number) => {
    const track = trackRef.current;
    const list = remeasure();
    if (!track || !list?.length) return;
    const k = Math.max(0, Math.min(list.length - 1, index));
    const left = list[k]!.left;
    setAt(k);
    if (Math.abs(track.scrollLeft - left) <= 2) return;
    pendingRef.current = k;
    setHeld(k);
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (typeof track.scrollTo === "function") {
      track.scrollTo({ left, behavior: reduce ? "auto" : "smooth" });
    } else {
      track.scrollLeft = left;
    }
  };

  const step = (by: -1 | 1) => {
    const to = (pendingRef.current ?? at) + by;
    if (to >= 0 && to <= shown.length - 1) goTo(to);
  };

  return { stops: shown, at, held, goTo, step };
}
