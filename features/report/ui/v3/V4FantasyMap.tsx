"use client";

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FC } from "react";
import type { FantasyMapDot } from "@features/report/server/fantasyMap";
import {
  MAP_DOTS,
  MAP_FILTERS,
  QUADRANTS,
  type MapDot,
  type MapFilter,
  type Quadrant,
} from "../sections/FantasySection";
import V4LockBadge from "./V4LockBadge";
import { placeNames, type NameDot, type NameSpot } from "./fantasyMapNames";
import { guardedUnlock } from "./v4Unlock";

/**
 * The fantasy map over the table — Figma 696:4393 in the open chapter (304:290),
 * 368:3481 in the paywalled one (305:217). V2's map, in V4's drawing: the same five
 * filters, the four quadrants, sixteen dots placed by fantasy pull and lived
 * pleasure, and V2's readout behind every dot.
 *
 * THE DOTS. A paying reader's come from the server view (getFantasyMapDots, as V2's
 * map takes them): the archetype's most characteristic fantasies, eight printed.
 * Their names are measured and set where they cover nothing (fantasyMapNames), and
 * sit under their dots, V2's rule, until the plot has a size. A name with no clear
 * spot is hidden, not dropped, so it is measured again when the plot grows. Without
 * them the map draws V2's illustrative layout, which is what Figma draws, the names
 * on the sides 696:4407 sets by hand.
 *
 * PAYWALLED. The plot sits under the blur with the lock on it, and the plot owns the
 * click; the chips, axes and caption stay sharp. What it draws there is what the
 * server sends (lockedBlurCopy.ts): the reader's own dots since review 26.09 ("the
 * unlocked content but blurred"), or none in decoy mode, when it draws the
 * illustrative layout — never sharp, where invented placements would read as the
 * reader's own.
 *
 * No copy is quoted in these comments on purpose: production serves browser source
 * maps, so a client component's comments are public.
 */

interface Props {
  /** The reader's own dots (buildFantasy), blurred when locked; null draws V2's illustrative layout. */
  dots: FantasyMapDot[] | null;
  locked: boolean;
  /** Opens the paywall. Omitted where it would be inert. */
  onUnlock?: () => void;
}

/** Where 696:4407 prints an illustrative name ("end": flush with the dot's right). */
type Place = "below" | "left" | "right" | "above-end" | "below-end";

/** 696:4407's side for each illustrative name. */
const FIGMA_PLACE: Readonly<Record<string, Place>> = {
  "Mutual surrender": "left",
  "Sacred kink": "left",
  Tantra: "left",
  "Slow builds": "above-end",
  "Emotional release": "below-end",
  "Voice & sound": "below",
  "Public play": "right",
  Quickies: "right",
};

const PLACE_CLASS: Readonly<Record<Place, string>> = {
  below: "is-below",
  left: "is-left",
  right: "is-right",
  "above-end": "is-above is-end",
  "below-end": "is-below is-end",
};

/** A dot's ring: its fill's radius and the 1.5 white ring — `--fvm-r` in the CSS. */
const RING: Readonly<Record<Quadrant, number>> = { lean: 7.5, keep: 6.5, hidden: 6.5, not: 6.5 };

const sameSpots = (a: (NameSpot | null)[] | null, b: (NameSpot | null)[]) =>
  a !== null &&
  a.length === b.length &&
  a.every((s, i) => s?.side === b[i]?.side && s?.shift === b[i]?.shift);

const ZONE: Readonly<Record<Quadrant, string>> = Object.fromEntries(
  QUADRANTS.map((quad) => [quad.id, quad.label])
) as Record<Quadrant, string>;

/** 696:4444 — V2's chart note, less its clause about dragging dots. */
const CAPTION =
  "Hover or tap any dot for its name and note. Placements start from your archetype's typical pattern.";

/** A score as V2's readout draws it: the value over ten pips, filled to it. */
const Meter: FC<{ label: string; value: number }> = ({ label, value }) => (
  <span className="rv4-fvm__meter">
    <span className="rv4-fvm__meter-head">
      <span className="rv4-fvm__meter-label">{label}</span>
      <span className="rv4-fvm__meter-value">{value}</span>
    </span>
    <span className="rv4-fvm__meter-pips">
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className={i < value ? "is-on" : undefined} />
      ))}
    </span>
  </span>
);

