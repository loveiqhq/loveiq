#!/usr/bin/env node
/**
 * Device-matrix sweep of the report: locked view -> scroll -> pricing modal ->
 * plan choice -> Stripe hand-off -> unlocked view.
 *
 * Why this exists: Android readers outnumber iPhone readers on the report
 * (563 vs 508 distinct reports / 90d) yet convert at a third of the rate, and
 * the leak is AFTER the checkout button (5/64 vs 14/75). So the flow is walked
 * on every viewport class we actually see, on both engines.
 *
 * Scroll is checked the way `touch-scroll-dies-silently` demands: a leaked body
 * lock freezes real fingers while `window.scrollBy` still returns the full
 * distance, so every programmatic scroll check passes on a frozen page. Ground
 * truth here is a CDP-synthesized TOUCH gesture (Chromium), plus engine-neutral
 * lock-state assertions that catch the same defect on WebKit.
 *
 * USAGE
 *   node scripts/device-matrix.mjs                     # stubbed hand-off, no Stripe writes
 *   node scripts/device-matrix.mjs --devices=Pixel,iPhone
 *   REAL_CHECKOUT=1 node scripts/device-matrix.mjs     # creates LIVE Stripe sessions
 */
import { chromium, webkit, devices } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { stagingCookies } from "./staging-cookie.mjs";
import { hitAreaHeight, realTap } from "./touch.mjs";

const ORIGIN = process.env.REPORT_ORIGIN ?? "https://www.loveiq.org";
const LOCKED_TOKEN = process.env.QA_TOKEN_LOCKED ?? "rpt_a9LY0Obbla1FVsclJ1nM";
const UNLOCKED_TOKEN = process.env.QA_TOKEN_FULL ?? "rpt_FW1ueobP1gU8YFZcIcpg";
const REAL_CHECKOUT = process.env.REAL_CHECKOUT === "1";
const OUT_DIR = process.env.OUT_DIR ?? "/tmp/device-matrix";
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 3);

const filter = (process.argv.find((a) => a.startsWith("--devices=")) ?? "").split("=")[1];

/**
 * One entry per viewport class that shows up in real traffic, not one per
 * marketing name. Chrome's UA reduction reports every Android as "Android 10; K",
 * so the device model is unknowable from our own logs — width is what actually
 * breaks a layout, and these span 320 to 984.
 */
const MATRIX = [
  // --- Android / Chromium ---
  ["Galaxy S5", "chromium"], // 360x640  — floor of still-shipping Android
  ["Galaxy S8", "chromium"], // 360x740
  ["Pixel 9", "chromium"], // 360x732
  ["Galaxy S24", "chromium"], // 360x780
  ["Galaxy Z Flip 7", "chromium"], // 360x764
  ["Pixel 3", "chromium"], // 393x786
  ["Nexus 5X", "chromium"], // 412x732
  ["Pixel 7", "chromium"], // 412x839
  ["Pixel 7 Pro", "chromium"], // 412x816
  ["Pixel 9 Pro", "chromium"], // 427x876
  ["Pixel 8 Pro", "chromium"], // 448x921
  ["Galaxy A55", "chromium"], // 480x1040
  ["Galaxy Tab S9", "chromium"], // 640x1024
  ["Galaxy Z Fold 7", "chromium"], // 984x1016 — unfolded
  ["Galaxy Z Flip 6 Cover", "chromium"], // 360x298 — stress: shortest viewport shipping
  // --- iOS / WebKit ---
  ["iPhone SE", "webkit"], // 320x568  — narrowest iPhone still in use
  ["iPhone SE (3rd gen)", "webkit"], // 375x667
  ["iPhone X", "webkit"], // 375x812
  ["iPhone 12 Mini", "webkit"], // 375x629
  ["iPhone XR", "webkit"], // 414x896
  ["iPhone 13", "webkit"], // 390x664
  ["iPhone 14 Pro", "webkit"], // 393x660
  ["iPhone 15 Pro", "webkit"], // 393x659
  ["iPhone 15 Plus", "webkit"], // 430x739
  ["iPhone 16 Pro", "webkit"], // 402x681
  ["iPhone 16e", "webkit"], // 390x651
  ["iPhone Air", "webkit"], // 420x719
  ["iPhone 17 Pro Max", "webkit"], // 440x763
  ["iPad Mini", "webkit"], // 768x1024
  ["iPad Pro 11", "webkit"], // 834x1194
];

