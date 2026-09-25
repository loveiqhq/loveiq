"use client";

import type { FC } from "react";
import type { Report3PartnershipView } from "@/data/report3-partnership";
import V4PartnershipLoop from "./V4PartnershipLoop";
import V4PremiumCard from "./V4PremiumCard";
import V4Prose from "./V4Prose";
import V4TryThis from "./V4TryThis";
import { guardedUnlock } from "./v4Unlock";

/**
 * "Challenges in Partnership" — the body of the chapter that opens Part V "How you
 * connect" (Figma 38:1679 inside the Part 5 page 334:829; paywalled 305:358),
 * followed by its "Try this & see what shifts" card.
 *
 * In 38:1679's own order, 16 apart: the prose (one text node in the frame, sixteen
 * blocks with the inline "Common challenges"), the Spark Seeker loop, a 44px rule,
 * and the result paragraph. The practice card follows as the body's next sibling,
 * as 399:240 sits after 38:1672 in the Part 5 page, with this chapter's geometry.
 *
 * The copy arrives as a prop. `@/data/report3-partnership` is paid copy registered
 * in the premium-content-bundle test, so the server reads it and threads it down —
 * the wall's position included, so the browser never decides where it falls.
 *
 * THE PAYWALLED STATE — 305:350. Paragraphs 1-4 stay sharp; paragraph 5 ramps in
 * over the blur's ~105px and everything after sits under the full blur at full
 * length, with the chapter-body Premium card 282px in. The loop is blurred behind
 * the brand lock, and the result paragraph is blurred too. Each blurred surface
 * owns the click, which is why the card's own CTA carries no handler.
 */

interface Props {
  view: Report3PartnershipView;
  /** Opens the paywall — from the gated prose, its card, the loop and the result. */
  onUnlock?: () => void;
}

const V4Partnership: FC<Props> = ({ view, onUnlock }) => {
  const { locked } = view;
  const { free, ramp, rest } = view.body;

  return (
    <>
      <div
        className={`rv4-cip${locked ? " is-locked" : ""}`}
        data-node-id={locked ? "305:358" : "38:1679"}
        data-name="Chapter — Challenges in Partnership"
      >
        {/* 38:1681 — a 356px text box in the 361 column. */}
        <div className="rv4-cip__text" data-node-id={locked ? "305:359" : "38:1681"}>
          <V4Prose blocks={free} />
          {ramp ? (
            /* 305:462 "Paywall sample". The band owns the click. */
            <div className="rv4-cip__gate" onClick={guardedUnlock(onUnlock)}>
              <div className="rv4-cip__gated" aria-hidden="true" inert>
                <div className="rv4-cip__ramp">
                  <V4Prose blocks={[ramp]} />
                  <span className="rv4-pblur" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                </div>
                <div className="rv4-cip__blurred">
                  <V4Prose blocks={rest} />
                </div>
              </div>
              <V4PremiumCard variant="guarantee" nodeId="305:362" />
            </div>
          ) : null}
        </div>

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
            <V4Prose blocks={[view.result]} />
          </div>
        </div>
      </div>

      <V4TryThis
        practice={view.practice}
        onUnlock={onUnlock}
        nodeIds={{ closed: "399:219", open: "399:240", gated: "399:260" }}
        teaserHeightPx={240}
        premiumTopPx={147.5}
      />
    </>
  );
};

export default V4Partnership;
