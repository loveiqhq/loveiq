/**
 * Can a reader actually get to the END of the unlocked report?
 *
 * Every earlier sweep fired `scrollBy` (or a touch gesture) on a short timer and
 * none of them reached the bottom — Chromium stopped around 17% of the document,
 * WebKit 35-96%. That looked like a stall but is the harness: the page scrolls
 * smoothly, so a second scroll issued 90ms into a ~400ms animation replaces it
 * instead of adding to it. Firing faster scrolls LESS.
 *
 * So this measures reachability separately from gesture feel (which the CDP
 * touch checks already cover): disable smooth scrolling, then drive to the
 * bottom, re-measuring until the position stops changing — the document grows
 * as sections mount, so a single jump is not enough. Then assert the last
 * section is really rendered, not an empty spacer.
 */
import { chromium, webkit, devices } from "playwright";

const ORIGIN = process.env.REPORT_ORIGIN ?? "https://www.loveiq.org";
const TOKEN = process.env.QA_TOKEN_FULL ?? "rpt_FW1ueobP1gU8YFZcIcpg";
const CASES = (
  process.env.DEVICES ??
  "Pixel 7,Galaxy S5,Pixel 9,iPhone SE,iPhone 15 Pro,iPhone 17 Pro Max,iPad Mini"
).split(",");

for (const name of CASES) {
  const d = name.toLowerCase();
  const engine = d.includes("iphone") || d.includes("ipad") ? "webkit" : "chromium";
  const browser = await (engine === "webkit" ? webkit : chromium).launch();
  const ctx = await browser.newContext({ ...devices[name], locale: "en-US" });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message).slice(0, 60)));

  await page.goto(`${ORIGIN}/report/${TOKEN}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page
    .waitForSelector(".report-status-card__spinner", { state: "detached", timeout: 90_000 })
    .catch(() => {});
  await page
    .waitForFunction(
      () =>
        !document.querySelector(".report-status-screen") &&
        document.documentElement.scrollHeight > window.innerHeight * 1.5,
      undefined,
      { timeout: 90_000 }
    )
    .catch(() => {});
  await page.waitForTimeout(2200);
  await page
    .locator(".cky-btn-accept")
    .first()
    .click({ timeout: 8000 })
    .catch(() => {});
  await page.waitForTimeout(1000);

  // Smooth scrolling makes rapid programmatic scrolls cancel each other; this
  // question is about whether the END is reachable, not about animation.
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
    document.body.style.scrollBehavior = "auto";
  });

  let last = -1;
  let stable = 0;
  let iterations = 0;
  while (stable < 3 && iterations < 60) {
    iterations += 1;
    const y = await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      return Math.round(window.scrollY);
    });
    await page.waitForTimeout(400);
    if (Math.abs(y - last) < 8) stable += 1;
    else stable = 0;
    last = y;
  }

  const end = await page.evaluate(() => {
    const de = document.documentElement;
    const sections = [...document.querySelectorAll(".report-section")];
    const lastSection = sections[sections.length - 1];
    const lastRect = lastSection?.getBoundingClientRect();
    const footerish = lastSection ? (lastSection.innerText || "").trim().length : 0;
    return {
      scrollY: Math.round(window.scrollY),
      viewportBottom: Math.round(window.scrollY + window.innerHeight),
      docHeight: de.scrollHeight,
      remaining: Math.round(de.scrollHeight - (window.scrollY + window.innerHeight)),
      sectionCount: sections.length,
      lastSectionVisible: !!lastRect && lastRect.top < window.innerHeight && lastRect.bottom > 0,
      lastSectionTextLen: footerish,
      hOverflow: de.scrollWidth - de.clientWidth,
      bodyPosition: getComputedStyle(document.body).position,
    };
  });

  // `lastSectionVisible` is NOT a criterion: at maximum scroll the site footer
  // legitimately fills the final viewport, so the last report section sits just
  // above it. Verified by screenshot — the footer renders in full. What matters
  // is that the document end is reachable, the last section carries real copy,
  // nothing overflows sideways and the body was not left scroll-locked.
  const reached = end.remaining <= 40;
  const ok =
    reached && end.lastSectionTextLen > 20 && end.hOverflow <= 1 && end.bodyPosition !== "fixed";
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name.padEnd(19)} ${engine.padEnd(9)} bottom=${end.scrollY}/${end.docHeight}px remaining=${end.remaining}px ` +
      `sections=${end.sectionCount} lastText=${end.lastSectionTextLen}ch footerFillsLastViewport=${!end.lastSectionVisible} hOverflow=${end.hOverflow} (${iterations} steps)`
  );
  if (errs.length) console.log(`     pageErrors: ${errs.slice(0, 2).join(" | ")}`);
  await page.screenshot({ path: `/tmp/bottom-${name.replace(/\W+/g, "_")}.png` }).catch(() => {});
  await ctx.close();
  await browser.close();
}
