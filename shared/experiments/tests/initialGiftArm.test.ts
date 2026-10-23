import { describe, expect, it } from "vitest";
import { assignInitialGiftArm, INITIAL_GIFT_EXPERIMENT } from "@shared/experiments/initialGiftArm";

/** E07's holdout (Pre-unlock): 80% of the readers still unpaid on day 4 get the gift. */
describe("assignInitialGiftArm", () => {
  it("gifts 80% of reports and holds 20% out, within 2 points over 10,000", () => {
    let gifted = 0;
    for (let id = 1; id <= 10_000; id++) {
      if (assignInitialGiftArm(id) === "gift") gifted++;
    }
    expect(gifted / 10_000).toBeGreaterThanOrEqual(0.78);
    expect(gifted / 10_000).toBeLessThanOrEqual(0.82);
  });

  it("keeps every report on the arm it was first given", () => {
    // Pinned from the first run: a change to the hash or the salt would move readers
    // between arms in the middle of the test.
    const heldOut = Array.from({ length: 30 }, (_, i) => i + 1).filter(
      (id) => assignInitialGiftArm(id) === "holdout"
    );
    expect(heldOut).toEqual([2, 3, 19, 20, 29]);
  });

  it("is salted for this test alone", () => {
    expect(INITIAL_GIFT_EXPERIMENT).toBe("initial_gift_2026_10");
  });
});
