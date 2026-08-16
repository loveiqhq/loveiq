"use client";

import { useEffect, useRef, useState, type FC, type ReactNode } from "react";
import { getReport2Config } from "@/data/report2-config";
import {
  AROUSAL_CURVES,
  resolveArousalFamily,
  TEASER_DOT_R,
  TEASER_STROKE,
  TEASER_VB_WIDTH,
  type ArousalFamily,
} from "../arousalCurves";

/**
 * Server-resolved insight-map copy (`getReport2Section(name, "map")`). The 634KB
 * copy module is server-only, so the per-archetype sublines are threaded down as
 * props (see `app/api/report/route.ts` → `mapCopy`). Every field is optional so
 * an archetype without a map block still renders (section bails if empty).
 *
 * The tile LABELS, symbols, CTA text, and the featured eyebrow are UNIVERSAL
 * (identical across all 14 archetypes in Figma 8762:15822 "B2 final") and are
 * hardcoded below — only these sublines + featured title/sub vary per archetype.
 */
export interface MapCopy {
  "tile1.sub"?: string | null;
  "tile2.sub"?: string | null;
  "tile3.sub"?: string | null;
  "tile4.sub"?: string | null;
  "tile5.sub"?: string | null;
  "featured.title"?: string | null;
  "featured.sub"?: string | null;
}

interface Props {
  /** Drives the arousal arc shape via `families.arousal`. */
  archetype: string;
  copy: MapCopy | null;
  /**
   * Open a pattern section by id. The page decides what that means: scroll to
   * it when the reader already owns it, open the paywall when they do not.
   * Previously this was a bare `onUnlock`, so every CTA opened the pricing
   * modal — including for a reader who had already paid for the section it
   * points at.
   */
  onOpen: (sectionId: string) => void;
  /** True when the reader already owns that section, so the CTA can be a link. */
  isSectionOpen: (sectionId: string) => boolean;
}

/**
 * Ignition curve for the featured tile. The arc SHAPE is family-driven — this
 * was previously hardcoded to `responsive` "universal in the frame", so a
 * Spark Seeker read "Your desire is spontaneous" above a warm-up arc. Shape,
 * colours and marker all come from the shared `AROUSAL_CURVES`.
 *
 * The stroke draws itself on reveal using the landing page's `pathLength={1}`
 * + dash-offset technique (`.w-draw-line`), so the two behave identically.
 */
