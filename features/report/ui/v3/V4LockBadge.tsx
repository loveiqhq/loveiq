"use client";

import type { FC } from "react";

/**
 * "Lock / Gradient Brand" — Figma 441:5956 on the coral panel, 441:6129 on the
 * green one. The team's call (Figma comments, 2026-09-22): the lock sits only on
 * top of VISUALS, never over blurred prose, and it is the branded gradient one.
 *
 * WITHOUT a click handler of its own, on purpose: the lock group around it owns
 * the click, so a tap anywhere on the blurred rows opens the paywall, and the
 * badge's own click (Enter and Space included) simply bubbles to it. A handler
 * here as well would open the pricing modal twice — the bug PremiumOverlay.tsx
 * records at 214-221 and V4PremiumCard avoids the same way.
 */

/** 441:5957 — the 22px padlock, white strokes at 1.83. Also a locked chapter's disc. */
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

const V4LockBadge: FC = () => (
  <button type="button" className="rv4-lockbadge" aria-label="Unlock the full report">
    <V4Padlock />
  </button>
);

export default V4LockBadge;
