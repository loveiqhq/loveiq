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
 */

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

const V3DimensionDeck: FC<Props> = ({ dimensions, accent, initialIndex = 0 }) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(initialIndex);

  // Which card is nearest the scrollport's snap edge. Measured from bounding rects
  // rather than `offsetLeft`, which is relative to the nearest positioned ancestor
  // and so carries the page's own x-offset in any centred layout.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const cards = el.querySelectorAll<HTMLElement>("[data-deck-card]");
      if (!cards.length) return;
      // At maximum scroll the last card cannot reach the snap edge — the track's
      // trailing padding is smaller than the gap it would need — so "nearest to the
      // edge" keeps naming the second-to-last one while the last is fully in view.
      // Being at the end IS being on the last card, whatever the geometry says.
      if (el.scrollLeft >= el.scrollWidth - el.clientWidth - 2) {
        setActive(cards.length - 1);
        return;
      }
      const edge = el.getBoundingClientRect().left + 22;
      let nearest = 0;
      let best = Infinity;
      cards.forEach((c, i) => {
        const d = Math.abs(c.getBoundingClientRect().left - edge);
        if (d < best) {
          best = d;
          nearest = i;
        }
      });
      setActive(nearest);
    };
    // Coalesced into one animation frame. `measure` reads six rects and the
    // scroll metrics; running that on every scroll event — a touch flick fires
    // far more than one per frame — forces a synchronous layout each time, which
    // is most of what "clunky" was. React bails out when `nearest` is unchanged,
    // so a re-render still only happens when the card actually changes.
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

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
                className={`rv3-deck__card ${isFocused ? "is-focused" : "is-peeking"}`}
                aria-roledescription="slide"
                aria-label={`${d.title}: ${d.value}`}
                style={
                  { "--rv3-deck-glyph": `url(/report/v3/dimensions/${d.key}.svg)` } as CSSProperties
                }
              >
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

                  {/* 15:1152. Peeking cards only — the focused card hides this block in
                   * every variant frame (15:1175 carries hidden="true"). Kept out of the
                   * DOM rather than visually hidden so it is not read out either. */}
                  {/* `hidden` rather than unmounted: removing a node from inside a
                   * `scroll-snap-type: x mandatory` scroller mid-gesture makes the
                   * browser re-resolve its snap target, which is visible as a
                   * snap-back. Hidden is still out of the accessibility tree, so
                   * it is not read out either. */}
                  <footer className="rv3-deck__more" hidden={isFocused}>
                    <span className="rv3-deck__more-label">Learn more in chapter:</span>
                    <span className="rv3-deck__more-item">
                      <span className="rv3-deck__bullet" aria-hidden="true" />
                      <span className="rv3-deck__chapter">{d.chapterLabel}</span>
                    </span>
                  </footer>
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
