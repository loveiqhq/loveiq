import type { CSSProperties } from "react";

/**
 * Mark's ring icons (pay-to-start Landing V2, final 30.10; Slack: "we changed the icons and
 * would need to change the icons also on the other landing pages"). Marcus asked at the 30.10
 * sync that section icons not wear the buttons' colours: the brand gradient stays only as a 2px
 * ring around a soft tint, and the glyph or number inside is ink. One style for the home page's
 * "In 15 minutes" tiles and the pay-to-start pages' tiles and steps.
 */
export const RING_ICON_STYLE: CSSProperties = {
  boxSizing: "border-box",
  border: "2px solid transparent",
  background:
    "linear-gradient(#fcf9ff, #fcf9ff) padding-box, linear-gradient(135deg, #fe6839 0%, #bf66d9 50%, #958ef6 100%) border-box",
};

/** The glyph's or number's ink inside a ring, and the glyphs' stroke. */
export const RING_ICON_INK = "#3a2a55";
export const RING_ICON_STROKE = 1.7;
