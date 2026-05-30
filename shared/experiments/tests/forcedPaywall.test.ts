import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getForcedPaywallCohort,
  resolveDevCohortOverride,
} from "@shared/experiments/forcedPaywall";

describe("getForcedPaywallCohort", () => {
  it("is deterministic per token (couples wizard + report on the same arm)", () => {
    expect(getForcedPaywallCohort("rpt_xyz")).toBe(getForcedPaywallCohort("rpt_xyz"));
  });

  it("returns control for a missing token", () => {
    expect(getForcedPaywallCohort(null)).toBe("control");
    expect(getForcedPaywallCohort(undefined)).toBe("control");
    expect(getForcedPaywallCohort("")).toBe("control");
  });

  it("reaches both arms across many tokens (~50/50)", () => {
    let treatment = 0;
    const N = 1000;
    for (let i = 0; i < N; i++) {
      if (getForcedPaywallCohort(`rpt_${i}`) === "treatment") treatment++;
    }
    expect(treatment).toBeGreaterThan(N * 0.4);
    expect(treatment).toBeLessThan(N * 0.6);
  });
});

describe("resolveDevCohortOverride", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns null outside development regardless of the param (prod-safe)", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(resolveDevCohortOverride("treatment")).toBeNull();
    expect(resolveDevCohortOverride("control")).toBeNull();
  });

  it("honours arm=treatment|control only in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(resolveDevCohortOverride("treatment")).toBe("treatment");
    expect(resolveDevCohortOverride("control")).toBe("control");
    expect(resolveDevCohortOverride("bogus")).toBeNull();
    expect(resolveDevCohortOverride(null)).toBeNull();
    expect(resolveDevCohortOverride(undefined)).toBeNull();
  });
});