const V4FantasyMap: FC<Props> = ({ dots, locked, onUnlock }) => {
  const [filter, setFilter] = useState<MapFilter>("all");
  /** Which dot is open. Hover, focus and tap all drive this one value (V2). */
  const [openDot, setOpenDot] = useState<number | null>(null);
  /*
   * V2's touch handling: a tap is pointerdown → focus (which opens the readout) →
   * click, so the click may only toggle for touch, and must know whether the dot
   * was open before the tap began.
   */
  const wasTouch = useRef(false);
  const wasOpen = useRef(false);

  /** The reader's own dots when the server sent them (blurred if locked); else V2's layout. */
  const own = Boolean(dots?.length);
  const shown: readonly MapDot[] = own ? dots! : MAP_DOTS;
  const points = useMemo<NameDot[]>(
    () => shown.map((dot) => ({ x: dot.x, y: dot.y, r: RING[dot.q] })),
    [shown]
  );
  const frameRef = useRef<HTMLDivElement>(null);
  const [spots, setSpots] = useState<(NameSpot | null)[] | null>(null);

  /*
   * Sets the reader's names once the plot and the names have sizes: again when the
   * plot or a name resizes (a web font landing changes a name's width), when the
   * fonts report ready, and when the map comes on screen, as useRampFit does.
   */
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!own || !frame) return;
    let live = true;
    const place = () => {
      if (!live) return;
      const box = frame.getBoundingClientRect();
      if (!box.width) return;
      const sizes = [...frame.querySelectorAll<HTMLElement>(".rv4-fvm__dot")].map((dot) => {
        const name = dot.querySelector<HTMLElement>(".rv4-fvm__name")?.getBoundingClientRect();
        return name ? { width: name.width, height: name.height } : null;
      });
      const titles = [...frame.querySelectorAll<HTMLElement>(".rv4-fvm__zone")].map((zone) => {
        const r = zone.getBoundingClientRect();
        return {
          left: r.left - box.left,
          top: r.top - box.top,
          right: r.right - box.left,
          bottom: r.bottom - box.top,
        };
      });
      const next = placeNames(points, sizes, box.width, titles);
      setSpots((prev) => (sameSpots(prev, next) ? prev : next));
    };
    place();
    const resized = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    resized?.observe(frame);
    // And each name: a web font landing changes its width without resizing the plot,
    // and WebKit fires no event for a face that lands after mount.
    for (const name of frame.querySelectorAll(".rv4-fvm__name")) resized?.observe(name);
    const onScreen =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) place();
          });
    onScreen?.observe(frame);
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    fonts?.ready.then(place).catch(() => {});
    fonts?.addEventListener?.("loadingdone", place);
    return () => {
      live = false;
      resized?.disconnect();
      onScreen?.disconnect();
      fonts?.removeEventListener?.("loadingdone", place);
    };
  }, [own, points]);

  const plot = (
    <div
      className={`rv4-fvm__plot${locked ? " rv4-fvm__blurred" : ""}`}
      data-node-id={locked ? undefined : "696:4407"}
      aria-hidden={locked ? true : undefined}
      inert={locked || undefined}
    >
      {QUADRANTS.map((quad) => (
        <div key={quad.id} className="rv4-fvm__quad" data-zone={quad.id}>
          <span className="rv4-fvm__zone">{quad.label}</span>
        </div>
      ))}
      <div className="rv4-fvm__dots">
        {shown.map((dot, i) => {
          const name = dot.name ?? dot.label ?? null;
          const pull = dot.pull ?? null;
          const pleasure = dot.pleasure ?? null;
          const zone = ZONE[dot.q];
          const open = openDot === i;
          const dimmed = filter !== "all" && dot.q !== filter;
          // V2's flips, toward the middle near an edge — but under the dot in the plot's
          // upper 45%, not V2's quarter: this readout is full size, V2's two thirds.
          const flip = `${dot.x > 0.55 ? " is-flip-x" : dot.x < 0.45 ? " is-flip-start" : ""}${
            dot.y < 0.45 ? " is-flip-y" : ""
          }`;
          const readout = [
            name ?? zone,
            pull === null ? null : `fantasy pull ${pull} of 10`,
            pleasure === null ? null : `lived pleasure ${pleasure} of 10`,
            `zone: ${zone}`,
          ]
            .filter(Boolean)
            .join(", ");
          return (
            <button
              key={i}
              type="button"
              className={`rv4-fvm__dot rv4-fvm__dot--${dot.q}${dimmed ? " is-dim" : ""}${
                open ? " is-open" : ""
              }${flip}`}
              style={
                { "--fvm-x": `${dot.x * 100}%`, "--fvm-y": `${dot.y * 100}%` } as CSSProperties
              }
              aria-label={readout}
              aria-expanded={open}
              onMouseEnter={() => setOpenDot(i)}
              onMouseLeave={() => setOpenDot((c) => (c === i ? null : c))}
              onFocus={() => setOpenDot(i)}
              onBlur={() => setOpenDot((c) => (c === i ? null : c))}
              onPointerDown={(event) => {
                wasTouch.current = event.pointerType === "touch";
                wasOpen.current = openDot === i;
              }}
              onClick={() => {
                // Mouse: hover governs. Touch: toggle.
                if (!wasTouch.current) return;
                setOpenDot(wasOpen.current ? null : i);
              }}
            >
              {/* The dot's centre: the pip, its name and its readout hang from it. */}
              <span className="rv4-fvm__anchor">
                <span className="rv4-fvm__pip" />
                {dot.label && own ? (
                  <span
                    className={`rv4-fvm__name is-${spots?.[i]?.side ?? "below"}${
                      spots && !spots[i] ? " is-hidden" : ""
                    }`}
                    style={{ "--fvm-shift": `${spots?.[i]?.shift ?? 0}px` } as CSSProperties}
                  >
                    {dot.label}
                  </span>
                ) : dot.label ? (
                  <span
                    className={`rv4-fvm__name ${PLACE_CLASS[FIGMA_PLACE[dot.label] ?? "below"]}`}
                  >
                    {dot.label}
                  </span>
                ) : null}
                <span className="rv4-fvm__readout" aria-hidden="true">
                  <span className="rv4-fvm__readout-zone">{zone}</span>
                  {name ? <span className="rv4-fvm__readout-name">{name}</span> : null}
                  {pull !== null && pleasure !== null ? (
                    <span className="rv4-fvm__meters">
                      <Meter label="Fantasy pull" value={pull} />
                      <Meter label="Lived pleasure" value={pleasure} />
                    </span>
                  ) : null}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div
      className={`rv4-fvm${openDot === null ? "" : " is-inspecting"}`}
      data-node-id={locked ? "368:3481" : "696:4393"}
    >
      <div className="rv4-fvm__chips" role="group" aria-label="Filter the map by zone">
        {MAP_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`rv4-fvm__chip${filter === f.id ? " is-active" : ""}`}
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 696:4405 → 696:4406: the plot 26 in from the left, the axes around it. */}
      <div className="rv4-fvm__row">
        <div className="rv4-fvm__img">
          {locked ? (
            <div className="rv4-fvm__frame rv4-fvm__lock" onClick={guardedUnlock(onUnlock)}>
              {plot}
              <V4LockBadge />
            </div>
          ) : (
            <div className="rv4-fvm__frame" ref={frameRef}>
              {plot}
            </div>
          )}
          <span className="rv4-fvm__axis rv4-fvm__axis--x" aria-hidden="true">
            lived pleasure &rarr;
          </span>
          <span className="rv4-fvm__axis rv4-fvm__axis--y" aria-hidden="true">
            fantasy pull &rarr;
          </span>
        </div>
      </div>

      <p className="rv4-fvm__caption">{CAPTION}</p>
    </div>
  );
};

export default V4FantasyMap;
