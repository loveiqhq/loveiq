"use client";

import { createContext, useCallback, useContext, useState, type FC, type ReactNode } from "react";
import {
  REPORT_V4_SUFFIX_BREAK_IDS,
  REPORT_V4_UNSUFFIXED_CHAPTER_IDS,
} from "@/data/report3-archetype-page";
import {
  REPORT_V3_CHAPTER_BY_ID,
  REPORT_V4_CHAPTER_BY_ID,
  type ReportV3Chapter,
} from "./reportV3Nav";
import { V4ChapterChevron, V4ChapterTitle } from "./V4ChapterHead";
import { useOnV4OpenChapter } from "./v4OpenChapter";

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

/**
 * Report V4 rides on V3 mode (`?v4=1` implies V3), so it is announced on top of
 * it rather than instead of it. It exists for the few places whose ORDER differs —
 * the chapter nav and the numbers in the V3 eyebrows — see REPORT_V4_CHAPTERS.
 */
const V4ModeContext = createContext(false);

export const V4ModeProvider: FC<{ children: ReactNode }> = ({ children }) => (
  <V4ModeContext.Provider value={true}>{children}</V4ModeContext.Provider>
);

export function useIsV4(): boolean {
  return useContext(V4ModeContext);
}

/**
 * The chapter meta for a section id, or null if it is not a numbered chapter.
 * `v4` reads V4's numbering, where Typical Beliefs opens its part and Accelerator
 * & Brakes opens the next (REPORT_V4_CHAPTERS).
 */
export function getV3Chapter(sectionId: string, v4 = false): ReportV3Chapter | null {
  return (v4 ? REPORT_V4_CHAPTER_BY_ID : REPORT_V3_CHAPTER_BY_ID).get(sectionId) ?? null;
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
  /** The archetype on screen. V4 sets each title's "- of the <Archetype>" run from it. */
  archetype?: string;
}

const V3Chapter: FC<Props> = ({ chapter, sectionId, children, feedbackWidget, archetype }) => {
  const isV4 = useIsV4();
  // The delivered V3 frame is "UNTOGGLED (all chapters open)", so open is its
  // resting state and the chevron points up until the reader collapses it. V4 closes
  // them (review 24.09): a chapter opens when the reader asks for it, and only then
  // shows its "Does this resonate?".
  const [isOpen, setIsOpen] = useState(!isV4);
  const bodyId = `rv3-chapter-body-${sectionId}`;
  // Part II's nudges open a chapter by its section id — V4 only; V3 has no nudges
  // and its chapters start open. Called before the branch so hook order is stable.
  useOnV4OpenChapter(
    sectionId,
    useCallback(() => setIsOpen(true), []),
    isV4
  );

  if (isV4) {
    // Typical Beliefs' head (V4ChapterHead), not V3's: no book icon, chapter number
    // or rule. `.rv4-chapter` takes V4Chapter's type, discs and the closed row's
    // divider; `.rv3-chapter` and its body keep what the V2 sections inside rely on.
    // The body stays mounted while closed — clipped by V3's own collapse, and inert —
    // so the cards in it keep their state and the paywall observers their targets.
    return (
      <section
        id={sectionId}
        data-report-section="true"
        className={`rv3-chapter rv4-chapter${isOpen ? " is-open" : ""}`}
        data-node-id={isOpen ? "1:175" : "1:862"}
        data-name="Chapter H1 + Copy"
      >
        <button
          type="button"
          className="rv4-chapter__button"
          aria-expanded={isOpen}
          aria-controls={bodyId}
          onClick={() => setIsOpen((v) => !v)}
        >
          <V4ChapterTitle
            title={chapter.title}
            archetype={REPORT_V4_UNSUFFIXED_CHAPTER_IDS.has(sectionId) ? undefined : archetype}
            breakBeforeSuffix={REPORT_V4_SUFFIX_BREAK_IDS.has(sectionId)}
          />
          <V4ChapterChevron />
        </button>

        <div className="rv3-chapter__body" id={bodyId} inert={!isOpen}>
          <div>
            <div className="rv3-chapter__body-inner">
              {children}
              {feedbackWidget ? (
                <div className="rv4-rating">
                  <div className="rv4-rating__live">{feedbackWidget}</div>
                  <div className="rv4-rating__tail" aria-hidden="true" />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    );
  }

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
            {feedbackWidget ? <div className="rv3-chapter__feedback">{feedbackWidget}</div> : null}
          </div>
        </div>
      </div>
    </section>
  );
};

export default V3Chapter;
