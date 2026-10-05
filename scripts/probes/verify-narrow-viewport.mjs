/**
 * Does anything overflow the viewport on a genuinely narrow screen?
 *
 * 3% of sessions in the 30 days to 2026-09-14 were under 348px wide, and the
 * narrowest observed was 262px — a Samsung Galaxy Z Flip (SM-F741U) whose
 * viewport moved between 262px and 715px as it folded. Our device matrix starts
 * at 320px, so nothing below that was ever rendered before this.
 *
 * It found a real defect: the reference lists print bare citation URLs, several
 * of them as plain italics rather than links, and a URL has no spaces to break
 * at — 123px past the edge on a 262px viewport.
 *
 *   REPORT_ORIGIN=https://www.loveiq.org node scripts/probes/verify-narrow-viewport.mjs
 *   MUTATE=1 ...   # removes the wrapping — narrow widths must FAIL
 *
 * TWO MEASUREMENT TRAPS, both of which produced a wrong answer first:
 *
 *  - `getBoundingClientRect()` on a WRAPPED inline element returns the union of
 *    its line boxes, which spans the whole column and reads as overflowing when
 *    nothing is. That reported 142 false overflows. Inlines are judged by their
 *    individual `getClientRects()` instead.
 *  - The decorative hero orb bleeds past the edge on purpose, and the stage
 *    carousel is a horizontal scroller whose off-screen cards are the point.
 *    Counting those put the number at 230 and hid the 8 that mattered.
 */
import { chromium } from "playwright";
import { stagingCookies } from "./staging-cookie.mjs";

const ORIGIN = process.env.REPORT_ORIGIN ?? "https://www.loveiq.org";
const TOKEN = process.env.REPORT_TOKEN ?? "rpt_a9LY0Obbla1FVsclJ1nM";
const WIDTHS = (process.env.WIDTHS ?? "262,300,320").split(",").map(Number);

const browser = await chromium.launch();
// Exit 0 clean, 1 the defect reproduced, 3 could not measure.
// verify-ux-findings.mjs reads 1 as "reproduced in production" and opens a
// draft PR for this criterion, so a page that merely failed to load must NOT
// come back as 1. See scripts/probes/README.md.
let bad = 0;
let unmeasured = 0;

for (const width of WIDTHS) {
  const ctx = await browser.newContext({
    viewport: { width, height: 640 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; SM-F741U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36",
  });
  await ctx.addCookies(stagingCookies(ORIGIN)).catch(() => {});
  const page = await ctx.newPage();

  /**
   * Everything that touches the network is inside the try. An uncaught throw
   * exits 1, and 1 means "the defect reproduced" — so a timeout or a refused
   * connection reported a defect nobody measured, on a criterion allowed to
   * open a pull request. Verified before the fix: REPORT_ORIGIN=http://localhost:1
   * exited 1. The stdout backstop in verify-ux-findings.mjs does not save it
   * either — a Playwright stack says "net::ERR_CONNECTION_REFUSED", which
   * matches neither "INCONCLUSIVE" nor "exception:".
   */
  try {
    await page.goto(`${ORIGIN}/report/${TOKEN}`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await page
      .waitForSelector(".report-status-card__spinner", { state: "detached", timeout: 120_000 })
      .catch(() => {});
    await page.waitForTimeout(2500);

    if (process.env.MUTATE === "1") {
      await page.addStyleTag({
        content: ".report-prose, .report-prose a { overflow-wrap: normal !important; }",
      });
      await page.waitForTimeout(400);
    }

    const result = await page.evaluate(() => {
      const vw = window.innerWidth;
      const offenders = [...document.querySelectorAll("body *")]
        .filter((el) => {
          const box = el.getBoundingClientRect();
          if (box.width < 2 || box.height < 2) return false;
          const cs = getComputedStyle(el);
          if (cs.position === "fixed") return false;
          // Horizontal scrollers and the decorative bleed are outside the
          // viewport by design.
          if (el.closest(".stage-explorer__carousel, .rpm-tm__track")) return false;
          if (/orb|carousel|stage-card|marquee/.test(String(el.className))) return false;
          if (cs.display === "inline") {
            return [...el.getClientRects()].some((r) => r.right > vw + 2 || r.left < -2);
          }
          return box.right > vw + 2 || box.left < -2;
        })
        .slice(0, 5)
        .map((el) => `${el.tagName.toLowerCase()}:${(el.textContent ?? "").trim().slice(0, 34)}`);

      return {
        hScroll: Math.round(document.documentElement.scrollWidth - vw),
        offenders,
        rendered: document.querySelectorAll("[class^='report-'], [class*=' report-']").length > 50,
      };
    });

    let note;
    if (!result.rendered) {
      note = "INCONCLUSIVE: the report did not render";
      unmeasured += 1;
    } else if (result.hScroll > 2 || result.offenders.length > 0) {
      note = `overflow: h-scroll ${result.hScroll}px, ${result.offenders.join(" | ")}`;
      bad += 1;
    } else {
      note = "nothing overflows the viewport";
    }
    console.log(
      `${note.startsWith("nothing") ? "PASS" : "FAIL"} ${String(width).padStart(4)}px  ${note}`
    );
  } catch (err) {
    unmeasured += 1;
    console.log(
      `INCONCLUSIVE ${String(width).padStart(4)}px  ${String(err.message).split("\n")[0].slice(0, 70)}`
    );
  } finally {
    await ctx.close().catch(() => {});
  }
}

await browser.close();
console.log(`\n${WIDTHS.length - bad}/${WIDTHS.length} widths: nothing overflows`);
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
