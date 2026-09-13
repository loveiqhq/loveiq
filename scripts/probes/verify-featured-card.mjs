/**
 * The featured Arousal card's BODY — title, sub, eyebrow — was inert after the
 * link alone was fixed. Taps the body well clear of the inner link and requires
 * a real effect: navigation to #arousal_style when owned, paywall when locked.
 */
import { chromium, webkit, devices } from "playwright";
import { stagingCookies } from "./staging-cookie.mjs";
import { touchScroll } from "./touch.mjs";

const ORIGIN = process.env.REPORT_ORIGIN ?? "https://www.loveiq.org";
const TOKEN = process.env.QA_TOKEN_LOCKED ?? "rpt_a9LY0Obbla1FVsclJ1nM";
const CASES = (process.env.DEVICES ?? "Pixel 7,iPhone 15 Pro,iPhone SE").split(",");
let bad = 0;

for (const name of CASES) {
  const engine = /iphone|ipad/i.test(name) ? "webkit" : "chromium";
  const browser = await (engine === "webkit" ? webkit : chromium).launch();
  const ctx = await browser.newContext({ ...devices[name], locale: "en-US" });
  await ctx.addCookies(stagingCookies(ORIGIN)).catch(() => {});
  const page = await ctx.newPage();
  const cdp = engine === "chromium" ? await ctx.newCDPSession(page) : null;
  await page.route("**/api/stripe/checkout-session", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: '{"enabled":false}' })
  );
  const notes = [];
  try {
    await page.goto(`${ORIGIN}/report/${TOKEN}`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await page
      .waitForSelector(".report-status-card__spinner", { state: "detached", timeout: 90_000 })
      .catch(() => {});
    await page.waitForTimeout(2200);
    await page
      .locator(".cky-btn-accept")
      .first()
      .click({ timeout: 8000 })
      .catch(() => {});
    await page.waitForTimeout(1000);

    let pt = null;
    for (let i = 0; i < 55 && !pt; i += 1) {
      pt = await page.evaluate(() => {
        const card = document.querySelector(".report-map-featured");
        if (!card) return null;
        const b = card.getBoundingClientRect();
        if (!(b.top > 60 && b.top < innerHeight - 160)) {
          card.scrollIntoView({ block: "center" });
          return null;
        }
        const title = card.querySelector(".report-map-featured__title");
        const link = card.querySelector(".report-map-featured__link");
        if (!title) return null;
        const t = title.getBoundingClientRect();
        const l = link?.getBoundingClientRect();
        const cx = Math.round(t.left + t.width / 2),
          cy = Math.round(t.top + t.height / 2);
        const insideLink = !!l && cx >= l.left && cx <= l.right && cy >= l.top && cy <= l.bottom;
        const hit = document.elementFromPoint(cx, cy);
        return {
          cx,
          cy,
          insideLink,
          onScreen: cy > 0 && cy < innerHeight,
          owns: !!hit && (hit === title || title.contains(hit)),
          cursor: getComputedStyle(card).cursor,
        };
      });
      if (!pt) await touchScroll(cdp, page, 550, { settle: 100 });
    }
    if (!pt || !pt.onScreen) {
      notes.push("INCONCLUSIVE: featured card never reachable");
      bad += 1;
    } else if (pt.insideLink) {
      notes.push("INCONCLUSIVE: probe point landed inside the link");
      bad += 1;
    } else {
      for (let k = 0; k < 3; k += 1) {
        if (!(await page.evaluate(() => !!document.querySelector(".report-pricing-modal__dialog"))))
          break;
        await page
          .locator(".report-pricing-modal__close")
          .first()
          .click({ timeout: 5000 })
          .catch(() => {});
        await page.waitForTimeout(700);
      }
      const before = await page.evaluate(() => ({ y: Math.round(scrollY), h: location.hash }));
      await page.touchscreen.tap(pt.cx, pt.cy);
      await page.waitForTimeout(1500);
      const after = await page.evaluate(() => ({
        y: Math.round(scrollY),
        h: location.hash,
        modal: !!document.querySelector(".report-pricing-modal__dialog"),
      }));
      const acted =
        after.h === "#arousal_style" || after.modal || Math.abs(after.y - before.y) > 200;
      notes.push(
        `cursor=${pt.cursor}`,
        `tapped TITLE outside link`,
        `hash ${before.h || "(none)"} -> ${after.h || "(none)"}`,
        `scroll ${before.y} -> ${after.y}`,
        `paywall=${after.modal}`,
        acted ? "ACTED" : "did NOTHING"
      );
      if (!acted) bad += 1;
    }
  } catch (e) {
    notes.push(`exception: ${String(e.message).split("\n")[0].slice(0, 60)}`);
    bad += 1;
  }
  console.log(
    `${notes.some((n) => n === "ACTED") ? "PASS" : "FAIL"} ${name.padEnd(15)} ${notes.join(" | ")}`
  );
  await ctx.close();
  await browser.close();
}
console.log(
  `\n${CASES.length - bad}/${CASES.length} devices: tapping the featured card BODY does something`
);
process.exitCode = bad ? 1 : 0;
