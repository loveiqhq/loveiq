/**
 * Does finishing the survey and pressing Back land the reader on the start screen?
 *
 * WHY THIS EXISTS. Six findings in twelve hours said the same thing — "the
 * survey restarted at the beginning", "unexpectedly looped back to the survey
 * start screen, resetting their progress entirely", "loops back to the 18+
 * consent/start screen" — and all six were classified L1 and handed to
 * `verify-no-survey-restart.mjs`, which only ever loads `/report/<token>` and
 * asks whether a VALID report offers a survey restart. That probe cannot see
 * the survey, so it returned clean on every device, and the verifier posted
 * "loop back to an earlier screen (L1) passes in production now" into six
 * readers' Slack threads. A probe answering about a surface it never visited
 * is worse than no probe: it is the false confidence the whole pipeline exists
 * to prevent, committed by the verification layer itself.
 *
 * THE MECHANISM, read from our own code. `handleReturn(true, token)` in
 * `SurveyPage.tsx` fires when the reader leaves for their report. It calls
 * `clearPersistedSurveyState({ clearPendingCompletion: true, clearSurveySession:
 * false })` — which removes the answers, the index and the pending completion —
 * then `sessionStorage.removeItem(SURVEY_STEP_KEY)`, then navigates to the
 * report. The survey SESSION id is deliberately kept and copied to the report
 * session, so the tab still knows this reader completed the survey. But
 * `loadInitialStep()` reads only the step key and the answers, finds neither,
 * and returns 0 — the intro. The survey page pushes a history entry per step,
 * so Back from the report lands right back in it.
 *
 * This probe puts the browser in that exact state and presses Back.
 *
 *   REPORT_ORIGIN=https://www.loveiq.org node scripts/probes/verify-survey-loop.mjs
 *   DEVICES="Pixel 9,iPhone SE" node scripts/probes/verify-survey-loop.mjs
 *
 * Exit 0 clean, 1 the loop reproduced, 3 could not measure. A page that failed
 * to load is NOT a reproduction — see scripts/probes/README.md.
 */
import { chromium, webkit, devices } from "playwright";
import { stagingCookies } from "./staging-cookie.mjs";

const ORIGIN = process.env.REPORT_ORIGIN ?? "https://www.loveiq.org";
const TOKEN = process.env.REPORT_TOKEN ?? "rpt_a9LY0Obbla1FVsclJ1nM";

/**
 * The intro screen's own headline. Asserting on copy is fragile, so the probe
 * never treats "I did not find it" as clean on its own: a page that rendered
 * almost nothing is reported as unmeasured instead. The engine renders its
 * questions without an h1, which is why every heading level is collected —
 * looking only at h1 made a FIXED survey indistinguishable from a blank one.
 */
const INTRO_HEADING = /prepare you/i;

/**
 * A page with no heading AND almost no text did not render, whatever it
 * returned. Both halves matter: a bare character floor called the FIXED
 * survey unrendered, because the "already finished" screen is deliberately
 * short (182 characters) — shorter than the intro it replaced.
 */
