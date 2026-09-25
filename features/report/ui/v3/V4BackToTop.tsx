"use client";

import { useCallback, useEffect, useState, type FC, type RefObject } from "react";

/**
 * The floating "Back to top" control for a very long expanded section.
 *
 * Asked for in the LoveIQ Sync of 2026-09-22: "a floating CTA to bring users back
 * to the top when expanding long sections". It is not drawn in Figma — the action
 * item allowed for that ("if the original implementation cannot be found, create a
 * new design and present it for feedback") — so the chrome is borrowed wholesale
 * from the Ignite panel (316:250) to keep it unmistakably of this report: white
 * fill, the same 1px violet hairline at 40%, a full radius, and the violet chevron
 * from 316:259 turned upwards.
 *
 * It returns to the top of ITS OWN SECTION, not the top of the page. "Go deeper &
 * learn more" expands to 11,624px — about eleven phone screens — and what a reader
 * wants at the bottom of that is the control that closes it again, which sits at
 * the section's head. Sending them to the report's first line would lose their
 * place entirely.
 *
 * POSITIONING. `position: sticky` with `height: 0`, exactly as `.rv4-chrome` pins
 * the header: the anchor keeps the button inside the 393px column on a phone AND
 * inside the preview's 393px canvas on a laptop, which `position: fixed` cannot do
 * — fixed resolves against the viewport, so in the preview it would fly out to the
 * browser's corner. Sticking to `bottom` also means the button retires by itself
 * when the section ends, with no second scroll threshold to maintain.
 *
 * WHEN IT SHOWS. From the moment the article opens (review 24.09: "should appear the
 * moment someone opens a Go deeper & learn more section and should stick to the
 * position while you scroll up and down in that element"). It used to wait until the
 * section head was a screen above the fold, which, under the unlock bar, meant a
 * locked reader first met it at the article's end. It fades in on the frame after
 * mounting, so opening the article is what brings it up.
 */

/**
 * The floating chrome occupies the top 136px of the viewport — header 8→56, pill
 * band 80→136, per the note above `.rv4-chrome`. Landing the section heading under
 * it would hide the very thing being scrolled to, so clear it with a little air.
 */
const CHROME_OFFSET_PX = 144;

interface Props {
  /** The section whose top the button returns to. */
  targetRef: RefObject<HTMLElement | null>;
  label?: string;
}

const V4BackToTop: FC<Props> = ({ targetRef, label = "Back to top" }) => {
  // Visible from the first render where there is no frame to wait for (SSR, old
  // browsers); otherwise one frame after mounting, so the fade has a start to run from.
  const [visible, setVisible] = useState(() => typeof requestAnimationFrame !== "function");

  useEffect(() => {
    if (typeof window.requestAnimationFrame !== "function") return;
    const frame = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const toTop = useCallback(() => {
    const el = targetRef.current;
    if (!el) return;
    // scrollIntoView cannot express the chrome offset, so scroll the window.
    const top = window.scrollY + el.getBoundingClientRect().top - CHROME_OFFSET_PX;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    window.scrollTo({ top: Math.max(0, top), behavior: reduced ? "auto" : "smooth" });
  }, [targetRef]);

  return (
    <div className="rv4-backtop" data-visible={visible ? "true" : "false"}>
      <button
        type="button"
        className="rv4-backtop__btn"
        onClick={toTop}
        // Hidden from the tab order as well as the eye, so a keyboard reader does
        // not land on a control that is not on screen.
        tabIndex={visible ? 0 : -1}
        aria-hidden={!visible}
      >
        <span className="rv4-backtop__chev" aria-hidden="true">
          <svg viewBox="0 0 18 18" fill="none">
            <path
              d="M4.78 11.11L9 6.89L13.22 11.11"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        {label}
      </button>
    </div>
  );
};

export default V4BackToTop;
