import { describe, expect, it } from "vitest";

import { readStampedArms } from "@features/attribution/server/traffic";

describe("readStampedArms", () => {
  it("reads both arms stamped at submit time", () => {
    const tracker = JSON.stringify({
      utm_source: "google",
      landing_variant: "white_prev",
      survey_variant: "dark",
    });
    expect(readStampedArms(tracker)).toEqual({ landing: "white_prev", survey: "dark" });
  });

  it("preserves white_prev instead of collapsing it to control", () => {
    // This is the whole reason this function exists. recordVisit.ts, the admin
    // explorer and get_landing_variant_funnel all fold anything != "white" into
    // "control", which reports round-2 traffic as the retired dark arm.
    const arms = readStampedArms(JSON.stringify({ landing_variant: "white_prev" }));
    expect(arms.landing).toBe("white_prev");
    expect(arms.landing).not.toBe("control");
  });

  it("returns nulls for a tracker with no stamps, rather than inventing arms", () => {
    expect(readStampedArms(JSON.stringify({ utm_source: "google" }))).toEqual({
      landing: null,
      survey: null,
    });
  });

  it("survives every malformed shape without throwing", () => {
    for (const input of [null, "", "   ", "not-json", "[]", '["white"]', "null", "42", '"str"']) {
      expect(readStampedArms(input)).toEqual({ landing: null, survey: null });
    }
  });

  it("ignores non-string arm values", () => {
    const tracker = JSON.stringify({ landing_variant: 42, survey_variant: { a: 1 } });
    expect(readStampedArms(tracker)).toEqual({ landing: null, survey: null });
  });

  it("trims surrounding whitespace on a stamped arm", () => {
    expect(readStampedArms(JSON.stringify({ landing_variant: "  white  " })).landing).toBe("white");
  });
});
