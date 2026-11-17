"use client";

import Image from "next/image";
import type { FC } from "react";
import { INITIAL_UNLOCK_PRICE_CENTS } from "@features/report/logic/initialUnlockGate";
import { REPORT_MAP_COPY } from "@features/survey/surveySheetsCopy";
import { euros } from "./gate/gateContent";
import { useIsV4 } from "./v3/V3Chapter";

/**
 * Per-chapter access badge in the report nav (Figma locked page, Aside
 * `8993:19278`).
 *
 * Three states:
 * - `free`     — a chapter open in full to this reader. White `IN FULL` chip (`FREE` until
 *   27.10, Eman: nothing in the report is sold as free once the EUR 1.99 gate follows the map).
 * - `locked`   — a gated chapter the reader has not bought. Closed padlock.
 * - `unlocked` — a gated chapter the reader's plan HAS opened. Renders NOTHING,
 *   except in Report V4 (below).
 *
 * `unlocked` used to draw an open padlock, on the reasoning that a buyer should
 * see the locks spring open rather than have the badges vanish. In practice a
 * closed and an open padlock at 14px are hard to tell apart, so the open one
 * read as "still locked" — worse than no mark at all. A chapter with nothing
 * beside it is unambiguously yours.
 *
 * Report V4 draws it again, on the brand ramp, which is what tells it from the grey
 * closed one: Mark's finalised nav (961:333, 29.09) "introduced the unlocked icons
 * with brand colors", the three tiers the team agreed on 28.09. It is the frame's own
 * asset (I961:333;865:243), drawn as an image so its gradient's id can never collide
 * with another badge's on the page. V2 and V3 still draw nothing.
 *
 * The lock is drawn as an inline SVG (not the 🔒 emoji it used to be) so it
 * inherits `currentColor` and renders identically across platforms — the emoji
 * picked up Segoe UI Emoji's colour glyph on Windows and a flat one elsewhere.
 * 961:333's closed padlock is this same drawing in the same grey.
 *
 * Two more, only while the tour runs before Mark's new EUR 1.99 page (Mark, 13 Nov: the menu
 * must name the offer as the survey's report map does, logic/lightReportMap.ts):
 * - `free_pill`  — the Core Archetype, which that page shows for free: the map's green Free.
 * - `price_pill` — a Light Report chapter: the map's violet chip with the EUR 1.99 price.
 */
export type ReportNavAccess = "free" | "locked" | "unlocked" | "free_pill" | "price_pill";

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
  const isV4 = useIsV4();

  if (access === "free") {
    return <span className="report-nav-badge report-nav-badge--free">In full</span>;
  }

  if (access === "free_pill") {
    return (
      <span className="report-nav-badge report-nav-badge--free-pill">{REPORT_MAP_COPY.free}</span>
    );
  }

  if (access === "price_pill") {
    return (
      <span className="report-nav-badge report-nav-badge--price-pill">
        {euros(INITIAL_UNLOCK_PRICE_CENTS)}
      </span>
    );
  }

  if (access === "unlocked") {
    // Nothing to say once it is unlocked, outside V4.
    if (!isV4) return null;
    return (
      <span className="report-nav-badge report-nav-badge--unlocked" title="Unlocked">
        <span className="sr-only">Unlocked chapter</span>
        <Image src="/report/v3/nav/badge-unlocked.svg" alt="" width={14} height={14} unoptimized />
      </span>
    );
  }

  return (
    <span className="report-nav-badge report-nav-badge--locked" title="Locked chapter">
      <span className="sr-only">Locked chapter</span>
      <PadlockIcon open={false} />
    </span>
  );
};

export default ReportNavBadge;
