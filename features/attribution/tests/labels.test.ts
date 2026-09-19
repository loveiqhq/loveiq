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
    expect(armLabel("landing", "white").long).toBe("Landing Page V2: survey in the hero");
    expect(armLabel("landing", "white_prev").long).toBe("Landing Page V1: the first design");
    expect(armLabel("landing", "white").short).toBe("Landing Page V2 (Survey in Hero)");
    expect(armLabel("landing", "white_prev").short).toBe("Landing Page V1 (First Design)");
    // The retired dark arm must not compete for "the first one" — see labels.ts.
    expect(armLabel("landing", "control").short).not.toMatch(/\bV1\b(?! *\))/);
    expect(armLabel("landing", "control").short.toLowerCase()).not.toContain("first");
    // "homepage" is not the term the team uses; every landing label says so.
    for (const arm of ["white", "white_prev", "control"]) {
      expect(armLabel("landing", arm).short.toLowerCase()).not.toContain("homepage");
      expect(armLabel("landing", arm).long.toLowerCase()).not.toContain("homepage");
    }
    expect(armLabel("survey", "dark").long).toBe("Survey questions: dark");
    expect(armLabel("survey", "white").long).toBe("Survey questions: white");
    // Deliberately direction-free: these used to claim A was the lower arm, which
    // pricing 2.1 inverted on 2026-08-24 without anything failing.
    expect(armLabel("pricing", "A").long).toBe("Pricing: group A");
    expect(armLabel("pricing", "B").long).toBe("Pricing: group B");
    for (const arm of ["A", "B"] as const) {
      for (const field of ["short", "long"] as const) {
        expect(armLabel("pricing", arm)[field]).not.toMatch(/lower|higher/i);
      }
    }
    expect(armLabel("paywall", "treatment").long).toBe("Paywall: forced — had to pay to read on");
    expect(armLabel("paywall", "control").long).toBe("Paywall: dismissible — could close it");
  });

  it("never uses the raw arm code in a label", () => {
    // The whole point: a non-technical reader must not meet "white_prev".
    for (const axis of ["landing", "survey", "pricing", "paywall"] as ExperimentAxis[]) {
      for (const arm of ["white", "white_prev", "control", "dark", "A", "B", "treatment"]) {
        const label = armLabel(axis, arm);
        if (label.short === "Unknown") continue;
        expect(label.long).not.toContain("white_prev");
        expect(label.short).not.toContain("white_prev");
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
    // V1 retired 2026-09-19 when the landing test concluded in favour of V2, so
    // V2 is the only design still being served.
    expect(activeArms("landing")).toEqual(["white"]);
    expect(armLabel("landing", "white_prev").retired).toBe(true);
    // …but still KNOWN, so the ~180 stored submissions that carry it keep a
    // plain-English label instead of reading as "Not recorded".
    expect(isKnownArm("landing", "white_prev")).toBe(true);
    expect(armLabel("landing", "white_prev").short).toBe("Landing Page V1 (First Design)");
    // Arm A retired 2026-08-31 when the higher-priced arm was dropped, so B is
    // the only group still stamped on a new quote.
    expect(activeArms("pricing")).toEqual(["B"]);
    expect(armLabel("pricing", "A").retired).toBe(true);
    expect(isKnownArm("pricing", "A")).toBe(true);
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
    expect(armLabel("landing", "white").short).toBe("Landing Page V2 (Survey in Hero)");
    expect(isKnownArm("landing", "white")).toBe(true);
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
    const pair = ["white_prev", "white"];
    for (const arm of pair) {
      const inPair = pair.map((a) => armColor("landing", a))[pair.indexOf(arm)];
      const alone = [arm].map((a) => armColor("landing", a))[0];
      expect(alone).toBe(inPair);
    }
  });

  it("draws a retired arm in the low-chroma step, not in a live arm's colour", () => {
    // A concluded arm still needs a truthful label, but it must not compete with a
    // live one for the eye.
    expect(armColor("landing", "control")).toBe("#64748b");
    expect(armColor("landing", "control")).not.toBe(armColor("landing", "white"));
    expect(armColor("landing", "control")).not.toBe(armColor("landing", "white_prev"));
  });
});
