"use client";

import { type CSSProperties, type FC } from "react";
import { getReportTheme } from "../reportTheme";
import { useRevealOnView } from "../hooks/useRevealOnView";

/**
 * Report 2.0 "Other Archetypes" / Constellation section — the LAST free Part I
 * block (Figma 8427:1070 "Section - CONSTELLATION (from r4) → Article"). Lists
 * all 14 archetypes ranked by match %, each row: rank · accent icon chip ·
 * name · its own motto · an accent match bar · the % · a "View report" pill.
 *
 * Copy threading: only the per-archetype `motto` varies (server-resolved for
 * ALL 14 via `getReport2Section(name, "constellation").motto`, threaded as
 * `mottos`). The header copy, row structure, icons, and accents are universal —
 * icons + accent colours come from `getReportTheme(name)` (the same source the
 * hero + existing breakdown list use, matching the Figma palette). No gating.
 *
 * The Figma frame does NOT visually highlight the viewer's own row — it's simply
 * first because it's the top match — so we render every row identically, in the
 * `ranking` order handed down.
 */
interface Props {
  /** Archetype names, already sorted by match % descending (all 14). */
  ranking: string[];
  /** Match percentage per archetype name (0-100). */
  percentages: Record<string, number>;
  /** Per-archetype motto, keyed by name; null when copy is absent. */
  mottos: Record<string, string | null>;
  /** The viewer's own archetype — routes to primary (no ?archetype=) on click. */
  viewArchetype: string;
  /** Open a given archetype (navigate if unlocked, else the pricing modal). */
  onViewArchetype: (archetypeName: string) => void;
}

type CssVarStyle = CSSProperties & Record<`--${string}`, string | number>;

/**
 * Chips whose glyph is painted dark rather than white.
 *
 * Sampled from every one of the 14 chips in Figma 8427:1070: twelve carry a
 * white glyph on a saturated fill, these two carry #000000. For Quiet
 * Withdrawer that is not a stylistic choice — its accent is #C7F3F1, so the
 * hardcoded white this replaces put a 1.16:1 glyph on the chip, i.e. an icon
 * that was effectively invisible. Analytical Sexualist is the designer's call
 * on a vivid #6A00FF fill, and still clears 3:1.
 */
const DARK_GLYPH_CHIPS = new Set(["Analytical Sexualist", "Quiet Withdrawer"]);

const padRank = (n: number) => n.toString().padStart(2, "0");
const formatPct = (pct: number) => `${pct.toFixed(1)}%`;

/** #RRGGBB → "r g b" for rgb()/rgba() with slash-alpha halos. */
function hexToRgbTriplet(hex: string): string {
  const c = hex.replace("#", "");
  const n = Number.parseInt(
    c.length === 3
      ? c
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : c,
    16
  );
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

const ConstellationSection: FC<Props> = ({
  ranking,
  percentages,
  mottos,
  viewArchetype,
  onViewArchetype,
}) => {
  // Before the early return — a hook may not be conditional.
  const [listRef, revealed] = useRevealOnView<HTMLOListElement>();

  if (ranking.length === 0) return null;

  return (
    <section className="report-constellation" aria-label="Other archetypes">
      <div className="report-constellation__intro">
        <h3 className="report-constellation__heading">
          You&apos;re a <em className="report-constellation__heading-accent">constellation,</em>
          <br />
          not a type
        </h3>
        <p className="report-constellation__subline">
          Most people are a blend, and yours shifts with safety, attachment, stress and the phase of
          your life you&apos;re in.
        </p>
      </div>

      <ol
        ref={listRef}
        className={`report-constellation__list report-chart-reveal${revealed ? " is-revealed" : ""}`}
      >
        {ranking.map((name, idx) => {
          const theme = getReportTheme(name);
          const Icon = theme.Icon;
          const pct = percentages[name] ?? 0;
          const motto = mottos[name] ?? null;
          const isYou = name === viewArchetype;
          const fillFraction = Math.max(0, Math.min(1, pct / 100));
          const rowStyle: CssVarStyle = {
            "--accent": theme.accent,
            "--accent-rgb": hexToRgbTriplet(theme.accent),
            "--icon-ink": DARK_GLYPH_CHIPS.has(name) ? "#000000" : "#ffffff",
            "--fill-fraction": fillFraction,
            // Staggers this bar behind the one above it (see .report-chart-reveal).
            "--row": idx,
          };

          return (
            <li key={name} style={rowStyle} className="report-constellation__row">
              <span className="report-constellation__rank">{padRank(idx + 1)}</span>

              <span className="report-constellation__icon" aria-hidden="true">
                <Icon className="report-constellation__icon-glyph" />
              </span>

              <div className="report-constellation__nametag">
                <h4 className="report-constellation__name">{name}</h4>
                {motto ? <p className="report-constellation__motto">{motto}</p> : null}
              </div>

              <div
                className="report-constellation__bar"
                role="progressbar"
                aria-label={`${name} match strength`}
                aria-valuenow={Number(pct.toFixed(1))}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span className="report-constellation__bar-track" />
                <span className="report-constellation__bar-fill" />
                <span className="report-constellation__bar-dot" />
              </div>

              <span className="report-constellation__pct">{formatPct(pct)}</span>

              <button
                type="button"
                onClick={() => onViewArchetype(name)}
                aria-label={isYou ? `View your ${name} report` : `View ${name} report`}
                className="report-constellation__view"
              >
                View report
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
};

export default ConstellationSection;
