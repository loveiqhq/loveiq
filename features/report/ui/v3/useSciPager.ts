"use client";

import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";

/**
 * The science deck's pager from 700px — Mark's desktop review (Notion, 28.09): "Should
 * also be a tile gallery that you can click through." Previous, Next and a dot per stop.
 *
 * A stop is a scrollLeft the deck can rest on: a tile's snap position, clamped to the
 * scroll's end. With two to four tiles in view the last ones can only reach the end, so
 * they share its stop, as does a stop within MERGE_PX of it; the phone's geometry gives
 * one stop a tile, the seven its own dots show. Positions are bounding rects against the
 * snap edge, never offsetLeft, so they hold wherever the deck sits (V3Methodology's own
 * dot tracking says why).
 *
 * A click marks its stop at once and holds it while the deck glides, so a second click
 * goes on from there; the scroll ending, the reader taking over (wheel, pointer, key) or
 * a resize lets the pager follow the deck again.
 */
export interface SciStop {
  /** The scrollLeft that lands on it. */
  left: number;
  /** The tile it brings in: the one at the snap edge; for the end stop, the last. */
  card: number;
}

const MERGE_PX = 40;

/** The deck's stops, from each tile's snap position and the scroll's end. */
export const sciStops = (lefts: readonly number[], max: number): SciStop[] =>
  lefts.reduce<SciStop[]>((stops, raw, card) => {
    const left = Math.round(Math.min(max, Math.max(0, raw)));
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
const measure = (track: HTMLElement): SciStop[] | null => {
  const cards = track.querySelectorAll<HTMLElement>(".rv3-sci__card");
  if (cards.length < 2 || track.clientWidth === 0) return null;
  const max = track.scrollWidth - track.clientWidth;
  if (max <= 0) return [];
  const pad = Number.parseFloat(getComputedStyle(track).scrollPaddingInlineStart) || 0;
  const edge = track.getBoundingClientRect().left + track.clientLeft + pad;
  return sciStops(
    Array.from(cards, (card) => track.scrollLeft + card.getBoundingClientRect().left - edge),
    max
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
  enabled: boolean
) {
  const [stops, setStops] = useState<SciStop[] | null>(null);
  const [at, setAt] = useState(0);
  const stopsRef = useRef<SciStop[] | null>(null);
  // The stop a click is gliding to, until the deck arrives or the reader takes over.
  const pendingRef = useRef<number | null>(null);

  const remeasure = useCallback(() => {
    const next = trackRef.current ? measure(trackRef.current) : null;
    stopsRef.current = next;
    setStops((prev) => (sameStops(prev, next) ? prev : next));
    return next;
  }, [trackRef]);

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
      pendingRef.current = null;
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

  return { stops: shown, at, goTo, step };
}
