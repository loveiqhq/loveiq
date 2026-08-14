"use client";

import type { FC, ReactNode } from "react";
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
  onUnlock: () => void;
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

  // NOTE: `preserveAspectRatio="none"` stretches the viewBox non-uniformly so the
  // path spans the card's full width, which also scales the marker below — at
  // 1440px it renders ~13.71x14.54, i.e. ~6% taller than wide. That was moved out
  // of the SVG once to make it a true circle, but the replacement element did not
  // paint in Safari, so it was reverted deliberately: a marker 6% off round beats
  // a marker that is missing. Leave the <circle> here unless a fix is verified in
  // real Safari, not just Playwright's WebKit.
  return (
    <svg
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
      <circle
        className="report-draw-dot"
        cx={curve.teaser.dot.x}
        cy={curve.teaser.dot.y}
        r={TEASER_DOT_R}
        fill={curve.dotColor}
      />
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
  onUnlock: () => void;
}> = ({ symbol, symbolColor, title, sub, cta, onUnlock }) => {
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
      <button type="button" className="report-map-row__cta" onClick={onUnlock}>
        {cta}
      </button>
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

const InsightMapSection: FC<Props> = ({ archetype, copy, onUnlock }) => {
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
    },
    {
      symbol: "▲",
      symbolColor: "#2e7d5b",
      title: "Desire Accelerators",
      sub: copy["tile2.sub"],
      cta: "See what opens you fastest →",
    },
    {
      symbol: "⇄",
      symbolColor: "#818cf8",
      title: "Initiation Pattern",
      sub: copy["tile3.sub"],
      cta: "See why your invites get lost →",
    },
    {
      symbol: <HeartGlyph />,
      symbolColor: "#c36ddf",
      title: "Peak Zone",
      sub: copy["tile4.sub"],
      cta: "See where body & mind agree →",
    },
    {
      symbol: "↻",
      symbolColor: "#fe6839",
      title: "Libido Pattern",
      sub: copy["tile5.sub"],
      cta: "See the loop that eats desire →",
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
          <button type="button" className="report-map-featured__link" onClick={onUnlock}>
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
              onUnlock={onUnlock}
            />
          ))}
        </div>
      </article>
    </div>
  );
};

export default InsightMapSection;
