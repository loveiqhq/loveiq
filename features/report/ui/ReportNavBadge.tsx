"use client";

import type { FC } from "react";

/**
 * Per-chapter access badge in the report nav (Figma locked page, Aside
 * `8993:19278`).
 *
 * Three states, and every nav item always carries exactly one:
 * - `free`     — an open chapter (Part I). White `FREE` chip.
 * - `locked`   — a gated chapter the reader has not bought. Closed padlock.
 * - `unlocked` — a gated chapter the reader's plan HAS opened. Open padlock.
 *
 * The `unlocked` state is why this is a three-way and not a boolean: a reader
 * who buys the report should see the padlocks on Parts II–IV spring open rather
 * than have every badge silently vanish, which is what the earlier
 * "hide badges when nothing is locked" behaviour did.
 *
 * The lock is drawn as an inline SVG (not the 🔒 emoji it used to be) so it
 * inherits `currentColor` and renders identically across platforms — the emoji
 * picked up Segoe UI Emoji's colour glyph on Windows and a flat one elsewhere.
 */
export type ReportNavAccess = "free" | "locked" | "unlocked";

/** Shackle + body. `open` swings the shackle up and to the right. */
const PadlockIcon: FC<{ open: boolean }> = ({ open }) => (
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

  const locked = access === "locked";
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
