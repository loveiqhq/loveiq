"use client";

import { Fragment, useId, useState, type FC } from "react";
import {
  REPORT_V4_NUDGES,
  REPORT_V4_NUDGES_HEADING,
  REPORT_V4_PARTS,
} from "@/data/report3-archetype-page";
import { REPORT_V4_CHAPTER_BY_ID } from "./reportV3Nav";
import { goToV4Chapter } from "./v4OpenChapter";

/**
 * Part II's "What you will discover" — Figma 1:763: the H2 1:766 over the chapter
 * nudges panel 663:1089, which replaced the Snapshot. The frame stacks three older
 * panels under this one ("Ignite panel expanded" 55:1700, 686:2187, 686:2468 — the
 * same rows with other chip treatments); only 663:1089 is built.
 *
 * Each row: "Learn in" and the chapter's place as a chip, the book glyph and the
 * chapter's name, and its serif question; open, a line of support and "Read full
 * chapter", which opens that chapter and jumps to it. The frame draws the first row
 * open and a hidden all-open state (662:233), so rows open independently.
 *
 * The chip and the name are read from V4's chapter order, not typed: the order
 * numbers chapters within V3's five parts, and the page's parts run one ahead
 * (Part I is the Welcome), which is exactly the frame's "PART III · 3.1".
 */

/** 663:1126's book glyph — lucide book-open at the frame's 16px, stroke 1.2. */
const BookIcon: FC = () => (
  <svg className="rv4-nudges__book" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M8 4.6665V13.9998M1.9997 12C1.8229 12 1.6533 11.9298 1.5283 11.8047C1.4032 11.6797 1.333 11.5101 1.333 11.3333V2.6667C1.333 2.4899 1.4032 2.3203 1.5283 2.1953C1.6533 2.0702 1.8229 2 1.9997 2H5.333C6.0403 2 6.7185 2.281 7.2186 2.781C7.7187 3.2811 7.9997 3.9594 7.9997 4.6667C7.9997 3.9594 8.2806 3.2811 8.7807 2.781C9.2808 2.281 9.9591 2 10.6663 2H13.9997C14.1765 2 14.3461 2.0702 14.4711 2.1953C14.5961 2.3203 14.6663 2.4899 14.6663 2.6667V11.3333C14.6663 11.5101 14.5961 11.6797 14.4711 11.8047C14.3461 11.9298 14.1765 12 13.9997 12H9.9997C9.4692 12 8.9605 12.2107 8.5855 12.5858C8.2104 12.9609 7.9997 13.4696 7.9997 14C7.9997 13.4696 7.789 12.9609 7.4139 12.5858C7.0388 12.2107 6.5301 12 5.9997 12H1.9997Z"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** The 13px arrow after "Read full chapter". */
const ArrowIcon: FC = () => (
  <svg viewBox="0 0 13 13" fill="none" aria-hidden="true">
    <path
      d="M2.708 6.5H9.75M7.041 3.521L10.021 6.5L7.041 9.479"
      stroke="currentColor"
      strokeWidth="1.08333"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** The disc's chevron, 18px, drawn pointing down; CSS turns it up when open. */
const Chevron: FC = () => (
  <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <path
      d="M4.78 6.89L9 11.11L13.22 6.89"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** "Part III · 3.1" and the chapter's V4 name, from V4's own order. */
export function nudgeLabel(id: string): { chip: string; title: string } | null {
  const chapter = REPORT_V4_CHAPTER_BY_ID.get(id);
  if (!chapter) return null;
  const [part, n] = chapter.number.split(".");
  const partIndex = Number(part);
  const heading = REPORT_V4_PARTS[partIndex];
  if (!heading) return null;
  return { chip: `${heading.eyebrow} · ${partIndex + 1}.${n}`, title: chapter.title };
}

const V4ChapterNudges: FC = () => {
  const baseId = useId();
  const [open, setOpen] = useState<ReadonlySet<string>>(
    () => new Set(REPORT_V4_NUDGES[0] ? [REPORT_V4_NUDGES[0].id] : [])
  );
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section className="rv4-nudges" data-node-id="1:763" data-name="What you will discover">
      <h2 className="rv4-nudges__head" data-node-id="1:766">
        {REPORT_V4_NUDGES_HEADING}
      </h2>
      <div className="rv4-nudges__panel" data-node-id="663:1089" data-name="Chapter nudges">
        {REPORT_V4_NUDGES.map((nudge) => {
          const label = nudgeLabel(nudge.id);
          if (!label) return null;
          const isOpen = open.has(nudge.id);
          const moreId = `${baseId}-${nudge.id}`;
          return (
            <div key={nudge.id} className={`rv4-nudges__row${isOpen ? " is-open" : ""}`}>
              {isOpen ? (
                <Fragment>
                  <span
                    className="rv4-nudges__wash rv4-nudges__wash--lavender"
                    aria-hidden="true"
                  />
                  <span className="rv4-nudges__wash rv4-nudges__wash--rose" aria-hidden="true" />
                </Fragment>
              ) : null}
              <button
                type="button"
                className="rv4-nudges__toggle"
                aria-expanded={isOpen}
                aria-controls={moreId}
                onClick={() => toggle(nudge.id)}
              >
                <span className="rv4-nudges__content">
                  <span className="rv4-nudges__where">
                    <span className="rv4-nudges__label">Learn in</span>
                    <span className="rv4-nudges__chip">{label.chip}</span>
                  </span>
                  <span className="rv4-nudges__chapter">
                    <BookIcon />
                    <span className="rv4-nudges__title">{label.title}</span>
                  </span>
                  <span className="rv4-nudges__question">{nudge.question}</span>
                </span>
                <span className="rv4-nudges__disc" aria-hidden="true">
                  <Chevron />
                </span>
              </button>
              <div className="rv4-nudges__more" id={moreId} hidden={!isOpen}>
                <p className="rv4-nudges__support">{nudge.support}</p>
                {/* A button, not a #hash link: Lenis runs with `anchors: true` on
                 * desktop and would smooth-scroll to where the chapter was before it
                 * opened. */}
                <button
                  type="button"
                  className="rv4-nudges__read"
                  onClick={() => goToV4Chapter(nudge.id)}
                >
                  Read full chapter
                  <ArrowIcon />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {/* 686:2102 — 44px to what follows. */}
      <div className="rv4-sep" aria-hidden="true" data-node-id="686:2102" />
    </section>
  );
};

export default V4ChapterNudges;
