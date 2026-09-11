/**
 * Visual/layout audit of the survey and report on emulated phones.
 *
 * Automated checks that catch what a screenshot alone can miss:
 *   - horizontal overflow (document scrolls sideways)
 *   - images that failed to load (naturalWidth === 0)
 *   - content taller than the viewport while the body is scroll-locked
 *     (the shape that produces $dead_swipe: fingers do nothing)
 *   - inputs/controls under 16px, which make iOS auto-zoom the whole page
 *   - elements painted outside the viewport's left/right edges
 *
 *   REPORT_ORIGIN=https://www.loveiq.org node scripts/probes/audit-visual.mjs
 */
import { chromium, webkit, devices } from "playwright";
import { stagingCookies } from "./staging-cookie.mjs";
import { touchScroll } from "./touch.mjs";
import { mkdirSync } from "node:fs";

const ORIGIN = process.env.REPORT_ORIGIN ?? "https://www.loveiq.org";
const TOKEN = process.env.REPORT_TOKEN ?? "rpt_a9LY0Obbla1FVsclJ1nM";
const SHOTS = process.env.SHOT_DIR ?? "/tmp/liq-visual";
mkdirSync(SHOTS, { recursive: true });

const audit = () =>
  // eslint-disable-next-line no-undef
  ({
    horizontalOverflow: Math.round(document.documentElement.scrollWidth - window.innerWidth),
    brokenImages: [...document.querySelectorAll("img")]
      .filter((i) => i.complete && i.naturalWidth === 0 && (i.currentSrc || i.src))
      .map((i) => (i.currentSrc || i.src).slice(-60)),
    bodyOverflowHidden:
      getComputedStyle(document.body).overflow === "hidden" ||
      getComputedStyle(document.documentElement).overflow === "hidden",
    contentTallerThanViewport: Math.round(
      document.documentElement.scrollHeight - window.innerHeight
    ),
    smallControls: [...document.querySelectorAll("input, select, textarea")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && parseFloat(getComputedStyle(el).fontSize) < 16;
      })
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(/\s+/)[0]}`),
    offscreenX: [...document.querySelectorAll("body *")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return false;
        if (getComputedStyle(el).position === "fixed") return false;
        return r.left < -2 || r.right > window.innerWidth + 2;
      })
      .slice(0, 6)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(/\s+/)[0]}`),
  });

const problems = [];
for (const name of (process.env.DEVICES ?? "Pixel 7,iPhone 15 Pro,iPhone SE").split(",")) {
  const engine = /iphone|ipad/i.test(name) ? webkit : chromium;
  const browser = await engine.launch();
  const ctx = await browser.newContext({ ...devices[name], locale: "en-US" });
  await ctx.addCookies(stagingCookies(ORIGIN)).catch(() => {});
  const page = await ctx.newPage();
  const cdp = engine === chromium ? await ctx.newCDPSession(page) : null;
  const slug = name.replace(/\s+/g, "-");

  // ── SURVEY ────────────────────────────────────────────────────────────
  await page.goto(`${ORIGIN}/survey`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForTimeout(3500);
  await page
    .locator(".cky-btn-accept")
    .first()
    .click({ timeout: 8000 })
    .catch(() => {});
  await page.waitForTimeout(1200);
  // Past the intro wizard into the questions themselves.
  for (let i = 0; i < 6; i += 1) {
    const skipped = await page
      .getByRole("button", { name: /skip intro|start|begin|continue|next/i })
      .first()
      .click({ timeout: 2500 })
      .then(() => true)
      .catch(() => false);
    if (!skipped) break;
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(1500);
  const surveyA = await page.evaluate(audit);
  await page.screenshot({ path: `${SHOTS}/${slug}-survey.png` });

  // Answer a few questions to reach a multi-select and a text input.
  for (let i = 0; i < 12; i += 1) {
    const opts = page.locator("main button, main label").filter({ hasText: /\S/ });
    const n = await opts.count().catch(() => 0);
    if (!n) break;
    await opts
      .nth(Math.min(1, n - 1))
      .click({ timeout: 2500 })
      .catch(() => {});
    await page.waitForTimeout(650);
  }
  const surveyB = await page.evaluate(audit);
  await page.screenshot({ path: `${SHOTS}/${slug}-survey-deep.png` });

  // ── REPORT ────────────────────────────────────────────────────────────
  await page.goto(`${ORIGIN}/report/${TOKEN}`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await page
    .waitForSelector(".report-status-card__spinner", { state: "detached", timeout: 120_000 })
    .catch(() => {});
  await page.waitForTimeout(3000);
  const reportTop = await page.evaluate(audit);
  await page.screenshot({ path: `${SHOTS}/${slug}-report-top.png` });

  // Scroll through the whole report, auditing as we go.
  const deep = [];
  for (let i = 0; i < 22; i += 1) {
    await touchScroll(cdp, page, 700, { settle: 120 });
    deep.push(await page.evaluate(audit));
  }
  await page.screenshot({ path: `${SHOTS}/${slug}-report-deep.png` });

  const worst = (key) => Math.max(...deep.map((d) => d[key]), 0);
  const allBroken = [...new Set(deep.flatMap((d) => d.brokenImages))];
  const allOffscreen = [...new Set(deep.flatMap((d) => d.offscreenX))];

  problems.push({
    device: name,
    survey: {
      hOverflow: surveyA.horizontalOverflow,
      hOverflowDeep: surveyB.horizontalOverflow,
      scrollLocked: surveyA.bodyOverflowHidden,
      overflowPx: surveyA.contentTallerThanViewport,
      overflowPxDeep: surveyB.contentTallerThanViewport,
      smallControls: [...new Set([...surveyA.smallControls, ...surveyB.smallControls])],
      broken: [...new Set([...surveyA.brokenImages, ...surveyB.brokenImages])],
    },
    report: {
      hOverflow: Math.max(reportTop.horizontalOverflow, worst("horizontalOverflow")),
      broken: [...new Set([...reportTop.brokenImages, ...allBroken])],
      offscreen: [...new Set([...reportTop.offscreenX, ...allOffscreen])],
      smallControls: reportTop.smallControls,
    },
  });
  await ctx.close();
  await browser.close();
}
console.log(JSON.stringify(problems, null, 2));
console.log(`\nscreenshots: ${SHOTS}`);
