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
 * heading equal the new. 05.10: Fantasy vs. Reality's "Common challenges" comes as free,
 * ramp and rest (Sanjin: open through its first sentence); flattened back into one list,
 * both views hash as before. 06.10: Accelerators & Brakes' intro drops the two doubled
 * spaces it copied from the frame; with them put back, both its views hash as before.
 * 16.10, the slimmed report: Typical Beliefs, Accelerators & Brakes and Challenges in
 * Partnerships are cut into sections (the example and framework, the lede, the archetype's
 * part of A&B's intro and of CiP's body each moved to a field of its own, CiP's "Common
 * Challenges" split off at its inline heading), the two shared openings are Sanjin's
 * slimmed ones, and a locked view sends its wall's sample only (toSample), CiP's "Common
 * Challenges" not at all. Applied to the previous views, that mapping gives the new six
 * key for key; Fantasy vs. Reality's two hash as before. Then the locked CiP view lost its
 * tail (the second example), which the slimmed page no longer draws past the blurred
 * result: the previous locked view less `tail` equals the new one.
 */
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

const PINNED: Record<string, string> = {
  "typicalBeliefs:open": "700a72451cd108f38a4e4ce9aae3153c4cca29002028b13a0a3e16407cc9f200",
  "typicalBeliefs:locked": "1bdc8433758ae5f3da437b92f82cd8b1c42d4ef246ec18f7a49c112abda55fe9",
  "accelerators:open": "3d26fdb63fd22af1620004c59b17a16329407087dbb8b8f1d23f1262b71ba1a2",
  "accelerators:locked": "9ffee0cb4de548ef49268a0dbe5ec0ed958b2dfeab20544fb60413dc25b233c6",
  "partnership:open": "e2a111545ca4695ca47ffe51bea333b23a26440261dd4b797b13f86fc1396df9",
  "partnership:locked": "fc332bba45e6f581cc4f44a608c4dc53ea914a5dbf1197b4a285aa28e67a0166",
  "fantasy:open": "905067e47374273b57d651b472432a8c18f74851e3e35dea20b1e8537b7afb6c",
  "fantasy:locked": "9c33a4ba206e387ddcf1fdf2f49012673f17d687debb9efdc78285c97fc9f19e",
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
