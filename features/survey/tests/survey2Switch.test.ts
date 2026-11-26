import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Whether a visit to /survey starts Survey 2.0: the `survey_2` switch (read default OFF), or a
 * `?order=survey2` preview where previews are allowed. Production never honours the preview,
 * and a failure reading the switch gives today's survey, never a mix of the two.
 */
const env = vi.hoisted(() => ({ nonProd: false, on: new Set<string>(), fail: false }));
vi.mock("@shared/env/is-non-prod-deploy", () => ({ isNonProdDeploy: () => env.nonProd }));
vi.mock("@shared/flags/system-flags", () => ({
  isFeatureEnabled: async (key: string, fallback: boolean) => {
    if (env.fail) throw new Error("supabase down");
    return env.on.has(key) ? true : fallback;
  },
}));

import { survey2ForVisit } from "@features/survey/server/survey2Switch";

beforeEach(() => {
  env.nonProd = false;
  env.on = new Set();
  env.fail = false;
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("whether a visit starts Survey 2.0", () => {
  it("not by default", async () => {
    expect(await survey2ForVisit(undefined)).toBe("off");
  });

  // The switch runs the Survey 2.0 test: a fresh run draws its half (Mark, sync of 25 Nov 2026).
  it("runs the Survey 2.0 test when the survey_2 switch is on, in production too", async () => {
    env.on = new Set(["survey_2"]);
    expect(await survey2ForVisit(undefined)).toBe("test");
  });

  it("production ignores ?order=survey2", async () => {
    expect(await survey2ForVisit("survey2")).toBe("off");
    env.on = new Set(["survey_2"]);
    expect(await survey2ForVisit("survey2")).toBe("test");
  });

  it("forces it for every run on a preview on dev, previews and staging", async () => {
    env.nonProd = true;
    expect(await survey2ForVisit("survey2")).toBe("forced");
  });

  it("forces it on the e2e server, which sets SURVEY_SHEETS_PREVIEW=1", async () => {
    vi.stubEnv("SURVEY_SHEETS_PREVIEW", "1");
    expect(await survey2ForVisit("survey2")).toBe("forced");
  });

  it("previews today's survey with ?order=variant while the switch is on", async () => {
    env.nonProd = true;
    env.on = new Set(["survey_2"]);
    expect(await survey2ForVisit("variant")).toBe("off");
    expect(await survey2ForVisit("control")).toBe("off");
  });

  it("fails closed to classic", async () => {
    env.fail = true;
    expect(await survey2ForVisit(undefined)).toBe("off");
  });
});
