import { describe, expect, it } from "vitest";
import {
  BARRIER_BASE,
  BARRIER_SHARE,
  barrierCodeFor,
  barrierStatFor,
  shareAsOneIn,
  type BarrierCode,
} from "@/data/report2-barriers";

/**
 * Every distinct `OVL_BARRIER_TAGS` value in the 1,636 scored submissions that
 * answered, as of 2026-08-26, with its reader count. Kept verbatim — including
 * the curly-apostrophe and reworded duplicates — because the point of this
 * fixture is that the stored tags are raw answer TEXT with no stable code, so a
 * reworded option silently creates a new one. A tag this map cannot place would
 * quietly drop that reader's column.
 */
const OBSERVED_TAGS: Array<[string, number, BarrierCode]> = [
  ["I'm not sure what would actually help", 388, "unsure"],
  ["Nothing major is in the way right now", 357, "none"],
  ["Shame, self-judgment, or inner pressure", 357, "shame"],
  ["The person I'm with isn't on the same page or willing to engage", 257, "partner"],
  ["Something else", 253, "other"],
  ["I don't have enough time or energy", 200, "capacity"],
  ["It doesn't feel emotionally safe enough yet", 169, "safety"],
  ["I struggle to keep going with things over time", 147, "consistency"],
  ["Physical pain or body issues", 139, "body"],
  ["I’m not sure what would actually help", 105, "unsure"],
  ["Useful support feels too expensive or hard to access", 86, "access"],
  ["I don’t have enough time or energy", 75, "capacity"],
  ["Shame, pressure, or self-judgment get in the way", 51, "shame"],
  ["It doesn’t feel emotionally safe yet", 39, "safety"],
  ["Someone I’m involved with isn’t aligned or engaged", 37, "partner"],
  ["I struggle to stay consistent over time", 30, "consistency"],
  ["My partner isn’t aligned or engaged", 24, "partner"],
  ["Physical pain or body-related issues", 21, "body"],
  ["Support feels too expensive or hard to access", 13, "access"],
];

describe("barrier normalisation", () => {
  it("places every tag seen in production", () => {
    for (const [tag, , expected] of OBSERVED_TAGS) {
      expect(barrierCodeFor(tag), `unmapped tag: ${tag}`).toBe(expected);
    }
  });

  it("folds curly apostrophes onto their straight twins", () => {
    // The single largest source of duplicate tags, and invisible in review.
    expect(barrierCodeFor("I’m not sure what would actually help")).toBe(
      barrierCodeFor("I'm not sure what would actually help")
    );
    expect(barrierCodeFor("I don’t have enough time or energy")).toBe(
      barrierCodeFor("I don't have enough time or energy")
    );
  });

  it("returns null for a tag it does not know, rather than guessing", () => {
    // A reworded option must fail loudly here, not land in the wrong bucket.
    expect(barrierCodeFor("Some barrier nobody has written yet")).toBeNull();
  });
});

describe("barrier share table", () => {
  it("matches the counts it was derived from", () => {
    // Guards the table against drifting from the fixture above without anyone
    // re-running the query.
    const byCode = new Map<BarrierCode, number>();
    for (const [, readers, code] of OBSERVED_TAGS) {
      byCode.set(code, (byCode.get(code) ?? 0) + readers);
    }
    for (const [code, readers] of byCode) {
      const expected = Number(((readers / BARRIER_BASE) * 100).toFixed(1));
      expect(BARRIER_SHARE[code], `${code} share`).toBeCloseTo(expected, 1);
    }
  });

  it("renders a share as a whole number of people", () => {
    expect(shareAsOneIn(30.1)).toBe("1 in 3");
    expect(shareAsOneIn(24.9)).toBe("1 in 4");
    expect(shareAsOneIn(6.1)).toBe("1 in 16");
    // Never "1 in 1", which would read as everyone.
    expect(shareAsOneIn(95)).toBe("1 in 2");
  });
});

describe("the column for one reader", () => {
  it("shows the most common of the barriers they named", () => {
    // The line's job is to say they are not alone in it, so the rarest would
    // say the opposite.
    const stat = barrierStatFor([
      "Physical pain or body issues",
      "Shame, self-judgment, or inner pressure",
    ]);
    expect(stat).toEqual({ stat: "1 in 4", caption: "Shame and self-judgment, like you" });
  });

  it("ignores 'Something else', which nobody can be compared on", () => {
    expect(barrierStatFor(["Something else"])).toBeNull();
    expect(barrierStatFor(["Something else", "Physical pain or body issues"])?.caption).toBe(
      "Physical pain or body issues, like you"
    );
  });

  it("gives 'nothing major' its own line rather than nothing", () => {
    expect(barrierStatFor(["Nothing major is in the way right now"])).toEqual({
      stat: "1 in 5",
      caption: "Say nothing major is in the way, like you",
    });
  });

  it("prefers a real barrier over 'nothing major' when both were ticked", () => {
    expect(
      barrierStatFor(["Nothing major is in the way right now", "Physical pain or body issues"])
        ?.caption
    ).toBe("Physical pain or body issues, like you");
  });

  it("falls back to null with no usable answer, so the matrix copy can show", () => {
    expect(barrierStatFor(null)).toBeNull();
    expect(barrierStatFor([])).toBeNull();
    expect(barrierStatFor(["Some barrier nobody has written yet"])).toBeNull();
  });
});
