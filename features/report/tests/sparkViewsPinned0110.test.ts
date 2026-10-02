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
 * as before.
 */
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

const PINNED: Record<string, string> = {
  "typicalBeliefs:open": "91cf58bcb34309f909a59293da883b6bc76162984048093ef802d8b3663d9485",
  "typicalBeliefs:locked": "13ad30fc9b7f8afeb07a85b8c002537077dfde10512e4fbe43f5c0155c668bfa",
  "accelerators:open": "862e127fd4953ca7f719d96396dadf52b9552b8d2319ee8bc2dae77f957aabd9",
  "accelerators:locked": "cf84dcf5e778eb3084c1ba74a1315ff9cea3eff06aa6573eafbf55e6f90cd920",
  "partnership:open": "5825c3105cd0d1f2350151cb964078f98d112959795a4564cbf9af7555ae4459",
  "partnership:locked": "5e63acff129e2b84b45847b740ff8e58fb44fac44d62a19ba37a987a7824a32d",
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
