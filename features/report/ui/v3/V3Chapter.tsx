"use client";

import { createContext, useContext, useState, type FC, type ReactNode } from "react";
import { REPORT_V3_CHAPTER_BY_ID, type ReportV3Chapter } from "./reportV3Nav";

/**
 * V3 chapter chrome — Figma 10439:181 (eyebrow) + 10439:190 (title button).
 *
 * `ReportSection` is the single wrapper every one of the report's 28 render
 * branches goes through, so switching the chrome there gives all 21 chapters the
 * V3 treatment without duplicating any of ReportPage's prop derivation. This
 * context is how it learns it is in V3 mode — a prop would have to be threaded
 * through all 28 call sites.
 */
const V3ModeContext = createContext(false);

export const V3ModeProvider: FC<{ children: ReactNode }> = ({ children }) => (
  <V3ModeContext.Provider value={true}>{children}</V3ModeContext.Provider>
);

export function useIsV3(): boolean {
  return useContext(V3ModeContext);
}

/** The chapter meta for a section id, or null if it is not a numbered chapter. */
export function getV3Chapter(sectionId: string): ReportV3Chapter | null {
  return REPORT_V3_CHAPTER_BY_ID.get(sectionId) ?? null;
}

/** Lucide `book-open`, stroke #795FC8. Figma draws it at 0.9917 stroke inside a
 * 14px box, which is a 24-viewBox glyph at stroke-width 1.7 (0.9917 * 24/14). */
const BookOpenIcon: FC = () => (
  <svg
    className="rv3-chapter__icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 7v14" />
    <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
  </svg>
);

/** Lucide `chevron-down` — Figma 10439:194, verbatim path at 15px. */
const ChapterChevron: FC = () => (
  <svg className="rv3-chapter__chev" viewBox="0 0 15 15" fill="none" aria-hidden="true">
    <path
      d="M3.28125 5.625L7.5 9.84375L11.7188 5.625"
      stroke="currentColor"
      strokeWidth="1.59375"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

interface Props {
  chapter: ReportV3Chapter;
  sectionId: string;
  children: ReactNode;
  feedbackWidget?: ReactNode;
}

const V3Chapter: FC<Props> = ({ chapter, sectionId, children, feedbackWidget }) => {
  // The delivered frame is "UNTOGGLED (all chapters open)", so open is the
  // resting state and the chevron points up until the reader collapses it.
  const [isOpen, setIsOpen] = useState(true);
  const bodyId = `rv3-chapter-body-${sectionId}`;

  return (
    <section
      id={sectionId}
      data-report-section="true"
      className={`rv3-chapter ${isOpen ? "is-open" : ""}`}
      data-node-id="10439:180"
    >
      <p className="rv3-chapter__eyebrow" data-node-id="10439:181">
        <BookOpenIcon />
        <span className="rv3-chapter__number">Chapter {chapter.number}</span>
        <span className="rv3-chapter__rule" aria-hidden="true" />
      </p>

      <button
        type="button"
        className="rv3-chapter__button"
        aria-expanded={isOpen}
        aria-controls={bodyId}
        onClick={() => setIsOpen((v) => !v)}
        data-node-id="10439:190"
      >
        <span className="rv3-chapter__title">{chapter.title}</span>
        <ChapterChevron />
      </button>

      <div className="rv3-chapter__body" id={bodyId}>
        <div>
          <div className="rv3-chapter__body-inner">
            {children}
            {feedbackWidget ? (
              <div className="rv3-chapter__feedback">{feedbackWidget}</div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
};

export default V3Chapter;
