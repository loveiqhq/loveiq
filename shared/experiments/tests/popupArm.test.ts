import { afterEach, describe, expect, it, vi } from "vitest";
import { assignPopupArm, resolvePopupArmOverride } from "@shared/experiments/popupArm";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("assignPopupArm", () => {
  it("gives a submission the same arm every time", () => {
    for (const id of [1, 1838, 2063, 999_999]) {
      expect(assignPopupArm(id)).toBe(assignPopupArm(id));
    }
  });

  it("puts a reader with no submission in neither arm", () => {
    expect(assignPopupArm(null)).toBeNull();
    expect(assignPopupArm(undefined)).toBeNull();
    expect(assignPopupArm(0)).toBeNull();
  });

  it("splits consecutive submission ids about 50/50", () => {
    // Submission ids are sequential, so this is the input the split really gets.
    const N = 4000;
    let noPopup = 0;
    for (let id = 2000; id < 2000 + N; id += 1) {
      if (assignPopupArm(id) === "no_popup") noPopup += 1;
    }
    expect(noPopup / N).toBeGreaterThan(0.47);
    expect(noPopup / N).toBeLessThan(0.53);
  });

  it("does not follow odd and even ids", () => {
    // A split by parity would put every other finished survey in one arm, and any
    // process that writes two rows per survey would then fill one arm alone.
    let sameAsParity = 0;
    const N = 4000;
    for (let id = 1; id <= N; id += 1) {
      if ((assignPopupArm(id) === "no_popup") === (id % 2 === 0)) sameAsParity += 1;
    }
    expect(sameAsParity / N).toBeGreaterThan(0.45);
    expect(sameAsParity / N).toBeLessThan(0.55);
  });
});

describe("resolvePopupArmOverride", () => {
  it("shows either arm on demand off production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://staging.loveiq.org");
    expect(resolvePopupArmOverride("on")).toBe("popup");
    expect(resolvePopupArmOverride("off")).toBe("no_popup");
    expect(resolvePopupArmOverride("bogus")).toBeNull();
    expect(resolvePopupArmOverride(null)).toBeNull();
  });

  it("is ignored on production, where only the bucket decides", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.loveiq.org");
    expect(resolvePopupArmOverride("on")).toBeNull();
    expect(resolvePopupArmOverride("off")).toBeNull();
  });
});
