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

interface Props {
  view: Report3TypicalBeliefsView;
  /**
   * How many turn rows animate before the rest are gated. The paywalled frame
   * animates three; the open chapter animates all ten.
   */
  animatedCount?: number;
}

const V4TypicalBeliefs: FC<Props> = ({ view, animatedCount }) => (
  <div className="rv4-tb" data-node-id="304:256" data-name="Expanded Chapter — Typical Beliefs">
    <V4Prose blocks={view.intro} />

    <V4ShadowBeliefs turns={view.panels.turns} animatedCount={animatedCount} />
    <V4SunBeliefs sun={view.panels.sun} />

    {/* 304:378 — the chapter's only H2, and the only 18px heading in the frame. */}
    <h3 className="rv4-tb__h2" data-node-id="304:379">
      {view.challengesTitle}
    </h3>

    <V4Prose blocks={view.challenges} />
  </div>
);

export default V4TypicalBeliefs;
