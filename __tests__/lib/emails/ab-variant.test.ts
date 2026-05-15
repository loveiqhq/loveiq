import { describe, expect, it } from "vitest";
import { pickEmailVariant, pickFromVariants } from "@shared/emails/ab-variant";

describe("pickEmailVariant", () => {
  it("returns the same variant for the same key + experiment", () => {
    const a = pickEmailVariant("user@example.com", "purchase-full_report");
    const b = pickEmailVariant("user@example.com", "purchase-full_report");
    expect(a).toBe(b);
    expect(["a", "b"]).toContain(a);
  });

  it("normalizes key (case + whitespace) so variants are stable", () => {
    const a = pickEmailVariant("User@Example.com", "x");
    const b = pickEmailVariant("  user@example.com  ", "x");
    expect(a).toBe(b);
  });

  it("can split the same user across experiments", () => {
    // It is possible (but not guaranteed) that two experiments give different
    // variants for the same key. Verify the function honors the experiment
    // salt by spot-checking a key that is known to differ.
    const variantsByExperiment = new Set<string>();
    for (let i = 0; i < 50; i++) {
      variantsByExperiment.add(pickEmailVariant("split@example.com", `exp-${i}`));
      if (variantsByExperiment.size === 2) break;
    }
    expect(variantsByExperiment.size).toBe(2);
  });

  it("approximates a 50/50 split across many keys", () => {
    let aCount = 0;
    let bCount = 0;
    const N = 1000;
    for (let i = 0; i < N; i++) {
      const variant = pickEmailVariant(`user${i}@example.com`, "test");
      if (variant === "a") aCount++;
      else bCount++;
    }
    // Expect roughly 50/50 — allow ±10% tolerance to keep the test stable.
    expect(aCount).toBeGreaterThan(N * 0.4);
    expect(bCount).toBeGreaterThan(N * 0.4);
  });
});

describe("pickFromVariants", () => {
  const ABC = ["a", "b", "c"] as const;

  it("returns the same variant for the same key + experiment", () => {
    const a = pickFromVariants("user@example.com", "report-share", ABC);
    const b = pickFromVariants("user@example.com", "report-share", ABC);
    expect(a).toBe(b);
    expect(ABC).toContain(a);
  });

  it("normalizes case + whitespace", () => {
    const a = pickFromVariants("User@Example.com", "x", ABC);
    const b = pickFromVariants("  user@example.com  ", "x", ABC);
    expect(a).toBe(b);
  });

  it("returns the only entry when given a single-variant list", () => {
    expect(pickFromVariants("anyone", "exp", ["only"] as const)).toBe("only");
  });

  it("throws when variants is empty", () => {
    expect(() => pickFromVariants("k", "e", [])).toThrow();
  });

  it("approximates a 1/3 split across many keys", () => {
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    const N = 3000;
    for (let i = 0; i < N; i++) {
      const variant = pickFromVariants(`user${i}@example.com`, "report-share", ABC);
      counts[variant]++;
    }
    // Expect ~33% each — allow ±8% tolerance.
    expect(counts.a).toBeGreaterThan(N * 0.25);
    expect(counts.b).toBeGreaterThan(N * 0.25);
    expect(counts.c).toBeGreaterThan(N * 0.25);
  });
});
