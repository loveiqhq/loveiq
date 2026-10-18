import { describe, expect, it } from "vitest";

import {
  REASON_COPY,
  UNLOCK_REASONS,
  isUnlockReason,
  keepKnownChips,
  rotateReasons,
} from "@features/unlock-feedback/logic/reasons";
import {
  SUBJECT_ARMS,
  drawSubjectArm,
  preheaderFor,
  subjectFor,
} from "@features/unlock-feedback/logic/subjects";
import {
  hashLinkToken,
  isLinkTokenShape,
  newLinkToken,
} from "@features/unlock-feedback/server/link";

/** A fixed sequence for the shuffle, so a test sees one known order. */
function seq(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe("unlock feedback reasons", () => {
  it("keeps the migration's nine codes, in the design's order", () => {
    expect(UNLOCK_REASONS).toEqual([
      "too_expensive",
      "low_value",
      "free_enough",
      "unclear_content",
      "result_off",
      "privacy",
      "checkout",
      "later",
      "other",
    ]);
    expect(isUnlockReason("later")).toBe(true);
    expect(isUnlockReason("LATER")).toBe(false);
    expect(isUnlockReason(undefined)).toBe(false);
  });

  it("rotates the first eight and keeps Something else last", () => {
    for (const random of [seq([0]), seq([0.999]), seq([0.5, 0.1, 0.9, 0.3]), Math.random]) {
      const order = rotateReasons(random);
      expect(order).toHaveLength(9);
      expect(order[8]).toBe("other");
      expect([...order].sort()).toEqual([...UNLOCK_REASONS].sort());
    }
    expect(rotateReasons(seq([0]))).not.toEqual(UNLOCK_REASONS);
  });

  it("keeps only the chips the reason offers, once each", () => {
    expect(
      keepKnownChips("too_expensive", ["A little less", "A little less", "Hacked", 3, null])
    ).toEqual(["A little less"]);
    expect(keepKnownChips("other", ["A little less"])).toEqual([]);
  });

  it("has no em dash in any copy", () => {
    const all = UNLOCK_REASONS.flatMap((r) => {
      const c = REASON_COPY[r];
      return [c.email, c.landing, c.short, c.question, c.placeholder, ...c.chips];
    });
    for (const text of all) expect(text).not.toMatch(/[—–]/);
  });
});

describe("unlock feedback subjects", () => {
  it("names the archetype only in arm D", () => {
    for (const arm of SUBJECT_ARMS) {
      expect(subjectFor(arm, "The Spiritual Lover").includes("The Spiritual Lover")).toBe(
        arm === "D"
      );
    }
    expect(preheaderFor("B")).not.toBe(preheaderFor("A"));
    expect(preheaderFor("C")).toBe(preheaderFor("A"));
  });

  it("draws every arm and never past the last", () => {
    expect(drawSubjectArm(() => 0)).toBe("A");
    expect(drawSubjectArm(() => 0.999999)).toBe("D");
    expect(drawSubjectArm(() => 0.25)).toBe("B");
  });
});

describe("unlock feedback link token", () => {
  it("is 43 base64url characters, and only its hash is kept", () => {
    const a = newLinkToken();
    const b = newLinkToken();
    expect(isLinkTokenShape(a.token)).toBe(true);
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashLinkToken(a.token)).toBe(a.hash);
    expect(a.hash).not.toContain(a.token);
  });

  it("refuses anything else before a lookup", () => {
    for (const bad of ["", "short", `${"a".repeat(43)}=`, "a".repeat(44), 42, null]) {
      expect(isLinkTokenShape(bad)).toBe(false);
    }
  });
});
