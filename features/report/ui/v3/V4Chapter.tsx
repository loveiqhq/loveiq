"use client";

import { useId, useState, type FC, type ReactNode } from "react";

/**
 * Chapter row — Report V4.
 *
 * Figma: "Expanded Chapter H1 + Copy" 1:175 / 1:185 and "Collapsed Chapter H1 + Copy"
 * 1:862. The frame repeats this 22 times, so it is the single most load-bearing
 * component on the page.
 *
 * The skeleton is unchanged from `.rv3-chapter` and is deliberately not re-derived:
 * same 8px gap, same `padding: 11px 0 0` on the button, same 15px chevron sitting 8px
 * below the title's cap height. Three things change in V4, which is why this is a
 * separate component rather than a restyle of the live `?v3=1` one:
 *
 * 1. The title goes 20/25.6 → 24/28.8 and gains an "- of the <Archetype>" suffix,
 *    set 14/16.8 with the archetype name in --rv3-name-ink.
 * 2. The violet "CHAPTER 2.1" eyebrow and its rule are gone entirely.
 * 3. Open and closed carry DIFFERENT copy, not the same copy revealed: closed shows a
 *    serif teaser (Lora 16/19.2), open shows the sans body (16/25.6). So both are
 *    props, and collapsing is not merely a CSS height change.
 */

interface Props {
  /** Chapter name, e.g. "Core Insecurities". */
  title: string;
  /**
   * Renders the "- of the <name>" suffix after the title. Omitted on Part I's
   * chapters, which the frame draws without it.
   */
  archetype?: string;
  /**
   * Closed-state copy. The frame draws `[Teaser Text]` for all seventeen collapsed
   * chapters, so that placeholder is what ships until Mark writes them.
   */
  teaser?: string;
  /**
   * Open-state copy. A chapter that carries one renders it INSTEAD of the teaser,
   * so a chapter whose body is a "Go deeper & learn more" article drops the
   * `[Chapter Copy]` placeholder rather than stacking the two.
   */
  children?: ReactNode;
  defaultOpen?: boolean;
}

const V4Chapter: FC<Props> = ({ title, archetype, teaser, children, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const bodyId = useId();

  return (
    <section
      className={`rv4-chapter${isOpen ? " is-open" : ""}`}
      data-node-id={isOpen ? "1:175" : "1:862"}
      data-name="Chapter H1 + Copy"
    >
      {/* 1:863 — the button row. */}
      <button
        type="button"
        className="rv4-chapter__button"
        aria-expanded={isOpen}
        aria-controls={bodyId}
        onClick={() => setIsOpen((v) => !v)}
      >
        <h3 className={`rv4-chapter__title${archetype ? " has-suffix" : ""}`}>
          {title}
          {archetype ? (
            <>
              <span className="rv4-chapter__of"> - of the </span>
              <span className="rv4-chapter__archetype">{archetype}</span>
            </>
          ) : null}
        </h3>
        {/* 1:867 — 15px, sits 8px below the title cap height. */}
        <span className="rv4-chapter__chev" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2.1" />
          </svg>
        </span>
      </button>

      {/* 1:869 — open and closed hold different copy, so only one is ever mounted. */}
      <div className="rv4-chapter__body" id={bodyId}>
        {isOpen && children ? (
          children
        ) : teaser ? (
          <p className="rv4-chapter__teaser">{teaser}</p>
        ) : null}
      </div>
    </section>
  );
};

export default V4Chapter;
