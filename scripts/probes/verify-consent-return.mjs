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

const ORIGIN = process.env.ORIGIN ?? "http://localhost:3000";
const CONSENT_STEP = "5"; // TOTAL_STEPS (4) + 1 — SurveyPage.tsx

let bad = 0;
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
      // Re-create the defect: the button sends the user to the token-less
      // /report instead of the site root.
      await page.addInitScript(() => {
        // The button is rendered by React after load, so poll for it rather
        // than binding once — an init script that binds nothing mutates
        // nothing, and the probe then passes in both directions.
        const bind = () => {
          const hit = [...document.querySelectorAll("button")].find((b) =>
            /return to site/i.test(b.textContent ?? "")
          );
          if (!hit) return false;
          hit.addEventListener(
            "click",
            (e) => {
              e.stopImmediatePropagation();
              e.preventDefault();
              window.location.href = "/report";
            },
            true
          );
          return true;
        };
        const t = setInterval(() => {
          if (bind()) clearInterval(t);
        }, 100);
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
    bad++;
    notes.push(`FAIL ${String(err).split("\n")[0]}`);
  }

  console.log(`${name.padEnd(16)} ${notes.join(" | ")}`);
  await browser.close();
}

console.log(bad === 0 ? "\nPASS" : `\nFAIL (${bad})`);
process.exit(bad === 0 ? 0 : 1);
