"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type FC } from "react";
import type { Report3Dimension } from "@/data/report3-archetype-card";

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
 * The card geometry is unchanged: a 268px slot, 12px gap, and the focused card
 * resting 22px from the viewport's left edge, exactly where each variant frame draws
 * it (`left: -280px x index`, 280 = 268 + 12).
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
 */

/**
 * How far past the halfway point a swipe must travel before focus moves: 60% of a
 * step each way, so a finger resting near the middle cannot flick focus back and
 * forth between the two cards it straddles.
 */
const SWITCH_AT = 0.6;

/** One card slot: 268 card + 12 gap. Every frame offset is a multiple of this. */
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
  const [active, setActive] = useState(initialIndex);

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
      if (!count) return;
      // At maximum scroll the last card cannot reach the snap edge — the track's
      // trailing padding is smaller than the gap it would need — so being at the
      // end IS being on the last card, whatever the offset says.
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
    return () => {
      el.removeEventListener("scroll", onScroll);
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

  const goTo = useCallback((index: number) => {
    const el = viewportRef.current;
    if (!el) return;
    const left = index * STEP;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (!reduced && typeof el.scrollTo === "function") {
      el.scrollTo({ left, behavior: "smooth" });
    } else {
      el.scrollLeft = left;
    }
  }, []);

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
        role="group"
        aria-roledescription="carousel"
        aria-label="Your four dimensions"
        tabIndex={0}
      >
        {/* 15:1137 — the track. Cards snap 22px in, as every variant frame draws. */}
        <div className="rv3-deck__track" data-node-id="15:1137" data-name="Track">
          {dimensions.map((d, i) => {
            const isFocused = i === active;
            return (
              <article
                key={d.key}
                data-deck-card
                data-dimension={d.key}
                className={`rv3-deck__slot ${isFocused ? "is-focused" : "is-peeking"}`}
                aria-roledescription="slide"
                aria-label={`${d.title}: ${d.value}`}
                style={
                  { "--rv3-deck-glyph": `url(/report/v3/dimensions/${d.key}.svg)` } as CSSProperties
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

      {/* 15:1231 — four bars, the active one in the archetype's accent. */}
      <div className="rv3-deck__dots" data-node-id="15:1231" data-name="Page indicator">
        {dimensions.map((d, i) => (
          <button
            key={d.key}
            type="button"
            className={`rv3-deck__dot${i === active ? " is-active" : ""}`}
            aria-current={i === active}
            onClick={() => goTo(i)}
          >
            <span className="rv3-sr">Show {d.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default V3DimensionDeck;
