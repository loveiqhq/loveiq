/**
 * Does a reader ever see a raw internal error string during checkout?
 *
 * Criterion E1 in the review protocol names the literal "Unable to process
 * request." — the generic 500 body returned by ~10 API routes, including
 * /api/stripe/checkout-session on both of its catch-all paths. The chain is
 * unbroken: the route returns {error: "Unable to process request."},
 * startReportCheckout passes json.error through verbatim as its `message`, and
 * ReportPage renders that message in .report-status-card__label. So a server
 * hiccup during checkout shows the reader an internal string that tells them
 * nothing and reads as a broken product.
 *
 * This is not hypothetical. Mark logged it on 2026-08-30 against session
 * 01a04d64: "'Continue to secure checkout' on a EUR 39.99 purchase gave
 * 'Unable to process request' three times." It is also the string the Replay
 * Vision scanners hallucinate most, precisely because it is in their prompt —
 * which is why E1 needed a real check rather than a console audit that asserts
 * nothing.
 *
 * The 500 is STUBBED, not provoked: this must never create live Stripe
 * sessions or depend on the server actually failing.
 *
 *   node scripts/probes/verify-checkout-error-copy.mjs
 *   MUTATE=1 node scripts/probes/verify-checkout-error-copy.mjs   # must FAIL
 *
 * Exit codes: 0 clean · 1 the reader saw the raw string · 3 inconclusive.
 */
import { chromium, webkit, devices } from "playwright";
import { stagingCookies } from "./staging-cookie.mjs";

const ORIGIN = process.env.REPORT_ORIGIN ?? "https://www.loveiq.org";
const TOKEN = process.env.QA_TOKEN_LOCKED ?? "rpt_a9LY0Obbla1FVsclJ1nM";
const RAW = "Unable to process request.";

let bad = 0;
let unmeasured = 0;

for (const name of (process.env.DEVICES ?? "Pixel 7,iPhone 15 Pro").split(",")) {
  const engine = /iphone|ipad/i.test(name) ? webkit : chromium;
  const browser = await engine.launch();
  const ctx = await browser.newContext({ ...devices[name], locale: "en-US" });
  await ctx.addCookies(stagingCookies(ORIGIN)).catch(() => {});
  const page = await ctx.newPage();
  const notes = [];

  try {
    // Stand in for a failing server. MUTATE=1 keeps the same 500 but is handled
    // by a page that re-introduces the passthrough, so the probe must go red.
    await page.route("**/api/stripe/checkout-session", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: RAW }),
      })
    );

    if (process.env.MUTATE === "1") {
      await page.addInitScript((raw) => {
        // Re-create the defect independently of the app: paint the raw string
        // into the handoff card the moment one appears.
        const paint = () => {
          const el = document.querySelector(".report-status-card__label");
          if (el && !/unable to process/i.test(el.textContent ?? "")) el.textContent = raw;
        };
        setInterval(paint, 150);
      }, RAW);
    }

    await page.goto(`${ORIGIN}/report/${TOKEN}`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    // The report is client-rendered; waiting a fixed beat measures the spinner.
    await page
      .waitForFunction(() => document.body.innerText.length > 2000, { timeout: 60_000 })
      .catch(() => {});
    await page
      .locator(".cky-btn-accept")
      .first()
      .click({ timeout: 6000 })
      .catch(() => {});

    // Open the pricing modal, then pick a plan.
    const opened = await page.evaluate(() => {
      const cta = document.querySelector(
        ".report-premium-overlay__cta, .report-sticky-unlock__button, [data-unlock]"
      );
      if (!cta) return false;
      cta.scrollIntoView({ block: "center" });
      cta.click();
      return true;
    });
    if (!opened) {
      notes.push("INCONCLUSIVE: no unlock CTA on the page");
      unmeasured += 1;
    } else {
      await page.waitForTimeout(1500);
      const chose = await page.evaluate(() => {
        const cta = document.querySelector(".report-pricing-card__cta");
        if (!cta) return false;
        cta.click();
        return true;
      });
      if (!chose) {
        notes.push("INCONCLUSIVE: pricing modal did not offer a plan");
        unmeasured += 1;
      } else {
        // The handoff card is rendered by the failure branch, so wait for it.
        await page
          .waitForSelector(".report-status-card__label", { timeout: 20_000 })
          .catch(() => {});
        await page.waitForTimeout(800);
        const shown = await page.evaluate(
          () => document.querySelector(".report-status-card__label")?.textContent?.trim() ?? ""
        );
        if (!shown) {
          notes.push("INCONCLUSIVE: no handoff message rendered");
          unmeasured += 1;
        } else if (/unable to process/i.test(shown)) {
          notes.push(`RAW STRING SHOWN: "${shown.slice(0, 70)}"`);
          bad += 1;
        } else {
          notes.push(`ok — reader sees: "${shown.slice(0, 70)}"`);
        }
      }
    }
  } catch (e) {
    notes.push(`exception: ${String(e.message).split("\n")[0].slice(0, 70)}`);
    unmeasured += 1;
  }

  console.log(`${name.padEnd(16)} ${notes.join(" | ")}`);
  await ctx.close();
  await browser.close();
}

if (bad > 0) {
  console.log(`\nFAIL (${bad}) — an internal error string reached the reader`);
  process.exit(1);
}
if (unmeasured > 0) {
  console.log(`\nINCONCLUSIVE (${unmeasured}) — could not measure, not a pass`);
  process.exit(3);
}
console.log("\nPASS");
process.exit(0);
