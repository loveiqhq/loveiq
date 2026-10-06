/**
 * Does a reader with a valid report ever get told to start the survey again?
 *
 * Mark, 2026-08-30: "I have also now seen it twice that users click a CTA that
 * should push them towards conversion and it triggers them to start the survey
 * from scratch." The mechanism is not a misfiring conversion CTA — it is the
 * report's failure screens. `ReportPage.tsx` renders "Take the survey" as the
 * ONLY way forward for a 404 and for `status === "missing"`, so anyone whose
 * report session is not found is invited to redo all 56 questions.
 *
 * This probe asserts the case that must never happen: a VALID report token
 * rendering a restart CTA. It does not judge the genuinely-lost-session screen,
 * which is a product decision (offer recovery by email instead of a restart) —
 * it guards the regression where a working report starts showing that door.
 *
 *   REPORT_ORIGIN=https://www.loveiq.org node scripts/probes/verify-no-survey-restart.mjs
 *   MUTATE=1 ...   # injects the restart CTA — every device must FAIL
 *
 * Covers criterion L1/B1 in the review protocol: navigation that sends a reader
 * backwards through the funnel.
 */
import { chromium, webkit, devices } from "playwright";
import { stagingCookies } from "./staging-cookie.mjs";

const ORIGIN = process.env.REPORT_ORIGIN ?? "https://www.loveiq.org";
const TOKEN = process.env.REPORT_TOKEN ?? "rpt_a9LY0Obbla1FVsclJ1nM";

// Exit 0 clean, 1 the defect reproduced, 3 could not measure.
// verify-ux-findings.mjs reads 1 as "reproduced in production" and opens a
// draft PR for this criterion, so a page that merely failed to load must NOT
// come back as 1. See scripts/probes/README.md.
let bad = 0;
let unmeasured = 0;
/**
 * Hoisted so the summary can count what actually ran.
 *
 * The summary line was `${2 - bad}/2 devices`, a hardcoded denominator from
 * when the default list was the only list. `devicesForSession()` sends ONE
 * device whenever the reader's viewport never changed — which is most sessions
 * — so a clean single-device run reported "2/2 devices" and a verdict quoting
 * it claimed evidence from a device that was never launched.
 */
const DEVICE_LIST = (process.env.DEVICES ?? "Pixel 7,iPhone 15 Pro")
  .split(",")
  .map((n) => n.trim())
  .filter(Boolean);
for (const name of DEVICE_LIST) {
  // `devices[unknown]` is undefined and `newContext({ ...undefined })` is a
  // plain desktop window — no touch, no phone width, no error. The run would
  // pass and be quoted as evidence about a phone. verify-survey-loop.mjs
  // already refuses this; the two probes share a criterion, so they share the
  // guard.
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
  const notes = [];

  try {
    if (process.env.MUTATE === "1") {
      // The defect this guards against: a working report offering a way back to
      // the start of the funnel.
      await page.addInitScript(() => {
        addEventListener("load", () => {
          const a = document.createElement("a");
          a.href = "/survey";
          a.textContent = "Take the survey";
          a.className = "report-button";
          document.body.appendChild(a);
        });
      });
    }

    await page.goto(`${ORIGIN}/report/${TOKEN}`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await page
      .waitForSelector(".report-status-card__spinner", { state: "detached", timeout: 120_000 })
      .catch(() => {});
    await page.waitForTimeout(2500);

    const state = await page.evaluate(() => {
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width > 2 && r.height > 2 && cs.visibility !== "hidden" && cs.display !== "none";
      };
      /**
       * Only a restart offered as THE WAY FORWARD counts.
       *
       * The first version flagged the grey "Survey" link in the site footer —
       * ordinary navigation at the bottom of an 80,000px page, not a trap — and
       * so failed on a perfectly healthy report. The defect shape is narrower:
       * `ReportPage.tsx` renders a restart inside a status card, or as a
       * `.report-button` primary action. Footer and nav links are excluded by
       * construction, because neither is one of those.
       */
      const restarts = [...document.querySelectorAll("a[href], button")]
        .filter(visible)
        .filter((el) => {
          const href = el.getAttribute("href") ?? "";
          const label = (el.textContent ?? "").trim().toLowerCase();
          const goesBack =
            /^\/survey(\?|$)/.test(href) || /take the survey|survey again|start over/.test(label);
          if (!goesBack) return false;
          return (
            el.closest(".report-status-card, .report-status-screen") !== null ||
            el.classList.contains("report-button")
          );
        })
        .map((el) => `${el.tagName.toLowerCase()}:${(el.textContent ?? "").trim().slice(0, 30)}`);

      return {
        restarts,
        // A status screen means the report itself did not load, so "no restart
        // CTA" would be a vacuous pass.
        onStatusScreen: !!document.querySelector(".report-status-screen"),
        reportRendered:
          document.querySelectorAll("[class^='report-'], [class*=' report-']").length > 50,
      };
    });

    if (state.onStatusScreen || !state.reportRendered) {
      notes.push("INCONCLUSIVE: the report did not render, so nothing was proven");
      unmeasured += 1;
    } else if (state.restarts.length > 0) {
      notes.push(`RESTART CTA on a valid report: ${state.restarts.join(", ")}`);
      bad += 1;
    } else {
      notes.push("no way back to the survey on a valid report");
    }
  } catch (e) {
    notes.push(`exception: ${String(e.message).split("\n")[0].slice(0, 70)}`);
    unmeasured += 1;
  }

  const ok = notes.some((n) => n.startsWith("no way back"));
  console.log(`${ok ? "PASS" : "FAIL"} ${name.padEnd(15)} ${notes.join(" | ")}`);
  await ctx.close();
  await browser.close();
}

console.log(
  `\n${DEVICE_LIST.length - bad}/${DEVICE_LIST.length} devices: ` +
    `a valid report offers no way back to the survey`
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
