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
 * Spark Seeker's copy updates these, and says so in its commit.
 */
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

const PINNED: Record<string, string> = {
  "typicalBeliefs:open": "d7fd54c14a672fdee6ccfa1d3109feeaa763e2341106e225bc260610e14f7c73",
  "typicalBeliefs:locked": "f3c4bb44efefeaf30d1228350560cabc39bd0bf68b72d7069d523d5bf25091ba",
  "accelerators:open": "1d603d83c0eac8d031319009a52e0a4765560a972abceb55e5b2065dd30f5fae",
  "accelerators:locked": "ceacdba194267427b80272eac8d4dbf3a5738cb26f02a879529cd51a956bb80c",
  "partnership:open": "f47d1013da1a2e1b1516f1c48b894ed646841ac8fb63d979a40c2924c8cb7d71",
  "partnership:locked": "d2b2cf92309eae677b5a90da3690d7126e675a245d933c263f73b2702b90a964",
  "fantasy:open": "8c4224f5758ba8cfc2d9087953ff5e21de50c088ca62e2d283ac695ec89fe078",
  "fantasy:locked": "fd19418fa28ea134ed300ad011222d861fe76d68af7d117364c866ca3abb130f",
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
