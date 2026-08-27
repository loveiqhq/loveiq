"use client";

import type { CSSProperties, FC } from "react";

import {
  CURIOSITY_AXIS,
  CURIOSITY_BANDS,
  CURIOSITY_SCALE,
  CURIOSITY_SCALE_NOTE,
} from "@/data/report2-curiosity-scale";
import { getReportTheme } from "../reportTheme";
import { useRevealOnView } from "../hooks/useRevealOnView";

/**
 * "Common Curiosity Level Styles Across Archetypes", as a scale.
 *
 * Replaces the list form of this block on 2026-08-26. The brief was to show it
 * the way Importance of Sexuality and Confidence Level are shown: all fourteen
 * archetypes on one axis with the reader's own dot named.
 *
 * Built to match `ImportanceOfSexualitySection`'s strip deliberately, since that
 * is the chapter it was asked to resemble: same fixed ranking rendered for every
 * viewer, same "only the reader's dot is named" rule, same per-archetype accent
 * as the dot fill, same reveal-on-view so the dots land as the reader arrives.
 *
 * The four bands under the axis are the source document's own level names, which
 * is what keeps this recognisably the same block it replaced. Where each
 * archetype sits, and why, is `data/report2-curiosity-scale.ts`.
 */

interface Props {
  /** The reader's archetype — the one dot that gets named. */
  archetype: string;
  /** The document's own heading for the block. */
  eyebrow: string;
  /** The closing line the chapter puts under the list. */
  outro?: string;
}

const CuriosityScale: FC<Props> = ({ archetype, eyebrow, outro }) => {
  const [ref, revealed] = useRevealOnView<HTMLDivElement>({ threshold: 0 });
  const youIndex = CURIOSITY_SCALE.findIndex((e) => e.name === archetype);
  const you = youIndex >= 0 ? CURIOSITY_SCALE[youIndex] : null;

  return (
    <div className="report-curiosity-scale">
      <p className="report-curiosity-scale__eyebrow">{eyebrow}</p>

      <div
        ref={ref}
        className={`report-curiosity-scale__plot${revealed ? " is-revealed" : ""}`}
        role="img"
        aria-label={
          you
            ? `Curiosity across the fourteen archetypes. ${archetype} sits in the ${you.band.replace("-", " ")} band.`
            : "Curiosity across the fourteen archetypes"
        }
      >
        {/* Bands first, so the dots sit on top of them. */}
        <div className="report-curiosity-scale__bands" aria-hidden="true">
          {CURIOSITY_BANDS.map((b) => (
            <span
              key={b.band}
              className={`report-curiosity-scale__band${you?.band === b.band ? " is-yours" : ""}`}
              style={{ left: `${b.from * 100}%`, width: `${(b.to - b.from) * 100}%` }}
            >
              <span className="report-curiosity-scale__band-label">{b.label}</span>
            </span>
          ))}
        </div>

        <span className="report-curiosity-scale__axis" aria-hidden="true" />

        {CURIOSITY_SCALE.map((entry, i) => {
          const isYou = i === youIndex;
          return (
            <span
              key={entry.name}
              className={`report-curiosity-scale__dot${isYou ? " is-you" : ""}`}
              style={
                {
                  left: `${entry.x * 100}%`,
                  "--dot-accent": getReportTheme(entry.name).accent,
                  "--row": i,
                } as CSSProperties
              }
              aria-hidden="true"
            />
          );
        })}

        {you ? (
          <span
            className="report-curiosity-scale__you"
            style={{ left: `${you.x * 100}%` }}
            aria-hidden="true"
          >
            {you.name}
          </span>
        ) : null}
      </div>

      <div className="report-curiosity-scale__ends" aria-hidden="true">
        <span>&larr; {CURIOSITY_AXIS.left}</span>
        <span>{CURIOSITY_AXIS.right} &rarr;</span>
      </div>

      {/* What the dots are. Without this a reader skimming the strip sees fourteen
          unexplained dots; the Importance strip has always carried the equivalent. */}
      <p className="report-curiosity-scale__note">{CURIOSITY_SCALE_NOTE}</p>

      {outro ? <p className="report-curiosity-scale__outro">{outro}</p> : null}
    </div>
  );
};

export default CuriosityScale;
