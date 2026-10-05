/**
 * Does "Return to site" on the 18+ consent screen return the user to the site?
 *
 * It did not. The button was wired `onClick={onReturn}`, and `onReturn` IS
 * `handleReturn(clearAnswers?, reportToken?)`. React passes the MouseEvent as
 * the first argument, so `clearAnswers` was an object — truthy. Tapping it
 * therefore wiped the persisted survey answers and navigated to the token-less
 * `/report`, i.e. the "Can't find your report" screen, whose only CTA points
 * back at `/survey`. TypeScript could not see it: the prop was typed
 * `() => void`, which erases the parameters it was actually called with.
 *
 * Found 2026-09-14 while checking why PostHog scanners kept reporting a "loop
 * back to the survey start". Four sessions hit the token-less /report in two
 * months, so the blast radius is small — but the destination is plainly wrong.
 *
 *   node scripts/probes/verify-consent-return.mjs
 *   MUTATE=1 node scripts/probes/verify-consent-return.mjs   # must FAIL
 *
 * Covers criterion B1 (navigation that sends a user backwards through the
 * funnel) in the review protocol.
 */
import { chromium, webkit, devices } from "playwright";
import { stagingCookies } from "./staging-cookie.mjs";

/**
 * REPORT_ORIGIN, not ORIGIN, and production by default.
 *
 * This read `process.env.ORIGIN ?? "http://localhost:3000"` from the day it was
 * written. `verify-ux-findings.mjs` passes REPORT_ORIGIN and nothing anywhere
 * sets ORIGIN, so in CI this probe loaded a dead localhost, found no "Return to
 * site" button and reported inconclusive on every single run — while B1 sat in
 * AUTO_PR_CRITERIA, one of only three criteria allowed to open a pull request.
 * B1 has therefore never once been checked against production.
 */
const ORIGIN = process.env.REPORT_ORIGIN ?? process.env.ORIGIN ?? "https://www.loveiq.org";
const CONSENT_STEP = "5"; // TOTAL_STEPS (4) + 1 — SurveyPage.tsx

// Exit 0 clean, 1 the defect reproduced, 3 could not measure. B1 is in
// AUTO_PR_CRITERIA, so a run that merely timed out must not come back as 1 and
// open a draft PR asserting a defect nobody saw.
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
    await page.addInitScript((step) => {
      try {
        sessionStorage.setItem("loveiq-survey-step", step);
      } catch {}
    }, CONSENT_STEP);

    if (process.env.MUTATE === "1") {
      /**
       * Re-create the defect: the button sends the reader to the token-less
       * /report instead of the site root.
       *
       * ONE LISTENER ON THE DOCUMENT, NOT A POLL ON THE BUTTON. The previous
       * version polled every 100ms for the button and bound to it, which is a
       * race against the tap — measured 2026-09-17, it lost 1 run in 3, so
       * MUTATE=1 exited 0 and the probe silently claimed to be falsifiable when
       * it was not. B1 is one of the criteria allowed to open a pull request.
       *
       * A capture listener on the document is bound before any markup exists,
       * needs no polling, and runs before React's root-container listener, so
       * stopImmediatePropagation still beats the app's own handler.
       */
      await page.addInitScript(() => {
        document.addEventListener(
          "click",
          (e) => {
            const btn = e.target instanceof Element ? e.target.closest("button") : null;
            if (!btn || !/return to site/i.test(btn.textContent ?? "")) return;
            e.stopImmediatePropagation();
            e.preventDefault();
            window.location.href = "/report";
          },
          true
        );
      });
    }

    await page.goto(`${ORIGIN}/survey`, { waitUntil: "domcontentloaded" });

    const btn = page.getByRole("button", { name: /return to site/i });
    await btn.waitFor({ state: "visible", timeout: 20_000 });

    // Tap where a finger would land, and only after confirming the point
    // actually belongs to the button — sticky chrome has faked this before.
    const box = await btn.boundingBox();
    if (!box) throw new Error("no box for Return to site");
    const x = Math.round(box.x + box.width / 2);
    const y = Math.round(box.y + box.height / 2);
    const owned = await page.evaluate(
      ([px, py]) => {
        const el = document.elementFromPoint(px, py);
        const target = [...document.querySelectorAll("button")].find((b) =>
          /return to site/i.test(b.textContent ?? "")
        );
        return !!(el && target && (el === target || target.contains(el)));
      },
      [x, y]
    );
    if (!owned) throw new Error(`(${x},${y}) is not owned by the button`);

    await page.touchscreen.tap(x, y);
    await page.waitForURL((u) => new URL(u).pathname !== "/survey", { timeout: 15_000 });

    const path = new URL(page.url()).pathname;
    if (path !== "/") {
      bad++;
      notes.push(`FAIL landed on ${path}, expected /`);
    } else {
      notes.push("ok -> /");
    }
  } catch (err) {
    // A timeout or a missing button means the probe never reached the control
    // it measures — that is "could not check", not "the button is broken".
    unmeasured++;
    notes.push(`INCONCLUSIVE ${String(err).split("\n")[0]}`);
  }

  console.log(`${name.padEnd(16)} ${notes.join(" | ")}`);
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
