"use client";

import type { CSSProperties, FC } from "react";
import { report3ArchetypeBlurbs } from "@/data/report3-archetype-blurbs";
import { getReportTheme } from "../reportTheme";

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
 */
interface Props {
  percentages: Record<string, number>;
}

const V3TopThree: FC<Props> = ({ percentages }) => {
  const ranked = Object.entries(percentages)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  if (!ranked.length) return null;

  return (
    <section className="rv3-top3" data-node-id="10392:18812">
      <p className="rv3-top3__label">Your three strongest patterns</p>
      <ol className="rv3-top3__list">
        {ranked.map(([name, pct], idx) => {
          const theme = getReportTheme(name);
          const Icon = theme.Icon;
          const blurb = report3ArchetypeBlurbs[name];
          const style = {
            "--rv3-accent": theme.accent,
            "--rv3-accent-ink": theme.accentInk,
            "--rv3-fill": `${Math.max(0, Math.min(100, pct))}%`,
          } as CSSProperties;

          return (
            <li
              key={name}
              className={`rv3-top3__row ${idx === 0 ? "is-lead" : ""}`}
              style={style}
            >
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
              <span className="rv3-top3__pct">{pct.toFixed(1)}%</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
};

export default V3TopThree;
