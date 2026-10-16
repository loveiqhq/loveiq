import { getPricingBucketsForPlan } from "@features/pricing/logic/reportPricing";
import { describe, expect, it } from "vitest";

import {
  activeArms,
  armColor,
  armLabel,
  AXIS_TITLES,
  isKnownArm,
  type ExperimentAxis,
} from "@features/attribution/server/labels";

describe("arm labels", () => {
  it("names every arm we actively assign, in plain English", () => {
    // Marketing's own convention (2026-08-27), so "V2" in a meeting and
    // "Landing Page V2" in Slack are unambiguously the same arm, and the
    // parenthetical says which is which without the reader knowing dates.
    // Round 3: V2 itself (white_card) against V3, the presenter video in the hero.
    expect(armLabel("landing", "white_card").long).toBe("Landing Page V2: survey in the hero");
    expect(armLabel("landing", "white_card").short).toBe("Landing Page V2 (Survey in Hero)");
    expect(armLabel("landing", "white_video").long).toBe("Landing Page V3: video in the hero");
    expect(armLabel("landing", "white_video").short).toBe("Landing Page V3 (Video in Hero)");
    // `white` is V2 before round 3, named apart so it never pools with white_card.
    expect(armLabel("landing", "white").long).toBe(
      "Landing Page V2: survey in the hero, before the V3 test"
    );
    expect(armLabel("landing", "white").short).toBe("Landing Page V2 (Survey in Hero, before V3)");
    expect(armLabel("landing", "white_prev").long).toBe("Landing Page V1: the first design");
    expect(armLabel("landing", "white_prev").short).toBe("Landing Page V1 (First Design)");
    // The retired dark arm must not compete for "the first one" — see labels.ts.
    expect(armLabel("landing", "control").short).not.toMatch(/\bV1\b(?! *\))/);
    expect(armLabel("landing", "control").short.toLowerCase()).not.toContain("first");
    // "homepage" is not the term the team uses; every landing label says so.
    for (const arm of ["white_card", "white_video", "white", "white_prev", "control"]) {
      expect(armLabel("landing", arm).short.toLowerCase()).not.toContain("homepage");
      expect(armLabel("landing", arm).long.toLowerCase()).not.toContain("homepage");
    }
    expect(armLabel("survey", "dark").long).toBe("Survey questions: dark");
    expect(armLabel("survey", "white").long).toBe("Survey questions: white");
    // The 2.x arms stay direction-free: their labels once claimed A was the lower arm,
    // which pricing 2.1 inverted on 2026-08-24 without anything failing.
    expect(armLabel("pricing", "A").long).toBe("Pricing: group A");
    expect(armLabel("pricing", "B").long).toBe("Pricing: group B");
    for (const arm of ["A", "B"] as const) {
      for (const field of ["short", "long"] as const) {
        expect(armLabel("pricing", arm)[field]).not.toMatch(/lower|higher/i);
      }
    }
    // Pricing 3.0's two lists are named by what the reader pays (founder, 2026-10-06), and
    // what made the old labels lie is checked instead of banned: each label must agree with
    // the price lists themselves, for both plans, so swapping the prices fails here.
    expect(armLabel("pricing", "A3").long).toBe("Pricing 3.0: higher prices");
    expect(armLabel("pricing", "B3").long).toBe("Pricing 3.0: lower prices");
    for (const plan of ["full_report", "all_reports"] as const) {
      const cents = (code: string) =>
        getPricingBucketsForPlan(plan).find((b) => b.code === code)!.startingCents;
      const higher = cents("A3") > cents("B3") ? "A3" : "B3";
      const lower = higher === "A3" ? "B3" : "A3";
      expect(armLabel("pricing", higher).short, plan).toMatch(/higher/);
      expect(armLabel("pricing", lower).short, plan).toMatch(/lower/);
    }
    expect(armLabel("paywall", "treatment").long).toBe("Paywall: forced — had to pay to read on");
    expect(armLabel("paywall", "control").long).toBe("Paywall: dismissible — could close it");
  });

  it("never uses the raw arm code in a label", () => {
    // The whole point: a non-technical reader must not meet "white_prev".
    for (const axis of ["landing", "survey", "pricing", "paywall"] as ExperimentAxis[]) {
      for (const arm of [
        "white",
        "white_prev",
        "white_card",
        "white_video",
        "control",
        "dark",
        "A",
        "B",
        "A3",
        "B3",
        "treatment",
      ]) {
        const label = armLabel(axis, arm);
        if (label.short === "Unknown") continue;
        for (const code of ["white_prev", "white_card", "white_video"]) {
          expect(label.long).not.toContain(code);
          expect(label.short).not.toContain(code);
        }
      }
    }
  });

  it("keeps the retired landing arm truthfully labelled rather than hidden", () => {
    // ~5% of stored submissions still carry it, so it needs its own honest name —
    // and it must NOT be conflated with V1, the round-2 arm it predates.
    const retired = armLabel("landing", "control");
    expect(retired.retired).toBe(true);
    expect(retired.long).toBe("Landing page: the original dark design, before V1");
    expect(retired.long).not.toBe(armLabel("landing", "white_prev").long);
  });

  it("marks the retired pricing bucket C so legacy quotes read honestly", () => {
    expect(armLabel("pricing", "C").retired).toBe(true);
  });

  it("reports an absent or unrecognised arm as not recorded, never a guess", () => {
    for (const value of [null, undefined, "", "nonsense", "WHITE"]) {
      expect(armLabel("landing", value).long).toBe("not recorded");
      expect(armLabel("landing", value).short).toBe("Not recorded");
    }
  });

  it("excludes retired arms from the active set used for charts", () => {
    // Round 3 assigns white_card and white_video. V1 retired 2026-09-19, and `white`
    // (V2 before round 3) is no longer assigned to anyone.
    expect(activeArms("landing")).toEqual(["white_card", "white_video"]);
    expect(armLabel("landing", "white").retired).toBe(true);
    expect(isKnownArm("landing", "white")).toBe(true);
    expect(armLabel("landing", "white_prev").retired).toBe(true);
    // …but still KNOWN, so the ~180 stored submissions that carry it keep a
    // plain-English label instead of reading as "Not recorded".
    expect(isKnownArm("landing", "white_prev")).toBe(true);
    expect(armLabel("landing", "white_prev").short).toBe("Landing Page V1 (First Design)");
    // Pricing 3.0 stamps every new quote A3 or B3. A (dropped 2026-08-31) and B (the
    // 2.x list 3.0 replaced) are retired but still KNOWN, for the rows bought under them.
    expect(activeArms("pricing")).toEqual(["A3", "B3"]);
    for (const arm of ["A", "B"]) {
      expect(armLabel("pricing", arm).retired).toBe(true);
      expect(isKnownArm("pricing", arm)).toBe(true);
    }
    // Dark is retired (the theme test concluded 2026-08-25 in favour of white), so
    // it must not read as an arm we still assign.
    expect(activeArms("survey")).toEqual(["white"]);
    expect(armLabel("survey", "dark").retired).toBe(true);
    // …but it is still KNOWN, so historical rows keep a plain-English label.
    expect(isKnownArm("survey", "dark")).toBe(true);
    expect(armLabel("survey", "dark").short).toBe("Dark survey");
  });

  it("recognises retired arms as known, so they are labelled not dropped", () => {
    expect(isKnownArm("landing", "control")).toBe(true);
    expect(isKnownArm("pricing", "C")).toBe(true);
    expect(isKnownArm("landing", "nope")).toBe(false);
    expect(isKnownArm("landing", null)).toBe(false);
  });

  /**
   * An arm value is a RAW string off `utm_tracker`, which `readStampedArms`
   * deliberately does not allowlist and the survey route stores verbatim when no
   * arm cookie is present. So a visitor can put `constructor` — or any other
   * `Object.prototype` member — in the arm slot.
   *
   * `LABELS[axis]` is an object literal, so it inherits those members, and `??`
   * does not catch them: they are functions, not nullish. That made `armLabel`
   * return `Object.prototype.constructor` with an `undefined` `short`, and
   * `isKnownArm` answer TRUE for a value nobody ever assigned — which matters
   * twice over, because `isKnownArm` is the whitelist that decides which arms
   * reach the conversion digest and the axis trends.
   */
  it("treats Object.prototype members as unknown arms, not as real ones", () => {
    for (const poisoned of ["constructor", "__proto__", "toString", "valueOf", "hasOwnProperty"]) {
      expect(armLabel("landing", poisoned)).toEqual({
        short: "Not recorded",
        long: "not recorded",
        // Stays an exhaustive toEqual, not a toMatchObject: the point of this
        // assertion is that a poisoned key returns the UNKNOWN object and nothing
        // else, so a new field has to be added here deliberately.
        color: "#64748b",
      });
      expect(armLabel("landing", poisoned).short).toBe("Not recorded");
      expect(isKnownArm("landing", poisoned)).toBe(false);
      // Every axis, not just landing — they share one lookup.
      for (const axis of ["landing", "survey", "pricing", "paywall"] as ExperimentAxis[]) {
        expect(armLabel(axis, poisoned).short).toBe("Not recorded");
        expect(isKnownArm(axis, poisoned)).toBe(false);
      }
    }
    // The real arms still resolve, so the guard has not over-reached.
    expect(armLabel("landing", "white_card").short).toBe("Landing Page V2 (Survey in Hero)");
    expect(isKnownArm("landing", "white_card")).toBe(true);
    expect(isKnownArm("pricing", "C")).toBe(true);
  });

  it("titles every axis", () => {
    expect(Object.keys(AXIS_TITLES).sort()).toEqual(["landing", "paywall", "pricing", "survey"]);
  });
});

