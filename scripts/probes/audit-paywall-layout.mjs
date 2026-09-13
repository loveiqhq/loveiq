/**
 * Card #1 "Paywall on Limiting beliefs sits after a long block of white"
 * Card #2 "Accelerator & Brakes Paywall sits over non blurred text on the top"
 *
 * Both are geometry claims, so both are MEASURED rather than eyeballed:
 *  #1 = vertical distance from the last painted content in the section to the
 *       top of that section's paywall overlay.
 *  #2 = text that is legible (no blur anywhere in its ancestor chain) and sits
 *       underneath the overlay's own box.
 * Class names are discovered at runtime — guessing them is how a probe ends up
 * measuring nothing and reporting a pass.
 */
import { chromium, webkit, devices } from "playwright";
import { stagingCookies } from "./staging-cookie.mjs";
import { touchScroll } from "./touch.mjs";

const ORIGIN = process.env.REPORT_ORIGIN ?? "https://www.loveiq.org";
const TOKEN = process.env.QA_TOKEN_LOCKED ?? "rpt_a9LY0Obbla1FVsclJ1nM";
const DEVICE = process.env.DEVICE ?? "Pixel 7";
const engine = /iphone|ipad/i.test(DEVICE) ? "webkit" : "chromium";

const browser = await (engine === "webkit" ? webkit : chromium).launch();
const ctx = await browser.newContext({ ...devices[DEVICE], locale: "en-US" });
await ctx.addCookies(stagingCookies(ORIGIN)).catch(() => {});
const page = await ctx.newPage();
const cdp = engine === "chromium" ? await ctx.newCDPSession(page) : null;
// Never let a probe tap its way into real Stripe.
await page.route("**/api/stripe/checkout-session", (r) =>
  r.fulfill({ status: 200, contentType: "application/json", body: '{"enabled":false}' })
);

await page.goto(`${ORIGIN}/report/${TOKEN}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
await page
  .waitForSelector(".report-status-card__spinner", { state: "detached", timeout: 90_000 })
  .catch(() => {});
await page
  .waitForFunction(
    () =>
      !document.querySelector(".report-status-screen") &&
      document.documentElement.scrollHeight > innerHeight * 1.5,
    undefined,
    { timeout: 90_000 }
  )
  .catch(() => {});
await page.waitForTimeout(2000);
await page
  .locator(".cky-btn-accept")
  .first()
  .click({ timeout: 8000 })
  .catch(() => {});
await page.waitForTimeout(1200);

// Everything is lazy/animated, so walk the whole page once to force layout.
for (let i = 0; i < 60; i += 1) {
  const atEnd = await page.evaluate(
    () => scrollY + innerHeight >= document.documentElement.scrollHeight - 40
  );
  if (atEnd) break;
  await touchScroll(cdp, page, 700, { settle: 90 });
}
await page.waitForTimeout(1500);
// Dismiss whatever the scroll-triggered paywall opened; it is not the subject.
for (let k = 0; k < 4; k += 1) {
  if (!(await page.evaluate(() => !!document.querySelector(".report-pricing-modal__dialog"))))
    break;
  await page
    .locator(".report-pricing-modal__close")
    .first()
    .click({ timeout: 5000 })
    .catch(() => {});
  await page.waitForTimeout(800);
}

const report = await page.evaluate(() => {
  const isBlurred = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.filter && cs.filter.includes("blur")) return true;
      if (parseFloat(cs.opacity) < 0.25) return true;
    }
    return false;
  };
  const painted = (el) => {
    const r = el.getBoundingClientRect();
    if (r.height < 6 || r.width < 20) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") return false;
    return (el.textContent || "").trim().length > 1;
  };

  // A section's overlay is the descendant whose class names it by "overlay" or
  // "lock" and which actually has a box.
  const out = [];
  for (const sec of document.querySelectorAll("section[id], div[id]")) {
    const id = sec.id;
    if (!id) continue;
    const overlay = [...sec.querySelectorAll("*")].find((n) => {
      const c = String(n.className || "");
      if (!/overlay|locked|paywall|unlock/i.test(c)) return false;
      const r = n.getBoundingClientRect();
      return r.height > 60 && r.width > 100;
    });
    if (!overlay) continue;

    const sr = sec.getBoundingClientRect();
    const or = overlay.getBoundingClientRect();
    const pageTop = (r) => r.top + scrollY;

    // The last legible thing in this section that ends ABOVE the overlay.
    let lastContentBottom = pageTop(sr);
    let lastContentText = "(section start)";
    // Anything legible that INTRUDES into the overlay's own box.
    const intruders = [];
    for (const el of sec.querySelectorAll("p, h1, h2, h3, h4, li, span, td, blockquote")) {
      if (!painted(el) || isBlurred(el)) continue;
      if (overlay.contains(el)) continue;
      // The overlay's own price card is often a SIBLING of the blur layer, not
      // a descendant, so `overlay.contains` alone lets "Premium content" and
      // "€29.00" count as intruding section text. Reject anything with an
      // overlay-ish ancestor: it is paywall chrome, not content being covered.
      let chrome = false;
      for (let n = el; n && n !== sec; n = n.parentElement) {
        if (/overlay|locked|paywall|unlock/i.test(String(n.className || ""))) {
          chrome = true;
          break;
        }
      }
      if (chrome) continue;
      const r = el.getBoundingClientRect();
      const top = pageTop(r);
      const bottom = top + r.height;
      const oTop = pageTop(or);
      const oBottom = oTop + or.height;
      if (bottom <= oTop + 1) {
        if (bottom > lastContentBottom) {
          lastContentBottom = bottom;
          lastContentText = (el.textContent || "").trim().slice(0, 44);
        }
      } else if (top < oBottom && bottom > oTop) {
        intruders.push({
          text: (el.textContent || "").trim().slice(0, 44),
          overlapPx: Math.round(Math.min(bottom, oBottom) - Math.max(top, oTop)),
        });
      }
    }
    out.push({
      id,
      gapPx: Math.round(pageTop(or) - lastContentBottom),
      lastContentText,
      overlayH: Math.round(or.height),
      intruders: intruders.slice(0, 4),
      viewportH: innerHeight,
    });
  }
  return out;
});

console.log(`device=${DEVICE}  viewport=${report[0]?.viewportH ?? "?"}px\n`);
console.log("=== #1  white gap between last content and the paywall overlay ===");
for (const s of report.sort((a, b) => b.gapPx - a.gapPx)) {
  const screens = (s.gapPx / (s.viewportH || 1)).toFixed(2);
  const flag = s.gapPx > s.viewportH * 0.6 ? "  <== LONG BLOCK OF WHITE" : "";
  console.log(
    `  ${s.id.padEnd(26)} gap=${String(s.gapPx).padStart(5)}px (${screens} screens) after "${s.lastContentText}"${flag}`
  );
}
console.log("\n=== #2  legible (unblurred) text sitting under a paywall overlay ===");
let any = false;
for (const s of report) {
  for (const i of s.intruders) {
    any = true;
    console.log(
      `  ${s.id.padEnd(26)} overlaps ${String(i.overlapPx).padStart(4)}px of "${i.text}"`
    );
  }
}
if (!any) console.log("  none — every overlay covers only blurred content");

await ctx.close();
await browser.close();
