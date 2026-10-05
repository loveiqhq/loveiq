/**
 * A PAYING READER'S REPORT, which nothing has ever checked.
 *
 * Every report probe in this corpus opens `rpt_a9LY0Obbla1FVsclJ1nM` — an
 * internal report with `payment_status: canceled`. So the entire corpus has
 * only ever seen the LOCKED page. Measured 2026-09-21 on production, the two
 * surfaces are not close:
 *
 *     locked    1,251 premium overlays · 54 unlock CTAs
 *     unlocked     14 premium overlays · 13 unlock CTAs
 *
 * Nothing would have caught a regression that re-locked a report somebody paid
 * for. That is the most expensive defect this product can have and it was the
 * one surface with no coverage at all.
 *
 * IF THIS EVER REPORTS A PAID REPORT AS LOCKED, check the token before the
 * product. The probe cannot tell a re-lock REGRESSION from this particular
 * report being legitimately re-locked — a refund or a dispute sets
 * `payment_status` away from `succeeded` and re-locks it correctly, and the
 * probe would then report the site as broken. One query settles it:
 *
 *     SELECT pr.payment_status FROM report_access_token rat
 *     LEFT JOIN personal_report pr ON pr.survey_submission_id = rat.survey_submission_id
 *     WHERE rat.token = 'rpt_HmQip3ZENUerTMsjrc1X';
 *
 * Still `succeeded` and not revoked as of 2026-09-22. If it is not, point
 * UNLOCKED_REPORT_TOKEN at another paid internal report rather than chasing a
 * regression that is not there.
 *
 * The token is an internal `ec@loveiq.org` report with
 * `payment_status: succeeded` and three unlocked archetypes — the same class of
 * internal account the locked default already uses, so this adds no customer
 * data. Override with UNLOCKED_REPORT_TOKEN to point at another.
 *
 *   node scripts/probes/verify-unlocked-report.mjs
 *   MUTATE=1 node scripts/probes/verify-unlocked-report.mjs   # must FAIL
 *
 * Exit 0 clean, 1 the defect reproduced, 3 could not measure.
 */
import { chromium, webkit, devices } from "playwright";
import { stagingCookies } from "./staging-cookie.mjs";

const ORIGIN = process.env.REPORT_ORIGIN ?? "https://www.loveiq.org";
const TOKEN = process.env.UNLOCKED_REPORT_TOKEN ?? "rpt_HmQip3ZENUerTMsjrc1X";

/**
 * Measured on production 2026-09-21, with headroom but not slack.
 *
 *     unlocked report      0-14 overlays  (teasers for archetypes not bought)
 *     locked report       1,251 overlays
 *
 * 40 is ~3x the most a healthy paid report has shown and two orders below the
 * locked page, so it catches a PARTIAL re-lock as well as a total one. It was
 * 120 first, which no longer looks cautious: the MUTATE run paints one overlay
 * per section — 65 of them — and sailed under the bar, so the mode reported
 * PASS while injecting its own defect. A threshold a mutation cannot cross is
 * not a threshold.
 */
const MAX_OVERLAYS_WHEN_PAID = 40;
/** Below this the page did not render and the run cannot measure. */
const MIN_RENDERED_CHARS = 4000;

let bad = 0;
let unmeasured = 0;
const DEVICE_LIST = (process.env.DEVICES ?? "Pixel 7,iPhone 15 Pro")
  .split(",")
  .map((n) => n.trim())
  .filter(Boolean);

for (const name of DEVICE_LIST) {
  if (!devices[name]) {
    console.log(`${name}: UNKNOWN DEVICE — INCONCLUSIVE`);
    unmeasured += 1;
    continue;
  }
  const engine = /iphone|ipad/i.test(name) ? webkit : chromium;
  const browser = await engine.launch();
  const ctx = await browser.newContext({ ...devices[name], locale: "en-US" });
  await ctx.addCookies(stagingCookies(ORIGIN)).catch(() => {});
  const page = await ctx.newPage();

  try {
    if (process.env.MUTATE === "1") {
      /**
       * The defect: a paid report served locked. Paints the premium overlay
       * over every section, which is what a regression in the access-plan
       * lookup would look like to a reader who paid.
       */
      await page.addInitScript(() => {
        /**
         * POLLED, not fired on `load`.
         *
         * The report is client-rendered: on `load` there are no `article` or
         * `section` elements yet, so a one-shot injection appended nothing and
         * MUTATE=1 passed — a mutation that does not mutate, which makes the
         * whole mode worthless. It keeps trying until the sections exist, then
         * stops.
         */
        const paint = () => {
          for (const section of document.querySelectorAll("article, section")) {
            // Idempotent, and it KEEPS running: React re-renders and strips
            // anything appended once, so a paint that stops after the first
            // success leaves nothing behind by the time the probe measures.
            if (section.querySelector(":scope > .report-premium-overlay")) continue;
            const veil = document.createElement("div");
            veil.className = "report-premium-overlay";
            veil.textContent = "Unlock the Full Report";
            section.appendChild(veil);
          }
        };
        setInterval(paint, 150);
      });
    }

    await page.goto(`${ORIGIN}/report/${TOKEN}`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await page
      .waitForSelector(".report-status-card__spinner", { state: "detached", timeout: 120_000 })
      .catch(() => {});
    await page.waitForTimeout(3500);

    const state = await page.evaluate(() => ({
      path: location.pathname,
      chars: (document.body.innerText ?? "").replace(/\s+/g, " ").trim().length,
      overlays: document.querySelectorAll(".report-premium-overlay, [class*='premium-overlay']")
        .length,
      sections: document.querySelectorAll("article, section").length,
    }));

    if (!state.path.startsWith("/report")) {
      console.log(`${name}: did not stay on the report (${state.path}) — INCONCLUSIVE`);
      unmeasured += 1;
    } else if (state.chars < MIN_RENDERED_CHARS) {
      // A report that did not render says nothing about whether it was paid.
      console.log(`${name}: rendered only ${state.chars} chars — INCONCLUSIVE`);
      unmeasured += 1;
    } else if (state.overlays > MAX_OVERLAYS_WHEN_PAID) {
      console.log(
        `${name}: FAIL — a PAID report is showing ${state.overlays} locked overlays across ` +
          `${state.sections} sections. Someone who paid is being asked to pay again.`
      );
      bad += 1;
    } else {
      console.log(
        `${name}: ok — paid report renders ${state.chars} chars, ${state.overlays} overlay(s)`
      );
    }
  } catch (err) {
    // A site that cannot be reached is not a defect.
    console.log(`${name}: exception: ${String(err.message).split("\n")[0].slice(0, 110)}`);
    unmeasured += 1;
  }
  await ctx.close();
  await browser.close();
}

console.log(
  `\n${DEVICE_LIST.length - bad - unmeasured}/${DEVICE_LIST.length} devices: ` +
    `a paid report renders unlocked`
);
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
