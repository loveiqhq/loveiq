import { describe, expect, it } from "vitest";

import {
  activeArms,
  armLabel,
  AXIS_TITLES,
  isKnownArm,
  type ExperimentAxis,
} from "@features/attribution/server/labels";

describe("arm labels", () => {
  it("names every arm we actively assign, in plain English", () => {
    // The A/B letter is part of the name so "variant A" in a meeting and
    // "Landing page A" in Slack are unambiguously the same arm, and the
    // parenthetical says which is which without the reader knowing dates.
    expect(armLabel("landing", "white").long).toBe("Landing page A: the current design");
    expect(armLabel("landing", "white_prev").long).toBe("Landing page B: the design it replaced");
    expect(armLabel("landing", "white").short).toContain("A");
    expect(armLabel("landing", "white_prev").short).toContain("B");
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
    // and it must NOT be conflated with the round-2 previous-design arm.
    const retired = armLabel("landing", "control");
    expect(retired.retired).toBe(true);
    expect(retired.long).toBe("Landing page: the original dark design");
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
    expect(activeArms("landing")).toEqual(["white", "white_prev"]);
    expect(activeArms("pricing")).toEqual(["A", "B"]);
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

  it("titles every axis", () => {
    expect(Object.keys(AXIS_TITLES).sort()).toEqual(["landing", "paywall", "pricing", "survey"]);
  });
});
