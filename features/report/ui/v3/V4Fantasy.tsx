"use client";

import type { FC } from "react";
import type { Report3FantasyView } from "@/data/report3-fantasy";
import V4FantasyMap from "./V4FantasyMap";
import V4FantasyTable from "./V4FantasyTable";
import V4PremiumCard from "./V4PremiumCard";
import V4Prose from "./V4Prose";
import V4TryThis from "./V4TryThis";
import { guardedUnlock } from "./v4Unlock";

/**
 * "Fantasy vs. Reality" — the body of the chapter that closes Part VI (Figma 304:290
 * inside the Part VI page 334:1137; paywalled 305:217), followed by its "Try this &
 * see what shifts" card.
 *
 * In 304:290's own order, 44px apart: the intro (one text node, with a heading
 * inside), the map, the fantasy table, "Common challenges", and a last 44 before the
 * practice card, which follows as the body's next sibling, as 441:6168 sits after
 * 304:281 in the Part VI page. 304:290 sets the map flush under the intro, where the
 * separator it moved down used to stand, so that first 44 is ours; 305:217 leaves 16.
 *
 * The copy arrives as a prop. `@/data/report3-fantasy` is paid copy registered in
 * the premium-content-bundle test, so the server reads it and threads it down, the
 * wall included, so the browser never decides where it falls.
 *
 * THE PAYWALLED STATE — 305:217. The intro stays sharp; the map blurs its plot; the
 * table shows its locked rows; "Common challenges" sits under the full blur at full
 * length, as the server sends it (lockedBlurCopy.ts), with the chapter-body Premium
 * card on it. The frame's blurred block also repeats the practice, which has a gated
 * card of its own, so it is left out. The blurred copy owns the click, which is why
 * the card's CTA carries no handler.
 */

interface Props {
  view: Report3FantasyView;
  /** Opens the paywall — from the map's plot, the table's locks, the blurred copy and the practice. */
  onUnlock?: () => void;
}

const V4Fantasy: FC<Props> = ({ view, onUnlock }) => {
  const { locked } = view;

  return (
    <>
      <div
        className={`rv4-fvr${locked ? " is-locked" : ""}`}
        data-node-id="304:290"
        data-name="Chapter — Fantasy vs. Reality"
      >
        {/* 304:291 — a 356px text box in the 361 column. */}
        <div className="rv4-fvr__text" data-node-id="304:291">
          <V4Prose blocks={view.intro} />
        </div>

        <div className="rv4-sep" aria-hidden="true" />

        <V4FantasyMap dots={view.mapDots} locked={locked} onUnlock={onUnlock} />

        <div
          className="rv4-sep"
          aria-hidden="true"
          data-node-id={locked ? "696:6063" : "368:1925"}
        />

        <V4FantasyTable table={view.table} onUnlock={onUnlock} />

        <div className="rv4-sep" aria-hidden="true" data-node-id="368:5447" />

        {locked ? (
          /* 305:228 "Locked copy", its card 103.3 into it (305:250). */
          <div className="rv4-fvr__gate" data-node-id="305:228" onClick={guardedUnlock(onUnlock)}>
            <div className="rv4-fvr__blurred" aria-hidden="true" inert>
              <V4Prose blocks={view.challenges} />
            </div>
            <V4PremiumCard variant="guarantee" nodeId="305:250" />
          </div>
        ) : (
          <div className="rv4-fvr__text" data-node-id="368:1920">
            <V4Prose blocks={view.challenges} />
          </div>
        )}

        <div
          className="rv4-sep"
          aria-hidden="true"
          data-node-id={locked ? "696:6057" : "696:6060"}
        />
      </div>

      <V4TryThis
        practice={view.practice}
        onUnlock={onUnlock}
        nodeIds={{ closed: "441:6422", open: "441:6168", gated: "441:6188" }}
        rampBandPx={84.5}
        gatedPaddingTopPx={8}
        premiumTopPx={238}
      />
    </>
  );
};

export default V4Fantasy;
