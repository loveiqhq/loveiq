import type { FC } from "react";

/**
 * "Typical sun beliefs" — Figma 368:5623, the green panel that follows the coral
 * one in the Typical Beliefs chapter.
 *
 * The same chrome as 368:5482 in the other hue — white under a 0.11 to 0.03
 * vertical wash, a hairline at 26%, a 20px radius and one soft drop shadow — but
 * no animation and no state: every row is already a sun belief, so there is
 * nothing to turn. That is why this is a plain server component while its coral
 * twin is a client one.
 *
 * The ten entries are the same ten the coral panel's rows land on, in the frame's
 * own order, which is not the turn order.
 */

/** 368:5623 heading. Chrome, not paid copy — see V4ShadowBeliefs. */
const PANEL_TITLE = "Typical sun beliefs";

interface Props {
  sun: readonly string[];
  /**
   * Index of the first blurred row, or null when the chapter is open. 381:362
   * leaves its first three rows clear and blurs 4 to 10 at 5px, the same boundary
   * the coral panel uses.
   */
  lockedFrom?: number | null;
}

const V4SunBeliefs: FC<Props> = ({ sun, lockedFrom = null }) => (
  <section className="rv4-sun" data-node-id="368:5623" data-name="Typical sun beliefs">
    <h4 className="rv4-sun__head">{PANEL_TITLE}</h4>

    <ul className="rv4-sun__list">
      {sun.map((belief, i) => (
        <li
          key={belief}
          className={`rv4-sun__row${lockedFrom !== null && i >= lockedFrom ? " is-locked" : ""}`}
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
        </li>
      ))}
    </ul>

    {/* The frame closes both panels with the same 29px foot. */}
    <div className="rv4-sun__foot" aria-hidden="true" />
  </section>
);

export default V4SunBeliefs;
