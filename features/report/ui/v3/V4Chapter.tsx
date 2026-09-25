"use client";

import { useId, useState, type FC, type ReactNode } from "react";
import { V4ChapterChevron, V4ChapterTitle } from "./V4ChapterHead";

/**
 * Chapter row — Report V4.
 *
 * Figma: "Expanded Chapter H1 + Copy" 1:175 / 1:185 and "Collapsed Chapter H1 + Copy"
 * 1:862. The frame repeats this 22 times, so it is the single most load-bearing
 * component on the page.
 *
 * The skeleton is unchanged from `.rv3-chapter` and is deliberately not re-derived:
 * same 8px gap, same `padding: 11px 0 0` on the button. Three things change in V4,
 * which is why this is a separate component rather than a restyle of the live
 * `?v3=1` one:
 *
 * 1. The title goes 20/25.6 → 24/28.8 and gains an "- of the <Archetype>" suffix,
 *    set 14/16.8 with the archetype name in --rv3-name-ink.
 * 2. The violet "CHAPTER 2.1" eyebrow and its rule are gone entirely.
 * 3. Open and closed carry DIFFERENT copy, not the same copy revealed: closed shows a
 *    serif teaser (Lora 16/19.2), open shows the sans body (16/25.6). So both are
 *    props, and collapsing is not merely a CSS height change.
 *
 * The chevron sits in a 34px "Control / Disc": open is a white disc with a 1.5px
 * violet ring and the chevron pointing UP (304:260), closed is the 10% lavender
 * disc with it pointing DOWN (1:866).
 */

interface Props {
  /**
   * Chapter name, e.g. "Core Insecurities". Only a non-collapsible chapter may go
   * without one — Part I's Introduction lost its title on 2026-09-24.
   */
  title?: string;
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
  /**
   * `false` renders the chapter permanently open, with a plain heading and no
   * toggle or chevron. Part I is not collapsible — Fatih's call on 2026-09-23 —
   * so its two chapters always show their copy.
   */
  collapsible?: boolean;
  /**
   * The report section this chapter IS in the live report. Becomes the element's
   * `id` — the anchor the chapter nav links to, the scroll-spy measures and the
   * scroll pop-up looks up — so a chapter moved off `ReportSection` keeps all three.
   */
  sectionId?: string;
  /**
   * The live "Does this resonate?" widget, rendered as the open body's last row in
   * the same `.rv4-rating` wrapper the Summary and Top-3 use. Its 44px tail is the
   * gap to the next chapter.
   */
  feedback?: ReactNode;
  /**
   * For a chapter that brings its own body — Typical Beliefs (304:256). The body
   * drops the generic 356px / 16px-gap / 20px-padding treatment, and the children
   * stay MOUNTED while collapsed (hidden, not removed), so the practice and article
   * cards inside keep their open state and the paywall observer keeps its target.
   */
  bare?: boolean;
}

const V4Chapter: FC<Props> = ({
  title,
  archetype,
  teaser,
  children,
  defaultOpen = false,
  collapsible = true,
  sectionId,
  feedback,
  bare = false,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const bodyId = useId();
  const anchor = sectionId ? { id: sectionId, "data-report-section": "true" } : {};
  const rating = feedback ? (
    <div className="rv4-rating">
      <div className="rv4-rating__live">{feedback}</div>
      <div className="rv4-rating__tail" aria-hidden="true" />
    </div>
  ) : null;

  if (!collapsible) {
    return (
      <section
        {...anchor}
        className="rv4-chapter is-open is-static"
        data-node-id="1:175"
        data-name="Chapter H1 + Copy"
      >
        {title ? (
          <div className="rv4-chapter__head">
            <h3 className={`rv4-chapter__title${archetype ? " has-suffix" : ""}`}>{title}</h3>
          </div>
        ) : null}
        <div className="rv4-chapter__body">
          {children}
          {rating}
        </div>
      </section>
    );
  }

  return (
    <section
      {...anchor}
      className={`rv4-chapter${isOpen ? " is-open" : ""}${bare ? " is-bare" : ""}`}
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
        <V4ChapterTitle title={title ?? ""} archetype={archetype} />
        <V4ChapterChevron />
      </button>

      {bare ? (
        <div className="rv4-chapter__body is-bare" id={bodyId} hidden={!isOpen}>
          {children}
          {rating}
        </div>
      ) : (
        /* 1:869 — open and closed hold different copy, so only one is ever mounted. */
        <div className="rv4-chapter__body" id={bodyId}>
          {isOpen && children ? (
            children
          ) : teaser ? (
            <p className="rv4-chapter__teaser">{teaser}</p>
          ) : null}
          {isOpen ? rating : null}
        </div>
      )}
    </section>
  );
};

export default V4Chapter;
