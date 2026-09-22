import type { FC } from "react";
import type { Report3TypicalBeliefsView } from "@/data/report3-typical-beliefs";
import V4Prose from "./V4Prose";
import V4ShadowBeliefs from "./V4ShadowBeliefs";
import V4SunBeliefs from "./V4SunBeliefs";

/**
 * "Expanded Chapter — Typical Beliefs" — Figma 304:256, the body of the one
 * chapter Part III draws open.
 *
 * A chapter with its own component rather than `V4Chapter`'s generic open state
 * (1:175), because the frame gives it two panels no other chapter has: the coral
 * turn list (368:5482) and the green sun list (368:5623), with the prose running
 * above, between and below them in 304:264's own order.
 *
 * The copy arrives as a prop. Everything under `features/report/ui/v3` is reached
 * from a "use client" boundary, and `@/data/report3-typical-beliefs` is paid copy
 * registered in the premium-content-bundle test, so the module is read on the
 * server and threaded down exactly as `learnMore` is.
 *
 * The frame sets its paragraphs 356 wide inside a 361 container. That 5px is a
 * text-box leftover rather than a right inset anyone drew: the headings and both
 * panels are the full 361, and every other prose surface in V4 runs full width.
 * So the copy runs full width here too.
 */

/**
 * How much of "Common challenges" stays clear behind the wall. 348:221 draws the
 * subheading and three paragraphs sharp, then carries a 5px layer blur on every
 * block from 348:332 down.
 */
const CHALLENGES_FREE_BLOCKS = 4;

interface Props {
  view: Report3TypicalBeliefsView;
}

const V4TypicalBeliefs: FC<Props> = ({ view }) => {
  const locked = view.lockedFrom !== null;
  const freeChallenges = locked
    ? view.challenges.slice(0, CHALLENGES_FREE_BLOCKS)
    : view.challenges;
  const gatedChallenges = locked ? view.challenges.slice(CHALLENGES_FREE_BLOCKS) : [];

  return (
    <div
      className={`rv4-tb${locked ? " is-locked" : ""}`}
      data-node-id={locked ? "348:213" : "304:256"}
      data-name="Expanded Chapter — Typical Beliefs"
    >
      <V4Prose blocks={view.intro} />

      <V4ShadowBeliefs turns={view.panels.turns} lockedFrom={view.lockedFrom} />
      <V4SunBeliefs sun={view.panels.sun} lockedFrom={view.lockedFrom} />

      {/* 304:378 — the chapter's only H2, and the only 18px heading in the frame. */}
      <h3 className="rv4-tb__h2" data-node-id="304:379">
        {view.challengesTitle}
      </h3>

      <V4Prose blocks={freeChallenges} />

      {gatedChallenges.length > 0 ? (
        /* 348:332 onwards. The mask ramps the blurred copy in over two lines
         * rather than cutting to it, which is Mark's "Fade first 2 lines of next
         * paragraph" on 1935708032. */
        <div className="rv4-tb__gated" aria-hidden="true" inert>
          <V4Prose blocks={gatedChallenges} />
        </div>
      ) : null}
    </div>
  );
};

export default V4TypicalBeliefs;
