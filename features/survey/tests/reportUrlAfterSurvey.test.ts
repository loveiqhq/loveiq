import { afterEach, describe, expect, it, vi } from "vitest";
import { reportUrlAfterSurvey } from "@features/survey/ui/reportUrlAfterSurvey";

/**
 * Report 3.0 is every reader's default since it launched, so the survey no longer flags
 * it with `?v4=1` off the live site (Fatih, 30.09: "V4 on staging only", until launch).
 */
describe("reportUrlAfterSurvey", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ["the live site", "production", "https://www.loveiq.org"],
    ["staging", "production", "https://staging.loveiq.org"],
    ["local dev", "development", ""],
  ])("opens the reader's report, unflagged, on %s", (_where, nodeEnv, siteUrl) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", siteUrl);
    expect(reportUrlAfterSurvey("rpt_abc123")).toBe("/report/rpt_abc123");
    expect(reportUrlAfterSurvey(null)).toBe("/report");
  });
});
