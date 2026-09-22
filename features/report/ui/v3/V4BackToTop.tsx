"use client";

import { useCallback, useEffect, useRef, useState, type FC, type RefObject } from "react";

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
 */

/**
 * How far the section's top must pass above the fold before the button appears.
 * Roughly one screen: showing it while the heading is still visible would offer a
 * trip to somewhere the reader can already see.
 */
const SHOW_AFTER_PX = 320;

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
  const [visible, setVisible] = useState(false);
  const frame = useRef(0);
  const queued = useRef(false);

  useEffect(() => {
    const read = () => {
      const el = targetRef.current;
      if (el) setVisible(el.getBoundingClientRect().top < -SHOW_AFTER_PX);
    };
    // rAF-coalesced: a passive scroll listener can fire many times per frame, and
    // this only ever reads layout to flip one boolean.
    //
    // The guard is its own flag, set BEFORE the frame is requested, rather than the
    // handle returned by requestAnimationFrame. The handle is assigned only after
    // the call returns, so any callback that runs during it — a synchronous rAF, as
    // in a test — would clear a handle that is then immediately overwritten, and the
    // listener would wedge shut for good.
    const onScroll = () => {
      if (queued.current) return;
      queued.current = true;
      frame.current = window.requestAnimationFrame(() => {
        queued.current = false;
        read();
      });
    };

    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame.current) window.cancelAnimationFrame(frame.current);
    };
  }, [targetRef]);

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
