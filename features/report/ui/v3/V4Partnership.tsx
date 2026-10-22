"use client";

import type { FC } from "react";
import type { Report3PartnershipView } from "@/data/report3-partnership";
import V4PartnershipLoop from "./V4PartnershipLoop";
import V4Passage from "./V4Passage";
import V4Prose from "./V4Prose";
import V4Section from "./V4Section";
import V4TryThis from "./V4TryThis";
import { guardedUnlock } from "./v4Unlock";

/**
 * "Challenges in Partnership" — the body of the chapter that opens Part V "How you
 * connect" (Figma 38:1679 inside the Part 5 page 334:829; paywalled 305:358),
 * followed by its "Try this & see what shifts" card.
 *
 * In 38:1679's own order, 16 apart: the prose (one text node in the frame, sixteen
 * blocks with the inline "Common challenges"), the Spark Seeker loop, a 44px rule,
 * the result paragraph and, since 25.09, another 44px rule before the practice card
 * (742:6653 / 742:6656). The practice card follows as the body's next sibling,
 * as 399:240 sits after 38:1672 in the Part 5 page, with this chapter's geometry.
 *
 * The copy arrives as a prop. `@/data/report3-partnership` is paid copy registered
 * in the premium-content-bundle test, so the server reads it and threads it down —
 * the wall's position included, so the browser never decides where it falls.
 *
 * THE PAYWALLED STATE — 305:350. The loop is blurred behind the brand lock, and the
 * result paragraph is blurred too; each blurred surface owns the click.
 *
 * THE SLIMMED CHAPTER (1665:6941, 16.10; Sanjin's "Slimmed_Intro_Challenges_in_partnership"):
 * the universal opening (1665:6952), then two sections, each a heading row that folds it
 * away (1711:1847, 1711:1861):
 *   "The <Archetype> Challenges" — the archetype's own paragraphs, six lines of them over
 *   "Show All" (1711:1857), and for a locked reader, at the end of the fold, the paragraph
 *   the wall falls in fading out into "Unlock Full Chapter", where the blurred passage and
 *   its card were;
 *   "Common Challenges" — the first paragraph sharp and the rest folded for a reader who
 *   has paid (1665:6953); locked for one who has not, its whole text past the wall.
 * The server cuts the body into the two and keeps the wall where each archetype's cuts put it.
 */

interface Props {
  view: Report3PartnershipView;
  /** The archetype on screen, for "The <Archetype> Challenges". */
  archetype: string;
  /** Opens the paywall — from the wall's sample, the locked section, the loop and the result. */
  onUnlock?: () => void;
}

const V4Partnership: FC<Props> = ({ view, archetype, onUnlock }) => {
  const { locked } = view;
  const archetypeTitle = `The ${archetype} Challenges`;

  return (
    <>
      <div
        className={`rv4-cip${locked ? " is-locked" : ""}`}
        data-node-id={locked ? "305:358" : "38:1679"}
        data-name="Chapter — Challenges in Partnership"
      >
        {/* 1665:6952 — a 356px text box in the 361 column. */}
        <div className="rv4-cip__text" data-node-id="1665:6951">
          <V4Prose blocks={view.intro} />
        </div>

        <V4Section title={archetypeTitle} nodeId="1711:1847">
          <V4Passage
            gated={view.archetypeBody}
            lines={6}
            label={archetypeTitle}
            onUnlock={onUnlock}
          />
        </V4Section>

        {view.challenges ? (
          <V4Section title={view.challengesTitle} nodeId="1711:1861">
            <V4Passage
              gated={view.challenges}
              lead={1}
              lines={6}
              label={view.challengesTitle}
              onUnlock={onUnlock}
            />
          </V4Section>
        ) : locked ? (
          <V4Section title={view.challengesTitle} nodeId="1711:1861" locked onUnlock={onUnlock} />
        ) : null}

        <V4PartnershipLoop stages={view.loop} locked={locked} onUnlock={onUnlock} />

        {/* 612:335 — 44px, 16 either side. */}
        <div className="rv4-sep" aria-hidden="true" data-node-id="612:335" />

        {/* 647:229 open / 659:234 blurred. The wrapper owns the click: the paragraph
         * is inert when locked, and a tap on inert content lands on its ancestor. */}
        <div
          className={`rv4-cip__closing${locked ? " is-blurred" : ""}`}
          data-node-id={locked ? "659:234" : "647:229"}
          onClick={locked ? guardedUnlock(onUnlock) : undefined}
        >
          <div
            className="rv4-cip__closing-text"
            aria-hidden={locked ? true : undefined}
            inert={locked}
          >
            {/* The result, then whatever the chapter's doc runs after it, Spark Seeker's
             * second example included (no frame draws that tail: it takes the result's
             * place and its blur). */}
            <V4Prose blocks={[view.result, ...(view.tail ?? [])]} />
          </div>
        </div>

        {/* 742:6653 / 742:6656 — 44px before "Try this" (Mark, 1941881246): the body's
         * 16 above it, its 20 below, as the frames set them. */}
        <div
          className="rv4-sep"
          aria-hidden="true"
          data-node-id={locked ? "742:6656" : "742:6653"}
        />
      </div>

      <V4TryThis
        practice={view.practice}
        onUnlock={onUnlock}
        nodeIds={{ closed: "399:219", open: "399:240", gated: "399:260" }}
        premiumTopPx={219.5}
      />
    </>
  );
};

export default V4Partnership;
