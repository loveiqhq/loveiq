"use client";

import Image from "next/image";
import type { FC } from "react";

/**
 * "Unlock Report" — the tile that sits on a locked visual. The team's call (Figma
 * comments, 2026-09-22): the lock sits only on top of VISUALS, never over blurred
 * prose.
 *
 * Mark, 29.09 (1945259495): "We have updated the Unlock Report icons that sit on the
 * visuals." The 48px gradient disc (441:5956) became 979:507: an 88x88 white tile, a
 * 38px disc in the brand gradient with the frame's 17px lock, and "Unlock Report" under
 * it in grey — Marcus's version (1944665216: "'full' is not needed … a grey font is less
 * noisy"). The fantasy table's categories take a compact 73x70 one (979:588 / 979:600 /
 * 979:612) with a 28px disc and the 14px lock. The glyphs are the frame's own SVGs.
 *
 * WITHOUT a click handler of its own, on purpose: the lock group around it owns the
 * click, so a tap anywhere on the blurred rows opens the paywall, and the tile's own
 * click (Enter and Space included) simply bubbles to it. A handler here as well would
 * open the pricing modal twice — the bug PremiumOverlay.tsx records at 214-221 and
 * V4PremiumCard avoids the same way. Its name is the words it shows.
 */

/** 441:5957 — the 22px padlock, white strokes at 1.83. A locked chapter's disc. */
export const V4Padlock: FC = () => (
  <svg viewBox="0 0 22 22" fill="none" aria-hidden="true">
    <rect
      x="2.75"
      y="10.083"
      width="16.5"
      height="10.083"
      rx="1.833"
      stroke="currentColor"
      strokeWidth="1.833"
    />
    <path
      d="M6.417 10.083V6.417a4.583 4.583 0 0 1 9.166 0v3.666"
      stroke="currentColor"
      strokeWidth="1.833"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const TILES = {
  tile: { node: "979:507", lock: "/report/v3/locks/lock-17.svg", px: 17 },
  compact: { node: "979:588", lock: "/report/v3/locks/lock-14.svg", px: 14 },
} as const;

interface Props {
  /** `compact` is the fantasy table's 73x70; every other visual takes the 88x88. */
  size?: keyof typeof TILES;
}

const V4LockBadge: FC<Props> = ({ size = "tile" }) => {
  const tile = TILES[size];
  return (
    <button
      type="button"
      className={`rv4-lockbadge${size === "compact" ? " rv4-lockbadge--compact" : ""}`}
      data-node-id={tile.node}
    >
      <span className="rv4-lockbadge__disc" aria-hidden="true">
        <Image src={tile.lock} alt="" width={tile.px} height={tile.px} unoptimized />
      </span>
      <span className="rv4-lockbadge__label">Unlock Report</span>
    </button>
  );
};

export default V4LockBadge;
