"use client";

import Image from "next/image";
import { useRef, type FC } from "react";
import { useCtaSeen } from "@features/analytics/useCtaSeen";

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

/**
 * A locked chapter's lock, in the chevron's place (Mark's mock, 26.09). Since 29.09
 * (1945269177, "Updated Lock icon + Text."): 982:379, a 28px disc in the brand gradient
 * with the frame's 14px lock, and "Unlock Report" under it — the visuals' CTA
 * (V4LockBadge) at the head's size. A span, not V4LockBadge's button: it sits inside
 * the chapter's own button, whose name its words finish.
 *
 * From 700px (Mark, desktop review 30.09: "scale up the Locked icon and the Text") it
 * takes the badge's own proportions, 979:507's 38px disc and 17px lock, so both glyphs
 * are here and the stylesheet shows one: each is the frame's own drawing at its size,
 * not one scaled.
 */
export const V4ChapterLockDisc: FC = () => {
  // A locked chapter's unlock offer, reported as seen the way the premium cards' are.
  const ref = useRef<HTMLSpanElement>(null);
  useCtaSeen(ref, "locked_chapter");
  return (
    <span ref={ref} className="rv4-chapter__lock" data-node-id="982:379">
      <span className="rv4-chapter__lock-disc" aria-hidden="true">
        <Image src="/report/v3/locks/lock-14.svg" alt="" width={14} height={14} unoptimized />
        <Image
          className="rv4-chapter__lock-17"
          src="/report/v3/locks/lock-17.svg"
          alt=""
          width={17}
          height={17}
          unoptimized
        />
      </span>
      <span className="rv4-chapter__lock-label">Unlock Report</span>
    </span>
  );
};
