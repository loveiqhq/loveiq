"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type FC } from "react";
import type { Report3Dimension } from "@/data/report3-archetype-card";
import PagerChevron from "./PagerChevron";
import useSciPager from "./useSciPager";

/**
 * Archetype dimension deck — the four-card swipe deck inside the archetype card.
 *
 * Figma: component "Archetype dimension deck" (15:194), variants 15:1136 (Initiation),
 * 15:1236 (Attachment) and 15:1336 (Power); placed in the archetype card as instance
 * 15:847, which opens on Communication.
 *
 * Built as a native scroll-snap carousel, the same mechanism the science deck and the
 * "next chapters" deck use, so a trackpad or a wheel scrolls it like any other
 * horizontal list. An earlier pass used pointer-drag to honour the designer's note on
 * 15:194 ("On drag advances to the next dimension and wraps at Power"), but that made
 * the deck the one thing on the page you had to press-and-drag to move. Native
 * scrolling costs the wrap at Power — a scroller stops at its end — which is worth
 * raising with Mark, but it is the behaviour every other deck here already has.
 *
 * The step is unchanged: since Mark's rebuild of 30.09 (1116:1425) a 266px card and a
 * 14px gap (268 + 12 before), and the focused card resting 22px from the viewport's
 * left edge, exactly where each frame draws it (`left: -280px x index`, 280 = 266 + 14).
 *
 * THE SWIPE (review 24.09: "the swipe is lagging, from communication - initiation -
 * attachment - power"). Focus used to move only once a swipe had SETTLED —
 * `scrollend`, or 120ms of quiet on Safari, which has none — and the two cards then
 * morphed their boxes for 260ms, animating width, height and inset: layout on every
 * frame, twice, after the card had already arrived. Now each slot lays out BOTH
 * designs, one over the other, and a change of focus only cross-fades them — opacity,
 * which the compositor runs on its own, glow included. And focus follows the swipe
 * while it travels, read from `scrollLeft` once a frame, so the arriving card is
 * already the focused one when it lands.
 *
 * DESKTOP (Sanjin, review 30.09: Attachment "jumps over", "hard to flip", "the lines"
 * hard to click). The track's trailing space was the phone's, so from about 720px the
 * scroll ended before Attachment's snap and its bar's scroll clamped to Power. The
 * trailing space now grows with the viewport, so every card reaches the snap edge at
 * any width, and from 700px the four bars are the science gallery's pager: dots, with
 * Previous and Next either side (reportV3.css; the phone keeps its lines). The bars and
 * the arrows page through useSciPager's stops, one a card: a click focuses its card at
 * once and holds it while the deck glides past the others, so a second click goes on
 * from there; the swipe's own reading takes over when the deck lands or the reader
 * scrolls.
 */

/**
 * How far past the halfway point a swipe must travel before focus moves: 60% of a
 * step each way, so a finger resting near the middle cannot flick focus back and
 * forth between the two cards it straddles.
 */
const SWITCH_AT = 0.6;

/** One card slot: 266 card + 14 gap (1116:1425). Every frame offset is a multiple of this. */
const STEP = 280;

interface Props {
  /** Exactly four, in frame order: communication, initiation, attachment, power. */
  dimensions: readonly Report3Dimension[];
  /** The archetype's own accent — `archetypePresentation[name].iconBg`, #ff6a3d for
   * Spark Seeker. Drives the focused chip, the glyphs and the active indicator. */
  accent: string;
  /** Which card opens focused. The card instance opens on Communication. */
  initialIndex?: number;
}

/** One design of a card — 15:1161 focused or 15:1139 peeking, set by its wrapper. */
const DeckFace: FC<{ d: Report3Dimension }> = ({ d }) => (
  <div className="rv3-deck__inner">
    <header className="rv3-deck__head">
      <span className="rv3-deck__chip" aria-hidden="true">
        <span className="rv3-deck__glyph" />
      </span>
      <span className="rv3-deck__labels">
        <span className="rv3-deck__title">{d.title}</span>
        <span className="rv3-deck__sub">{d.subtitle}</span>
      </span>
    </header>

    <p className="rv3-deck__value">{d.value}</p>
    <p className="rv3-deck__body">{d.body}</p>
    {/* No "Learn more in chapter" link on any card: the body is followed by blank
     * space, as 15:1136 / 15:1236 / 15:1336 draw it. Removed on Fatih's instruction,
     * 2026-09-23. */}
  </div>
);

