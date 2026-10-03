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
 * Spark Seeker's copy updates these, and says so in its commit. 02.10: its headings and its
 * practices' title in the sync's heading case; mapped back to the old case, the views hash
 * as before. 03.10: its copy from Sanjin's docs (Common Challenges without subheadings, no
 * A&B lead lines, CiP's second example and finished practice sentence); a structural diff
 * of the eight views against the previous commit showed those changes and nothing else.
 * Then the belief-map H2 went from the lede (no doc has one): the old views minus that one
 * heading equal the new.
 */
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

const PINNED: Record<string, string> = {
  "typicalBeliefs:open": "8b929fff8d5d2860ac4bd4e2a949d835ded191f2a2fe47e65678d4d79374ea96",
  "typicalBeliefs:locked": "82b56e5ab6b95531d26a0e10281d2d19179728c29cea0dbc2ce24813d8463b12",
  "accelerators:open": "c3c009133b4eb26cd3d11dfe550c8ffb05926fa8f154fef83ba27eee7cf1c130",
  "accelerators:locked": "7becb3420063f7454d15222cbfb090790ffddb5c689e77a384a3c5c5d57f1c45",
  "partnership:open": "8bfc00eb582555e7d1d3552e159d446a3bc611292c7a1047a1d1899dbd243e3e",
  "partnership:locked": "1bce22c397122f9f5228345b8362341a866a9f404f108293554b7c234e433832",
  "fantasy:open": "75422df86ad437ae8446a0de69eea9d681b0badb531cf685d672b248e42a3f9c",
  "fantasy:locked": "9d35808a592a7025230aab7c2d1ab36645949915e0aef924966f36d94af84603",
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
