/**
 * Does "Start a new one" really start a new survey?
 *
 * WHY THIS EXISTS. Session 01a0e682 (PR #375) was reported as a loop back to
 * the start. It was not a loop. The reader finished, opened their report, came
 * back to /survey, pressed "Start a new one" on the already-finished screen and
 * spent 23 minutes answering the whole survey again (PostHog, 2026-09-28). None
 * of it was stored: both report links they got belong to submission 2263, the
 * FIRST run, so the second report showed the first run's answers.
 *
 * THE MECHANISM, read from our own code:
 * - the survey session id lives in sessionStorage (`loveiq-survey-session`), and
 *   submitting keeps it on purpose (`clearSurveySession: false`);
 * - `finalizeReportSession()` is what removes it, and a report opened by token
 *   never calls it;
 * - "Start a new one" called `forgetCompletedReport()`, which removed the
 *   finished-report key and nothing else;
 * - so the new run submitted under the old session id, and `submitSurveyOnce()`
 *   answers a session id it has seen with the EXISTING submission.
 *
 * This probe puts the tab in the finished state, presses "Start a new one" and
 * reads the session id the next run would submit under. It stops there on
 * purpose: finishing the survey would write a real submission to production.
 *
 *   REPORT_ORIGIN=https://www.loveiq.org node scripts/probes/verify-start-over-new-session.mjs
 *   MUTATE=1 ...   # puts the old id back after the press; must exit 1
 *
 * Exit 0 clean, 1 reproduced, 3 could not measure.
 */
import { chromium, webkit, devices } from "playwright";
import { stagingCookies } from "./staging-cookie.mjs";

const ORIGIN = process.env.REPORT_ORIGIN ?? "https://www.loveiq.org";
/** Only rendered as a link on the finished screen, never opened. */
const TOKEN = "rpt_probe_start_over";
const OLD_SESSION = "probe-finished-session";

let bad = 0;
let unmeasured = 0;

for (const name of (process.env.DEVICES ?? "Pixel 7,iPhone 15 Pro").split(",")) {
  const device = devices[name.trim()];
  if (!device) {
    console.log(`${name}: UNKNOWN DEVICE — INCONCLUSIVE`);
    unmeasured += 1;
    continue;
  }
  const engine = /iphone|ipad|safari/i.test(name) ? webkit : chromium;
  let browser;

  try {
    // Inside the try: a browser that will not start measured nothing, and an
    // uncaught throw here would exit 1, the code for "reproduced".
    browser = await engine.launch();
    const ctx = await browser.newContext({ ...device, locale: "en-US" });
    await ctx.addCookies(stagingCookies(ORIGIN)).catch(() => {});
    const page = await ctx.newPage();

    await page.goto(`${ORIGIN}/survey`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    // The banner covers 316px of a phone and could sit over the button.
    await page
      .locator(".cky-btn-accept")
      .first()
      .click({ timeout: 8_000 })
      .catch(() => {});

    // What a tab that finished and came back holds: the kept session id, the
    // finished report, and no answers or step (submitting clears both).
    await page.evaluate(
      ([token, old]) => {
        localStorage.removeItem("loveiq-survey-answers");
        localStorage.removeItem("loveiq-survey-index");
        localStorage.removeItem("loveiq-survey-pending-completion");
        sessionStorage.removeItem("loveiq-survey-step");
        sessionStorage.setItem("loveiq-survey-session", old);
        sessionStorage.setItem("loveiq-completed-report", token);
      },
      [TOKEN, OLD_SESSION]
    );
    // The page reads the finished report once, on mount.
    await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });

    const startOver = page.getByRole("button", { name: /start a new one/i });
    const shown = await startOver
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!shown) {
      console.log(`${name}: no "Start a new one" button on the finished screen — INCONCLUSIVE`);
      unmeasured += 1;
      continue;
    }
    await startOver.click({ timeout: 15_000 });
    await page.waitForTimeout(1_000);

    if (process.env.MUTATE === "1") {
      await page.evaluate(
        (old) => sessionStorage.setItem("loveiq-survey-session", old),
        OLD_SESSION
      );
    }

    const state = await page.evaluate(() => ({
      session: sessionStorage.getItem("loveiq-survey-session"),
      finished: sessionStorage.getItem("loveiq-completed-report"),
    }));

    if (state.finished !== null) {
      // The press never reached the handler, so this run says nothing either way.
      console.log(`${name}: the press did not clear the finished screen — INCONCLUSIVE`);
      unmeasured += 1;
    } else if (state.session === OLD_SESSION) {
      console.log(
        `${name}: FAIL — after "Start a new one" the tab keeps the finished run's ` +
          `session id, so the new answers would be filed under the old submission`
      );
      bad += 1;
    } else {
      console.log(`${name}: ok — "Start a new one" drops the finished run's session id`);
    }
  } catch (err) {
    // A site that cannot be reached is not a defect.
    console.log(`${name}: exception: ${String(err.message).split("\n")[0].slice(0, 120)}`);
    unmeasured += 1;
  } finally {
    await browser?.close();
  }
}

if (bad > 0) {
  console.log(`\n${bad} device(s) would file a new run under the finished one.`);
  process.exit(1);
}
if (unmeasured > 0) {
  console.log(`\nINCONCLUSIVE — ${unmeasured} device(s) could not be measured.`);
  process.exit(3);
}
console.log('\nclean — "Start a new one" starts a new submission.');
process.exit(0);