/** Third-party noise that says nothing about the report. */
const IGNORED_CONSOLE = [
  /googletagmanager|clarity\.ms|cookieyes|trustpilot|hotjar|posthog|doubleclick|google-analytics/i,
  /Content Security Policy/i,
  /favicon/i,
  /website URL has changed|registered URL on your CookieYes/i,
  /Failed to load resource: the server responded with a status of 4\d\d/i,
];

/**
 * Read the page's scroll health from inside the document.
 *
 * `window.scrollBy` is deliberately NOT the signal — it returns the full
 * distance on a body that no finger can move. What is measured instead is the
 * state that produces that divergence (a stranded `overflow:hidden` /
 * `position:fixed` lock) plus anything sitting between the finger and the page.
 */
const SCROLL_HEALTH = () => {
  const de = document.documentElement;
  const b = document.body;
  const cs = getComputedStyle(b);
  const csDe = getComputedStyle(de);
  const cx = Math.floor(window.innerWidth / 2);
  const cy = Math.floor(window.innerHeight * 0.6);
  const el = document.elementFromPoint(cx, cy);

  // Anything fixed/sticky that covers the point a thumb would land on.
  let blocker = null;
  let node = el;
  while (node && node !== document.documentElement) {
    const s = getComputedStyle(node);
    if (s.position === "fixed" || s.position === "sticky") {
      const r = node.getBoundingClientRect();
      if (r.width >= window.innerWidth * 0.9 && r.height >= window.innerHeight * 0.5) {
        blocker = `${node.tagName}.${String(node.className || "").split(" ")[0]}`;
        break;
      }
    }
    node = node.parentElement;
  }

  return {
    bodyOverflow: cs.overflow,
    bodyPosition: cs.position,
    htmlOverflow: csDe.overflow,
    inlineBodyOverflow: b.style.overflow,
    inlineBodyPosition: b.style.position,
    inlineBodyTop: b.style.top,
    inlineHtmlOverflow: de.style.overflow,
    scrollHeight: de.scrollHeight,
    innerHeight: window.innerHeight,
    scrollY: window.scrollY,
    hasSomethingToScroll: de.scrollHeight > window.innerHeight + 4,
    touchPointEl: el ? `${el.tagName}.${String(el.className || "").split(" ")[0]}` : null,
    touchAction: el ? getComputedStyle(el).touchAction : null,
    fixedBlocker: blocker,
    docScrollWidth: de.scrollWidth,
    docClientWidth: de.clientWidth,
    horizontalOverflowPx: de.scrollWidth - de.clientWidth,
  };
};

/**
 * Wait for the report to actually be on screen.
 *
 * The report page is a client-render: the server ships a shell, then
 * `useReportData` fetches /api/report (118KB locked, 1.3MB unlocked) and only
 * then does anything appear. Sampling the DOM on a fixed timer measures the
 * spinner, not the report — the first version of this script did exactly that
 * and reported a healthy page as broken on every device.
 */
async function loadReportWithRetry(page, url, getStatus) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const ttc = await waitForReportContent(page).catch(() => null);
    if (ttc !== null)
      return { ttc, httpStatus: resp?.status() ?? null, attempts: attempt + 1, rateLimited: false };
    if (getStatus() !== 429)
      return {
        ttc: null,
        httpStatus: resp?.status() ?? null,
        attempts: attempt + 1,
        rateLimited: false,
      };
    const waitMs = 20_000 * (attempt + 1);
    await page.waitForTimeout(waitMs);
  }
  return { ttc: null, httpStatus: null, attempts: 4, rateLimited: true };
}

async function waitForReportContent(page, timeout = 90_000) {
  const t0 = Date.now();
  await page
    .waitForSelector(".report-status-card__spinner", { state: "detached", timeout })
    .catch(() => {});
  await page.waitForFunction(
    () => {
      const status = document.querySelector(".report-status-screen");
      if (status) return false;
      return document.documentElement.scrollHeight > window.innerHeight * 1.5;
    },
    undefined,
    { timeout }
  );
  return Date.now() - t0;
}

