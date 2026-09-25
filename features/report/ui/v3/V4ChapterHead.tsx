import type { FC } from "react";

/**
 * The head of a Report V4 chapter row — Figma 1:863 / 1:874 — shared by V4Chapter
 * and by the V3 chapters the live V4 report still draws, so every chapter on the
 * page is set alike (review 24.09: "they should match the Typical Beliefs chapter").
 */

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
 * The chapter title, with "of the <Archetype>" under it when `archetype` is set —
 * always on a line of its own and with no dash, as Mark redrew every head on 25.09
 * (1:862 / 1942042395; Fatih: the open chapters too). Each line is its own block, so
 * each sits its own height under the last, the way Figma stacks mixed-size lines.
 * The space between the two runs is only for assistive tech: blocks swallow it.
 */
export const V4ChapterTitle: FC<{ title: string; archetype?: string }> = ({ title, archetype }) => (
  <h3 className={`rv4-chapter__title${archetype ? " has-suffix" : ""}`}>
    {archetype ? (
      <>
        <span className="rv4-chapter__name">{title}</span>{" "}
        <span className="rv4-chapter__of">
          of the <span className="rv4-chapter__archetype">{archetype}</span>
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
