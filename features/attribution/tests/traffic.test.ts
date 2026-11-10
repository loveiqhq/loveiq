import { describe, expect, it } from "vitest";

import {
  classifyTraffic,
  LANDING_PATH_TRACKER_KEY,
  readStampedArms,
} from "@features/attribution/server/traffic";

describe("classifyTraffic — where they came from", () => {
  // AP-Analytics' channel (classifySource): an untagged visit by its referring site. 10 of the
  // last 30 days' surveys read "Direct" with an organic search's referrer unread.
  it.each([
    [{ referrer_host: "www.google.com" }, "organic_search"],
    [{ referrer_host: "l.instagram.com" }, "social"],
    [{ referrer_host: "com.twitter.android" }, "social"],
    [{ referrer_host: "example.org" }, "referral"],
    [{ referrer_host: "chatgpt.com" }, "ai"],
    [{ utm_source: "chatgpt.com" }, "ai"],
    [{ utm_source: "email", utm_medium: "nurture", utm_campaign: "survey_paused" }, "email"],
    [{ utm_source: "google", utm_medium: "cpc", gclid: "x" }, "google_ads"],
    [{}, "direct"],
  ])("reads %j as AP's %s", (tracker, channel) => {
    expect(classifyTraffic(JSON.stringify(tracker)).channel).toBe(channel);
  });

  it("keeps the referring site for the line, and the tags as the source", () => {
    const tagged = classifyTraffic(
      JSON.stringify({ utm_source: "chatgpt.com", referrer_host: "chatgpt.com" })
    );
    expect(tagged).toMatchObject({ source: "chatgpt.com", referrerHost: "chatgpt.com" });
    expect(classifyTraffic(JSON.stringify({ referrer_host: "www.google.com" })).source).toBeNull();
  });

  it("reads the first page the survey route stamps", () => {
    const tracker = JSON.stringify({ [LANDING_PATH_TRACKER_KEY]: "/glossary/demisexuality" });
    expect(classifyTraffic(tracker).landingPath).toBe("/glossary/demisexuality");
    expect(classifyTraffic(JSON.stringify({ utm_source: "x" }))).not.toHaveProperty("landingPath");
  });
});

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
