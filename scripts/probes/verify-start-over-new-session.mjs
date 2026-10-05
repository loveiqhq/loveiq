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
 * The same loss had a second door (round-9 audit): Back from the screens after
 * submitting lands on the consent screen, and "I agree" started a fresh run under
 * the finished id. The audit found 13 sessions since March that answered the whole
 * survey again after completing it, none with a second submission.
 *
 * A third door (round-10 audit): Back to the consent screen, then the browser's
 * Forward button, remounts the survey without passing "I agree" at all. A fourth
 * (round-11): the landing page's question saves an answer, and /survey then opens
 * straight into the survey, again past "I agree".
 *
 * This probe puts the tab in the finished state three times per device:
 *   A. on the already-finished screen, presses "Start a new one";
 *   B. on the consent screen, ticks both boxes and presses "I agree";
 *   C. on the consent screen with the survey one step ahead, presses Forward;
 *   D. with an answer saved by the landing page's question, opens /survey;
 * and each time reads the session id the next run would submit under. It stops
 * there on purpose, and every request to /api/ other than a GET is aborted:
 * finishing the survey would write a real submission, and the engine that B and
 * C open would send tracking events. Loading /survey still counts as a visit in
 * our own tables and, with the banner accepted, in GA4 and Clarity, as every
 * probe that loads a page does.
 *
 *   REPORT_ORIGIN=https://www.loveiq.org node scripts/probes/verify-start-over-new-session.mjs
 *   MUTATE=1 ...   # puts the old id back after each press; must exit 1
 *
 * Exit 0 clean, 1 reproduced, 3 could not measure.
 */
import { chromium, webkit, devices } from "playwright";
import { stagingCookies } from "./staging-cookie.mjs";

const ORIGIN = process.env.REPORT_ORIGIN ?? "https://www.loveiq.org";
/** Only rendered as a link on the finished screen, never opened. */
const TOKEN = "rpt_probe_start_over";
const OLD_SESSION = "probe-finished-session";
const MUTATE = process.env.MUTATE === "1";

/** What a tab that finished holds: the kept session id and the finished report, no answers. */
async function seedFinished(page, step) {
  await page.evaluate(
    ([token, old, at]) => {
      localStorage.removeItem("loveiq-survey-answers");
      localStorage.removeItem("loveiq-survey-index");
      localStorage.removeItem("loveiq-survey-pending-completion");
      if (at === null) sessionStorage.removeItem("loveiq-survey-step");
      else sessionStorage.setItem("loveiq-survey-step", at);
      sessionStorage.setItem("loveiq-survey-session", old);
      sessionStorage.setItem("loveiq-completed-report", token);
    },
    [TOKEN, OLD_SESSION, step]
  );
  // The page reads the step and the finished report once, on mount.
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
}

async function sessionAfter(page) {
  if (MUTATE) {
    await page.evaluate((old) => sessionStorage.setItem("loveiq-survey-session", old), OLD_SESSION);
  }
  return page.evaluate(() => ({
    session: sessionStorage.getItem("loveiq-survey-session"),
    finished: sessionStorage.getItem("loveiq-completed-report"),
    step: sessionStorage.getItem("loveiq-survey-step"),
  }));
}

/** A. The already-finished screen's "Start a new one". */
async function startOver(page) {
  await seedFinished(page, null);
  const button = page.getByRole("button", { name: /start a new one/i });
  const shown = await button
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (!shown) return ["inconclusive", 'no "Start a new one" button on the finished screen'];
  await button.click({ timeout: 15_000 });
  await page.waitForTimeout(1_000);
  const state = await sessionAfter(page);
  // The press never reached the handler, so this run says nothing either way.
  if (state.finished !== null)
    return ["inconclusive", "the press did not clear the finished screen"];
  if (state.session === OLD_SESSION) {
    return ["fail", '"Start a new one" keeps the finished run\'s session id'];
  }
  return ["ok", '"Start a new one" drops the finished run\'s session id'];
}

/** B. Back to the consent screen after finishing, then "I agree". */
async function agreeAgain(page) {
  await seedFinished(page, "5");
  const boxes = page.getByRole("checkbox");
  const ready = await boxes
    .nth(1)
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (!ready) return ["inconclusive", "no consent screen with two boxes"];
  await boxes.nth(0).click({ timeout: 15_000 });
  await boxes.nth(1).click({ timeout: 15_000 });
  await page.getByRole("button", { name: /i agree/i }).click({ timeout: 15_000 });
  // The press hands over after a 400 ms exit animation, and the engine takes the id on mount.
  await page.waitForTimeout(2_000);
  const state = await sessionAfter(page);
  if (state.step !== "6")
    return ["inconclusive", `"I agree" did not open the survey (step ${state.step})`];
  if (state.session === OLD_SESSION) {
    return ["fail", '"I agree" after finishing starts the new run under the finished session id'];
  }
  return ["ok", '"I agree" after finishing starts the new run under a new session id'];
}

