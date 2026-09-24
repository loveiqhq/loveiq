"use client";

import type { FC } from "react";
import type { Report3TypicalBeliefsView } from "@/data/report3-typical-beliefs";
import V4PremiumCard from "./V4PremiumCard";
import V4Prose from "./V4Prose";
import V4ShadowBeliefs from "./V4ShadowBeliefs";
import V4SunBeliefs from "./V4SunBeliefs";
import { guardedUnlock } from "./v4Unlock";

/**
 * "Expanded Chapter — Typical Beliefs" — Figma 304:256, the body of the chapter
 * that opens Part III.
 *
 * A chapter with its own component rather than `V4Chapter`'s generic open state
 * (1:175), because the frame gives it two panels no other chapter has: the coral
 * turn list (368:5482) and the green sun list (368:5623), with the prose running
 * above, between and below them in 304:264's own order.
 *
 * The copy arrives as a prop. `@/data/report3-typical-beliefs` is paid copy
 * registered in the premium-content-bundle test, so the module is read on the
 * server and threaded down exactly as `learnMore` is — including the split of
 * "Common challenges" into free, ramp and blurred parts, which the server makes
 * so the browser never decides where the wall falls.
 *
 * THE PAYWALLED STATE — 348:221. The subheading and three paragraphs stay sharp;
 * the fourth block is the ramp (the blur fades in over its first four lines, per
 * Mark's "progression of 4 lines"); everything after sits under the full blur to
 * the end of the chapter, and the Premium content card floats 87px in. That whole
 * band owns the click, which is why the card's own CTA carries no handler.
 */

interface Props {
  view: Report3TypicalBeliefsView;
  /** Opens the paywall — from the locked rows, the gated prose and its card. */
  onUnlock?: () => void;
}

const V4TypicalBeliefs: FC<Props> = ({ view, onUnlock }) => {
  const locked = view.lockedFrom !== null;
  const { free, ramp, rest } = view.challenges;

  return (
    <div
      className={`rv4-tb${locked ? " is-locked" : ""}`}
      data-node-id={locked ? "348:213" : "304:256"}
      data-name="Expanded Chapter — Typical Beliefs"
    >
      <V4Prose blocks={view.intro} />

      <V4ShadowBeliefs turns={view.panels.turns} lockedFrom={view.lockedFrom} onUnlock={onUnlock} />
      <V4SunBeliefs sun={view.panels.sun} lockedFrom={view.lockedFrom} onUnlock={onUnlock} />

      {/* 304:378 — the chapter's only H2, and the only 18px heading in the frame. */}
      <h3 className="rv4-tb__h2" data-node-id="304:379">
        {view.challengesTitle}
      </h3>

      <V4Prose blocks={free} />

      {ramp ? (
        /* 348:328 onwards — only the rest of "Common challenges", so this band never
         * nests inside another click owner. */
        <div className="rv4-tb__gate" onClick={guardedUnlock(onUnlock)}>
          <div className="rv4-tb__gated" aria-hidden="true" inert>
            <div className="rv4-tb__ramp">
              <V4Prose blocks={[ramp]} />
              <span className="rv4-pblur" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </div>
            <div className="rv4-tb__blurred">
              <V4Prose blocks={rest} />
            </div>
          </div>
          {/* 348:373 — the chapter-body copy of the card, as the frame draws it. */}
          <V4PremiumCard variant="guarantee" nodeId="348:373" />
        </div>
      ) : null}
    </div>
  );
};

export default V4TypicalBeliefs;
