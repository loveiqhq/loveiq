#!/usr/bin/env node
/**
 * Does closing the paywall leave a desktop reader where they were?
 *
 * Mark, desktop review 30.09: "When the paywall pop up comes and you exit it, it
 * scrolls up weirdly." Two causes, both measured at 1440 that day, both invisible to a
 * unit test because they need the real page, its smooth scroll and a real wheel:
 *
 *  1. FOCUS. Closing hands focus back to what had it when the pop-up opened. It opens by
 *     itself as the reader scrolls, so that is what they last clicked, often a chapter
 *     head far above, and focusing it scrolled the page up to it: 11141 → 4247 in a
 *     second.
 *  2. LENIS. The page's smooth scroll was never told about the body-scroll lock. While
 *     the body is fixed the page has no height, and Lenis re-measures 250ms after a
 *     resize, so a wheel tick in the first ~250ms after closing glided the reader to
 *     the top: 14741 → 0.
 *
 * Each width runs both, on a fresh page. A run clicks a chapter head first (scenario 1
 * only), wheels down until the pop-up opens on its own, closes it, and then:
 *  1. the window must hold within 2px for a second;
 *  2. a wheel tick sent at once must move it DOWN, by about the tick.
 * Chromium only: Lenis runs for a mouse, and WebKit has no `mouse.wheel` (README).
 *
 * USAGE
 *   node scripts/probes/verify-paywall-close-holds.mjs                 # local dev on :3000
 *   ORIGIN=http://localhost:3100 WIDTHS=1280,1920 node scripts/probes/verify-paywall-close-holds.mjs
 *   MUTATE=1 node scripts/probes/verify-paywall-close-holds.mjs        # must FAIL everywhere
 *
 * MUTATE=1 re-creates both old behaviours after the close: it focuses the chapter head
 * without `preventScroll`, and jumps the window to the top in place of the wheel. A page
 * on which the pop-up never opens, or with no smooth scroll running, is INCONCLUSIVE,
 * which fails the run like a FAIL does.
 */
import { chromium } from "playwright";
import { stagingCookies } from "./staging-cookie.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://localhost:3000";
const PATH = process.env.PATH_ ?? "/report?preview=1&v4=1";
const WIDTHS = (process.env.WIDTHS ?? "1280,1440,1920").split(",").map(Number);
const MUTATE = process.env.MUTATE === "1";

/** Load the locked report and wheel down until the pop-up opens by itself. */
async function openByScrolling(browser, width, { clickFirst }) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  await context.addCookies(stagingCookies(ORIGIN));
  const page = await context.newPage();
  await page.goto(ORIGIN + PATH, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.waitForSelector(".rv4-chapter__button", { timeout: 120_000 });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.waitForTimeout(3000);
  if (!(await page.evaluate(() => document.documentElement.classList.contains("lenis")))) {
    return { context, page, skip: "no smooth scroll running" };
  }
  if (clickFirst) {
    const head = page.locator(".rv4-chapter__button").first();
    await head.scrollIntoViewIfNeeded();
    await head.click();
    await page.waitForTimeout(800);
  }
  const isOpen = () =>
    page.evaluate(() => !!document.querySelector(".report-pricing-modal.is-visible"));
  for (let i = 0; i < 160 && !(await isOpen()); i++) {
    await page.mouse.move(width / 2, 450);
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(150);
  }
  if (!(await isOpen())) return { context, page, skip: "the paywall never opened" };
  await page.waitForTimeout(1500);
  const y = await page.evaluate(() => Math.round(-parseFloat(document.body.style.top || "0")));
  return { context, page, y };
}

const scrollY = (page) => page.evaluate(() => Math.round(window.scrollY));

async function holdsAfterClose(browser, width) {
  const label = `${width} focus: the page holds after closing`;
  const { context, page, y, skip } = await openByScrolling(browser, width, { clickFirst: true });
  try {
    if (skip) return { label, verdict: "INCONCLUSIVE", detail: [skip] };
    await page.locator(".report-pricing-modal__close").click();
    if (MUTATE) {
      // The fixed close has already focused it, without scrolling; focusing the focused
      // element again would do nothing, so let go of it first.
      await page.evaluate(() => {
        document.activeElement?.blur?.();
        document.querySelector(".rv4-chapter__button")?.focus();
      });
    }
    const seen = [];
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(125);
      seen.push(await scrollY(page));
    }
    const moved = seen.find((s) => Math.abs(s - y) > 2);
    return moved === undefined
      ? { label, verdict: "PASS", detail: [] }
      : { label, verdict: "FAIL", detail: [`at ${y} before closing, then ${seen.join(" → ")}`] };
  } finally {
    await context.close();
  }
}

async function followsTheWheel(browser, width) {
  const label = `${width} lenis: a wheel tick right after closing scrolls down`;
  const { context, page, y, skip } = await openByScrolling(browser, width, { clickFirst: false });
  try {
    if (skip) return { label, verdict: "INCONCLUSIVE", detail: [skip] };
    await page.keyboard.press("Escape");
    if (MUTATE) {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    } else {
      await page.mouse.move(width / 2, 450);
      await page.mouse.wheel(0, 120);
    }
    await page.waitForTimeout(1200);
    const after = await scrollY(page);
    const ok = after > y + 40 && after < y + 400;
    return ok
      ? { label, verdict: "PASS", detail: [] }
      : { label, verdict: "FAIL", detail: [`at ${y} before closing, ${after} after one tick`] };
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch();
const results = [];
for (const width of WIDTHS) {
  for (const check of [holdsAfterClose, followsTheWheel]) {
    try {
      results.push(await check(browser, width));
    } catch (e) {
      results.push({
        label: `${width} ${check.name}`,
        verdict: "INCONCLUSIVE",
        detail: [String(e.message).split("\n")[0].slice(0, 140)],
      });
    }
  }
}
await browser.close();

for (const r of results) {
  console.log(`${r.verdict.padEnd(12)} ${r.label}`);
  for (const d of r.detail) console.log(`             ${d}`);
}
const failed = results.filter((r) => r.verdict !== "PASS");
if (MUTATE) {
  // Every check must catch the re-created jump; one that still passes cannot see it.
  const survived = results.filter((r) => r.verdict === "PASS");
  console.log(
    survived.length
      ? `\nMUTATE: ${survived.length} check(s) missed the re-created jump`
      : "\nMUTATE: every check caught the re-created jump"
  );
  process.exit(survived.length ? 1 : 0);
}
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
process.exit(failed.length ? 1 : 0);
