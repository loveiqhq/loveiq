import { test, expect } from "@playwright/test";
import { getAllSlugs } from "@/data/glossary-data";
import redirectsConfig from "@features/glossary/glossary-redirects.constants.js";

const { GLOSSARY_MERGED, GLOSSARY_REMOVED } = redirectsConfig;

/**
 * What crawlers get from the glossary. GPTBot, OAI-SearchBot, ClaudeBot and
 * PerplexityBot read the raw HTML and run no JavaScript, so a term link that
 * only appears after hydration does not exist for them. Until 3 Nov 2026 the
 * index sent zero term links and the words "No terms found".
 */

const termLinks = (html: string) =>
  new Set([...html.matchAll(/href="\/glossary\/([a-z0-9-]+)"/g)].map((m) => m[1]));

test.describe("Glossary — what crawlers read", () => {
  test("the index HTML links every term, with no JavaScript run", async ({ request }) => {
    const response = await request.get("/glossary");
    await expect(response).toBeOK();
    const html = await response.text();

    const linked = termLinks(html);
    expect(getAllSlugs().filter((slug) => !linked.has(slug))).toEqual([]);
    expect(html).not.toContain("No terms found");
  });

  test("a shared ?q= link arrives already filtered", async ({ request }) => {
    const html = await (await request.get("/glossary?q=aftercare")).text();
    const linked = termLinks(html);
    expect(linked.has("aftercare")).toBe(true);
    expect(linked.has("abandonment-insecurity")).toBe(false);
  });
});

test.describe("Glossary — readable without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("term links are visible, not faded out waiting for a script", async ({ page }) => {
    await page.goto("/glossary");
    const link = page.locator('a[href="/glossary/abandonment-insecurity"]');
    await expect(link).toHaveCount(1);
    // toBeVisible() ignores opacity; the old list sat at opacity 0 until a script ran.
    const opacity = await link.evaluate((el) => {
      let lowest = 1;
      for (let node: Element | null = el; node; node = node.parentElement) {
        lowest = Math.min(lowest, Number(getComputedStyle(node).opacity));
      }
      return lowest;
    });
    expect(opacity).toBe(1);
  });
});

test.describe("Glossary — search in the browser", () => {
  test("filters as you type, without hydration warnings or re-rendering the page", async ({
    page,
  }) => {
    const warnings: string[] = [];
    page.on("console", (msg) => {
      if (/hydrat/i.test(msg.text())) warnings.push(msg.text());
    });
    // Router requests for /glossary itself. (The nav and footer links prefetch their own
    // pages; that is unrelated to search.) router.replace would add one per keystroke.
    const glossaryRenders: string[] = [];
    page.on("request", (req) => {
      const url = new URL(req.url());
      const isRouterRequest = Boolean(req.headers()["rsc"]) || url.searchParams.has("_rsc");
      if (isRouterRequest && url.pathname.startsWith("/glossary")) glossaryRenders.push(req.url());
    });
    await page.goto("/glossary");

    const search = page.getByLabel("Search glossary terms").filter({ visible: true });
    await search.fill("aftercare");
    await expect(page.locator('a[href="/glossary/aftercare"]')).toBeVisible();
    await expect(page.locator('a[href="/glossary/abandonment-insecurity"]')).toHaveCount(0);
    await expect(page).toHaveURL(/[?&]q=aftercare/);

    expect(glossaryRenders).toEqual([]);
    expect(warnings).toEqual([]);
  });
});

test.describe("Glossary — term pages", () => {
  test("carry their own share tags and schema, and no template card", async ({ request }) => {
    const html = await (await request.get("/glossary/aftercare")).text();

    // The "Inside LoveIQ" card (same text and a hard-coded 66% bar on every term) is gone.
    expect(html).not.toContain("Inside LoveIQ");
    expect(html).toContain('<meta name="twitter:title" content="Aftercare | LoveIQ Glossary"');
    expect(html).toMatch(/<meta property="og:url" content="[^"]*\/glossary\/aftercare"/);

    const definedTerm = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)]
      .map((m) => JSON.parse(m[1]!))
      .find((data) => data["@type"] === "DefinedTerm");
    expect(definedTerm.url).toMatch(/\/glossary\/aftercare$/);
    expect(definedTerm["@id"]).toMatch(/\/glossary\/aftercare#term$/);
    expect(definedTerm.inDefinedTermSet["@id"]).toMatch(/\/glossary#glossary$/);
  });
});

test.describe("Glossary — merged duplicates", () => {
  for (const [from, to] of Object.entries(GLOSSARY_MERGED)) {
    test(`/glossary/${from} moves permanently to /glossary/${to}`, async ({ request }) => {
      const direct = await request.get(`/glossary/${from}`, { maxRedirects: 0 });
      expect(direct.status()).toBe(308);
      expect(direct.headers()["location"]).toMatch(new RegExp(`/glossary/${to}$`));

      // With a trailing slash the proxy strips the slash first: assert where a visitor
      // ends up, not how many hops it takes.
      const followed = await request.get(`/glossary/${from}/`);
      await expect(followed).toBeOK();
      expect(followed.url()).toMatch(new RegExp(`/glossary/${to}$`));
    });
  }

  test("the sitemap lists the kept terms, not the merged ones", async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    for (const [from, to] of Object.entries(GLOSSARY_MERGED)) {
      expect(xml).not.toContain(`/glossary/${from}<`);
      expect(xml).toContain(`/glossary/${to}<`);
    }
  });
});

test.describe("Glossary — removed terms", () => {
  const BOT_UA =
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)";

  test("answer a real 404, to browsers and crawlers alike", async ({ request }) => {
    for (const slug of GLOSSARY_REMOVED) {
      const asBrowser = await request.get(`/glossary/${slug}`, { maxRedirects: 0 });
      expect(asBrowser.status(), `${slug} as a browser`).toBe(404);
      const asBot = await request.get(`/glossary/${slug}`, {
        maxRedirects: 0,
        headers: { "user-agent": BOT_UA },
      });
      expect(asBot.status(), `${slug} as GPTBot`).toBe(404);
    }
  });

  test("are gone from the sitemap", async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    for (const slug of GLOSSARY_REMOVED) expect(xml).not.toContain(`/glossary/${slug}<`);
  });
});
