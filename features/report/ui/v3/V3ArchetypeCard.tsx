"use client";

import type { CSSProperties, FC } from "react";
import { archetypePresentation } from "@features/report/data/archetypePresentation";
import type { ArchetypeName } from "@features/report/server/archetypeSlug";
import type { Report3CardCopy, Report3MeterLevel } from "@/data/report3-archetype-card";
import V3DimensionDeck from "./V3DimensionDeck";
import useV4CountUp from "./useV4CountUp";
import useV4Reveal from "./useV4Reveal";

/**
 * Archetype card — Part 2, "Your Constellation".
 *
 * Figma: "Report V4 — MOBILE" (1:165) > Archetype card 15:815, 361x1031. Children sit
 * at y = 19 (header), 210 (core motivation), 451 (spacer), 466 (deck), 826 + 852
 * (spacers) and 866 (meters), since Mark's 28.09 update.
 *
 * Two sub-frames of 15:815 are `hidden="true"` in the file — 15:848 (a 697px
 * alternative body) and 15:966/967 — so they are deliberately not built here.
 *
 * The palette is NOT hardcoded to Spark Seeker. The frame's #ff6a3d chip and #f97316
 * meter-gradient end are precisely `archetypePresentation[name].iconBg` and `.dotColor`,
 * so the card reads both from there and renders correctly for any of the 14 archetypes
 * that has card copy authored.
 *
 * The entrance (Mark, 28.09, 1943981051: "Also check for V2 animations and build them
 * into this please" / "If there werent any, feel free to be creative"). V2's card
 * animates its match strength alone: the bar widens as the % counts up, over 1800ms.
 * That plays when the header is in view; the tagline and the core motivation panel rise
 * in behind it, and the meters, far lower, fill segment by segment when they are
 * reached — at half the first pace since the 28.09 mobile review asked for the scales
 * to be slower. The timings are in reportV3.css; the deck keeps its own cross-fade.
 */

/** Three-step meters fill one segment per step. */
const FILLED: Record<Report3MeterLevel, number> = { low: 1, medium: 2, high: 3 };
const METER_STOPS: ReadonlyArray<{ level: Report3MeterLevel; label: string }> = [
  { level: "low", label: "Low" },
  { level: "medium", label: "Medium" },
  { level: "high", label: "High" },
];
/**
 * 870:7211, under "Core motivation" — Mark added it on 28.09 (1943978820), in the manner
 * of the deck cards' "How desire gets spoken". Chrome, the same for every archetype. The
 * card's labels are in the 02.10 sync's heading case (logic/titleCase.ts).
 */
const CORE_MOTIVATION_SUB = "What Drives Your Desire";

interface Props {
  archetype: ArchetypeName;
  /** 0–100. The frame draws 43% as a 138.875px fill inside a 323px track. */
  matchStrength: number;
  copy: Report3CardCopy;
  /** Which deck card opens focused; the frame's instance opens on Communication. */
  initialDeckIndex?: number;
}

