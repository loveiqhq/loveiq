import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildAccelerators } from "@/data/report3-accelerators";
import { buildFantasy } from "@/data/report3-fantasy";
import { buildPartnership } from "@/data/report3-partnership";
import { buildTypicalBeliefs } from "@/data/report3-typical-beliefs";

/**
 * The other 13 archetypes' V4 copy (Sanjin's docs, 01.10) moves the four chapters' Spark-only
 * constants (Typical Beliefs' prose, every chapter's paywall cuts and ramp anchors) into
 * per-archetype records. Spark Seeker is hand-set from Figma and must come out of that
 * byte-identical, so its built views, open and locked, are pinned here as hashes: the paid
 * copy itself is not repeated in a test (the repo is public). An intentional change to
 * Spark Seeker's copy updates these, and says so in its commit. 02.10: its headings in the
 * sync's heading case, mapped back to the old case the views hash as before.
 */
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

const PINNED: Record<string, string> = {
  "typicalBeliefs:open": "fef4e095123334745aff5aa389a0201c0a6b5548684806d28d83b06c9080ac3c",
  "typicalBeliefs:locked": "3b19507fb42a6b4439c4920cbe2d32e4e5a3485234eeee9c78c9d37cb210d97b",
  "accelerators:open": "b876495aa1d7e19ffe9ab2112f21fc7afae66787815fa62e7bd76fefbd68164b",
  "accelerators:locked": "a8c6d94c9c34022036938bc140528726f11bad076779bdc2c18b00268ccbb930",
  "partnership:open": "d63b13af6c10e584cb960a91f390b552f6c75f958c6377c7a8fd4f5dd8f1b7e4",
  "partnership:locked": "d71125358863c9c1a296801f0e7e4527f5a5a03df5a89ba9ea3fe4a704d0cc70",
  "fantasy:open": "675b368746103295f5e1c9e246c701569726e37f2e17a268b65ee6ab8556ae7a",
  "fantasy:locked": "12a6db8ead12fb1bb2e8abeb5cd8f2b883b2db1b710afa868d19cbeab23bf46d",
};

const BUILDERS = {
  typicalBeliefs: buildTypicalBeliefs,
  accelerators: buildAccelerators,
  partnership: buildPartnership,
  fantasy: buildFantasy,
} as const;

describe("Spark Seeker's V4 chapters, pinned through the per-archetype refactor", () => {
  for (const [chapter, build] of Object.entries(BUILDERS)) {
    for (const locked of [false, true]) {
      const key = `${chapter}:${locked ? "locked" : "open"}`;
      it(`builds ${key} exactly as before`, () => {
        expect(digest(build("Spark Seeker", { locked }))).toBe(PINNED[key]);
      });
    }
  }
});
