"use client";

import type { FC } from "react";
import V4LockBadge from "./V4LockBadge";
import { guardedUnlock } from "./v4Unlock";

/**
 * "Typical sun beliefs" — Figma 368:5623, the green panel that follows the coral
 * one in the Typical Beliefs chapter.
 *
 * The same chrome as 368:5482 in the other hue — white under a 0.11 to 0.03
 * vertical wash, a hairline at 26%, a 20px radius and one soft drop shadow — but
 * no animation: every row is already a sun belief, so there is nothing to turn.
 *
 * The ten entries are the same ten the coral panel's rows land on, in the frame's
 * own order, which is not the turn order.
 *
 * THE PAYWALLED STATE — 381:362. Rows 1 to 3 clear, row 4 the ramp (the blur fades
 * in over its top 65.6%), rows 5 to 10 under the full blur, their text as the server
 * sends it (lockedBlurCopy.ts), and the gradient lock (441:6129) 111px below the top
 * of the locked group. A client component only because that group opens the
 * paywall.
 */

/** 368:5623 heading. Chrome, not paid copy — see V4ShadowBeliefs. */
const PANEL_TITLE = "Typical sun beliefs";

interface Props {
  sun: readonly string[];
  /**
   * Index of the first locked row, or null when the chapter is open. 381:362
   * leaves its first three rows clear and locks 4 to 10, the same boundary the
   * coral panel uses.
   */
  lockedFrom?: number | null;
  /** Opens the paywall from the locked rows. Omitted, the rows are inert. */
  onUnlock?: () => void;
}

const V4SunBeliefs: FC<Props> = ({ sun, lockedFrom = null, onUnlock }) => {
  const locked = lockedFrom !== null;

  // Keyed by index: in decoy mode a locked reader's rows 5-10 arrive scrambled.
  const row = (belief: string, i: number) => {
    const isLocked = locked && i >= lockedFrom;
    const isRamp = locked && i === lockedFrom;
    return (
      <li
        key={i}
        className={`rv4-sun__row${isLocked ? ` is-locked ${isRamp ? "is-ramp" : "is-blurred"}` : ""}`}
      >
        <span className="rv4-sun__tick" aria-hidden="true">
          <svg viewBox="0 0 9 9" fill="none">
            <path
              d="M1.4 4.8L3.5 6.9L7.6 2.1"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <p className="rv4-sun__text">{belief}</p>

        {/* 381:383 — the blur ramps in over this row's top 65.6%. */}
        {isRamp ? (
          <span className="rv4-pblur rv4-sun__ramp" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        ) : null}
      </li>
    );
  };

  return (
    <section
      className={`rv4-sun${locked ? " is-locked" : ""}`}
      data-node-id={locked ? "381:362" : "368:5623"}
      data-name="Typical sun beliefs"
    >
      {/* 368:5624 — the green twin of the coral blob. */}
      <span className="rv4-sun__blob" aria-hidden="true" />

      <h4 className="rv4-sun__head">{PANEL_TITLE}</h4>

      <ul className="rv4-sun__list">
        {(locked ? sun.slice(0, lockedFrom) : sun).map((belief, i) => row(belief, i))}
      </ul>

      {locked ? (
        <div className="rv4-tb-lock rv4-sun__lock" onClick={guardedUnlock(onUnlock)}>
          <ul className="rv4-sun__list is-locked" aria-hidden="true" inert>
            {sun.slice(lockedFrom).map((belief, j) => row(belief, lockedFrom + j))}
          </ul>
          <V4LockBadge />
        </div>
      ) : null}

      {/* The frame closes both panels with the same 29px foot. */}
      <div className="rv4-sun__foot" aria-hidden="true" />
    </section>
  );
};

export default V4SunBeliefs;
