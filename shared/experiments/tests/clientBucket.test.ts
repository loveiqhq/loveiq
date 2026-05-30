import { describe, expect, it } from "vitest";
import { pickClientVariant } from "@shared/experiments/clientBucket";

describe("pickClientVariant", () => {
  it("is deterministic for the same key + experiment", () => {
    const a = pickClientVariant("rpt_abc", "exp");
    const b = pickClientVariant("rpt_abc", "exp");
    expect(a).toBe(b);
    expect(["a", "b"]).toContain(a);
  });

  it("normalizes case + whitespace", () => {
    expect(pickClientVariant("RPT_AbC", "exp")).toBe(pickClientVariant("  rpt_abc  ", "exp"));
  });

  it("returns control ('b') for empty/missing keys (never randomly forces)", () => {
    expect(pickClientVariant("", "exp")).toBe("b");
    expect(pickClientVariant(null, "exp")).toBe("b");
    expect(pickClientVariant(undefined, "exp")).toBe("b");
    expect(pickClientVariant("   ", "exp")).toBe("b");
  });

  it("can split the same key across experiments", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      seen.add(pickClientVariant("rpt_split", `exp-${i}`));
      if (seen.size === 2) break;
    }
    expect(seen.size).toBe(2);
  });

  it("approximates a 50/50 split across many keys", () => {
    let aCount = 0;
    const N = 1000;
    for (let i = 0; i < N; i++) {
      if (pickClientVariant(`rpt_${i}`, "test") === "a") aCount++;
    }
    expect(aCount).toBeGreaterThan(N * 0.4);
    expect(aCount).toBeLessThan(N * 0.6);
  });
});
