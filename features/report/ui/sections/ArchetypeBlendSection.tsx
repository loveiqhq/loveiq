"use client";

import { type CSSProperties, type FC } from "react";
import { archetypeSlug, type Report2CopySlug } from "@/data/report2-config";
import { archetypeBlurbs } from "@/data/report2-archetype-blurbs";
import { getReportTheme } from "../reportTheme";
import { useRevealOnView } from "../hooks/useRevealOnView";

/**
 * "You're a constellation, not a type" — the report's OPENING block, mounted
 * above the Part I divider so it is the first thing a reader meets, before the
 * hero card names their archetype.
 *
 * It exists because of the 2026-08-24 friends-and-family feedback: a reader
 * could not attribute the hero's "Match Strength 71%" to anything, and a
 * primary archetype that does not land makes the whole report feel wrong
 * rather than partly wrong. Both are framing failures, not copy failures, so
 * the fix is to set the frame BEFORE the result: you are scored against all
 * fourteen patterns, here are your three strongest, and here is what the
 * percentage does and does not mean.
 *
 * Deliberately NOT the same block as `ConstellationSection`. That one is the
 * full fourteen-row ranking at the end of Part I and stays exactly where it
 * is. This one is a three-row primer: prose first, ranking second, no
 * per-archetype CTAs competing with the reader's own result.
 *
 * A closing "the chapters ahead read <archetype> in depth" paragraph was cut on
 * 2026-08-25. It also carried the only note telling a reader browsing ANOTHER
 * archetype's chapters that they were not looking at their own top match; that
 * caveat went with it.
 */
interface Props {
  /** Archetype names, already sorted by match % descending (all 14). */
  ranking: string[];
  /** Match percentage per archetype name (0-100). */
  percentages: Record<string, number>;
  /** Per-archetype motto, keyed by name; null when copy is absent. */
  mottos: Record<string, string | null>;
}

type CssVarStyle = CSSProperties & Record<`--${string}`, string | number>;

/**
 * Chips whose glyph is painted dark rather than white. Same two as
 * `ConstellationSection` — Quiet Withdrawer's #C7F3F1 accent puts a white glyph
 * at 1.16:1, i.e. invisible; Analytical Sexualist is the designer's call.
 */
const DARK_GLYPH_CHIPS = new Set(["Analytical Sexualist", "Quiet Withdrawer"]);

const TOP_N = 3;

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

const ArchetypeBlendSection: FC<Props> = ({ ranking, percentages, mottos }) => {
  // Before the early return — a hook may not be conditional.
  const [listRef, revealed] = useRevealOnView<HTMLOListElement>();

  if (ranking.length === 0) return null;

  const top = ranking.slice(0, TOP_N);

  return (
    <div className="report-blend">
      <h2 className="report-blend__heading">
        You&apos;re a <span className="report-blend__heading-accent">constellation,</span>
        <br />
        not a type
      </h2>

      {/* Same treatment as "What this means for you" (`.report-means__body`):
          one prose voice for the two blocks that open the report. */}
      <div className="report-blend__intro">
        <p>
          You were scored against all fourteen archetypes at once, not sorted into one. Almost
          nobody is a single clean pattern, and which one leads depends on who you are with, how
          safe you feel, and what your body needs at the time.
        </p>
        <p>
          The percentages show how well each pattern fits your answers. They are{" "}
          <strong>not scores</strong>, and there is nothing to pass.
        </p>
      </div>

      <section className="report-blend__card" aria-label="Your three strongest archetypes">
        <p className="report-blend__card-label">Your three strongest patterns</p>

        <ol
          ref={listRef}
          className={`report-blend__list report-chart-reveal${revealed ? " is-revealed" : ""}`}
        >
          {top.map((name, idx) => {
            const theme = getReportTheme(name);
            const Icon = theme.Icon;
            const pct = percentages[name] ?? 0;
            const motto = mottos[name] ?? null;
            const blurb = archetypeBlurbs[archetypeSlug(name) as Report2CopySlug] ?? null;
            const rowStyle: CssVarStyle = {
              "--accent": theme.accent,
              "--accent-rgb": hexToRgbTriplet(theme.accent),
              "--icon-ink": DARK_GLYPH_CHIPS.has(name) ? "#000000" : "#ffffff",
              "--fill-fraction": Math.max(0, Math.min(1, pct / 100)),
              // Staggers this bar behind the one above it (see .report-chart-reveal).
              "--row": idx,
            };

            return (
              <li key={name} style={rowStyle} className="report-blend__row">
                <span className="report-blend__rank">{padRank(idx + 1)}</span>

                <span className="report-blend__icon" aria-hidden="true">
                  <Icon className="report-blend__icon-glyph" />
                </span>

                <div className="report-blend__nametag">
                  <h3 className="report-blend__name">{name}</h3>
                  {motto ? <p className="report-blend__motto">{motto}</p> : null}
                  {/* The motto is evocative, not descriptive, so on its own the row
                      never says what the pattern actually is. */}
                  {blurb ? <p className="report-blend__blurb">{blurb}</p> : null}
                </div>

                <div
                  className="report-blend__bar"
                  role="progressbar"
                  aria-label={`${name} match strength`}
                  aria-valuenow={Number(pct.toFixed(1))}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span className="report-blend__bar-track" />
                  <span className="report-blend__bar-fill" />
                  <span className="report-blend__bar-dot" />
                </div>

                <span className="report-blend__pct">{formatPct(pct)}</span>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
};

export default ArchetypeBlendSection;
