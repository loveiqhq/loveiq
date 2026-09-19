/**
 * Does a real finger reach the unlock CTA while the consent banner is up?
 *
 * The check is not "is the button visible" but "did the button receive the tap":
 * a capture-phase listener is attached to the element itself, then the
 * touchscreen is tapped at its on-screen centre. If the CookieYes banner is on
 * top, the banner receives the tap and the flag stays 0.
 *
 * Point it at production (unfixed) and at a local build (fixed) to see the
 * difference:
 *   REPORT_ORIGIN=https://www.loveiq.org node scripts/verify-consent-fix.mjs
 *   REPORT_ORIGIN=http://localhost:3123   node scripts/verify-consent-fix.mjs
 */
import { chromium, webkit, devices } from "playwright";
import { stagingCookies } from "./staging-cookie.mjs";
import { touchScroll } from "./touch.mjs";

const ORIGIN = process.env.REPORT_ORIGIN ?? "http://localhost:3123";
const TOKEN = process.env.QA_TOKEN_LOCKED ?? "rpt_a9LY0Obbla1FVsclJ1nM";
const CASES = (
  process.env.DEVICES ?? "Pixel 7,Galaxy S5,Pixel 9,iPhone 15 Pro,iPhone SE,iPhone 17 Pro Max"
).split(",");
const CTA = ".report-sticky-unlock__cta";

async function settle(page) {
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
  await page.waitForTimeout(2000);
}

/** Tap where the CTA is and report whether the CTA itself received it. */
async function fingerTap(page, sel) {
  const probe = await page.evaluate((s) => {
    // Both the mobile and desktop sticky bars are in the DOM; CSS hides one by
    // breakpoint. Picking `querySelector` blindly measures the hidden one on a
    // tablet and reports a not-applicable case as a failure.
    const all = [...document.querySelectorAll(s)];
    const n = all.find((el) => {
      const b = el.getBoundingClientRect();
      return b.width > 0 && b.height > 0;
    });
    if (!all.length) return { exists: false };
    if (!n) return { exists: true, visible: false };
    const r = n.getBoundingClientRect();
    n.setAttribute("data-liq-hit", "0");
    n.addEventListener("click", () => n.setAttribute("data-liq-hit", "1"), {
      capture: true,
      once: true,
    });
    const cx = Math.round(r.left + r.width / 2);
    const cy = Math.round(r.top + r.height / 2);
    const onScreen = cy >= 0 && cy <= window.innerHeight;
    const top = onScreen ? document.elementFromPoint(cx, cy) : null;
    return {
      exists: true,
      visible: true,
      onScreen,
      cx,
      cy,
      topEl: top ? `${top.tagName}.${String(top.className || "").split(" ")[0]}` : null,
      onConsent: !!(top && top.closest && top.closest("[class*='cky']")),
      consentH:
        getComputedStyle(document.documentElement).getPropertyValue("--liq-consent-h").trim() ||
        "(unset)",
    };
  }, sel);
  if (!probe.exists || !probe.visible || !probe.onScreen) return { received: false, ...probe };
  await page.touchscreen.tap(probe.cx, probe.cy);
  await page.waitForTimeout(700);
  const hit = await page.evaluate(
    (s) => [...document.querySelectorAll(s)].some((el) => el.getAttribute("data-liq-hit") === "1"),
    sel
  );
  return { received: hit, ...probe };
}

const rows = [];
for (const name of CASES) {
  const d = name.toLowerCase();
  const engine = d.includes("iphone") || d.includes("ipad") ? "webkit" : "chromium";
  const browser = await (engine === "webkit" ? webkit : chromium).launch();
  const ctx = await browser.newContext({ ...devices[name], locale: "en-US" });
  await ctx.addCookies(stagingCookies(ORIGIN)).catch(() => {});
  const page = await ctx.newPage();
  // A tap that DOES reach the CTA goes straight to Stripe. We only care whether
  // the button received the tap, so answer that POST locally rather than open a
  // live Checkout Session on every device.
  await page.route("**/api/stripe/checkout-session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        enabled: false,
        reason: "checkout_disabled",
        message: "stubbed by verify-consent-fix",
      }),
    })
  );
  const cdp = engine === "chromium" ? await ctx.newCDPSession(page) : null;

  await page.goto(`${ORIGIN}/report/${TOKEN}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await settle(page);
  // scroll far enough that the sticky bar is showing
  for (let i = 0; i < 12; i += 1) await touchScroll(cdp, page, 600, { settle: 120 });
  await page.waitForTimeout(1200);

  // CookieYes is domain-locked to loveiq.org, so its banner never loads on a
  // local build — a local run without this would "pass" simply because nothing
  // was in the way. SYNTHETIC=1 injects a faithful stand-in (same class, same
  // fixed bottom placement, same z-index, same measured height) so the fixed and
  // unfixed builds face an identical stimulus.
  if (process.env.SYNTHETIC === "1") {
    await page.evaluate(() => {
      document
        .querySelectorAll(".cky-consent-container, [class*='cky-consent']")
        .forEach((n) => n.remove());
      const b = document.createElement("div");
      b.className = "cky-consent-container";
      b.setAttribute("data-synthetic", "1");
      b.style.cssText =
        "position:fixed;left:0;right:0;bottom:0;height:316px;z-index:9999999;background:#111;color:#fff;pointer-events:auto;display:flex;align-items:center;justify-content:center";
      b.textContent = "synthetic consent banner";
      document.body.appendChild(b);
    });
    await page.waitForTimeout(1200);
  }

  const banner = await page.evaluate(() => {
    const b = document.querySelector(".cky-consent-container, [class*='cky-consent']");
    const r = b?.getBoundingClientRect();
    return r && r.height > 0
      ? { h: Math.round(r.height), sharePct: Math.round((r.height / window.innerHeight) * 100) }
      : null;
  });

  const withBanner = await fingerTap(page, CTA);
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(500);
  const accepted = await page
    .locator(".cky-btn-accept")
    .first()
    .click({ timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  await page.waitForTimeout(1500);
  const afterAccept = await fingerTap(page, CTA);

  rows.push({ name, engine, banner, withBanner, accepted, afterAccept });
  console.log(
    `${withBanner.received ? "PASS" : "FAIL"} ${name.padEnd(20)} banner=${banner ? banner.h + "px/" + banner.sharePct + "%" : "none"} ` +
      `--liq-consent-h=${withBanner.consentH} tapReached=${withBanner.received} top=${withBanner.topEl} ` +
      `| afterAccept=${afterAccept.received}`
  );
  await ctx.close();
  await browser.close();
}

const failed = rows.filter((r) => !r.withBanner.received);
console.log(
  `\n${rows.length - failed.length}/${rows.length} devices: the unlock CTA receives a real tap WITH the consent banner up`
);
if (failed.length) console.log("still blocked:", failed.map((r) => r.name).join(", "));
process.exitCode = failed.length ? 1 : 0;
