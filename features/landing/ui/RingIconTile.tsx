import type { FC, ReactNode } from "react";
import { RING_ICON_INK, RING_ICON_STROKE, RING_ICON_STYLE } from "./ringIcon";

/**
 * A ring icon tile (the design system's IconTile; Mark's ring icons, 30.10): a 44px rounded
 * square, the brand gradient only as its 2px ring, the glyph in ink. The four glyphs are the
 * video page's "What you'll find out" ones (white/WDiscover.tsx, copied so that page stays
 * byte for byte as it is); the design system names them flame, thermometer, message and rings.
 */
export type RingIconName = "flame" | "thermometer" | "message" | "rings";

const GLYPHS: Record<RingIconName, ReactNode> = {
  flame: (
    <path d="M11 2.75c.611 2.444 1.833 4.431 3.667 5.958C16.5 10.236 17.417 11.917 17.417 13.75a6.417 6.417 0 1 1-12.834 0c0-.992.322-1.957.917-2.75a2.292 2.292 0 0 0 4.583 0c0-1.833-1.375-2.75-1.375-4.583 0-1.223.764-2.445 2.292-3.667Z" />
  ),
  thermometer: (
    <path d="M12.833 13.328V3.667a1.833 1.833 0 1 0-3.666 0v9.661a4.125 4.125 0 1 0 3.666 0Z" />
  ),
  message: (
    <path d="M2.829 16.05a1.375 1.375 0 0 0-.086-1.07 9.167 9.167 0 1 1 4.379 4.326 1.375 1.375 0 0 0-1.008-.085l-3.128.915a.688.688 0 0 1-.851-.87l.694-3.216Z" />
  ),
  rings: (
    <>
      <path d="M8.25 14.667a6.417 6.417 0 1 0 0-12.834 6.417 6.417 0 0 0 0 12.834Z" />
      <path d="M13.75 20.167a6.417 6.417 0 1 0 0-12.834 6.417 6.417 0 0 0 0 12.834Z" />
    </>
  ),
};

const RingIconTile: FC<{ icon: RingIconName }> = ({ icon }) => (
  <span
    data-ring-icon={icon}
    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px]"
    style={RING_ICON_STYLE}
  >
    <svg
      aria-hidden
      className="h-[22px] w-[22px]"
      viewBox="0 0 22 22"
      fill="none"
      stroke={RING_ICON_INK}
      strokeWidth={RING_ICON_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {GLYPHS[icon]}
    </svg>
  </span>
);

export default RingIconTile;
