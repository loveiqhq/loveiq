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

  // Bucketing-stability contract. The arm is recomputed in THREE places (this
  // fn client-side, the checkout-session route server-side, and the
  // report_price_quote.forced_paywall_arm stamp) — all via the same cyrb53
  // hash. If a refactor changes the hash, every already-assigned token
  // silently re-buckets and the live A/B is invalidated retroactively.
  // These fixed token→arm mappings (captured 2026-05-31) make that breakage
  // a RED TEST. Do NOT just update them — a failure means the experiment
  // assignment changed and must be treated as a breaking change.
  it("pins fixed tokens to their arm (hash-stability contract)", () => {
    const PINNED: Record<string, "treatment" | "control"> = {
      rpt_aaa: "control",
      rpt_bbb: "control",
      rpt_ccc: "control",
      rpt_user_123: "treatment",
      abc123def456: "control",
      "token-with-dashes-001": "control",
      "9f8e7d6c5b4a": "treatment",
    };
    for (const [token, arm] of Object.entries(PINNED)) {
      expect(getForcedPaywallCohort(token)).toBe(arm);
    }
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
