import { describe, expect, it, vi, afterEach } from "vitest";

/**
 * `/llms.txt` — the map this site hands to AI agents.
 *
 * Added after a PageSpeed run scored the new **Agentic Browsing** category 2/3 on
 * 2026-08-28: nothing served `/llms.txt` at all, so the audit failed on "llms.txt does
 * not follow recommendations".
 *
 * The assertions that matter are not "does the file exist" but the two ways it can be
 * quietly wrong: the format requirements the audit actually checks, and — the one with
 * consequences — telling a crawler something different from robots.txt about which
 * paths are private.
 */
async function body(): Promise<string> {
  vi.resetModules();
  const { GET } = await import("@/app/llms.txt/route");
  return await GET().text();
}

afterEach(() => vi.unstubAllEnvs());

describe("llms.txt", () => {
  it("is markdown with an H1, which is what the audit checks for", () => {
    return body().then((text) => {
      expect(text.split("\n")[0]).toMatch(/^# \S/);
      expect(text.length).toBeGreaterThan(200);
    });
  });

  it("is served as markdown, not as HTML or plain text", async () => {
    vi.resetModules();
    const { GET } = await import("@/app/llms.txt/route");
    expect(GET().headers.get("content-type")).toContain("text/markdown");
  });

  it("never contradicts robots.txt about what is private", async () => {
    /**
     * The one that has consequences. robots.txt disallows these paths; if llms.txt
     * omitted one, an agent reading only this file would crawl token-gated report
     * URLs it can never open. Two files disagreeing is worse than one saying nothing,
     * so the lists are asserted against each other rather than eyeballed.
     */
    const robots = (await import("@/app/robots")).default();
    const rules = Array.isArray(robots.rules) ? robots.rules : [robots.rules];
    const disallowed = new Set(
      rules.flatMap((r) => {
        const d = r.disallow;
        return d === undefined ? [] : Array.isArray(d) ? d : [d];
      })
    );
    expect(disallowed.size).toBeGreaterThan(0);

    const text = await body();
    for (const path of disallowed) {
      if (path === "/") continue; // the staging "close everything" rule
      expect(text, `${path} is disallowed in robots.txt but absent from llms.txt`).toContain(path);
    }
  });

  it("follows NEXT_PUBLIC_SITE_URL, so staging does not advertise production URLs", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://staging.loveiq.org");
    const text = await body();
    expect(text).toContain("https://staging.loveiq.org/glossary");
    expect(text).not.toContain("https://www.loveiq.org/glossary");
  });

  it("carries the medical disclaimer, so a summariser cannot miss it", async () => {
    // LoveIQ is not a diagnostic instrument. An agent condensing this site should
    // meet that caveat in the map itself, not only if it happens to open the page.
    const text = await body();
    expect(text.toLowerCase()).toContain("not medical advice");
  });
});
