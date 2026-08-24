"use client";

import { type CSSProperties, type FC } from "react";
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
 */
interface Props {
  /** Archetype names, already sorted by match % descending (all 14). */
  ranking: string[];
  /** Match percentage per archetype name (0-100). */
  percentages: Record<string, number>;
  /** Per-archetype motto, keyed by name; null when copy is absent. */
  mottos: Record<string, string | null>;
  /**
   * The archetype the chapters below are actually written in. Usually the
   * reader's own top match, but the report can be browsed in another
   * archetype's voice, and the handoff line must name the one they are about to
   * read rather than assuming rank 1.
   */
  viewArchetype: string;
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

const ArchetypeBlendSection: FC<Props> = ({ ranking, percentages, mottos, viewArchetype }) => {
  // Before the early return — a hook may not be conditional.
  const [listRef, revealed] = useRevealOnView<HTMLOListElement>();

  if (ranking.length === 0) return null;

  const top = ranking.slice(0, TOP_N);
  const primary = top[0]!;
  const spread = (percentages[primary] ?? 0) - (percentages[top[top.length - 1]!] ?? 0);
  // True in the ordinary case. False when the reader has opened someone else's
  // archetype from the constellation list, where "the chapters ahead read your
  // top match" would simply be untrue.
  const readingOwnTop = viewArchetype === primary;

  return (
    <div className="report-blend">
      <p className="report-blend__eyebrow">Start here</p>

      <h2 className="report-blend__heading">
        You&apos;re a <span className="report-blend__heading-accent">constellation,</span>
        <br />
        not a type
      </h2>

      <div className="report-blend__intro">
        <p>
          Your answers were scored against all fourteen LoveIQ archetypes at once, not sorted into
          one of them. Almost nobody comes out as a single clean pattern. Most people carry several,
          and which one runs the show depends on who you are with, how safe you feel, the phase of
          life you are in, and what your body needs at the time.
        </p>
        <p>
          So read the numbers below as <strong>pull, not identity</strong>. They say how closely
          your answers track each pattern compared with the other thirteen. A high score means that
          pattern explains a lot of what you told us. It does not mean the others are absent, and it
          is not a mark you can pass or fail.
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

      {/*
        The handoff line is the one that has to do real work: it tells the
        reader why the report is about to speak in one archetype's voice, and
        gives them somewhere to put it when a passage does not fit. Without it,
        "this isn't me" has nowhere to go except away from the page.

        `spread` makes the sentence honest per reader. Under 8 points the three
        genuinely sit on top of each other and saying so is more accurate than
        implying a clear winner.
      */}
      <p className="report-blend__handoff">
        {!readingOwnTop ? (
          <>
            You are reading the <strong>{viewArchetype}</strong> chapters, which came out at{" "}
            {formatPct(percentages[viewArchetype] ?? 0)} for you. Your own strongest match is{" "}
            <strong>{primary}</strong>, and its chapters are one click away in the full ranking.
          </>
        ) : spread < 8 ? (
          <>
            Your top three sit close together, within {spread.toFixed(1)} points, so you are a
            genuine blend. The chapters ahead read <strong>{primary}</strong> in depth because it
            edges the others out, and you will recognise the second and third in it too.
          </>
        ) : (
          <>
            The chapters ahead read <strong>{primary}</strong> in depth, because it explains the
            most of what you told us. Where a passage misses, that is information rather than a
            broken result: it usually points at the pattern sitting just underneath.
          </>
        )}{" "}
        Your full ranking across all fourteen is at the end of this part.
      </p>
    </div>
  );
};

export default ArchetypeBlendSection;
