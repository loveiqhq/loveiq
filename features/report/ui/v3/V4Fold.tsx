"use client";

import { useEffect, useId, useRef, useState, type FC, type ReactNode } from "react";

/**
 * A sneak peek — the slimmed report's fold (16.10; Figma 1709:1486, 1709:1493, 1686:10619,
 * 1711:1857). Mark asked on 13.10 whether to "fully collapse the elements or better have a
 * sneak peek with the Show All CTAs? I think the latter", and at the 14.10 sync: "take the
 * text that is there, you collapse it, and have this fade and the CTA on top, and the CTA
 * expands it".
 *
 * Folded, the copy shows its first `lines` lines, the last two fading to white under a 63px
 * fade (Figma's: clear, 66% at 42%, white), and the "Show All" pill the A&B cards and the
 * Summary use sits just under them. One tap opens it for good, as theirs do, and focus moves
 * to the copy, since the pill leaves with the fold. Copy that runs no more than a line past
 * its peek is never folded: a pill that would hide one line hides nothing worth the tap.
 *
 * Everything inside is on the page from the start (it is the reader's own copy, paid or
 * free): the fold is a way to read it, not a gate. Gates are V4UnlockSample's; a fold may
 * hold one at its end (V4Passage), and says so with `has-wall`.
 */

interface Props {
  /** Lines shown while folded: six in 1709:1486, Figma's most common peek. */
  lines?: number;
  /** What the pill opens, for its accessible name: "Show all of <label>". */
  label: string;
  children: ReactNode;
  nodeId?: string;
  /** The chapter's wall is inside, after the copy: the page's first paywall may be here. */
  holdsWall?: boolean;
}

/** The V4 prose line (16/25.6) when the copy has none to measure yet. */
const FALLBACK_LINE_PX = 25.6;

const V4Fold: FC<Props> = ({ lines = 6, label, children, nodeId, holdsWall = false }) => {
  const [open, setOpen] = useState(false);
  // Unknown until measured: folded meanwhile, so a long passage never flashes open, with
  // no pill yet, so a short one never flashes one.
  const [fits, setFits] = useState<boolean | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  /** Set by the pill: once the fold has gone, focus goes to the copy. */
  const opened = useRef(false);
  const copyId = useId();

  useEffect(() => {
    const root = rootRef.current;
    const el = copyRef.current;
    if (!root || !el || open) return;
    const measure = () => {
      const first = el.querySelector("p, li, h3, h4");
      const line = Number.parseFloat(getComputedStyle(first ?? el).lineHeight) || FALLBACK_LINE_PX;
      // On the root, so the fade under the copy reads the same peek; to the hundredth, as
      // 6 x 25.6 is 153.60000000000002 in floating point.
      root.style.setProperty("--rv4-fold-peek", `${Math.round(lines * line * 100) / 100}px`);
      setFits(el.scrollHeight <= (lines + 1) * line + 1);
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => measure());
    observer?.observe(el);
    // The real faces load after the first layout and rewrap the copy.
    void document.fonts?.ready.then(measure);
    return () => observer?.disconnect();
  }, [lines, open]);

  useEffect(() => {
    if (!open || !opened.current) return;
    opened.current = false;
    copyRef.current?.focus();
  }, [open]);

  const folded = !open && fits !== true;

  return (
    <div
      ref={rootRef}
      className={`rv4-fold${folded ? " is-folded" : ""}${holdsWall ? " has-wall" : ""}`}
      data-node-id={nodeId}
    >
      <div className="rv4-fold__copy" id={copyId} ref={copyRef} tabIndex={-1}>
        {children}
      </div>
      {folded ? <span className="rv4-fold__fade" aria-hidden="true" /> : null}
      {folded && fits === false ? (
        <button
          type="button"
          className="rv4-fold__pill"
          aria-controls={copyId}
          aria-expanded={false}
          aria-label={`Show all of ${label}`}
          data-chapter-action="show_all"
          onClick={() => {
            opened.current = true;
            setOpen(true);
          }}
        >
          <span className="rv4-fold__pill-label">Show all</span>
        </button>
      ) : null}
    </div>
  );
};

export default V4Fold;