/** C. Back to the consent screen after finishing, then the browser's Forward button. */
async function forwardAgain(page) {
  await seedFinished(page, "5");
  const ready = await page
    .getByRole("button", { name: /i agree/i })
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (!ready) return ["inconclusive", "no consent screen to go forward from"];
  // The history the page itself writes: the survey one entry ahead of consent.
  await page.evaluate(() => {
    history.pushState({ surveyStep: 6 }, "");
    history.back();
  });
  await page.waitForTimeout(500);
  await page.goForward({ timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(2_000);
  const state = await sessionAfter(page);
  if (state.step !== "6")
    return ["inconclusive", `Forward did not open the survey (step ${state.step})`];
  if (state.session === OLD_SESSION) {
    return ["fail", "Forward after finishing starts the new run under the finished session id"];
  }
  return ["ok", "Forward after finishing starts the new run under a new session id"];
}

/** D. An answer from the landing page's question, then /survey. */
async function landingAgain(page) {
  await page.evaluate(
    ([token, old]) => {
      localStorage.removeItem("loveiq-survey-index");
      localStorage.removeItem("loveiq-survey-pending-completion");
      // A submit clears the run's consent (clearPersistedSurveyState), so a reader who
      // finished meets the consent screen again. B's "I agree" saved one on this page.
      localStorage.removeItem("loveiq-survey-consent");
      sessionStorage.removeItem("loveiq-survey-step");
      // The shape saveLandingPrefill writes.
      localStorage.setItem(
        "loveiq-survey-answers",
        JSON.stringify({
          answers: { probe_landing_question: 3 },
          startedAt: new Date().toISOString(),
          prefilled: ["probe_landing_question"],
        })
      );
      sessionStorage.setItem("loveiq-survey-session", old);
      sessionStorage.setItem("loveiq-completed-report", token);
    },
    [TOKEN, OLD_SESSION]
  );
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForTimeout(3_000);
  // Since #495 a draft from the card opens the consent screen first, so this door is the
  // card, then "I agree", as a reader who finished would meet it.
  const boxes = page.getByRole("checkbox");
  if ((await sessionAfter(page)).step === "5" && (await boxes.count()) >= 2) {
    await boxes.nth(0).click({ timeout: 15_000 });
    await boxes.nth(1).click({ timeout: 15_000 });
    await page.getByRole("button", { name: /i agree/i }).click({ timeout: 15_000 });
    await page.waitForTimeout(2_000);
  }
  const state = await sessionAfter(page);
  if (state.step !== "6")
    return ["inconclusive", `the saved answer did not open the survey (step ${state.step})`];
  if (state.session === OLD_SESSION) {
    return [
      "fail",
      "a landing answer after finishing starts the new run under the finished session id",
    ];
  }
  return ["ok", "a landing answer after finishing starts the new run under a new session id"];
}

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
    // Nothing this probe does may submit or save survey data.
    await page.route("**/api/**", (route) =>
      route.request().method() === "GET" ? route.continue() : route.abort()
    );

    await page.goto(`${ORIGIN}/survey`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    // The banner covers 316px of a phone and could sit over the buttons.
    await page
      .locator(".cky-btn-accept")
      .first()
      .click({ timeout: 8_000 })
      .catch(() => {});

    for (const [label, scenario] of [
      ["A", startOver],
      ["B", agreeAgain],
      ["C", forwardAgain],
      ["D", landingAgain],
    ]) {
      const [verdict, what] = await scenario(page);
      if (verdict === "fail") {
        console.log(
          `${name} ${label}: FAIL — ${what}, so the new answers would be filed under the old submission`
        );
        bad += 1;
      } else if (verdict === "inconclusive") {
        console.log(`${name} ${label}: ${what} — INCONCLUSIVE`);
        unmeasured += 1;
      } else {
        console.log(`${name} ${label}: ok — ${what}`);
      }
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
  console.log(`\n${bad} check(s) would file a new run under the finished one.`);
  process.exit(1);
}
if (unmeasured > 0) {
  console.log(`\nINCONCLUSIVE — ${unmeasured} check(s) could not be measured.`);
  process.exit(3);
}
console.log("\nclean — starting again after finishing always starts a new submission.");
process.exit(0);
