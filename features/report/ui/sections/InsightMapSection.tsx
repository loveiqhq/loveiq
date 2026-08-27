"use client";

import { type FC, type ReactNode } from "react";
import { PadlockIcon } from "../ReportNavBadge";
import { archetypeSlug, getReport2Config, type Report2CopySlug } from "@/data/report2-config";
import { mapLearnDetail } from "@/data/report2-map-detail";

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

/*
 * The featured tile's ignition curve was REMOVED on 2026-08-24.
 *
 * Friends-and-family feedback: the insight map "does not create ANY real
 * value", the chart being the loudest thing in it. It plotted no reader data —
 * the arc was one of a handful of family shapes, identical for everyone in that
 * family — so it looked like a measurement and was a decoration, and it pushed
 * the actual copy down the card. The headline and subline it sat under say the
 * same thing in words, and they are per-archetype.
 *
 * The shapes themselves are untouched in `../arousalCurves` and still drive the
 * real Arousal Style chapter, which is where a curve belongs. If it ever comes
 * back here, it should carry the reader's own answers.
 */

/** One "five more patterns" row: symbol + Lora title, "WHAT YOU'LL LEARN"
 *  label + subline, and the gradient pill CTA on the right. */
/**
 * Split a row description after its FIRST sentence.
 *
 * The lead sentence states the pattern; what follows explains how it behaves. One
 * split, never more, so a row never fragments into four lines — and a description
 * with no sentence break comes back as a single part unchanged.
 */
function splitLead(text: string | null | undefined): string[] {
  if (!text) return [];
  const at = text.indexOf(". ");
  if (at < 0 || at > 120) return [text];
  return [text.slice(0, at + 1), text.slice(at + 2)];
}

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
      {/* No per-row padlock. Figma names this section "… lock top-right" and one
          was added per withheld row, but Eman had them pulled on 2026-08-19 — in
          BOTH states. Access is still legible without them: the group carries its
          own "Locked" mark, and a withheld row's CTA opens the paywall. */}
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
        {/* One description, not two stacked lines. The clause from the copy
            matrix and the specific sentence under it used to render separately
            and read as a label arguing with its own footnote; they are merged
            per archetype in `report2-map-detail.ts` now. */}
        {/* The "WHAT YOU'LL LEARN" eyebrow went on 2026-08-25: once each row
            carried one real description, the label was announcing the obvious
            five times down the card. */}
        <div className="report-map-row__learn">
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
  const slug = archetypeSlug(archetype) as Report2CopySlug;
  const detail = mapLearnDetail[slug];

  if (!copy) return null;

  // CTA copy shortened on 2026-08-24. Each row used to carry its own six-word
  // sentence ("See what quietly shuts it down"), which restated the row title in
  // the loudest element on the row and made five rows read as five different
  // offers. The two learn lines now do the specifics; the pill only has to say
  // where it goes.
  const CTA = "Learn more →";

  const rows = [
    {
      symbol: "▼",
      symbolColor: "#c2542f",
      title: "Desire Brakes",
      sub: detail?.tile1 ?? copy["tile1.sub"],
      cta: CTA,
      target: "typical_arousal_accelerators_turn_ons_of_the_core_archetype",
    },
    {
      symbol: "▲",
      symbolColor: "#2e7d5b",
      title: "Desire Accelerators",
      sub: detail?.tile2 ?? copy["tile2.sub"],
      cta: CTA,
      target: "typical_arousal_accelerators_turn_ons_of_the_core_archetype",
    },
    {
      symbol: "⇄",
      symbolColor: "#818cf8",
      title: "Initiation Pattern",
      sub: detail?.tile3 ?? copy["tile3.sub"],
      cta: CTA,
      target: "initiation_style",
    },
    {
      symbol: <HeartGlyph />,
      symbolColor: "#c36ddf",
      title: "Peak Zone",
      sub: detail?.tile4 ?? copy["tile4.sub"],
      cta: CTA,
      target: "typical_sexual_fantasy_amp_practice_tendencies",
    },
    {
      symbol: "↻",
      symbolColor: "#fe6839",
      title: "Libido Pattern",
      sub: detail?.tile5 ?? copy["tile5.sub"],
      cta: CTA,
      target: "libido_challenges_in_relationships",
    },
  ];

  // Nothing to render (archetype without a map block) — bail.
  if (rows.every((r) => !r.sub)) return null;

  return (
    <div className="report-map">
      <h3 className="report-map__heading">Your insight map</h3>

      {/*
        The featured Arousal tile was removed on 2026-08-25. It had already lost
        its ignition curve the day before; what was left was a headline, a
        subline and a CTA sitting above the five rows and competing with them
        for the same job. The chapter it linked to is still reachable from the
        sidebar and from Part III. The map now opens straight on the patterns.
      */}
      {/* The five patterns (Figma "5 Patterns — Variant C"). */}
      <article className="report-map-patterns">
        {/* Figma puts a "LOCKED" chip at the FAR RIGHT of this header row — the
            empty right-hand container at x=830 in the unlocked variant is where
            it goes. It is a group-level mark, distinct from the per-row padlocks
            in each row's top-right corner, and it disappears with them once the
            chapters are owned. */}
        <div className="report-map-patterns__head">
          <p className="report-map-patterns__label">Five patterns</p>
          {rows.some((r) => !isSectionOpen(r.target)) ? (
            <span className="report-map-patterns__locked">
              <PadlockIcon open={false} />
              Locked
            </span>
          ) : null}
        </div>
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