const V3ArchetypeCard: FC<Props> = ({ archetype, matchStrength, copy, initialDeckIndex = 0 }) => {
  const presentation = archetypePresentation[archetype];
  const accent = presentation?.iconBg ?? "#ff6a3d";
  const accentDeep = presentation?.dotColor ?? "#f97316";
  // The frame prints a whole number here ("43%") even where the top-three list
  // beside it prints one decimal ("43.4%"). The bar keeps the exact value.
  const matchLabel = Math.round(matchStrength);
  const [headRef, headInView] = useV4Reveal<HTMLElement>();
  const [metersRef, metersInView] = useV4Reveal<HTMLDivElement>();
  const matchShown = useV4CountUp(matchLabel, headInView);
  // The lit segments are numbered in reading order across both meters, for the stagger:
  // each meter's first lit segment follows the ones lit before it.
  const firstLit = copy.meters.map((_, m) =>
    copy.meters.slice(0, m).reduce((n, before) => n + FILLED[before.level], 0)
  );

  return (
    <section
      className={`rv3-arch is-animated${headInView ? "" : " is-pending"}`}
      data-node-id="15:815"
      data-name="Archetype card"
      style={{ "--rv3-arch-accent": accent, "--rv3-arch-deep": accentDeep } as CSSProperties}
      aria-label={`${archetype} — your core archetype`}
    >
      {/* 15:816 — name, match strength, tagline. */}
      <header ref={headRef} className="rv3-arch__head" data-node-id="15:816">
        <h3 className="rv3-arch__name" data-node-id="15:818">
          {archetype}
        </h3>

        <div className="rv3-arch__match" data-node-id="15:819">
          <div className="rv3-arch__match-row" data-node-id="15:820">
            <span className="rv3-arch__match-label" data-node-id="15:822">
              Match Strength
            </span>
            <span className="rv3-arch__match-value" data-node-id="15:824">
              <span aria-hidden="true">{matchShown}%</span>
              <span className="rv3-sr">{matchLabel}%</span>
            </span>
          </div>
          {/* 15:826 / 15:827 — 8px track, gradient fill. */}
          <div
            className="rv3-arch__bar"
            data-node-id="15:826"
            role="img"
            aria-label={`Match strength ${matchLabel} percent`}
          >
            <span
              className="rv3-arch__bar-fill"
              style={{ "--rv3-arch-match": `${matchStrength}%` } as CSSProperties}
              data-node-id="15:827"
            />
          </div>
        </div>

        <p className="rv3-arch__tagline" data-node-id="15:829">
          {copy.tagline}
        </p>
      </header>

      {/* 15:830 / 15:831 — core motivation panel on the peach gradient: the head (chip,
       * label and sub-label), then the value on a row of its own, then the body. */}
      <div className="rv3-arch__motive-wrap" data-node-id="15:830">
        <div className="rv3-arch__motive" data-node-id="15:831">
          <div className="rv3-arch__motive-head" data-node-id="15:832">
            <span className="rv3-arch__motive-chip" aria-hidden="true" data-node-id="65:1794">
              <span className="rv3-arch__motive-glyph" />
            </span>
            <span className="rv3-arch__motive-labels" data-node-id="15:839">
              <span className="rv3-arch__motive-label" data-node-id="15:841">
                Core Motivation
              </span>
              <span className="rv3-arch__motive-sub" data-node-id="870:7211">
                {CORE_MOTIVATION_SUB}
              </span>
            </span>
          </div>
          <p className="rv3-arch__motive-value" data-node-id="15:843">
            {copy.coreMotivation.value}
          </p>
          <p className="rv3-arch__motive-body" data-node-id="15:845">
            {copy.coreMotivation.body}
          </p>
        </div>
      </div>

      {/* 15:846 — 15px spacer before the deck. */}
      <div className="rv3-arch__gap-15" data-node-id="15:846" aria-hidden="true" />

      <V3DimensionDeck
        dimensions={copy.dimensions}
        accent={accent}
        initialIndex={initialDeckIndex}
      />

      {/* 15:924 + 15:925 — 26px and 14px spacers below the deck. */}
      <div className="rv3-arch__gap-26" data-node-id="15:924" aria-hidden="true" />
      <div className="rv3-arch__gap-14" data-node-id="15:925" aria-hidden="true" />

      {/* 15:926 — "Risk orientation" and "Typical confidence". */}
      <div
        ref={metersRef}
        className={`rv3-arch__meters${metersInView ? "" : " is-pending"}`}
        data-node-id="15:926"
      >
        {copy.meters.map((meter, m) => {
          const filled = FILLED[meter.level];
          const first = firstLit[m]!;
          return (
            <div
              className="rv3-arch__meter"
              key={meter.label}
              style={{ "--rv4-stop-i": first + filled - 1 } as CSSProperties}
            >
              <span className="rv3-arch__meter-label">{meter.label}</span>
              <div
                className="rv3-arch__meter-bars"
                role="img"
                aria-label={`${meter.label}: ${meter.level}`}
              >
                {METER_STOPS.map((stop, i) =>
                  i < filled ? (
                    <span
                      className="rv3-arch__seg is-on"
                      key={stop.level}
                      style={{ "--rv4-seg-i": first + i } as CSSProperties}
                    />
                  ) : (
                    <span className="rv3-arch__seg" key={stop.level} />
                  )
                )}
              </div>
              <div className="rv3-arch__meter-scale" aria-hidden="true">
                {METER_STOPS.map((stop) => (
                  <span
                    className={`rv3-arch__stop${stop.level === meter.level ? " is-current" : ""}`}
                    key={stop.level}
                  >
                    {stop.label}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default V3ArchetypeCard;
