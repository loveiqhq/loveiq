"use client";

import { useState, type FC } from "react";

/**
 * "Does this resonate?" — Report V4.
 *
 * Figma 1:833 (393 wide, at the end of a part) and 1:747 (361 wide, inside the
 * Summary Chapter). 26px tall row, right-aligned, with a 44px spacer beneath it —
 * the spacer is part of the frame, which is why the block measures 70.
 *
 * The live report posts this to /api/report-feedback keyed by submission and
 * section. There is no submission in the preview, so this records the choice
 * locally and nothing is sent; wiring it up belongs with the real report, not here.
 */

interface Props {
  /** The section this rates, used for the buttons' accessible names. */
  label: string;
  /** 1:749 is 361 wide inside the Summary Chapter; 1:835 is 393 at part level. */
  width?: 361 | 393;
}

const V4Rating: FC<Props> = ({ label, width = 393 }) => {
  const [choice, setChoice] = useState<"yes" | "no" | null>(null);

  return (
    <div className="rv4-rating" data-node-id="1:833" data-name="Rating with buttom space">
      <div className="rv4-rating__row" style={{ width }}>
        <span className="rv4-rating__label">Does this resonate?</span>
        <div className="rv4-rating__buttons">
          <button
            type="button"
            className={`rv4-rating__btn${choice === "yes" ? " is-on" : ""}`}
            aria-pressed={choice === "yes"}
            onClick={() => setChoice(choice === "yes" ? null : "yes")}
          >
            <span className="rv4-rating__glyph rv4-rating__glyph--yes" aria-hidden="true" />
            <span className="rv3-sr">This resonates: {label}</span>
          </button>
          <button
            type="button"
            className={`rv4-rating__btn${choice === "no" ? " is-on" : ""}`}
            aria-pressed={choice === "no"}
            onClick={() => setChoice(choice === "no" ? null : "no")}
          >
            <span className="rv4-rating__glyph rv4-rating__glyph--no" aria-hidden="true" />
            <span className="rv3-sr">This does not resonate: {label}</span>
          </button>
        </div>
      </div>
      {/* 1:847 — the frame's own 44px tail. */}
      <div className="rv4-rating__tail" aria-hidden="true" />
    </div>
  );
};

export default V4Rating;