const V3DimensionDeck: FC<Props> = ({ dimensions, accent, initialIndex = 0 }) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const viewportId = useId();
  const [active, setActive] = useState(initialIndex);
  const pager = useSciPager(viewportRef, dimensions.length, true, ".rv3-deck__slot", {
    endsWhenLastShows: true,
  });
  // Desktop review 01.10 (Mark: "Lets only have the tile that is no in view be beiged
  // out"): which cards the viewport shows whole. Only the others take the peeking design.
  const [whole, setWhole] = useState<readonly boolean[]>([]);
  // The card a click is gliding to wins over the swipe's reading until it lands.
  const heldCard = pager.held === null ? undefined : pager.stops[pager.held]?.card;
  const focus = heldCard ?? active;
  // The stop the pager stands on: the one holding the focused card. A stop a card on the
  // phone; where cards share the end, the end holds the last (and the focus is it there).
  const holding = pager.stops.findIndex((s) => s.card >= focus);
  const stop = pager.held ?? (holding < 0 ? pager.stops.length - 1 : holding);

  // Which card the swipe is on, read while it moves. Every card sits a whole STEP
  // from the one before it and snaps to the same 22px inset, so the scroll offset
  // alone says where the swipe is — no layout read, once a frame at most.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const count = dimensions.length;
    let frame = 0;
    // Its own flag, set BEFORE the frame is requested, rather than the handle
    // requestAnimationFrame returns: that handle is assigned only after the call
    // returns, so a callback run during it (a synchronous rAF, as in a test) would
    // clear a guard that is then overwritten, and the listener would wedge shut.
    let queued = false;
    const measure = () => {
      queued = false;
      // Nothing to read before layout (jsdom, a deck not drawn): its zero widths would read
      // as the end of the track.
      if (!count || el.clientWidth === 0) return;
      // Whole cards, from the slots' boxes against the viewport's.
      {
        const box = el.getBoundingClientRect();
        const from = box.left + el.clientLeft;
        const to = from + el.clientWidth;
        const next = Array.from(el.querySelectorAll<HTMLElement>(".rv3-deck__slot"), (slot) => {
          const r = slot.getBoundingClientRect();
          return r.left >= from - 1 && r.left + r.width <= to + 1;
        });
        setWhole((prev) =>
          prev.length === next.length && prev.every((w, i) => w === next[i]) ? prev : next
        );
      }
      // Being at the end IS being on the last card, whatever the offset says. Since
      // 30.09 the trailing space lets the last card reach the snap edge at any width,
      // so this only rounds a scroll that stops a pixel or two short of it.
      if (el.scrollLeft >= el.scrollWidth - el.clientWidth - 2) {
        setActive(count - 1);
        return;
      }
      const at = el.scrollLeft / STEP;
      setActive((current) =>
        Math.abs(at - current) < SWITCH_AT
          ? current
          : Math.min(count - 1, Math.max(0, Math.round(at)))
      );
    };
    const onScroll = () => {
      if (queued) return;
      queued = true;
      frame = window.requestAnimationFrame(measure);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const resize = typeof ResizeObserver === "function" ? new ResizeObserver(onScroll) : null;
    resize?.observe(el);
    onScroll();
    return () => {
      el.removeEventListener("scroll", onScroll);
      resize?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [dimensions.length]);

  // Open on the requested card without animating past the others. Assigning
  // `scrollLeft` rather than calling `scrollTo` keeps this working anywhere the
  // element API is partial — jsdom, for one, implements the property but not the
  // method, so the method would throw during tests and server-adjacent renders.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || initialIndex === 0) return;
    el.scrollLeft = initialIndex * STEP;
  }, [initialIndex]);

  return (
    <div
      className="rv3-deck"
      data-node-id="15:847"
      data-name="Archetype dimension deck"
      style={{ "--rv3-deck-accent": accent } as CSSProperties}
    >
      <div
        className="rv3-deck__viewport"
        ref={viewportRef}
        id={viewportId}
        role="group"
        aria-roledescription="carousel"
        aria-label="Your four dimensions"
        tabIndex={0}
      >
        {/* 15:1137 — the track. Cards snap 22px in, as every variant frame draws. */}
        <div className="rv3-deck__track" data-node-id="15:1137" data-name="Track">
          {dimensions.map((d, i) => {
            const isFocused = i === focus;
            const state = isFocused ? "is-focused" : whole[i] ? "is-visible" : "is-peeking";
            return (
              <article
                key={d.key}
                data-deck-card
                data-dimension={d.key}
                className={`rv3-deck__slot ${state}`}
                aria-roledescription="slide"
                aria-label={`${d.title}: ${d.value}`}
                style={
                  { "--rv3-deck-glyph": `url(/report/v4/dimensions/${d.key}.svg)` } as CSSProperties
                }
              >
                {/* Both designs, always laid out; the slot's state cross-fades them.
                 * The focused one carries the words for assistive tech. */}
                <div className="rv3-deck__card is-focused">
                  <DeckFace d={d} />
                </div>
                <div className="rv3-deck__card is-peeking" aria-hidden="true">
                  <DeckFace d={d} />
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {/* 15:1231 — four bars, the active one in the archetype's accent. From 700px they
       * are dots between Previous and Next, which the phone never draws. The arrows stay
       * focusable at the ends (aria-disabled), so a keyboard keeps its place. */}
      <div
        className="rv3-deck__dots"
        data-node-id="15:1231"
        data-name="Page indicator"
        role="group"
        aria-label="Dimension cards"
      >
        <button
          type="button"
          className="rv3-deck__arrow"
          aria-label="Previous dimension"
          aria-controls={viewportId}
          aria-disabled={stop <= 0 || undefined}
          onClick={() => {
            if (stop > 0) pager.goTo(stop - 1);
          }}
        >
          <PagerChevron back />
        </button>
        {/* A bar a stop: a stop a card on the phone, fewer where cards share the end
         * (01.10). Each names the card its stop brings in. */}
        {pager.stops.map(({ card }, k) => (
          <button
            key={dimensions[card]!.key}
            type="button"
            className={`rv3-deck__dot${k === stop ? " is-active" : ""}`}
            aria-current={k === stop}
            aria-controls={viewportId}
            onClick={() => pager.goTo(k)}
          >
            <span className="rv3-sr">Show {dimensions[card]!.title}</span>
          </button>
        ))}
        <button
          type="button"
          className="rv3-deck__arrow"
          aria-label="Next dimension"
          aria-controls={viewportId}
          aria-disabled={stop >= pager.stops.length - 1 || undefined}
          onClick={() => {
            if (stop < pager.stops.length - 1) pager.goTo(stop + 1);
          }}
        >
          <PagerChevron />
        </button>
      </div>
    </div>
  );
};

export default V3DimensionDeck;