/** Does the consent banner sit on top of the thing we need the reader to tap? */
const CONSENT_OVERLAP = () => {
  const banner =
    document.querySelector(
      ".cky-consent-container, .cky-modal, #cookieyes, [class*='cky-consent']"
    ) ?? null;
  if (!banner) return { present: false };
  const b = banner.getBoundingClientRect();
  if (b.width === 0 || b.height === 0) return { present: false };
  const covered = [];
  for (const sel of [
    ".report-sticky-unlock__cta",
    ".report-premium-overlay__cta",
    ".report-pricing-modal__dialog",
  ]) {
    for (const n of document.querySelectorAll(sel)) {
      const r = n.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const overlapY = Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top);
      const overlapX = Math.min(b.right, r.right) - Math.max(b.left, r.left);
      if (overlapY > 0 && overlapX > 0) {
        covered.push({ sel, overlapPx: Math.round(overlapY * overlapX) });
      }
    }
  }
  return {
    present: true,
    bannerRect: { top: Math.round(b.top), height: Math.round(b.height) },
    viewportSharePct: Math.round((b.height / window.innerHeight) * 100),
    covered,
  };
};

/** True finger scroll. Chromium only — WebKit exposes no CDP. */
async function touchScroll(cdp, page, dy = 500) {
  const before = await page.evaluate(() => window.scrollY);
  const box = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  await cdp.send("Input.synthesizeScrollGesture", {
    x: Math.floor(box.w / 2),
    y: Math.floor(box.h * 0.6),
    xDistance: 0,
    yDistance: -dy,
    gestureSourceType: "touch",
    speed: 1200,
    preventFling: true,
  });
  await page.waitForTimeout(450);
  const after = await page.evaluate(() => window.scrollY);
  return { before, after, moved: after - before };
}

function isRealConsoleError(text) {
  return !IGNORED_CONSOLE.some((r) => r.test(text));
}

