"use client";

import type { FC } from "react";
import type { Report3TypicalBeliefsView } from "@/data/report3-typical-beliefs";
import V4Fold from "./V4Fold";
import V4Passage from "./V4Passage";
import V4Prose from "./V4Prose";
import V4Section from "./V4Section";
import V4ShadowBeliefs from "./V4ShadowBeliefs";
import V4SunBeliefs from "./V4SunBeliefs";

/**
 * "Expanded Chapter — Typical Beliefs" — Figma 304:256, the body of the chapter that opens
 * Part III; slimmed 1686:10027 (16.10).
 *
 * A chapter with its own component rather than `V4Chapter`'s generic open state (1:175),
 * because the frame gives it two panels no other chapter has: the coral turn list
 * (368:5482) and the green sun list (368:5623).
 *
 * The copy arrives as a prop. `@/data/report3-typical-beliefs` is paid copy registered in
 * the premium-content-bundle test, so the module is read on the server and threaded down —
 * including where "Common challenges" stops for a locked reader, which the server decides
 * so the browser never decides where the wall falls.
 *
 * THE SLIMMED CHAPTER (1686:10036, Sanjin's "Slimmed_Intro_Typical_Beliefs"): the short
 * universal opening, then three sections, each a heading row that folds it away:
 *   "Sun and Shadow Beliefs" — the example and the framework, folded at six lines;
 *   "The <Archetype>" — the archetype's lede, folded at seven, over the two panels;
 *   "Common Challenges" — the first challenge's heading and paragraph sharp, the rest
 *   folded at six (1686:10619), and for a locked reader the wall's faded sample and
 *   "Unlock Full Chapter" at the end of the fold, the frame drawing only "Show All".
 * The panels' locked rows keep their own lock (V4ShadowBeliefs, V4SunBeliefs).
 */

interface Props {
  view: Report3TypicalBeliefsView;
  /** The archetype on screen, for "The <Archetype>". */
  archetype: string;
  /** Opens the paywall — from the locked rows and the wall's sample. */
  onUnlock?: () => void;
}

const V4TypicalBeliefs: FC<Props> = ({ view, archetype, onUnlock }) => {
  const locked = view.lockedFrom !== null;
  const archetypeTitle = `The ${archetype}`;

  return (
    <div
      className={`rv4-tb is-slim${locked ? " is-locked" : ""}`}
      data-node-id={locked ? "1686:10027" : "304:256"}
      data-name="Expanded Chapter — Typical Beliefs"
    >
      {/* 1686:10506 */}
      <div className="rv4-tb__intro">
        <V4Prose blocks={view.intro} />
      </div>

      <V4Section title={view.sunShadowTitle} nodeId="1686:10509">
        <V4Fold lines={6} label={view.sunShadowTitle} nodeId="1709:1486">
          <V4Prose blocks={view.sunShadow} />
        </V4Fold>
      </V4Section>

      <V4Section title={archetypeTitle} nodeId="1686:10559">
        <V4Fold lines={7} label={archetypeTitle} nodeId="1709:1493">
          <V4Prose blocks={view.lede} />
        </V4Fold>
        <V4ShadowBeliefs
          turns={view.panels.turns}
          lockedFrom={view.lockedFrom}
          onUnlock={onUnlock}
        />
        <V4SunBeliefs sun={view.panels.sun} lockedFrom={view.lockedFrom} onUnlock={onUnlock} />
        {/* What a doc sets after the two lists. No frame draws it. */}
        {view.afterPanels ? <V4Prose blocks={view.afterPanels} /> : null}
      </V4Section>

      <V4Section title={view.challengesTitle} nodeId="1686:10568">
        <V4Passage
          gated={view.challenges}
          lead={1}
          lines={6}
          label={view.challengesTitle}
          onUnlock={onUnlock}
        />
      </V4Section>
    </div>
  );
};

export default V4TypicalBeliefs;
