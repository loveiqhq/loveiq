import type { CSSProperties } from "react";
import { reportThemes } from "../reportTheme";

/**
 * The colours V4 draws an archetype in: the archetype card, its deck and meters, and the
 * archetype's name wherever V4 sets it (the card, the chapter titles, the Core Archetype and
 * Summary headings).
 *
 * Fatih, 03.10: every card takes "each archetype's own" colours, the report theme's (the
 * accent, and its contrast-safe ink for text and the meter's dark end: the palette the
 * archetype's top-three row and old card already use). Spark Seeker's card is the frame's
 * (15:815), and its colours are kept to the hex so it renders exactly as before.
 *
 * As the old report does, the accent tints and fills (the frame, the motivation panel, the
 * meter's light end) and the ink draws the strokes: several accents are too pale to draw a
 * glyph in (Quiet Withdrawer's #c7f3f1 is 1.2:1 on white).
 */
export interface V4ArchetypeColors {
  /** The meter's light end. The frame and the motivation panel are --report-accent-rgb. */
  accent: string;
  /** The meter's dark end. */
  deep: string;
  /** The glyphs, the deck's active dot and its focus ring. */
  glyph: string;
  /** The active meter label and the focused deck card's glow. */
  ink: string;
  /** The archetype's name. */
  nameInk: string;
}

const FRAME: Readonly<Record<string, V4ArchetypeColors>> = {
  "Spark Seeker": {
    accent: "#ff6a3d",
    deep: "#f97316",
    glyph: "#ff6a3d",
    ink: "#d5451c",
    nameInk: "#d63200",
  },
};

export function v4ArchetypeColors(archetype: string): V4ArchetypeColors {
  const frame = FRAME[archetype];
  if (frame) return frame;
  const theme = reportThemes[archetype];
  if (!theme) return FRAME["Spark Seeker"]!;
  const ink = theme.accentInk.toLowerCase();
  return { accent: theme.accent.toLowerCase(), deep: ink, glyph: ink, ink, nameInk: ink };
}

const rgbTriplet = (hex: string) =>
  [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)).join(" ");

/** The page-wide inks, as the custom properties the V4 rules read, for the report root. */
export function v4InkStyle(archetype: string): CSSProperties {
  const { ink, nameInk } = v4ArchetypeColors(archetype);
  return {
    "--rv3-name-ink": nameInk,
    "--rv3-accent-ink": ink,
    "--rv3-accent-ink-rgb": rgbTriplet(ink),
  } as CSSProperties;
}
