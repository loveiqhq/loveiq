"use client";

import type { FC } from "react";

/**
 * Per-chapter access badge in the report nav (Figma locked page, Aside
 * `8993:19278`).
 *
 * Three states:
 * - `free`     — an open chapter (Part I). White `FREE` chip.
 * - `locked`   — a gated chapter the reader has not bought. Closed padlock.
 * - `unlocked` — a gated chapter the reader's plan HAS opened. Renders NOTHING.
 *
 * `unlocked` used to draw an open padlock, on the reasoning that a buyer should
 * see the locks spring open rather than have the badges vanish. In practice a
 * closed and an open padlock at 14px are hard to tell apart, so the open one
 * read as "still locked" — worse than no mark at all. A chapter with nothing
 * beside it is unambiguously yours.
 *
 * The lock is drawn as an inline SVG (not the 🔒 emoji it used to be) so it
 * inherits `currentColor` and renders identically across platforms — the emoji
 * picked up Segoe UI Emoji's colour glyph on Windows and a flat one elsewhere.
 */
export type ReportNavAccess = "free" | "locked" | "unlocked";

/**
 * Shackle + body. `open` swings the shackle up and to the right.
 *
 * Exported so the Insight Map rows can mark a withheld chapter with the same
 * glyph rather than introducing a second padlock drawing.
 */
export const PadlockIcon: FC<{ open: boolean }> = ({ open }) => (
  <svg viewBox="0 0 14 14" width="14" height="14" fill="none" aria-hidden="true" focusable="false">
    <path
      d={open ? "M4.6 6.2V4.3a2.4 2.4 0 0 1 4.8 0" : "M4.6 6.2V4.3a2.4 2.4 0 0 1 4.8 0v1.9"}
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
    <rect
      x="2.9"
      y="6.2"
      width="8.2"
      height="5.5"
      rx="1.4"
      stroke="currentColor"
      strokeWidth="1.3"
    />
  </svg>
);

const ReportNavBadge: FC<{ access: ReportNavAccess }> = ({ access }) => {
  if (access === "free") {
    return <span className="report-nav-badge report-nav-badge--free">Free</span>;
  }

  // Nothing to say once it is unlocked.
  if (access === "unlocked") return null;

  const locked = true;
  return (
    <span
      className={`report-nav-badge report-nav-badge--${locked ? "locked" : "unlocked"}`}
      title={locked ? "Locked chapter" : "Unlocked"}
    >
      <span className="sr-only">{locked ? "Locked chapter" : "Unlocked chapter"}</span>
      <PadlockIcon open={!locked} />
    </span>
  );
};

export default ReportNavBadge;