const IgnitionCurve: FC<{ family: ArousalFamily }> = ({ family }) => {
  const curve = AROUSAL_CURVES[family];
  const gradientId = `report-map-ignition-${family}`;
  const svgRef = useRef<SVGSVGElement>(null);
  // x-stretch that cancels the outer squeeze: renders 1 until measured, which is
  // the current (elliptical) behaviour rather than a missing marker.
  const [xStretch, setXStretch] = useState(1);
  const vbHeight = curve.teaser.vbHeight;

  useEffect(() => {
    const el = svgRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const sx = box.width / TEASER_VB_WIDTH;
      const sy = box.height / vbHeight;
      // Pre-stretching x by sy/sx makes the rendered x-radius equal the y-radius.
      setXStretch(sx > 0 ? sy / sx : 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [vbHeight]);

  const { x: dotX, y: dotY } = curve.teaser.dot;

  // `preserveAspectRatio="none"` stretches the viewBox non-uniformly so the path
  // spans the card's full width — which also stretches the marker. The earlier
  // note here measured only 1440px, where it is ~6% taller than wide and hard to
  // see. On a 390px screen the same SVG scales x by 0.39 and y by 0.71, so the
  // marker rendered 6x10: a vertical ellipse whose ends poke out above and below
  // the stroke, which reads as a dot sitting off its own line (its CENTRE is on
  // the curve to 0.01px — the position was never wrong, the shape was).
  //
  // Fixed by counter-stretching a wrapper <g> by the inverse of the outer
  // squeeze, so the marker stays inside the SVG — the previous attempt used an
  // HTML element over the chart and never painted in real Safari.
  //
  // The factor has to be measured: it is the SVG's rendered box over its viewBox,
  // and the rendered width is whatever the card is. A nested <svg> with
  // `xMidYMid` does NOT work here — preserveAspectRatio resolves in the nested
  // element's own user space, and the ancestor's non-uniform transform is applied
  // afterwards, so the ellipse comes back (verified: still 5.72x10.38).
  //
  // The stretch goes on a wrapper <g>, not the circle: `.report-draw-dot` animates
  // `transform` in CSS, and a CSS transform overrides the presentation attribute,
  // so putting both on one element loses the correction the moment the reveal
  // animation runs.
  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${TEASER_VB_WIDTH} ${curve.teaser.vbHeight}`}
      fill="none"
      preserveAspectRatio="none"
      className="report-map-featured__curve"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="0"
          y1="0"
          x2={TEASER_VB_WIDTH}
          y2="0"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor={curve.from} />
          <stop offset="1" stopColor={curve.to} />
        </linearGradient>
      </defs>
      <path
        className="report-draw-line"
        pathLength={1}
        d={curve.teaser.path}
        stroke={`url(#${gradientId})`}
        strokeWidth={TEASER_STROKE}
        strokeLinecap="round"
        fill="none"
      />
      <g transform={`translate(${dotX} ${dotY}) scale(${xStretch} 1) translate(${-dotX} ${-dotY})`}>
        <circle
          className="report-draw-dot"
          cx={dotX}
          cy={dotY}
          r={TEASER_DOT_R}
          fill={curve.dotColor}
        />
      </g>
    </svg>
  );
};

/** One "five more patterns" row: symbol + Lora title, "WHAT YOU'LL LEARN"
 *  label + subline, and the gradient pill CTA on the right. */
const PatternRow: FC<{
  symbol: ReactNode;
  symbolColor: string;
  title: string;
  sub: string | null | undefined;
  cta: string;
  target: string;
  onOpen: (sectionId: string) => void;
  isSectionOpen: (sectionId: string) => boolean;
}> = ({ symbol, symbolColor, title, sub, cta, target, onOpen, isSectionOpen }) => {
  if (!sub) return null;
  return (
    <div className="report-map-row">
      <div className="report-map-row__left">
        <div className="report-map-row__title-line">
          <span
            className="report-map-row__symbol"
            style={{ color: symbolColor }}
            aria-hidden="true"
          >
            {symbol}
          </span>
          <h4 className="report-map-row__title">{title}</h4>
        </div>
        <div className="report-map-row__learn">
          <p className="report-map-row__learn-label">WHAT YOU&apos;LL LEARN</p>
          <p className="report-map-row__learn-text">{sub}</p>
        </div>
      </div>
      {/* A real anchor when the section is owned: that is the sidebar's proven
          path, so it inherits the sections' scroll-margin-top and lands under
          the sticky header exactly as sidebar navigation does. Scripted
          scrolling landed 250-700px short because the page reflows after the
          jump. Still a button when locked — it opens the paywall, not a link. */}
      {isSectionOpen(target) ? (
        <a className="report-map-row__cta" href={`#${target}`}>
          {cta}
        </a>
      ) : (
        <button type="button" className="report-map-row__cta" onClick={() => onOpen(target)}>
          {cta}
        </button>
      )}
    </div>
  );
};

// Universal heart glyph for the "Peak Zone" row (Figma uses a filled heart).
const HeartGlyph: FC = () => (
  <svg viewBox="0 0 19 18" fill="none" aria-hidden="true" width="19" height="18">
    <path
      d="M9.5 17S1 12 1 5.75A4.25 4.25 0 0 1 9.5 3.9 4.25 4.25 0 0 1 18 5.75C18 12 9.5 17 9.5 17Z"
      fill="currentColor"
    />
  </svg>
);

const InsightMapSection: FC<Props> = ({ archetype, copy, onOpen, isSectionOpen }) => {
  const family = resolveArousalFamily(getReport2Config(archetype)?.families?.arousal);

  if (!copy) return null;

  // Headline + subline are family-level in Figma ("only the family word, the
  // body line and the arc change"). Server copy wins when an archetype has its
  // own, otherwise fall back to the family text so no reader gets a headline
  // that contradicts the arc drawn beneath it.
  const featuredTitle = copy["featured.title"] ?? AROUSAL_CURVES[family].headline;
  const featuredSub = copy["featured.sub"] ?? AROUSAL_CURVES[family].subline;

  const rows = [
    {
      symbol: "▼",
      symbolColor: "#c2542f",
      title: "Desire Brakes",
      sub: copy["tile1.sub"],
      cta: "See what quietly shuts it down →",
      target: "typical_arousal_accelerators_turn_ons_of_the_core_archetype",
    },
    {
      symbol: "▲",
      symbolColor: "#2e7d5b",
      title: "Desire Accelerators",
      sub: copy["tile2.sub"],
      cta: "See what opens you fastest →",
      target: "typical_arousal_accelerators_turn_ons_of_the_core_archetype",
    },
    {
      symbol: "⇄",
      symbolColor: "#818cf8",
      title: "Initiation Pattern",
      sub: copy["tile3.sub"],
      cta: "See why your invites get lost →",
      target: "initiation_style",
    },
    {
      symbol: <HeartGlyph />,
      symbolColor: "#c36ddf",
      title: "Peak Zone",
      sub: copy["tile4.sub"],
      cta: "See where body & mind agree →",
      target: "typical_sexual_fantasy_amp_practice_tendencies",
    },
    {
      symbol: "↻",
      symbolColor: "#fe6839",
      title: "Libido Pattern",
      sub: copy["tile5.sub"],
      cta: "See the loop that eats desire →",
      target: "libido_challenges_in_relationships",
    },
  ];

  // Nothing to render (archetype without a map block) — bail.
  if (!featuredTitle && rows.every((r) => !r.sub)) return null;

  return (
    <div className="report-map">
      <h3 className="report-map__heading">Your insight map</h3>

      {/* Featured tile — Arousal, always unlocked (Figma "Article"). */}
      {featuredTitle ? (
        <article className="report-map-featured">
          <div className="report-map-featured__eyebrow">
            <span className="report-map-featured__dot" aria-hidden="true" />
            <span className="report-map-featured__eyebrow-text">Arousal · always unlocked</span>
          </div>
          <h4 className="report-map-featured__title">{featuredTitle}</h4>
          {featuredSub ? <p className="report-map-featured__sub">{featuredSub}</p> : null}
          <IgnitionCurve family={family} />
          <button
            type="button"
            className="report-map-featured__link"
            onClick={() => onOpen("arousal_style")}
          >
            See how your desire switches on →
          </button>
        </article>
      ) : null}

      {/* Five more patterns (Figma "5 Patterns — Variant C"). */}
      <article className="report-map-patterns">
        <p className="report-map-patterns__label">Five more patterns</p>
        <div className="report-map-patterns__rows">
          {rows.map((r) => (
            <PatternRow
              key={r.title}
              symbol={r.symbol}
              symbolColor={r.symbolColor}
              title={r.title}
              sub={r.sub}
              cta={r.cta}
              target={r.target}
              onOpen={onOpen}
              isSectionOpen={isSectionOpen}
            />
          ))}
        </div>
      </article>
    </div>
  );
};

export default InsightMapSection;
