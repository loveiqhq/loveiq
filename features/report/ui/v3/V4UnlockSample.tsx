"use client";

import { useRef, type FC } from "react";
import { useCtaSeen } from "@features/analytics/useCtaSeen";
import type { Report3Block } from "@/data/report3-learn-more";
import V4Prose from "./V4Prose";
import { guardedUnlock } from "./v4Unlock";

/**
 * The slimmed report's wall (16.10; Figma 1665:6780, and "Unlock Full Chapter" in Mark's
 * prototype KhQYPL14…). Where a locked reader's free copy ends, a few lines of the next
 * paragraph fade out to white and a pill offers the rest, in place of the blurred passage
 * and the card that floated on it. Mark's PostHog review (13.10): "Long blurred elements
 * make people drop … Collapse all blurred elements after a few lines."
 *
 * The sample is the ramp's real head only (toSample on the server): what the fade lets
 * through is always the copy itself, never a decoy. The band owns the click, so a tap on
 * the faded lines opens the paywall too, and the pill carries no handler of its own (the
 * premium card's rule: two would open the pricing modal twice). The pill is the chapter's
 * paywall: its `cta_seen` and the chapter's "paywall seen" are a locked chapter's, and
 * `.rv4-unlock` is what "paywall reached" waits for.
 */

interface Props {
  /** The ramp's head, which the page fades out. */
  sample: Report3Block;
  onUnlock?: () => void;
}

const V4UnlockSample: FC<Props> = ({ sample, onUnlock }) => {
  const ref = useRef<HTMLButtonElement>(null);
  useCtaSeen(ref, "locked_chapter");
  return (
    <div className="rv4-unlock" data-node-id="1665:6780" onClick={guardedUnlock(onUnlock)}>
      <div className="rv4-unlock__sample" aria-hidden="true" inert>
        <V4Prose blocks={[sample]} />
        <span className="rv4-unlock__fade" />
      </div>
      <button ref={ref} type="button" className="rv4-unlock__pill">
        <span className="rv4-unlock__pill-label">Unlock Full Chapter</span>
      </button>
    </div>
  );
};

export default V4UnlockSample;
