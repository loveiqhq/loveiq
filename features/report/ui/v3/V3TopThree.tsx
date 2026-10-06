"use client";

import type { CSSProperties, FC } from "react";
import { report3ArchetypeBlurbs } from "@/data/report3-archetype-blurbs";
import { getReportTheme } from "../reportTheme";
import useV4CountUp from "./useV4CountUp";
import useV4Reveal from "./useV4Reveal";

/**
 * "Your three strongest patterns" — Figma 10392:18812.
 *
 * Rank 1 is emphasised throughout: tinted panel with a coral halo, accent-ink
 * rank number, 18px name and a bold percentage, against 16px / medium for
 * ranks 2 and 3.
 *
 * Every colour on a row comes from `getReportTheme(name)` — icon tile, bar fill
 * and dot all take `accent`, the rank number takes `accentInk`. Note this is NOT
 * `archetypePresentation`, which carries a different bar/dot colour
 * (`#f97316` for Spark Seeker where V3 wants the accent `#ff6a3d`).
 *
 * `animate` is Report V4's entrance (Mark, 28.09, 1943965090: "the scale start from 0 and
 * the % also count up from 0 … the Archetype names should fade in after the animations
 * have finished"). Once the list is in view each bar grows and its % counts up on V2's
 * match-strength timing, 150ms behind the row above, and the names fade in after the
 * last bar lands; the choreography is in reportV3.css. Without it the list renders as
 * it always has, which is what `?v3=1` and the non-V4 report get.
 */
interface Props {
  percentages: Record<string, number>;
  /**
   * The description under each name. Defaults to V3's own three one-liners; Report V4
   * passes all fourteen of Sanjin's (`report4ArchetypeBlurbs`, 1:493).
   */
  blurbs?: Readonly<Record<string, string>>;
  /** Report V4's entrance; off everywhere else. */
  animate?: boolean;
}

/** One stagger step between rows, in ms; the CSS reads the same index. */
const ROW_STAGGER_MS = 150;

/**
 * The % counting up from 0.0 behind the row's stagger. Hidden from assistive tech, which
 * reads the final value beside it instead of every step.
 */
const CountedPct: FC<{ pct: number; row: number; run: boolean }> = ({ pct, row, run }) => {
  const shown = useV4CountUp(pct, run, { decimals: 1, delay: row * ROW_STAGGER_MS });
  return (
    <span className="rv3-top3__pct">
      <span aria-hidden="true">{shown.toFixed(1)}%</span>
      <span className="rv3-sr">{pct.toFixed(1)}%</span>
    </span>
  );
};

const V3TopThree: FC<Props> = ({
  percentages,
  blurbs = report3ArchetypeBlurbs,
  animate = false,
}) => {
  const [listRef, inView] = useV4Reveal<HTMLOListElement>({ enabled: animate });
  const ranked = Object.entries(percentages)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  if (!ranked.length) return null;

  const listClass = animate
    ? `rv3-top3__list is-animated${inView ? "" : " is-pending"}`
    : "rv3-top3__list";

  return (
    <section className="rv3-top3" data-node-id="10392:18812">
      {/* The "Your three strongest patterns" label was removed from the frame
          on 2026-09-05; the card now opens straight into the ranked rows. */}
      <ol ref={listRef} className={listClass}>
        {ranked.map(([name, pct], idx) => {
          const theme = getReportTheme(name);
          const Icon = theme.Icon;
          const blurb = blurbs[name];
          const style = {
            "--rv3-accent": theme.accent,
            "--rv3-accent-ink": theme.accentInk,
            "--rv3-fill": `${Math.max(0, Math.min(100, pct))}%`,
            ...(animate ? { "--rv4-t3-i": idx } : {}),
          } as CSSProperties;

          return (
            <li key={name} className={`rv3-top3__row ${idx === 0 ? "is-lead" : ""}`} style={style}>
              <span className="rv3-top3__rank">{String(idx + 1).padStart(2, "0")}</span>
              <span className="rv3-top3__icon" aria-hidden="true">
                <Icon />
              </span>
              <h3 className="rv3-top3__name">{name}</h3>
              {blurb ? <p className="rv3-top3__blurb">{blurb}</p> : null}
              <span className="rv3-top3__bar" aria-hidden="true">
                <span className="rv3-top3__track" />
                <span className="rv3-top3__fill" />
                <span className="rv3-top3__dot" />
              </span>
              {animate ? (
                <CountedPct pct={pct} row={idx} run={inView} />
              ) : (
                <span className="rv3-top3__pct">{pct.toFixed(1)}%</span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
};

export default V3TopThree;
