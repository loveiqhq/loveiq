/**
 * The mapping that makes a probe run match the session it is verifying.
 *
 * Before this existed, `runProbe` passed one session-derived variable and only
 * one of fourteen gate probes read it — while every Slack verdict claimed the
 * result was measured "at the size this reader had".
 */
import { devices } from "playwright";
import { describe, expect, it } from "vitest";

// @ts-expect-error -- .mjs helper, no types
import { devicesForSession, FAMILIES } from "../../scripts/lib/session-devices.mjs";

const pick = (v: unknown) => devicesForSession(v) as string | null;

describe("devicesForSession", () => {
  it("names only devices Playwright actually knows", () => {
    // A name the registry has dropped would reach a probe as `devices[name]`
    // === undefined, and the context would be silently wrong rather than loud.
    const seen = new Set<string>();
    for (const os of ["iOS", "Android", "Mac OS X", "Windows", "", undefined]) {
      for (let w = 200; w <= 2000; w += 7) {
        const out = pick({ min: w, max: w, os });
        if (out) out.split(",").forEach((d) => seen.add(d));
      }
    }
    expect(seen.size).toBeGreaterThan(3);
    for (const name of seen) {
      expect(devices[name], `${name} is not a Playwright device`).toBeTruthy();
    }
  });

  it("keeps every candidate name in step with Playwright's registry", () => {
    // The guard in `nearest()` SKIPS a name the registry does not know, which is
    // the safe answer and a silent one: a typo would quietly shrink the family
    // to whatever was left, and the probe would run on the wrong phone with
    // nothing to show for it. This is the assertion that actually fails on one.
    const all = Object.values(FAMILIES as Record<string, string[]>).flat();
    expect(all.length).toBeGreaterThan(5);
    for (const name of all) {
      expect(
        devices[name],
        `${name} is listed here but Playwright has no such device`
      ).toBeTruthy();
    }
  });

  it("picks an iPhone for iOS and an Android handset otherwise", () => {
    expect(pick({ min: 393, max: 393, os: "iOS" })).toBe("iPhone 15 Pro");
    expect(pick({ min: 320, max: 320, os: "iOS" })).toBe("iPhone SE");
    expect(pick({ min: 412, max: 412, os: "Android" })).toBe("Pixel 7");
  });

  it("covers both ends when the screen changed mid-session", () => {
    // A Galaxy Z Flip moved 262px -> 715px inside one recording, which is why
    // sessionViewport reports min and max instead of an average.
    const out = pick({ min: 262, max: 715, os: "Android" })!;
    expect(out.split(",").length).toBe(2);
  });

  it("collapses to one device when the session never resized", () => {
    expect(pick({ min: 393, max: 393, os: "iOS" })!.split(",").length).toBe(1);
  });

  it("returns null rather than guessing when the viewport is unusable", () => {
    // The caller must then leave the probe on its own defaults. A guess here
    // would be indistinguishable from a measurement.
    expect(pick(null)).toBeNull();
    expect(pick({ min: 0, max: 0, os: "iOS" })).toBeNull();
    expect(pick({ min: NaN, max: NaN, os: "iOS" })).toBeNull();
    expect(pick({ min: 99999, max: 99999, os: "iOS" })).toBeNull();
  });

  it("treats a wide viewport as a desktop whatever the OS says", () => {
    expect(pick({ min: 1440, max: 1440, os: "Mac OS X" })).toBe("Desktop Chrome");
    expect(pick({ min: 1440, max: 1440, os: "Android" })).toBe("Desktop Chrome");
  });

  it("chooses the nearest width, not merely a member of the family", () => {
    // 330 is closer to the iPhone SE's 320 than to the 15 Pro's 393.
    expect(pick({ min: 330, max: 330, os: "iOS" })).toBe("iPhone SE");
    expect(pick({ min: 380, max: 380, os: "iOS" })).toBe("iPhone 15 Pro");
  });
});
