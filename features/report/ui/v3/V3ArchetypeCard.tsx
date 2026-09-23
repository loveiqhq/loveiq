import type { CSSProperties, FC } from "react";
import { archetypePresentation } from "@features/report/data/archetypePresentation";
import type { ArchetypeName } from "@features/report/server/archetypeSlug";
import type { Report3CardCopy, Report3MeterLevel } from "@/data/report3-archetype-card";
import V3DimensionDeck from "./V3DimensionDeck";

/**
 * Archetype card — Part 2, "Your Constellation".
 *
 * Figma: "Report V4 — MOBILE" (1:165) > Archetype card 15:815, 361x1031. Children sit
 * at y = 19 (header), 210 (core motivation), 432 (spacer), 447 (deck), 807 + 833
 * (spacers) and 847 (meters).
 *
 * Two sub-frames of 15:815 are `hidden="true"` in the file — 15:848 (a 697px
 * alternative body) and 15:966/967 — so they are deliberately not built here.
 *
 * The palette is NOT hardcoded to Spark Seeker. The frame's #ff6a3d chip and #f97316
 * meter-gradient end are precisely `archetypePresentation[name].iconBg` and `.dotColor`,
 * so the card reads both from there and renders correctly for any of the 14 archetypes
 * that has card copy authored.
 */

/** Three-step meters fill one segment per step. */
const FILLED: Record<Report3MeterLevel, number> = { low: 1, medium: 2, high: 3 };
const METER_STOPS: ReadonlyArray<{ level: Report3MeterLevel; label: string }> = [
  { level: "low", label: "Low" },
  { level: "medium", label: "Medium" },
  { level: "high", label: "High" },
];

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

  return (
    <section
      className="rv3-arch"
      data-node-id="15:815"
      data-name="Archetype card"
      style={{ "--rv3-arch-accent": accent, "--rv3-arch-deep": accentDeep } as CSSProperties}
      aria-label={`${archetype} — your core archetype`}
    >
      {/* 15:816 — name, match strength, tagline. */}
      <header className="rv3-arch__head" data-node-id="15:816">
        <h3 className="rv3-arch__name" data-node-id="15:818">
          {archetype}
        </h3>

        <div className="rv3-arch__match" data-node-id="15:819">
          <div className="rv3-arch__match-row" data-node-id="15:820">
            <span className="rv3-arch__match-label" data-node-id="15:822">
              Match Strength
            </span>
            <span className="rv3-arch__match-value" data-node-id="15:824">
              {matchLabel}%
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
              style={{ width: `${matchStrength}%` }}
              data-node-id="15:827"
            />
          </div>
        </div>

        <p className="rv3-arch__tagline" data-node-id="15:829">
          {copy.tagline}
        </p>
      </header>

      {/* 15:830 / 15:831 — core motivation panel on the peach gradient. */}
      <div className="rv3-arch__motive-wrap" data-node-id="15:830">
        <div className="rv3-arch__motive" data-node-id="15:831">
          <div className="rv3-arch__motive-head" data-node-id="15:832">
            <span className="rv3-arch__motive-chip" aria-hidden="true" data-node-id="65:1794">
              <span className="rv3-arch__motive-glyph" />
            </span>
            <span className="rv3-arch__motive-labels" data-node-id="15:839">
              <span className="rv3-arch__motive-label" data-node-id="15:841">
                Core motivation
              </span>
              <span className="rv3-arch__motive-value" data-node-id="15:843">
                {copy.coreMotivation.value}
              </span>
            </span>
          </div>
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
      <div className="rv3-arch__meters" data-node-id="15:926">
        {copy.meters.map((meter) => {
          const filled = FILLED[meter.level];
          return (
            <div className="rv3-arch__meter" key={meter.label}>
              <span className="rv3-arch__meter-label">{meter.label}</span>
              <div
                className="rv3-arch__meter-bars"
                role="img"
                aria-label={`${meter.label}: ${meter.level}`}
              >
                {METER_STOPS.map((stop, i) => (
                  <span className={`rv3-arch__seg${i < filled ? " is-on" : ""}`} key={stop.level} />
                ))}
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
