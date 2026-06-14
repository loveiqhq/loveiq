import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getForcedPaywallCohort,
  resolveDevCohortOverride,
  resolveReportPaywallCohort,
} from "@shared/experiments/forcedPaywall";

describe("getForcedPaywallCohort", () => {
  it("returns treatment (100% forced) for any identifiable report token", () => {
    // The 50/50 A/B was concluded in favour of the forced experience, so every
    // identifiable report now gets the non-closable paywall.
    expect(getForcedPaywallCohort("rpt_xyz")).toBe("treatment");
    expect(getForcedPaywallCohort("rpt_aaa")).toBe("treatment");
    expect(getForcedPaywallCohort("rpt_user_123")).toBe("treatment");
    expect(getForcedPaywallCohort("token-with-dashes-001")).toBe("treatment");
  });

  it("returns control for a missing token (we never force what we can't bucket)", () => {
    expect(getForcedPaywallCohort(null)).toBe("control");
    expect(getForcedPaywallCohort(undefined)).toBe("control");
    expect(getForcedPaywallCohort("")).toBe("control");
  });
});

describe("resolveReportPaywallCohort", () => {
  const TOKEN = "rpt_user_123";

  it("softens to control for an email-return visit (re-engagement must never trap)", () => {
    expect(getForcedPaywallCohort(TOKEN)).toBe("treatment");
    expect(resolveReportPaywallCohort({ devArm: null, fromEmail: true, token: TOKEN })).toBe(
      "control"
    );
  });

  it("forces treatment for any non-email visit with a token", () => {
    expect(resolveReportPaywallCohort({ devArm: null, fromEmail: false, token: TOKEN })).toBe(
      "treatment"
    );
    expect(resolveReportPaywallCohort({ devArm: null, fromEmail: false, token: "rpt_aaa" })).toBe(
      "treatment"
    );
  });

  it("lets the dev override win over both email and bucketing", () => {
    expect(
      resolveReportPaywallCohort({ devArm: "treatment", fromEmail: true, token: "rpt_aaa" })
    ).toBe("treatment");
    expect(resolveReportPaywallCohort({ devArm: "control", fromEmail: false, token: TOKEN })).toBe(
      "control"
    );
  });

  it("falls back to control for a missing token on a non-email visit", () => {
    expect(resolveReportPaywallCohort({ devArm: null, fromEmail: false, token: null })).toBe(
      "control"
    );
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
