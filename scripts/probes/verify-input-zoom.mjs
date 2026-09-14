/**
 * iOS Safari zooms the page in when a focused <input> has font-size < 16px, and
 * it does NOT zoom back out. On the survey that means tapping the country
 * search at question 38 leaves the remaining 21 questions — including the email
 * step — magnified for the rest of the visit.
 *
 * Playwright's WebKit is not iOS Safari and may not implement the auto-zoom, so
 * a scale of 1.0 here is NOT proof the bug is absent. The font size is measured
 * directly as well, because that is the condition iOS actually keys on.
 */
import { webkit, chromium, devices } from "playwright";
import { stagingCookies } from "./staging-cookie.mjs";

const ORIGIN = process.env.REPORT_ORIGIN ?? "https://www.loveiq.org";
const IDX = Number(process.env.QUESTION_INDEX ?? 37);

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
  // Restore straight to the country question rather than clicking 37 times.
  await page.addInitScript((idx) => {
    localStorage.setItem(
      "loveiq-survey-answers",
      JSON.stringify({
        answers: {},
        currentIndex: idx,
        startedAt: new Date().toISOString(),
        prefilled: [],
      })
    );
  }, IDX);

  const notes = [];
  try {
    await page.goto(`${ORIGIN}/survey`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForTimeout(3000);
    await page
      .locator(".cky-btn-accept")
      .first()
      .click({ timeout: 8000 })
      .catch(() => {});
    await page.waitForTimeout(1500);

    // Get past the multi-slide intro and the terms gate; only then does the
    // engine mount and restore `currentIndex`.
    for (let i = 0; i < 10; i += 1) {
      const skip = page
        .locator("button, a")
        .filter({ hasText: /skip intro/i })
        .first();
      if (await skip.count()) {
        await skip.click({ timeout: 6000 }).catch(() => {});
        await page.waitForTimeout(1200);
        continue;
      }
      // Tick every consent checkbox before trying to agree.
      //
      // The consent controls are role="checkbox" elements, NOT real inputs, so
      // an 'input[type="checkbox"]' locator matched ZERO of them: nothing was
      // ticked, "I agree" stayed disabled, and this probe sat on the consent
      // screen until it gave up — reporting "no text input" on every run since
      // it was written, while the review protocol called Z1 fully covered.
      // .check() only works on real inputs; an ARIA checkbox needs a click and
      // reports its state through aria-checked.
      const boxes = page.locator('input[type="checkbox"], [role="checkbox"]');
      const n = await boxes.count();
      for (let b = 0; b < n; b += 1) {
        const box = boxes.nth(b);
        const isInput = await box.evaluate((el) => el.tagName === "INPUT").catch(() => false);
        const checked = isInput
          ? await box.isChecked().catch(() => true)
          : (await box.getAttribute("aria-checked").catch(() => "true")) === "true";
        if (checked) continue;
        if (isInput) await box.check({ timeout: 4000 }).catch(() => {});
        else await box.click({ timeout: 4000 }).catch(() => {});
      }
      const agree = page
        .locator("button")
        .filter({ hasText: /^i agree$/i })
        .first();
      if (await agree.count()) {
        const on = await agree.isEnabled().catch(() => false);
        if (on) {
          await agree.click({ timeout: 6000 }).catch(() => {});
          await page.waitForTimeout(1500);
          continue;
        }
      }
      const cont = page
        .locator("button, a")
        .filter({ hasText: /continue|start|begin|let.s go/i })
        .filter({ hasNotText: /cookie|accept|reject|customise/i })
        .first();
      if (await cont.count()) {
        await cont.click({ timeout: 6000 }).catch(() => {});
        await page.waitForTimeout(1200);
        continue;
      }
      break;
    }
    await page.waitForTimeout(1200);

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