describe("arm colours", () => {
  /**
   * Asked for on the 2026-09-16 sync: "fixed colour codes for variants, e.g.
   * preventing V1 and V2 colours from swapping". The renderer used to colour by
   * series POSITION, so an arm's colour depended on the order the caller passed
   * the arms in — and on a day when one arm had no data, the survivor took the
   * first slot's colour.
   */
  it("gives V1 blue and V2 orange, and never the same colour", () => {
    expect(armColor("landing", "white_prev")).toBe("#2563eb"); // V1, first design
    expect(armColor("landing", "white")).toBe("#e0552f"); // V2, survey in hero
    expect(armColor("landing", "white_prev")).not.toBe(armColor("landing", "white"));
  });

  it("keeps V2 orange in round 3 and gives V3 the live pair's blue", () => {
    expect(armColor("landing", "white_card")).toBe(armColor("landing", "white")); // V2 stays orange
    expect(armColor("landing", "white_video")).toBe("#2563eb"); // V3
    expect(armColor("landing", "white_card")).not.toBe(armColor("landing", "white_video"));
  });

  it("names every landing arm differently, so no two pool under one name", () => {
    // The admin explorer groups by display name: two arms sharing one would merge.
    const names = ["white_card", "white_video", "white", "white_prev", "control"].map(
      (arm) => armLabel("landing", arm).short
    );
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives every declared arm a colour, on every axis", () => {
    /**
     * `color` is a REQUIRED field on ArmLabel, so this cannot fail at runtime
     * without the build failing first. It is here because the compiler only checks
     * the arms that exist today: it is the assertion that says a new arm needs a
     * colour decision, in words, to whoever adds one.
     */
    let checked = 0;
    for (const axis of ["landing", "survey", "pricing", "paywall"] as ExperimentAxis[]) {
      for (const arm of activeArms(axis)) {
        expect(armColor(axis, arm), `${axis}/${arm} has no colour`).toMatch(/^#[0-9a-f]{6}$/i);
        checked += 1;
      }
    }
    // The loop ran. `activeArms` returning nothing would otherwise pass this test
    // while checking not one arm — `paywall` is already a legitimately empty axis,
    // so an empty result is not obviously wrong from inside the loop.
    expect(checked).toBeGreaterThanOrEqual(3);
  });

  it("does not repaint an arm when the other arm is filtered out", () => {
    /**
     * The property the old positional scheme could not hold. Reading the colour
     * from a one-arm list must give the same answer as reading it from the pair —
     * which is trivially true once colour is a property of the arm, and was
     * impossible to guarantee while it was a property of the slot.
     */
    const pair = ["white_card", "white_video"];
    for (const arm of pair) {
      const inPair = pair.map((a) => armColor("landing", a))[pair.indexOf(arm)];
      const alone = [arm].map((a) => armColor("landing", a))[0];
      expect(alone).toBe(inPair);
    }
  });

  it("gives Pricing 3.0's two lists the live pair, never the same colour", () => {
    expect(armColor("pricing", "A3")).toBe("#2563eb");
    expect(armColor("pricing", "B3")).toBe("#e0552f");
  });

  it("draws a retired arm in the low-chroma step, not in a live arm's colour", () => {
    // A concluded arm still needs a truthful label, but it must not compete with a
    // live one for the eye.
    expect(armColor("landing", "control")).toBe("#64748b");
    expect(armColor("landing", "control")).not.toBe(armColor("landing", "white"));
    expect(armColor("landing", "control")).not.toBe(armColor("landing", "white_prev"));
  });
});
