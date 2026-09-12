#!/usr/bin/env node
/**
 * Screenshots of what SHIPPED, sized so a vision model can actually read them.
 *
 * WHY NOT THE VISUAL-REGRESSION BASELINES. They exist, CI refreshes them, and they are
 * the obvious source -- but they are captured `fullPage: true` and measured 2026-09-12
 * they are unusable for this: landing 1280x9789, the previous landing 1280x12195,
 * glossary 1280x9818, about 1280x6185. A vision model downscales anything over roughly
 * 1568px on its longest edge, so a 9.5:1 page arrives as a stripe with no legible word
 * in it. Only 2 of the 7 were the right shape. They also are not committed by CI -- the
 * workflow uploads them as an artifact for a human to commit -- so they cannot be
 * refreshed without someone doing it by hand.
 *
 * WHY NOT A BROWSER IN THE FUNCTION. `@sparticuz/chromium` is ~50 MB of dependency and
 * 3-8s of cold start inside a 60s budget, to buy freshness measured in days over a path
 * that costs nothing. Flagged and rejected during planning.
 *
 * So: capture here, commit the files, and serve them from `public/` -- the same shape
 * `scripts/generate-locked-previews.mjs` already uses for report previews.
 *
 * EVERY SHOT IS DATED, and `show_page` says so. A screenshot with no date is worse than
 * none: it invites a critique of a page that may have changed since.
 *
 *   node scripts/capture-page-shots.mjs                     # against production
 *   ORIGIN=http://localhost:3000 node scripts/capture-page-shots.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ORIGIN = process.env.ORIGIN?.replace(/\/$/, "") || "https://www.loveiq.org";
const OUT_DIR = join(process.cwd(), "public", "page-shots");

/**
 * Viewport-sized, not full-page. A viewport is what a visitor sees before scrolling,
 * which is the thing worth critiquing; `section` shots below cover what is further down.
 */
const VIEWPORT = { width: 1280, height: 900 };
const MOBILE = { width: 390, height: 844 };

/**
 * THE LANDING IS A LIVE A/B AND THE TWO ARMS ARE DIFFERENT PAGES.
 *
 * `proxy.ts` picks an arm on a coin flip, so a bare "/" photographs whichever one this
 * run was dealt. Measured on the first two runs of this script: one produced the
 * "Sexual Personalities" arm with a question card in the hero, the next produced
 * "Sexual Archetypes" with an archetype map and a stats table. Entirely different
 * pages -- the e2e spec records them as 9,789 vs 12,195 pixels tall.
 *
 * A critique written from an unpinned shot is a critique of a page half our visitors
 * never see, and nothing in the image says which half. `?variant=` is the override the
 * middleware already honours for exactly this reason, so both arms are captured and
 * both are named.
 */
const SHOTS = [
  { name: "landing-white", path: "/?variant=white", viewport: VIEWPORT, what: "the landing page, arm `white`, above the fold" },
  { name: "landing-white-prev", path: "/?variant=white_prev", viewport: VIEWPORT, what: "the landing page, arm `white_prev`, above the fold" },
  { name: "landing-white-mobile", path: "/?variant=white", viewport: MOBILE, what: "the landing page, arm `white`, on a phone" },
  { name: "landing-white-prev-mobile", path: "/?variant=white_prev", viewport: MOBILE, what: "the landing page, arm `white_prev`, on a phone" },
  { name: "survey-intro", path: "/survey", viewport: VIEWPORT, what: "the first thing a visitor sees when starting the assessment" },
  { name: "survey-intro-mobile", path: "/survey", viewport: MOBILE, what: "the assessment intro on a phone" },
  { name: "about", path: "/about", viewport: VIEWPORT, what: "the about page, above the fold" },
  { name: "glossary", path: "/glossary", viewport: VIEWPORT, what: "the glossary index" },
  { name: "trust-zone", path: "/trust-zone", viewport: VIEWPORT, what: "the trust page" },
];

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const captured = [];
  const startedAt = new Date().toISOString();

  for (const shot of SHOTS) {
    const ctx = await browser.newContext({ viewport: shot.viewport, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    try {
      await page.goto(`${ORIGIN}${shot.path}`, { waitUntil: "networkidle", timeout: 45_000 });

      /**
       * DISMISS THE CONSENT BANNER, AND SAY SO IN THE MANIFEST.
       *
       * MEASURED on the first run: the CookieYes banner occupies the bottom 170px of a
       * 900px viewport -- 19% of every shot, identical on every page, covering real
       * content. A design critique made from those images spends its attention on a
       * third-party overlay and never sees what is underneath it.
       *
       * Clicked rather than hidden with CSS, so the page is in the state a visitor is
       * actually in one click later, with the layout genuinely reflowed rather than an
       * element painted out. It is recorded in the manifest because a shot that silently
       * differs from what a first-time visitor sees would be a quiet lie.
       */
      const reject = page.getByRole("button", { name: /reject all/i }).first();
      if (await reject.isVisible({ timeout: 4000 }).catch(() => false)) {
        await reject.click({ timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(400);
      }
      // Fonts settle after networkidle, and a half-swapped font is a false finding in a
      // design critique -- the same reason the e2e spec has `waitForVisualReady`.
      await page.evaluate(() => document.fonts.ready);
      // Animations mid-flight photograph as misaligned layout.
      await page.addStyleTag({
        content: `*,*::before,*::after{animation:none!important;transition:none!important}`,
      });
      await page.waitForTimeout(600);
      const file = `${shot.name}.png`;
      await page.screenshot({ path: join(OUT_DIR, file), fullPage: false });
      captured.push({
        name: shot.name,
        file,
        url: `${ORIGIN}${shot.path}`,
        what: shot.what,
        width: shot.viewport.width,
        height: shot.viewport.height,
        consentBannerDismissed: true,
      });
      console.log(`  captured ${shot.name.padEnd(22)} ${shot.viewport.width}x${shot.viewport.height}`);
    } catch (err) {
      // A page that fails to capture is REPORTED, never silently absent: a missing shot
      // must read as "we did not get one", not as "that page looks like nothing".
      console.error(`  FAILED   ${shot.name}: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    } finally {
      await ctx.close();
    }
  }
  await browser.close();

  writeFileSync(
    join(OUT_DIR, "manifest.json"),
    `${JSON.stringify({ capturedAt: startedAt, origin: ORIGIN, shots: captured }, null, 2)}\n`
  );
  console.log(`\n  ${captured.length}/${SHOTS.length} captured into public/page-shots at ${startedAt}`);
  if (captured.length < SHOTS.length) {
    console.error("  Some pages did not capture — the manifest lists only what succeeded.");
  }
}

void main();
