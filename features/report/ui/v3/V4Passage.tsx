"use client";

import type { FC } from "react";
import type { Report3Block } from "@/data/report3-learn-more";
import type { Report3GatedCopy } from "@features/report/server/gatedCopy";
import V4Fold from "./V4Fold";
import V4Prose from "./V4Prose";
import V4UnlockSample from "./V4UnlockSample";

/**
 * A passage of a slimmed chapter (16.10): its first `lead` paragraphs sharp, the rest of
 * its free copy folded under "Show All" (V4Fold), and, for a locked reader, the wall's
 * faded sample and "Unlock Full Chapter" (V4UnlockSample) at the end of it. A reader who
 * has paid gets every block as free copy, so the same passage folds the whole chapter for
 * them and never shows a wall.
 *
 * "Common challenges" keeps its first paragraph sharp in the slimmed frames, under its
 * first challenge's heading where it has one (1686:10616-10617, 1665:6780), and folds the
 * rest (1686:10619).
 *
 * The wall sits INSIDE the fold when there is free copy to fold: the paywalled frame draws
 * "Show All" over Typical Beliefs' challenges and nothing after it (1686:10619), so the
 * sample and its pill come after the free copy they close, one call to action at a time.
 * That fold is then where the page meets the chapter's paywall (`has-wall`): "paywall
 * reached" watches it, since the wall inside is clipped until opened.
 */

interface Props {
  gated: Report3GatedCopy;
  /** Paragraphs shown in full before the fold; a heading goes with the paragraph it heads. */
  lead?: number;
  /** The fold's peek, in lines (V4Fold). */
  lines?: number;
  /** The fold's subject, for the pill's accessible name. */
  label: string;
  /** Opens the paywall, from the wall's sample. */
  onUnlock?: () => void;
}

/** How many blocks run through the `lead`-th paragraph or list. */
const leadBlocks = (blocks: readonly Report3Block[], lead: number): number => {
  if (lead <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i]!.kind !== "heading") seen++;
    if (seen === lead) return i + 1;
  }
  return blocks.length;
};

const V4Passage: FC<Props> = ({ gated, lead = 0, lines, label, onUnlock }) => {
  const at = leadBlocks(gated.free, lead);
  const sharp = gated.free.slice(0, at);
  const folded = gated.free.slice(at);
  const wall = gated.ramp ? <V4UnlockSample sample={gated.ramp} onUnlock={onUnlock} /> : null;
  return (
    <>
      {sharp.length ? <V4Prose blocks={sharp} /> : null}
      {folded.length ? (
        <V4Fold lines={lines} label={label} holdsWall={wall !== null}>
          <V4Prose blocks={folded} />
          {wall}
        </V4Fold>
      ) : (
        wall
      )}
    </>
  );
};

export default V4Passage;
