/**
 * In-app browsers — where a lot of social traffic actually lands.
 *
 * HONEST LIMIT: this emulates the user-agent and the shorter viewport an in-app
 * browser leaves after its own chrome. It cannot reproduce a real WebView's
 * storage and cookie policy, nor its navigation restrictions. So it answers
 * "does our UA handling and layout hold up", not "does Instagram's WebView work".
 * Anything storage-related still needs a physical device.
 *
 * What it does check, per surface:
 *   - the report renders at all
 *   - the sticky unlock CTA is reachable by a real tap
 *   - the pricing modal opens with real prices
 *   - the checkout POST carries plan + quoteId + report context
 *   - which device class the server assigned (pricing depends on it)
 */
import { chromium, webkit, devices } from "playwright";
import { touchScroll } from "./touch.mjs";

const ORIGIN = process.env.REPORT_ORIGIN ?? "https://www.loveiq.org";
const TOKEN = process.env.QA_TOKEN_LOCKED ?? "rpt_a9LY0Obbla1FVsclJ1nM";

const IG_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.29.110 (iPhone15,3; iOS 18_7; en_US; en; scale=3.00; 1179x2556; 500000000)";
const IG_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; SM-S928B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36 Instagram 300.0.0.29.110 Android (34/14; 450dpi; 1080x2176; samsung; SM-S928B; e3q; qcom; en_US; 500000000)";
const TIKTOK_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_2023 BytedanceWebview/d8a21c6";
const FB_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; SM-A556B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/450.0.0.38.108;]";

// Viewports are the host device MINUS the in-app browser's own chrome (~56-72px).
const SURFACES = [
  {
    name: "Instagram · iOS",
    engine: "webkit",
    ua: IG_IOS,
    vp: { width: 393, height: 592 },
    dpr: 3,
  },
  {
    name: "TikTok · iOS",
    engine: "webkit",
    ua: TIKTOK_IOS,
    vp: { width: 393, height: 587 },
    dpr: 3,
  },
  {
    name: "Instagram · Android",
    engine: "chromium",
    ua: IG_ANDROID,
    vp: { width: 412, height: 772 },
    dpr: 2.6,
  },
  {
    name: "Facebook · Android",
    engine: "chromium",
    ua: FB_ANDROID,
    vp: { width: 412, height: 768 },
    dpr: 2.6,
  },
];

for (const s of SURFACES) {
  const browser = await (s.engine === "webkit" ? webkit : chromium).launch();
  const ctx = await browser.newContext({
    userAgent: s.ua,
    viewport: s.vp,
    deviceScaleFactor: s.dpr,
    isMobile: true,
    hasTouch: true,
    locale: "en-US",
  });
  const page = await ctx.newPage();
  let posted = null;
  await page.route("**/api/stripe/checkout-session", (route) => {
    posted = route.request().postDataJSON?.() ?? null;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ enabled: false, reason: "checkout_disabled", message: "stubbed" }),
    });
  });
  const cdp = s.engine === "chromium" ? await ctx.newCDPSession(page) : null;
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message).slice(0, 80)));

  const problems = [];
  try {
    await page.goto(`${ORIGIN}/report/${TOKEN}`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await page
      .waitForSelector(".report-status-card__spinner", { state: "detached", timeout: 90_000 })
      .catch(() => {});
    const rendered = await page
      .waitForFunction(
        () =>
          !document.querySelector(".report-status-screen") &&
          document.documentElement.scrollHeight > window.innerHeight * 1.5,
        undefined,
        { timeout: 90_000 }
      )
      .then(() => true)
      .catch(() => false);
    if (!rendered) problems.push("report never rendered");
    await page.waitForTimeout(2000);

    // What device class did the server assign? Pricing multiplies by it.
    const quote = await page.evaluate(async () => {
      const t = location.pathname.split("/").pop();
      const r = await fetch(`/api/report?token=${t}`, { cache: "no-store" });
      if (!r.ok) return { httpError: r.status };
      const j = await r.json();
      const q = j.pricingQuotes?.full_report;
      return q
        ? {
            deviceType: q.deviceType ?? q.device_type ?? null,
            price: q.currentPriceCents,
            cluster: q.pricingClusterId,
          }
        : { noQuote: true };
    });

    await page
      .locator(".cky-btn-accept")
      .first()
      .click({ timeout: 8000 })
      .catch(() => {});
    await page.waitForTimeout(1200);
    for (let i = 0; i < 10; i += 1) await touchScroll(cdp, page, 600, { settle: 120 });

    const reach = await page.evaluate(() => {
      const all = [...document.querySelectorAll(".report-sticky-unlock__cta")];
      const n = all.find((el) => {
        const b = el.getBoundingClientRect();
        return b.width > 0 && b.height > 0;
      });
      if (!n) return { visible: false };
      const r = n.getBoundingClientRect();
      const cx = Math.round(r.left + r.width / 2);
      const cy = Math.round(r.top + r.height / 2);
      const top = cy >= 0 && cy <= window.innerHeight ? document.elementFromPoint(cx, cy) : null;
      return {
        visible: true,
        h: Math.round(r.height),
        reaches: !!top && (top === n || n.contains(top)),
        topEl: top ? top.tagName : null,
      };
    });
    if (reach.visible && !reach.reaches) problems.push(`sticky CTA blocked by ${reach.topEl}`);
    if (reach.visible && reach.h < 44) problems.push(`sticky CTA only ${reach.h}px tall`);

    await page
      .locator(".report-premium-overlay__cta")
      .first()
      .click({ timeout: 15_000 })
      .catch(() => {});
    const modal = await page
      .locator(".report-pricing-modal__dialog")
      .waitFor({ state: "visible", timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (!modal) problems.push("pricing modal did not open");
    const prices = modal
      ? await page.evaluate(() =>
          [...document.querySelectorAll(".report-pricing-card__amount")].map((n) =>
            n.textContent.trim()
          )
        )
      : [];
    if (modal && prices.length === 0) problems.push("no prices in modal");

    if (modal) {
      const box = await page.evaluate(() => {
        const n = [...document.querySelectorAll(".report-pricing-modal__dialog button")].find((b) =>
          /unlock|continue|get |buy|choose/i.test(b.textContent || "")
        );
        if (!n) return null;
        n.scrollIntoView({ block: "center" });
        const r = n.getBoundingClientRect();
        return { cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2) };
      });
      if (box) {
        await page.touchscreen.tap(box.cx, box.cy);
        await page.waitForTimeout(3000);
      }
      if (!posted) problems.push("plan tap produced no checkout POST");
      else if (!posted.quoteId || !posted.plan || !posted.reportToken)
        problems.push("checkout POST missing context");
    }

    const hOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    if (hOverflow > 1) problems.push(`${hOverflow}px horizontal overflow`);

    console.log(
      `${problems.length ? "FAIL" : "PASS"} ${s.name.padEnd(22)} ${s.vp.width}x${s.vp.height}  ` +
        `server-class=${quote.deviceType ?? JSON.stringify(quote)} price=${quote.price ?? "?"} ` +
        `stickyH=${reach.h ?? "-"} prices=${prices.join("/") || "-"} ` +
        `payload=${posted ? `${posted.plan}` : "none"}` +
        (problems.length ? `\n     problems: ${problems.join("; ")}` : "")
    );
  } catch (e) {
    console.log(`ERROR ${s.name}: ${String(e.message).split("\n")[0].slice(0, 120)}`);
  }
  await ctx.close();
  await browser.close();
}
