import { Fragment, type FC } from "react";

/**
 * The head of a Report V4 chapter row — Figma 1:863 / 1:874 — shared by V4Chapter
 * and by the V3 chapters the live V4 report still draws, so every chapter on the
 * page is set alike (review 24.09: "they should match the Typical Beliefs chapter").
 */

/**
 * The suffix, one box per word (310:224 / 1:865). Figma sets a line of suffix alone
 * its own 16.8 below the title's baseline, where CSS would stack it under the 24px
 * run's whole line box; a word box lets reportV3.css pull its top in by exactly the
 * leading the two overlap. Per word, not per run, because the frame breaks inside
 * the suffix ("… of the / Spark Seeker", "… Spark / Seeker").
 */
const Words: FC<{ text: string }> = ({ text }) =>
  text.split(" ").map((word, i) => (
    <Fragment key={i}>
      {i > 0 ? " " : null}
      <span className="rv4-chapter__word">{word}</span>
    </Fragment>
  ));

/** 304:263 / 1:866 — the 15px chevron, stroke 3, drawn pointing down. */
const Chevron: FC = () => (
  <svg viewBox="0 0 15 15" fill="none">
    <path
      d="M3.28125 5.625L7.5 9.84375L11.7188 5.625"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * The chapter title, with its "- of the <Archetype>" suffix when `archetype` is set.
 * The space before the suffix is the 24px run's, as the frame sets it.
 */
export const V4ChapterTitle: FC<{ title: string; archetype?: string }> = ({ title, archetype }) => (
  <h3 className={`rv4-chapter__title${archetype ? " has-suffix" : ""}`}>
    {archetype ? (
      <>
        <span className="rv4-chapter__name">{`${title} `}</span>
        <span className="rv4-chapter__of">
          <Words text="- of the" />{" "}
        </span>
        <span className="rv4-chapter__archetype">
          <Words text={archetype} />
        </span>
      </>
    ) : (
      title
    )}
  </h3>
);

/** 1:867 / 304:261 — "Control / Disc". */
export const V4ChapterChevron: FC = () => (
  <span className="rv4-chapter__chev" aria-hidden="true">
    <Chevron />
  </span>
);
