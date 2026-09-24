"use client";

import type { FC } from "react";
import type { Report3AcceleratorsView } from "@/data/report3-accelerators";
import V4PremiumCard from "./V4PremiumCard";
import V4Prose from "./V4Prose";
import V4TriggerCard from "./V4TriggerCard";
import V4TryThis from "./V4TryThis";
import { guardedUnlock } from "./v4Unlock";

/**
 * "Chapter — Accelerator & Brakes" — the body of the chapter that opens Part IV
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
 * behind a badge. "Common challenges" keeps its H2 and first paragraph sharp (Mark
 * moved the paywall "right after the first paragraph", 2026-09-22); the next
 * paragraph ramps in over two lines and everything after stays under the full blur,
 * with the chapter-body copy of the Premium card floating 84px in. That band owns
 * the click, which is why the card's own CTA carries no handler.
 */

interface Props {
  view: Report3AcceleratorsView;
  /** Opens the paywall — from the locked rows, the gated prose and its card. */
  onUnlock?: () => void;
}

const V4Accelerators: FC<Props> = ({ view, onUnlock }) => {
  const locked = view.lockedFrom !== null;
  const { free, ramp, rest } = view.challenges;

  return (
    <>
      <div
        className={`rv4-ab${locked ? " is-locked" : ""}`}
        data-node-id={locked ? "314:219" : "310:229"}
        data-name="Chapter — Accelerator & Brakes"
      >
        {/* 310:230 — a 356px box in the 361 column. */}
        <div className="rv4-ab__intro">
          <V4Prose blocks={view.intro} />
        </div>

        {/* 311:410 */}
        <p className="rv4-ab__lead">{view.brakesLead}</p>
        <V4TriggerCard
          tone="brake"
          rows={view.brakes}
          lockedFrom={view.lockedFrom}
          onUnlock={onUnlock}
        />

        {/* 311:412 */}
        <p className="rv4-ab__lead">{view.acceleratorsLead}</p>
        <V4TriggerCard
          tone="accel"
          rows={view.accelerators}
          lockedFrom={view.lockedFrom}
          onUnlock={onUnlock}
        />

        {/* 312:211 open / 314:307 paywalled */}
        <section className="rv4-ab__challenges" data-node-id={locked ? "314:307" : "312:211"}>
          <h3 className="rv4-ab__h2">{view.challengesTitle}</h3>
          <V4Prose blocks={free} />
          {ramp ? (
            <div className="rv4-ab__gate" onClick={guardedUnlock(onUnlock)}>
              <div className="rv4-ab__gated" aria-hidden="true" inert>
                {/* 482:6455 — the blur fades in over the ramp's first two lines. */}
                <div className="rv4-ab__ramp">
                  <V4Prose blocks={[ramp]} />
                  <span className="rv4-pblur" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                </div>
                {/* 314:284 */}
                <div className="rv4-ab__blurred">
                  <V4Prose blocks={rest} />
                </div>
              </div>
              {/* 314:309 — the chapter-body copy of the card, as the frame draws it. */}
              <V4PremiumCard variant="guarantee" nodeId="314:309" />
            </div>
          ) : null}
        </section>
      </div>

      <V4TryThis
        practice={view.practice}
        onUnlock={onUnlock}
        nodeIds={{ closed: "377:221", open: "374:304", gated: "375:221" }}
        teaserHeightPx={224}
        rampBandPx={89.6}
        openPaddingTopPx={8}
        premiumTopPx={155}
      />
    </>
  );
};

export default V4Accelerators;