async function runDevice(browser, deviceName, engine) {
  const descriptor = devices[deviceName];
  const result = {
    device: deviceName,
    engine,
    viewport: `${descriptor.viewport.width}x${descriptor.viewport.height}`,
    dpr: descriptor.deviceScaleFactor,
    problems: [],
    notes: {},
  };
  const fail = (code, detail) => result.problems.push({ code, detail });

  const ctx = await browser.newContext({ ...descriptor, locale: "en-US" });
  await ctx.addCookies(stagingCookies(ORIGIN)).catch(() => {});
  const page = await ctx.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  page.on("console", (m) => {
    if (m.type() === "error" && isRealConsoleError(m.text()))
      consoleErrors.push(m.text().slice(0, 200));
  });
  page.on("pageerror", (e) => {
    const text = String(e.message);
    // Same filter as console errors — pageerror was bypassing it, so CookieYes
    // shouting "your website URL has changed" on localhost read as a defect.
    if (isRealConsoleError(text)) consoleErrors.push(`pageerror: ${text.slice(0, 200)}`);
  });
  page.on("requestfailed", (r) => {
    const u = r.url();
    if (isRealConsoleError(u))
      failedRequests.push(`${u.slice(0, 120)} ${r.failure()?.errorText ?? ""}`);
  });

  // The checkout POST is the one request that costs money. Record the payload,
  // and unless REAL_CHECKOUT is set, answer it with a synthetic Stripe URL so
  // the matrix never creates 30 live sessions (which would also inflate the
  // very Android checkout-start metric this sweep is investigating).
  let checkoutPayload = null;
  await page.route("**/api/stripe/checkout-session", async (route) => {
    checkoutPayload = route.request().postDataJSON?.() ?? null;
    if (REAL_CHECKOUT) return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ enabled: true, url: `${ORIGIN}/__stub_stripe__` }),
    });
  });

  let lastReportStatus = null;
  page.on("response", (r) => {
    if (r.url().includes("/api/report?")) lastReportStatus = r.status();
  });

  const cdp = engine === "chromium" ? await ctx.newCDPSession(page) : null;

  // Optional network shaping. Android skews toward cheaper handsets on worse
  // connections than iPhone does, and the report ships 118KB-1.3MB of JSON
  // AFTER first paint, so latency is a plausible half of the conversion gap.
  if (cdp && process.env.THROTTLE) {
    const profiles = {
      "4g": {
        latency: 70,
        downloadThroughput: (4 * 1024 * 1024) / 8,
        uploadThroughput: (3 * 1024 * 1024) / 8,
      },
      slow4g: {
        latency: 150,
        downloadThroughput: (1.6 * 1024 * 1024) / 8,
        uploadThroughput: (750 * 1024) / 8,
      },
      "3g": {
        latency: 300,
        downloadThroughput: (780 * 1024) / 8,
        uploadThroughput: (330 * 1024) / 8,
      },
    };
    const p = profiles[process.env.THROTTLE] ?? profiles.slow4g;
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, ...p });
    result.notes.throttle = process.env.THROTTLE;
  }

  try {
    // ---------- 1. locked report loads ----------
    const load = await loadReportWithRetry(
      page,
      `${ORIGIN}/report/${LOCKED_TOKEN}`,
      () => lastReportStatus
    );
    result.notes.httpStatus = load.httpStatus;
    result.notes.timeToContentMs = load.ttc;
    result.notes.loadAttempts = load.attempts;
    if (load.rateLimited) {
      fail(
        "RATE_LIMITED",
        "/api/report kept returning 429 — this run says nothing about the device"
      );
    } else if (load.ttc === null) {
      const txt = await page
        .locator(".report-status-card__title, .report-status-card__label")
        .first()
        .textContent()
        .catch(() => null);
      fail(
        "REPORT_NEVER_RENDERED",
        `still on a status screen after 90s (api status ${lastReportStatus}): ${txt ?? "unknown"}`
      );
    }
    await page.waitForTimeout(2500); // let the paywall's own scroll/time trigger settle

    if (process.env.SYNTHETIC === "1") {
      await page.evaluate(() => {
        document
          .querySelectorAll(".cky-consent-container, [class*='cky-consent']")
          .forEach((n) => n.remove());
        const b = document.createElement("div");
        b.className = "cky-consent-container";
        b.style.cssText =
          "position:fixed;left:0;right:0;bottom:0;height:316px;z-index:9999999;background:#111;pointer-events:auto";
        document.body.appendChild(b);
      });
      await page.waitForTimeout(1000);
    }

    result.notes.consent = await page.evaluate(CONSENT_OVERLAP);
    if (await page.locator(".report-sticky-unlock__cta").count()) {
      const t = await page.evaluate(() => {
        const all = [...document.querySelectorAll(".report-sticky-unlock__cta")];
        const n = all.find((el) => {
          const b = el.getBoundingClientRect();
          return b.width > 0 && b.height > 0;
        });
        if (!n) return { visible: false };
        const r = n.getBoundingClientRect();
        const cx = Math.round(r.left + r.width / 2);
        const cy = Math.round(r.top + r.height / 2);
        if (cy < 0 || cy > window.innerHeight) return { visible: true, offscreen: true };
        const top = document.elementFromPoint(cx, cy);
        return {
          visible: true,
          reaches: !!top && (top === n || n.contains(top)),
          topEl: top ? `${top.tagName}.${String(top.className || "").split(" ")[0]}` : null,
          blockedByConsent: !!(top && top.closest && top.closest("[class*='cky']")),
          size: { w: Math.round(r.width), h: Math.round(r.height) },
        };
      });
      result.notes.stickyReach = t;
      if (t.visible && !t.offscreen && !t.reaches && t.blockedByConsent) {
        fail("CONSENT_BLOCKS_CTA", `the unlock CTA's centre is covered by ${t.topEl}`);
      }
      // Measure what a finger can hit, not the painted box — a hit-area
      // expansion enlarges the former without changing the latter.
      const hit = await hitAreaHeight(page, ".report-sticky-unlock__cta");
      result.notes.ctaHitArea = hit;
      if (hit && hit.hit > 0 && hit.hit < 44) {
        fail(
          "CTA_TAP_TARGET",
          `sticky unlock CTA is tappable over ${hit.hit}px (painted ${hit.box}px) — below the 44px minimum`
        );
      }
    }
    // Measured above, now dismissed: leaving it up would fail every device on the
    // same known defect and hide everything downstream of it.
    result.notes.consentAccepted = await page
      .locator(".cky-btn-accept")
      .first()
      .click({ timeout: 6000 })
      .then(() => true)
      .catch(() => false);
    await page.waitForTimeout(1200);

    const initial = await page.evaluate(SCROLL_HEALTH);
    result.notes.initial = initial;

    if (initial.horizontalOverflowPx > 1) {
      fail("H_OVERFLOW", `${initial.horizontalOverflowPx}px wider than the viewport`);
    }
    if (!initial.hasSomethingToScroll) {
      fail(
        "NO_CONTENT_HEIGHT",
        `scrollHeight ${initial.scrollHeight} <= innerHeight ${initial.innerHeight}`
      );
    }

    // ---------- 2. can a finger scroll the locked report ----------
    if (cdp) {
      const t = await touchScroll(cdp, page, 600);
      result.notes.touchScroll = t;
      if (t.moved <= 0) fail("TOUCH_SCROLL_DEAD", `finger gesture moved ${t.moved}px`);
    }
    const afterScroll = await page.evaluate(SCROLL_HEALTH);
    result.notes.afterScroll = afterScroll;
    if (
      afterScroll.bodyPosition === "fixed" ||
      afterScroll.bodyOverflow === "hidden" ||
      afterScroll.htmlOverflow === "hidden"
    ) {
      fail(
        "SCROLL_LOCKED",
        `body{position:${afterScroll.bodyPosition};overflow:${afterScroll.bodyOverflow}} html{overflow:${afterScroll.htmlOverflow}} with no overlay open`
      );
    }
    if (afterScroll.fixedBlocker) {
      fail("VIEWPORT_BLOCKER", `${afterScroll.fixedBlocker} covers the touch point`);
    }

    // ---------- 3. the unlock CTA ----------
    const ctaSel = ".report-premium-overlay__cta, .report-sticky-unlock__cta";
    const ctaCount = await page.locator(ctaSel).count();
    result.notes.ctaCount = ctaCount;
    if (ctaCount === 0)
      fail("NO_UNLOCK_CTA", "no premium-overlay or sticky unlock CTA on a locked report");

    let cta = null;
    for (let i = 0; i < ctaCount; i += 1) {
      const c = page.locator(ctaSel).nth(i);
      if (await c.isVisible().catch(() => false)) {
        cta = c;
        break;
      }
    }
    if (!cta) {
      fail("NO_VISIBLE_CTA", `${ctaCount} unlock CTAs exist but none is visible`);
    } else {
      const box = await cta.boundingBox();
      result.notes.ctaBox = box;
      if (box && (box.height < 40 || box.width < 60)) {
        fail(
          "CTA_TAP_TARGET",
          `${Math.round(box.width)}x${Math.round(box.height)} is below the 44px touch minimum`
        );
      }
    }

    // ---------- 4. pricing modal ----------
    if (cta) {
      await cta.scrollIntoViewIfNeeded().catch(() => {});
      await cta
        .click({ timeout: 15_000 })
        .catch((e) => fail("CTA_CLICK_FAILED", String(e.message).slice(0, 160)));
      const dialog = page.locator(".report-pricing-modal__dialog");
      const opened = await dialog
        .waitFor({ state: "visible", timeout: 15_000 })
        .then(() => true)
        .catch(() => false);
      result.notes.modalOpened = opened;
      if (!opened) {
        fail("MODAL_DID_NOT_OPEN", "pricing modal never became visible after tapping unlock");
      } else {
        const modal = await page.evaluate(() => {
          const d = document.querySelector(".report-pricing-modal__dialog");
          const region = document.querySelector(".report-pricing-modal__scroll-region");
          const cards = [
            ...document.querySelectorAll(
              ".report-pricing-card, [class*='report-pricing-card__title']"
            ),
          ];
          const prices = [...document.querySelectorAll(".report-pricing-card__amount")].map((n) =>
            n.textContent.trim()
          );
          const ctas = [
            ...document.querySelectorAll(
              ".report-pricing-modal__dialog button, .report-pricing-modal__dialog a"
            ),
          ]
            .filter((n) => /unlock|continue|get |buy|choose/i.test(n.textContent || ""))
            .map((n) => {
              const r = n.getBoundingClientRect();
              return {
                text: (n.textContent || "").trim().slice(0, 40),
                top: Math.round(r.top),
                bottom: Math.round(r.bottom),
                h: Math.round(r.height),
                inViewport: r.top >= 0 && r.bottom <= window.innerHeight,
              };
            });
          const dr = d?.getBoundingClientRect();
          return {
            dialogHeight: dr ? Math.round(dr.height) : null,
            dialogOverflowsViewport: dr ? dr.height > window.innerHeight + 2 : null,
            scrollRegionScrollable: region ? region.scrollHeight > region.clientHeight + 2 : null,
            scrollRegionOverflowY: region ? getComputedStyle(region).overflowY : null,
            cardCount: cards.length,
            prices,
            ctas,
            closeVisible: !!document.querySelector(".report-pricing-modal__close"),
          };
        });
        result.notes.modal = modal;

        if (modal.prices.length === 0)
          fail("NO_PRICES", "pricing modal rendered with no price amounts");
        if (modal.prices.some((p) => /nan|undefined|null|^$/i.test(p))) {
          fail("BAD_PRICE_TEXT", modal.prices.join(" | "));
        }
        if (modal.ctas.length === 0)
          fail("NO_PLAN_CTA", "no purchase CTA inside the pricing modal");
        if (
          modal.ctas.length > 0 &&
          !modal.ctas.some((c) => c.inViewport) &&
          !modal.scrollRegionScrollable
        ) {
          fail(
            "PLAN_CTA_UNREACHABLE",
            "every plan CTA is off-screen and the modal does not scroll"
          );
        }
        if (modal.dialogOverflowsViewport && !modal.scrollRegionScrollable) {
          fail(
            "MODAL_TALLER_THAN_SCREEN",
            `dialog ${modal.dialogHeight}px vs viewport, no scroll region`
          );
        }

        // ---------- 5. plan -> Stripe hand-off ----------
        const planCta = page
          .locator(".report-pricing-modal__dialog button, .report-pricing-modal__dialog a")
          .filter({ hasText: /unlock|continue|get |buy|choose/i })
          .first();
        if (await planCta.count()) {
          await planCta.scrollIntoViewIfNeeded().catch(() => {});
          await planCta
            .click({ timeout: 15_000 })
            .catch((e) => fail("PLAN_CLICK_FAILED", String(e.message).slice(0, 160)));
          await page.waitForTimeout(4000);
          result.notes.checkoutPayload = checkoutPayload;
          result.notes.urlAfterPlanClick = page.url();
          if (!checkoutPayload) {
            fail("NO_CHECKOUT_REQUEST", "tapping a plan never POSTed /api/stripe/checkout-session");
          } else {
            if (!checkoutPayload.quoteId)
              fail("CHECKOUT_NO_QUOTE", "POST body carried no quoteId — the price never resolved");
            if (!checkoutPayload.plan)
              fail("CHECKOUT_NO_PLAN", JSON.stringify(checkoutPayload).slice(0, 160));
            if (!checkoutPayload.reportToken && !checkoutPayload.reportSessionId) {
              fail(
                "CHECKOUT_NO_CONTEXT",
                "neither reportToken nor reportSessionId in the POST body"
              );
            }
          }
          if (!REAL_CHECKOUT && !page.url().includes("__stub_stripe__")) {
            fail(
              "NO_REDIRECT",
              `stayed on ${page.url().slice(0, 120)} instead of following the Stripe URL`
            );
          }
        }
      }
    }

    // ---------- 6. unlocked report scrolls ----------
    const loadUnlocked = await loadReportWithRetry(
      page,
      `${ORIGIN}/report/${UNLOCKED_TOKEN}`,
      () => lastReportStatus
    );
    result.notes.unlockedTimeToContentMs = loadUnlocked.ttc;
    if (loadUnlocked.rateLimited)
      fail("RATE_LIMITED", "unlocked report: /api/report kept returning 429");
    else if (loadUnlocked.ttc === null)
      fail(
        "UNLOCKED_NEVER_RENDERED",
        `unlocked report stayed on a status screen (api ${lastReportStatus})`
      );
    await page.waitForTimeout(2000);
    const un = await page.evaluate(SCROLL_HEALTH);
    result.notes.unlocked = un;
    if (un.horizontalOverflowPx > 1) fail("UNLOCKED_H_OVERFLOW", `${un.horizontalOverflowPx}px`);
    if (un.bodyPosition === "fixed" || un.bodyOverflow === "hidden") {
      fail(
        "UNLOCKED_SCROLL_LOCKED",
        `body{position:${un.bodyPosition};overflow:${un.bodyOverflow}}`
      );
    }
    if (cdp) {
      const t2 = await touchScroll(cdp, page, 800);
      result.notes.unlockedTouchScroll = t2;
      if (t2.moved <= 0) fail("UNLOCKED_TOUCH_SCROLL_DEAD", `moved ${t2.moved}px`);
    }
    // walk to the bottom the way a reader would, and make sure nothing dies there
    await page.evaluate(async () => {
      for (let i = 0; i < 40; i += 1) {
        window.scrollBy(0, window.innerHeight * 0.9);
        await new Promise((r) => setTimeout(r, 90));
      }
    });
    await page.waitForTimeout(1200);
    const bottom = await page.evaluate(SCROLL_HEALTH);
    result.notes.bottom = bottom;
    if (bottom.horizontalOverflowPx > 1)
      fail("BOTTOM_H_OVERFLOW", `${bottom.horizontalOverflowPx}px after full scroll`);

    const shot = `${OUT_DIR}/${deviceName.replace(/[^a-z0-9]+/gi, "_")}.png`;
    await page.screenshot({ path: shot }).catch(() => {});
    result.notes.screenshot = shot;
  } catch (err) {
    fail("EXCEPTION", String(err.message).slice(0, 300));
  }

  result.consoleErrors = consoleErrors.slice(0, 8);
  result.failedRequests = failedRequests.slice(0, 8);
  if (consoleErrors.length) fail("CONSOLE_ERRORS", `${consoleErrors.length}: ${consoleErrors[0]}`);

  await ctx.close();
  return result;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const list = MATRIX.filter(
    ([n]) => !filter || filter.split(",").some((f) => n.toLowerCase().includes(f.toLowerCase()))
  );
  console.log(`${list.length} devices | origin ${ORIGIN} | realCheckout=${REAL_CHECKOUT}`);

  const browsers = {};
  for (const engine of new Set(list.map(([, e]) => e))) {
    browsers[engine] = await (engine === "webkit" ? webkit : chromium).launch();
  }

  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < list.length) {
      const [name, engine] = list[cursor++];
      const t0 = Date.now();
      const r = await runDevice(browsers[engine], name, engine);
      r.ms = Date.now() - t0;
      results.push(r);
      const bad = r.problems.length;
      console.log(
        `${bad ? "FAIL" : "ok  "} ${name.padEnd(24)} ${r.viewport.padEnd(9)} ${bad ? r.problems.map((p) => p.code).join(",") : ""}`
      );
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker));
  for (const b of Object.values(browsers)) await b.close();

  results.sort((a, b) => a.device.localeCompare(b.device));
  writeFileSync(`${OUT_DIR}/results.json`, JSON.stringify(results, null, 2));

  const failed = results.filter((r) => r.problems.length);
  console.log(`\n${results.length - failed.length}/${results.length} clean`);
  const byCode = {};
  for (const r of failed) for (const p of r.problems) (byCode[p.code] ??= []).push(r.device);
  for (const [code, ds] of Object.entries(byCode).sort((a, b) => b[1].length - a[1].length)) {
    console.log(
      `  ${String(ds.length).padStart(2)}x ${code.padEnd(26)} ${ds.slice(0, 6).join(", ")}${ds.length > 6 ? ` +${ds.length - 6}` : ""}`
    );
  }
  console.log(`\nfull results: ${OUT_DIR}/results.json`);
  process.exitCode = failed.length ? 1 : 0;
}

main();
