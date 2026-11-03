import { test, expect } from "@playwright/test";
import { getAllSlugs } from "@/data/glossary-data";

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
