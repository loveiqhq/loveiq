/**
 * iOS Safari zooms the page in when a focused <input> has font-size < 16px, and
 * it does NOT zoom back out. On the survey that would mean tapping the country
 * search leaves every later question — including the email step — magnified for
 * the rest of the visit.
 *
 * THE COUNTRY QUESTION IS INDEX 35, NOT 37. This defaulted to 37 from the day it
 * was written, which is "Which age range are you in?" — a question with no text
 * input at all. So the probe reported "no text input" on every run and exit 3
 * forever, and Z1 was read as uncoverable. It was pointed at the wrong screen.
 * Scanned every index 0-59 against production on 2026-09-17: exactly four
 * questions have a text input — 0 name (22px), 35 country (16px), 36 postcode
 * (22px), 55 email (22px). None is under 16px, so Z1 is genuinely clean today,
 * and this probe can now say so instead of shrugging.
 *
 * Playwright's WebKit is not iOS Safari and may not implement the auto-zoom, so
 * a scale of 1.0 here is NOT proof the bug is absent. The font size is measured
 * directly as well, because that is the condition iOS actually keys on.
 */
import { webkit, chromium, devices } from "playwright";
import { stagingCookies } from "./staging-cookie.mjs";
import { seedQuestion } from "../lib/survey-nav.mjs";

const ORIGIN = process.env.REPORT_ORIGIN ?? "https://www.loveiq.org";
const IDX = Number(process.env.QUESTION_INDEX ?? 35);

// A probe that always exits 0 cannot report a defect. verify-ux-findings.mjs
// reads a non-zero exit as "reproduced in production", so until 2026-09-14 the
// Z1 criterion could never produce a finding however badly the page zoomed.
//
// Exit codes are three-way on purpose: 0 clean, 1 the defect reproduced, 3 the
// probe could not measure. Collapsing 3 into 1 would let a broken probe
// manufacture confident findings.
let bad = 0;
let unmeasured = 0;
for (const name of (process.env.DEVICES ?? "iPhone 15 Pro,iPhone SE,Pixel 7").split(",")) {
  const engine = /iphone|ipad/i.test(name) ? webkit : chromium;
  const browser = await engine.launch();
  const ctx = await browser.newContext({ ...devices[name], locale: "en-US" });
  await ctx.addCookies(stagingCookies(ORIGIN)).catch(() => {});
  const page = await ctx.newPage();
  /**
   * The two-key jump, now in scripts/lib/survey-nav.mjs. This probe set only the
   * localStorage answers blob, so `loadInitialStep()` returned 0, the engine
   * never mounted, and sixty lines of "skip intro" and ARIA-consent clicking
   * tried to compensate. The sessionStorage STEP is the half that was missing.
   */
  await seedQuestion(page, IDX);

  const notes = [];
  try {
    await page.goto(`${ORIGIN}/survey`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForTimeout(2500);
    await page
      .locator(".cky-btn-accept")
      .first()
      .click({ timeout: 8000 })
      .catch(() => {});
    await page.waitForTimeout(800);

    if (process.env.MUTATE === "1") {
      // Shrink the input below the threshold iOS keys on. A clean page must
      // FAIL here, or a pass from this probe means nothing.
      await page.addStyleTag({
        content: 'input[type="text"],input[type="search"]{font-size:13px !important}',
      });
      await page.waitForTimeout(200);
    }

    const found = await page.evaluate(() => {
      const heading = document.querySelector("h1,h2,h3")?.textContent?.trim().slice(0, 40) ?? "";
      const input = document.querySelector('input[type="text"], input[type="search"]');
      if (!input) return { heading, input: false };
      const cs = getComputedStyle(input);
      return {
        heading,
        input: true,
        fontSize: parseFloat(cs.fontSize),
        scaleBefore: window.visualViewport ? +window.visualViewport.scale.toFixed(3) : null,
      };
    });
    if (!found.input) {
      // "An inconclusive run is a FAILURE, never a pass" — scripts/probes/README.md.
      // But it is not a REPRODUCTION either, so it exits 3, not 1.
      notes.push(`INCONCLUSIVE: no text input on "${found.heading}"`);
      unmeasured += 1;
    } else {
      notes.push(
        `q="${found.heading}"`,
        `input font-size=${found.fontSize}px`,
        found.fontSize < 16 ? "UNDER 16px -> iOS WILL zoom" : "16px+ -> safe"
      );
      await page
        .locator('input[type="text"], input[type="search"]')
        .first()
        .tap()
        .catch(async () => {
          await page.locator('input[type="text"], input[type="search"]').first().focus();
        });
      await page.waitForTimeout(1200);
      const after = await page.evaluate(() =>
        window.visualViewport ? +window.visualViewport.scale.toFixed(3) : null
      );
      const zoomed = Boolean(after && after > 1.01);
      notes.push(
        `visualViewport.scale ${found.scaleBefore} -> ${after}`,
        zoomed ? "ZOOMED (reproduced)" : "no scale change in this engine"
      );
      // font-size is the engine-independent signal: WebKit does not always
      // implement the auto-zoom, so measuring only the scale would call a real
      // 15px input clean. Either symptom is the defect.
      if (found.fontSize < 16 || zoomed) bad += 1;
    }
  } catch (e) {
    notes.push(`exception: ${String(e.message).split("\n")[0].slice(0, 60)}`);
    unmeasured += 1;
  }
  console.log(`${name.padEnd(15)} ${notes.join(" | ")}`);
  await ctx.close();
  await browser.close();
}

if (bad > 0) {
  console.log(`\nFAIL (${bad})`);
  process.exit(1);
}
if (unmeasured > 0) {
  console.log(`\nINCONCLUSIVE (${unmeasured}) — could not measure, not a pass`);
  process.exit(3);
}
console.log("\nPASS");
process.exit(0);
