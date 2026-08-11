// "What this means for you" — the SUMMARY section Figma places DIRECTLY under
// the Hero. In the Part I container (`8427:800`) the child order is
// HERO `8427:801` → SUMMARY `8719:8865` → SNAPSHOT `8719:8871`, so this sits
// between the archetype card and "Your snapshot".
//
// This copy is NOT in Mark's copy matrix: it is absent from `report2-copy.ts`,
// from the handoff `sections-schema.json`, and from `copy-matrix.csv` (grep for
// "Not a verdict" / "never only physical" returns nothing anywhere in the repo
// or the handoff). It is therefore captured here verbatim from the verified
// Figma frame, one entry per archetype — the same approach `report2-snapshot-
// cards.ts` uses for the snapshot micro-copy.
//
// Archetypes without a verified entry render NO section at all rather than
// fabricated or third-person legacy copy. Voice check: these paragraphs are
// SECOND person ("For you, sex is never only physical…"), unlike the pre-2.0
// `data/report-summary.ts` which is third person ("Experiences sexuality
// primarily as a space for…") — they are not interchangeable.
import type { Report2CopySlug } from "./report2-config";

export interface MeansForYou {
  /** Opening paragraph. `bold` renders as <strong> between `before` and `after`. */
  lead: { before: string; bold: string; after: string };
  /** Further body paragraphs, in order. */
  body: string[];
  /** Accent-coloured closing line. */
  closing: string;
}

export const meansForYou: Partial<Record<Report2CopySlug, MeansForYou>> = {
  // Spiritual Lover — verified verbatim from Figma node 8719:8865.
  "spiritual-lover": {
    lead: {
      before: "For you, sex is never only physical. It's a language for ",
      bold: "closeness, meaning, and being fully seen",
      after:
        ". Desire builds through emotional safety and real presence, not pressure or performance, and once the connection feels true, your body opens completely.",
    },
    body: [
      "At your best you create intimacy that is both sacred and deeply human, the kind most people only catch in glimpses. That same depth is why routine, distance, or a conflict left unrepaired can quietly close you down faster than you would expect.",
      "Your full report maps what opens you, what shuts you off, the one pattern that most often gets in your way, and the rare strength that sets you apart.",
    ],
    closing: "Not a verdict. A mirror, and a map for where your intimacy goes next.",
  },
};
