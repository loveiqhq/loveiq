import { afterEach, describe, expect, it, vi } from "vitest";
import { reportUrlAfterSurvey } from "@features/survey/ui/reportUrlAfterSurvey";

/**
 * Fatih, 30.09: after the wizard, staging opens the V4 report; the live site keeps
 * its default until V4 ships. Gated by isNonProdDeploy(), so an unknown environment
 * reads as production and keeps the default.
 */
describe("reportUrlAfterSurvey", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("opens the V4 report on staging", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://staging.loveiq.org");
    expect(reportUrlAfterSurvey("rpt_abc123")).toBe("/report/rpt_abc123?v4=1");
  });

  it("opens it locally too", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(reportUrlAfterSurvey("rpt_abc123")).toBe("/report/rpt_abc123?v4=1");
  });

  it("keeps the live site's default report", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.loveiq.org");
    expect(reportUrlAfterSurvey("rpt_abc123")).toBe("/report/rpt_abc123");
  });

  it("flags the session's own report the same way when there is no token", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(reportUrlAfterSurvey(null)).toBe("/report?v4=1");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.loveiq.org");
    expect(reportUrlAfterSurvey(null)).toBe("/report");
  });

  it("treats an unknown environment as the live site", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(reportUrlAfterSurvey("rpt_abc123")).toBe("/report/rpt_abc123");
  });
});