const MIN_RENDERED_CHARS = 60;

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
  const browser = await engine.launch();
  const ctx = await browser.newContext({ ...device, locale: "en-US" });
  await ctx.addCookies(stagingCookies(ORIGIN)).catch(() => {});
  const page = await ctx.newPage();

  try {
    // 1. The reader is on the survey. The banner is dismissed because it covers
    //    316px of the viewport and would otherwise be all we could read.
    await page.goto(`${ORIGIN}/survey`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page
      .locator(".cky-btn-accept")
      .first()
      .click({ timeout: 8_000 })
      .catch(() => {});
    await page.waitForTimeout(2_000);

    // 2. Exactly what handleReturn(true, token) leaves behind. Not invented:
    //    every key here is one that function touches, with the survey session
    //    kept because it passes clearSurveySession: false.
    const mutate = process.env.MUTATE === "1";
    await page.evaluate(
      ([token, mutate]) => {
        localStorage.removeItem("loveiq-survey-answers");
        localStorage.removeItem("loveiq-survey-index");
        localStorage.removeItem("loveiq-survey-pending-completion");
        sessionStorage.removeItem("loveiq-survey-step");
        sessionStorage.setItem("loveiq-survey-session", "probe-completed-session");
        sessionStorage.setItem("loveiq-report-session", "probe-completed-session");
        // What a finished tab carries: useSubmitSurvey records the token the
        // moment the submit response returns it. Production ignored this key
        // entirely before 2026-09-17, which is why seeding it still reproduces
        // there — and why this probe is the regression guard for the fix.
        // MUTATE=1 withholds exactly this key, which is the regression: before
        // 2026-09-17 nothing recorded which report a finished tab belonged to, so
        // loadInitialStep() found no step and no answers and fell through to the
        // intro. A probe that only ever passes is as useless as one that only
        // ever fails, and production is fixed now — this is what keeps it honest.
        if (!mutate) sessionStorage.setItem("loveiq-completed-report", token);
      },
      [TOKEN, mutate]
    );

    // The inverse of MUTATE: a probe that can only ever FAIL is as useless as
    // one that can only pass, and this one fails on production today. Keeping
    // the step key is what a fix would amount to — loadInitialStep() would then
    // find a position and never fall through to the intro — so SIMULATE_FIX=1
    // must make this same probe exit 0. Run both before trusting either.
    if (process.env.SIMULATE_FIX === "1") {
      await page.evaluate(() => sessionStorage.setItem("loveiq-survey-step", "6"));
    }

    // 3. Where handleReturn sends them.
    await page.goto(`${ORIGIN}/report/${TOKEN}`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await page.waitForTimeout(3_000);
    const onReport = await page.evaluate(() => location.pathname.startsWith("/report"));
    if (!onReport) {
      console.log(`${name}: the report never loaded — INCONCLUSIVE`);
      unmeasured += 1;
      continue;
    }

    // 4. Back.
    await page.goBack({ waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(2_500);

    const state = await page.evaluate(() => ({
      path: location.pathname,
      headings: [...document.querySelectorAll("h1, h2, h3")]
        .map((h) => (h.textContent ?? "").replace(/\s+/g, " ").trim())
        .filter(Boolean),
      chars: (document.body.innerText ?? "").replace(/\s+/g, " ").trim().length,
      step: sessionStorage.getItem("loveiq-survey-step"),
      completed: sessionStorage.getItem("loveiq-survey-session"),
    }));
    const intro = state.headings.find((h) => INTRO_HEADING.test(h));

    if (!state.path.startsWith("/survey")) {
      // Back did not return to the survey at all; this run says nothing about
      // the claim either way.
      console.log(`${name}: back went to ${state.path}, not the survey — INCONCLUSIVE`);
      unmeasured += 1;
    } else if (state.headings.length === 0 && state.chars < MIN_RENDERED_CHARS) {
      console.log(`${name}: ${state.path} rendered ${state.chars} chars — INCONCLUSIVE`);
      unmeasured += 1;
    } else if (intro) {
      // Read by a human in a Slack thread, so it says what happened rather
      // than echoing the probe's own seed values.
      console.log(
        `${name}: FAIL — after finishing the survey, Back from the report lands ` +
          `on the intro screen ("${intro.slice(0, 40)}") with progress reset to step ` +
          `${state.step}, even though this tab still holds the completed survey session`
      );
      bad += 1;
    } else {
      console.log(
        `${name}: ok — back lands on "${(state.headings[0] ?? `${state.chars} chars`).slice(0, 48)}", ` +
          `step=${state.step}`
      );
    }
  } catch (err) {
    // A site that cannot be reached is not a defect. Exiting 1 here would let a
    // timeout manufacture a reproduction, which is the failure this contract
    // was written for.
    console.log(`${name}: exception: ${String(err.message).split("\n")[0].slice(0, 120)}`);
    unmeasured += 1;
  } finally {
    await browser.close();
  }
}

if (bad > 0) {
  console.log(`\n${bad} device(s) looped back to the survey start after finishing.`);
  process.exit(1);
}
if (unmeasured > 0) {
  console.log(`\nINCONCLUSIVE — ${unmeasured} device(s) could not be measured.`);
  process.exit(3);
}
console.log("\nclean — finishing the survey does not return the reader to the start.");
process.exit(0);
