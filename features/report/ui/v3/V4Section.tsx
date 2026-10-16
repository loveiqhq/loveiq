"use client";

import { useId, useState, type FC, type ReactNode } from "react";
import { V4ChapterLockDisc, V4SectionChevron } from "./V4ChapterHead";
import { guardedUnlock } from "./v4Unlock";

/**
 * A section inside a chapter — the slimmed report's "Button" rows (16.10; 1686:10509,
 * 1686:10559, 1686:10568, 1709:1500, 1711:1847, 1711:1861): a Lora Bold 18 heading with the
 * chapter's disc beside it, 361 wide, 11 above. Mark's PostHog review (13.10): "Chapter
 * text should be structured into collapsable sub-chapters. So make H2/H3 collapsed."
 *
 * The row is the heading's button, the accordion pattern: tap it and the section folds
 * away, tap again and it is back. Every section opens open, as the frames draw them; its
 * long copy is folded inside it instead (V4Fold). Mark's prototype (KhQYPL14…) has the
 * same two controls: "The small arrows inside open its sections."
 *
 * LOCKED: a section a locked reader has none of (Challenges in Partnerships' "Common
 * Challenges", whose wall falls before it) keeps its heading and takes a locked chapter's
 * lock in the disc's place; its row opens the paywall, and no body is drawn.
 */

interface Props {
  title: string;
  /** The frame's node for the row. */
  nodeId?: string;
  children?: ReactNode;
  /** Opens the paywall: the section is wholly behind it for this reader. */
  onUnlock?: () => void;
  locked?: boolean;
}

const V4Section: FC<Props> = ({ title, nodeId, children, onUnlock, locked = false }) => {
  const [open, setOpen] = useState(true);
  const bodyId = useId();

  if (locked) {
    return (
      <section className="rv4-sect is-locked" data-node-id={nodeId}>
        <h3 className="rv4-sect__title">
          <button type="button" className="rv4-sect__head" onClick={guardedUnlock(onUnlock)}>
            <span className="rv4-sect__name">{title}</span>
            <V4ChapterLockDisc />
          </button>
        </h3>
      </section>
    );
  }

  return (
    <section className={`rv4-sect${open ? " is-open" : ""}`} data-node-id={nodeId}>
      <h3 className="rv4-sect__title">
        <button
          type="button"
          className="rv4-sect__head"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="rv4-sect__name">{title}</span>
          <V4SectionChevron />
        </button>
      </h3>
      <div className="rv4-sect__inner" id={bodyId} hidden={!open}>
        {children}
      </div>
    </section>
  );
};

export default V4Section;
