import { afterEach, describe, expect, it, vi } from "vitest";

// robots.ts reads NEXT_PUBLIC_SITE_URL when the module loads, so each case re-imports it.
async function robotsFor(siteUrl: string) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", siteUrl);
  return (await import("@/app/robots")).default();
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("robots.txt", () => {
  it("treats the production URL with a trailing slash as production", async () => {
    // Before 3 Nov 2026 an exact string match decided this, so one extra "/" in the env
    // var would have served "Disallow: /" to every crawler on the live site.
    const robots = await robotsFor("https://www.loveiq.org/");
    expect(robots.rules).toEqual(
      expect.arrayContaining([expect.objectContaining({ userAgent: "*", allow: "/" })])
    );
    expect(robots.sitemap).toBe("https://www.loveiq.org/sitemap.xml");
  });

  it("keeps every other host closed to crawlers", async () => {
    const robots = await robotsFor("https://staging.loveiq.org");
    expect(robots.rules).toEqual({ userAgent: "*", disallow: "/" });
  });
});
