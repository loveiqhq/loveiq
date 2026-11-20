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

  it("lets Google and Bing fetch the private pages, so they can read the noindex", async () => {
    // A page robots.txt blocks is never fetched, so its noindex is never read, and Google can
    // still list the bare URL from a link: "Indexed, though blocked by robots.txt".
    const rules = [(await robotsFor("https://www.loveiq.org")).rules].flat();
    const disallowFor = (agent: string) =>
      [rules.find((rule) => rule.userAgent === agent)?.disallow ?? []].flat();

    expect(disallowFor("Googlebot")).toEqual(["/api/", "/admin"]);
    expect(disallowFor("Bingbot")).toEqual(["/api/", "/admin"]);
  });

  it("keeps the private pages closed to every other crawler", async () => {
    const rules = [(await robotsFor("https://www.loveiq.org")).rules].flat();
    const others = rules.filter(
      (rule) => rule.userAgent !== "Googlebot" && rule.userAgent !== "Bingbot"
    );

    expect(others.length).toBeGreaterThan(1); // "*" and the AI crawlers
    for (const rule of others) {
      expect([rule.disallow].flat(), String(rule.userAgent)).toEqual(
        expect.arrayContaining(["/report", "/survey", "/checkout", "/login", "/why"])
      );
    }
  });
});
