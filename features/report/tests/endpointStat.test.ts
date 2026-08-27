import { describe, expect, it } from "vitest";

import { DIMENSION_QIDS, ENDPOINT_AVERAGE, endpointStatFor } from "@/data/report2-endpoint-stat";
import { dimensions } from "@/data/scoring-config";

/**
 * The endpoint stat makes a numeric claim about the reader in the Snapshot, so the
 * things worth testing are the ones that would make it QUIETLY wrong: a qid list
 * that drifts from the scoring config, a denominator that counts dimensions the
 * reader never answered, and the guard that stops it comparing a part-filled
 * response against an average taken over full ones.
 */

/** Build an answer map: every dimension answered with `fill`, then overrides. */
function answers(fill: number, overrides: Record<string, number> = {}) {
  const out: Record<string, number> = {};
  for (const qid of DIMENSION_QIDS) out[qid] = fill;
  return { ...out, ...overrides };
}

describe("the dimension qid list", () => {
  it("matches the scoring config exactly", () => {
    // If a dimension is added, removed or re-pointed in scoring-config.ts and this
    // list is not updated, the stat silently measures the wrong set.
    const fromConfig = dimensions.map((d) => d.qid).sort();
    expect([...DIMENSION_QIDS].sort()).toEqual(fromConfig);
  });

  it("has no duplicates", () => {
    expect(new Set(DIMENSION_QIDS).size).toBe(DIMENSION_QIDS.length);
  });
});

describe("endpointStatFor", () => {
  it("counts both ends of the scale, not just the top", () => {
    const r = endpointStatFor(answers(4, { "01005": 7, "02002": 1, "02003": 1 }));
    expect(r?.stat).toBe(`3 of ${DIMENSION_QIDS.length}`);
  });

  it("counts nothing when every answer is mid-scale", () => {
    expect(endpointStatFor(answers(4))?.stat).toBe(`0 of ${DIMENSION_QIDS.length}`);
  });

  it("counts everything when every answer is an endpoint", () => {
    const n = DIMENSION_QIDS.length;
    expect(endpointStatFor(answers(7))?.stat).toBe(`${n} of ${n}`);
  });

  it("excludes unanswered dimensions from the denominator", () => {
    // This is the DIM_RISK_PREF case: its question is single-choice, so it never
    // carries a 1-7 value and cannot be an endpoint. Counting it in the denominator
    // would understate every reader.
    const partial = answers(4, { "01005": 7 });
    delete (partial as Record<string, number>)["03010"];
    const r = endpointStatFor(partial);
    expect(r?.stat).toBe(`1 of ${DIMENSION_QIDS.length - 1}`);
  });

  it("ignores values outside the 1-7 scale rather than guessing", () => {
    const bad = answers(4, { "01005": 0, "02002": 8, "02003": Number.NaN });
    const r = endpointStatFor(bad);
    expect(r?.stat).toBe(`0 of ${DIMENSION_QIDS.length - 3}`);
  });

  it("returns null when too few dimensions are on file to compare honestly", () => {
    const few: Record<string, number> = {};
    for (const qid of DIMENSION_QIDS.slice(0, 14)) few[qid] = 7;
    expect(endpointStatFor(few)).toBeNull();
  });

  it("returns null for absent answers", () => {
    expect(endpointStatFor(null)).toBeNull();
    expect(endpointStatFor(undefined)).toBeNull();
    expect(endpointStatFor({})).toBeNull();
  });

  it("says which side of the average the reader sits, and never both", () => {
    const rounded = Math.round(ENDPOINT_AVERAGE);
    const high = endpointStatFor(answers(7))!;
    const low = endpointStatFor(answers(4))!;
    expect(high.caption).toContain(`do on ${rounded}`);
    expect(high.caption).not.toContain("nearer the middle");
    expect(low.caption).toContain("nearer the middle");
  });

  it("never claims more endpoints than dimensions measured", () => {
    for (const fill of [1, 2, 3, 4, 5, 6, 7]) {
      const r = endpointStatFor(answers(fill))!;
      const [count, total] = r.stat.split(" of ").map(Number);
      expect(count!).toBeLessThanOrEqual(total!);
    }
  });
});
