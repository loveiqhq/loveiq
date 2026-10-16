"use client";

import type { FC } from "react";
import type { Report3AcceleratorsView } from "@/data/report3-accelerators";
import V4Fold from "./V4Fold";
import V4Passage from "./V4Passage";
import V4Prose from "./V4Prose";
import V4Section from "./V4Section";
import V4TriggerCard from "./V4TriggerCard";
import V4TryThis from "./V4TryThis";

/**
 * "Chapter — Accelerators & Brakes" — the body of the chapter that opens Part IV
 * (Figma 310:229 inside the Part IV page 334:521; paywalled 314:219), followed by
 * its "Try this & see what shifts" card.
 *
 * In 310:229's own order: the intro, a lead-in, the "WHAT BRAKES YOU" card, a
 * second lead-in, the "WHAT ACCELERATES YOU" card, then "Common challenges" — all
 * 16px apart. The practice card is rendered here too, as the body's next sibling,
 * because its geometry is this chapter's (377:221 / 374:304 / 375:221) and both
 * hosts should not have to know it.
 *
 * The copy arrives as a prop. `@/data/report3-accelerators` is paid copy registered
 * in the premium-content-bundle test, so the server reads it and threads it down —
 * including the split of each gated passage into free, ramp and blurred parts, so
 * the browser never decides where the wall falls.
 *
 * THE PAYWALLED STATE — 314:211. Both cards keep two rows sharp and lock the rest
 * behind a badge. "Common challenges" keeps its first paragraph sharp (Mark moved the
 * paywall "right after the first paragraph", 2026-09-22).
 *
 * THE SLIMMED CHAPTER (1665:6717, 16.10; Sanjin's "Slimmed_Intro_Acc&Brakes"): the short
 * universal opening (1665:6728), then two sections, each a heading row that folds it away:
 *   "The <Archetype>" — the archetype's own part of the old opening, folded (1665:6729),
 *   over the two cards;
 *   "Common Challenges" — the first paragraph sharp, the rest folded, and for a locked
 *   reader, whose free copy ends there, the next paragraph fading out into "Unlock Full
 *   Chapter" straight after it (1665:6780) where the blurred passage and its card were.
 */

interface Props {
  view: Report3AcceleratorsView;
  /** The archetype on screen, for "The <Archetype>". */
  archetype: string;
  /** Opens the paywall — from the locked rows and the wall's sample. */
  onUnlock?: () => void;
}

const V4Accelerators: FC<Props> = ({ view, archetype, onUnlock }) => {
  const locked = view.lockedFrom !== null;
  const archetypeTitle = `The ${archetype}`;

  return (
    <>
      <div
        className={`rv4-ab${locked ? " is-locked" : ""}`}
        data-node-id={locked ? "314:219" : "310:229"}
        data-name="Chapter — Accelerators & Brakes"
      >
        {/* 1665:6728 — a 356px box in the 361 column. */}
        <div className="rv4-ab__intro">
          <V4Prose blocks={view.intro} />
        </div>

        <V4Section title={archetypeTitle} nodeId="1709:1500">
          {view.archetypeIntro.length ? (
            <V4Fold lines={7} label={archetypeTitle} nodeId="1665:6729">
              <V4Prose blocks={view.archetypeIntro} />
            </V4Fold>
          ) : null}

          {/* 311:410. Figma's line for Spark Seeker; of Sanjin's docs, only one has a lead. */}
          {view.brakesLead ? <p className="rv4-ab__lead">{view.brakesLead}</p> : null}
          <V4TriggerCard
            tone="brake"
            rows={view.brakes}
            lockedFrom={view.lockedFrom}
            onUnlock={onUnlock}
          />

          {/* 311:412 */}
          {view.acceleratorsLead ? <p className="rv4-ab__lead">{view.acceleratorsLead}</p> : null}
          <V4TriggerCard
            tone="accel"
            rows={view.accelerators}
            lockedFrom={view.lockedFrom}
            onUnlock={onUnlock}
          />

          {/* What some of Sanjin's docs set after the two lists. No frame draws it. */}
          {view.afterCards ? (
            <div className="rv4-ab__after">
              <V4Prose blocks={view.afterCards} />
            </div>
          ) : null}
        </V4Section>

        {/* 1665:6780 */}
        <V4Section title={view.challengesTitle}>
          <V4Passage
            gated={view.challenges}
            lead={1}
            lines={6}
            label={view.challengesTitle}
            onUnlock={onUnlock}
          />
        </V4Section>
      </div>

      <V4TryThis
        practice={view.practice}
        onUnlock={onUnlock}
        nodeIds={{ closed: "377:221", open: "374:304", gated: "375:221" }}
        teaserHeightPx={202}
        rampBandPx={89.6}
        openPaddingTopPx={8}
        premiumTopPx={205.5}
      />
    </>
  );
};

export default V4Accelerators;
