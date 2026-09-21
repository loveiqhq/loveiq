/**
 * REPLAY THE READER'S OWN ROUTE, instead of a route we invented.
 *
 * Every other probe in this corpus drives a path somebody here chose: open the
 * report, scroll, tap the locked card. That is why they can all be clean while
 * the report scanner sits at 0 confirmed in 45 — a defect that only appears
 * after a particular SEQUENCE (open the chapter drawer, scroll to three
 * quarters, tap a locked card, dismiss, tap again) is not something a probe
 * that never performs that sequence can find. It is structurally invisible,
 * and no amount of prompt work on the scanner side changes that.
 *
 * This reads the reader's ordered event stream out of PostHog and performs the
 * same named steps, at a device matched to their own screen, checking after
 * every step that the page is still usable.
 *
 * IT REPLAYS THE ROUTE, NOT THE PERSON. The steps come from their session; the
 * page is OUR internal report.
 *
 * Not for privacy — six probes in this corpus already open the reader's own
 * report and the verifier hands them the token deliberately. The reason is
 * VOLUME. Those probes load a page and assert; this one performs the whole
 * visit, nine to twelve route steps plus up to thirty-six taps, and every one
 * of those emits analytics: scroll_depth, locked_card_price_shown,
 * paywall_dismissed. Against a reader's own report that lands in the same
 * tables the scanners and the funnel read, so the pipeline would be measuring
 * its own replays. The probe cookie does not cover it either — it suppresses
 * one `report_session` row and nothing on the analytics_event path.
 *
 * The defects this looks for — a dead scroll, an overlay over the text, a
 * thrown error — are page mechanics, so the substitution costs little. It does
 * mean a fault specific to one archetype's content will not reproduce; point
 * REPLAY_TOKEN at a matching report when that is the claim.
 *
 * WHAT IT ASSERTS, after every step:
 *   - the page still scrolls with a real finger, with no dialog open
 *   - nothing threw
 *   - the text is not behind a full-screen overlay while no dialog is open
 *
 * HOW MUCH OF THE SESSION IT COVERED IS PART OF THE VERDICT. A run that could
 * only perform two of eleven steps has not cleared anything, and says so with
 * exit 3. "Clear" from a probe that never reached the interesting part is the
 * error this whole corpus exists to stop making.
 *
 *   SESSION_ID=01a0c4c6-… node scripts/probes/replay-session.mjs
 *   MUTATE=1 SESSION_ID=… node scripts/probes/replay-session.mjs   # must FAIL
 *
 * Exit 0 clean, 1 the defect reproduced, 3 could not measure.
 */
import { chromium, webkit, devices } from "playwright";

import { hogQuery } from "../lib/hogql.mjs";
import { stagingCookies } from "./staging-cookie.mjs";
import { realTap, touchScroll } from "./touch.mjs";

const ORIGIN = process.env.REPORT_ORIGIN ?? "https://www.loveiq.org";
/** The same internal locked report the rest of the report probes use. */
const TOKEN = process.env.REPLAY_TOKEN ?? "rpt_a9LY0Obbla1FVsclJ1nM";
const SESSION_ID = process.env.SESSION_ID ?? "";
const PROJECT = "244778";

/**
 * Below this share of the session's steps, a clean run is not evidence.
 *
 * Two thirds rather than "all of them": a step can be legitimately
 * unreplayable — a checkout that leaves for Stripe, a tab_hidden — and
 * demanding every one would make the probe permanently inconclusive, which is
 * just a slower way of having no probe. Two thirds still means the shape of
 * the visit was followed.
 */
const MIN_REPLAYED_SHARE = 2 / 3;

/**
 * Events that describe a step we can actually perform on the page.
 *
 * `locked_card_price_shown` is deliberately NOT here. It fires once on mount
 * behind a one-shot ref when a price is rendered — an impression, not an
 * action, with nothing to tap. Treating it as a step failed on 6 of 6 sessions
 * and quietly cost every run a point of route coverage.
 */
const REPLAYABLE = new Set([
  "$pageview",
  "scroll_depth_25",
  "scroll_depth_50",
  "scroll_depth_75",
  "scroll_depth_100",
  "report_chapter_menu_opened",
  "section_navigated",
  "lock_icon_clicked",
  "unlock_click",
  "sticky_unlock_clicked",
  "paywall_initiated",
  "paywall_dismissed",
  "dead_click",
]);

function fail(msg) {
  console.log(msg);
  process.exit(3);
}

async function sessionPath(sessionId) {
  const rows = await hogQuery(
    `SELECT event, timestamp, properties.$viewport_width, properties.$os,
            properties.target_selector, properties.$current_url
       FROM events
      WHERE properties.$session_id = '${sessionId.replace(/'/g, "")}'
        AND timestamp > now() - INTERVAL 45 DAY
      ORDER BY timestamp ASC
      LIMIT 2000`,
    { projectId: PROJECT, apiKey: process.env.POSTHOG_API_KEY, label: "replay" }
  );
  return rows.map(([event, ts, vw, os, selector, url]) => ({
    event,
    ts,
    vw: Number(vw) || 0,
    os: String(os ?? ""),
    selector: selector ? String(selector) : "",
    url: String(url ?? ""),
  }));
}

/** The reader's own screen, not ours — a layout defect is width-specific. */
function deviceFor(steps) {
  const explicit = process.env.DEVICE;
  if (explicit) return explicit;
  const ios = steps.some((s) => /ios|mac/i.test(s.os));
  const width = steps.map((s) => s.vw).find((w) => w > 0) ?? 0;
  if (ios) return width >= 760 ? "iPad Mini" : "iPhone 15 Pro";
  return width >= 760 ? "Galaxy Tab S4" : "Pixel 7";
}

/**
 * Tap it the way a finger would, and say which KIND of failure it was.
 *
 * `exists:false` means the selector names something on the reader's own report
 * that is not on ours — unreplayable by construction, and not a fault.
 */
const tap = async (page, cdp, selector) => {
  const r = await realTap(page, selector, { cdp }).catch(() => ({ tapped: false, exists: false }));
  if (r.tapped) await page.waitForTimeout(700);
  return r;
};

/**
 * Is there a control here that a finger cannot use?
 *
 * THE OBVIOUS TEST IS WRONG. "The tap did not reach the element" fires on
 * every paragraph, because a recorded dead tap mostly names a CONTAINER: a
 * disabled control is `pointer-events: none`, so the browser reports whatever
 * sits behind it and our own dead_click stores that. Replaying those and
 * calling each a defect produced 14 findings on the first session tried, all
 * of them `div.flex`, `p` or `strong` — a finger resting on prose.
 *
 * So the question is the one the product's own detector now asks: is a
 * DISABLED control under that point? That is a defect wherever it is, and a
 * thumb on a paragraph is not.
 */
async function blockedControlAt(page, selector) {
  return page.evaluate((sel) => {
    const n = document.querySelector(sel);
    if (!n) return null;
    const r = n.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const INTERACTIVE = "button,a[href],input,select,textarea,[role='button'],[role='link']";
    for (const el of n.querySelectorAll(INTERACTIVE)) {
      const cs = getComputedStyle(el);
      const dead =
        el.disabled === true ||
        el.getAttribute("aria-disabled") === "true" ||
        cs.pointerEvents === "none";
      if (!dead) continue;
      const b = el.getBoundingClientRect();
      if (x >= b.left && x <= b.right && y >= b.top && y <= b.bottom) {
        return `${el.tagName.toLowerCase()}.${String(el.className || "").split(" ")[0]}`;
      }
    }
    return null;
  }, selector);
}

const DONE = { tapped: true, exists: true };

async function perform(step, page, cdp) {
  switch (step.event) {
    case "$pageview":
      return DONE; // already there; a second navigation would discard the state
    case "scroll_depth_25":
    case "scroll_depth_50":
    case "scroll_depth_75":
    case "scroll_depth_100": {
      const pct = Number(step.event.slice("scroll_depth_".length)) / 100;
      const target = await page.evaluate(
        (p) => (document.documentElement.scrollHeight - window.innerHeight) * p,
        pct
      );
      for (let i = 0; i < 40; i += 1) {
        const y = await page.evaluate(() => window.scrollY);
        if (y >= target - 50) break;
        const { moved } = await touchScroll(cdp, page, Math.min(900, target - y));
        if (moved <= 0) break;
      }
      return DONE;
    }
    case "report_chapter_menu_opened":
      return tap(page, cdp, ".report-chapter-pill__btn");
    case "section_navigated": {
      const m = await tap(page, cdp, ".report-mobile-nav__link");
      return m.tapped ? m : tap(page, cdp, ".report-sidebar__item");
    }
    case "lock_icon_clicked":
      return tap(page, cdp, ".report-locked-preview");
    case "unlock_click":
    case "paywall_initiated":
      return tap(page, cdp, ".report-premium-overlay__cta");
    case "sticky_unlock_clicked":
      return tap(page, cdp, ".report-sticky-unlock__cta");
    case "paywall_dismissed":
      return tap(page, cdp, ".report-pricing-modal__close");
    case "dead_click":
      return step.selector ? tap(page, cdp, step.selector) : { tapped: false, exists: false };
    default:
      return { tapped: false, exists: false };
  }
}

/**
 * Is the page still usable? Checked after EVERY step, because the whole point
 * is that the damage appears part-way through a sequence.
 */
async function inspect(page, cdp) {
  const state = await page.evaluate(() => {
    /**
     * PRESENT IN THE DOM IS NOT OPEN, and getting this wrong disables the
     * whole probe. Both dialogs on this page are always in the document:
     * `.report-pricing-modal__dialog` sits there at `visibility: hidden`, and
     * CookieYes leaves `.cky-consent-container` visible after Accept. A
     * presence test therefore reported "a dialog is open" for every step of
     * every run, and since a lock is only a fault when nothing is open, every
     * check below was suppressed — the MUTATE run passed while painting its
     * own scroll lock, which is how this was found.
     */
    const shown = (n) => {
      if (!n) return false;
      const cs = getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false;
      const r = n.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    /**
     * The ROOT, not the inner dialog. `.report-pricing-modal__dialog` sits
     * inside an animating viewport and can read as `opacity: 0` while the
     * paywall is genuinely up — which made an open paywall look like a
     * stranded lock and reported a defect four times in one iPhone run. The
     * root is the element that actually covers the page, so it is the one
     * whose visibility answers "is a dialog open".
     */
    const dialogOpen = [
      ...document.querySelectorAll(
        '[role="dialog"]:not([hidden]), .report-pricing-modal, .share-report-modal'
      ),
    ].some(shown);
    const body = getComputedStyle(document.body);
    // Named, not counted. "1 full-screen overlay" is not something anyone can
    // act on, and a finding nobody can chase is the same as no finding.
    const covering = [];
    for (const el of document.querySelectorAll("div,section,aside")) {
      const cs = getComputedStyle(el);
      if (cs.position !== "fixed" || cs.visibility === "hidden" || cs.opacity === "0") continue;
      const r = el.getBoundingClientRect();
      if (r.width >= window.innerWidth * 0.95 && r.height >= window.innerHeight * 0.95) {
        covering.push(`${el.tagName.toLowerCase()}.${String(el.className || "").split(" ")[0]}`);
      }
    }
    return {
      dialogOpen,
      locked: body.overflow === "hidden" || body.position === "fixed",
      covering,
      scrollable: document.documentElement.scrollHeight > window.innerHeight + 100,
    };
  });

  const faults = [];
  // A lock with a dialog open is the CORRECT behaviour — that is how a modal
  // stops the page behind it moving. Only a lock with nothing open is a fault.
  if (state.locked && !state.dialogOpen) faults.push("the page was locked with no dialog open");
  if (state.covering.length > 0 && !state.dialogOpen) {
    faults.push(`${state.covering.join(", ")} covers the page with no dialog open`);
  }
  if (state.scrollable && !state.dialogOpen) {
    const { moved, real } = await touchScroll(cdp, page, 400);
    // WebKit has no CDP, so a moved page there proves nothing about a finger.
    // The lock-state check above is what covers iOS; see touch.mjs.
    if (real && moved <= 0) faults.push("a real finger could not scroll the page");
  }
  return faults;
}

/**
 * A route supplied directly, instead of read from PostHog.
 *
 * Two things need this. The contract check in
 * verify-probe-falsifiability.mjs points every gate probe at a refused
 * connection and requires exit 3 — but without a route this probe exits 3 at
 * its first guard, before it ever tries to reach the site, so the check would
 * pass while testing nothing. And a unit test cannot query PostHog at all.
 *
 *   REPLAY_STEPS=scroll_depth_25,report_chapter_menu_opened
 */
const scriptedSteps = (process.env.REPLAY_STEPS ?? "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean)
  .map((event) => ({ event, ts: "", vw: 0, os: "", selector: "", url: "" }));

let all;
if (scriptedSteps.length > 0) {
  all = scriptedSteps;
} else {
  if (!SESSION_ID) fail("SESSION_ID is not set — nothing to replay. INCONCLUSIVE");
  if (!process.env.POSTHOG_API_KEY) fail("POSTHOG_API_KEY is not set — INCONCLUSIVE");
  try {
    all = await sessionPath(SESSION_ID);
  } catch (err) {
    fail(`could not read the session (${String(err).slice(0, 120)}) — INCONCLUSIVE`);
  }
}
const steps = all.filter((s) => REPLAYABLE.has(s.event));
if (steps.length === 0) {
  fail(`session ${SESSION_ID} has no replayable steps (${all.length} events) — INCONCLUSIVE`);
}

const deviceName = deviceFor(steps);
if (!devices[deviceName]) fail(`unknown device ${deviceName} — INCONCLUSIVE`);
const engine = /iphone|ipad/i.test(deviceName) ? webkit : chromium;

console.log(
  `replaying ${steps.length} step(s) from ${SESSION_ID || "REPLAY_STEPS"} on ${deviceName}`
);

const browser = await engine.launch();
const ctx = await browser.newContext({ ...devices[deviceName], locale: "en-US" });
await ctx.addCookies(stagingCookies(ORIGIN)).catch(() => {});
const page = await ctx.newPage();
const thrown = [];
page.on("pageerror", (e) => thrown.push(String(e).slice(0, 160)));

if (process.env.MUTATE === "1") {
  /**
   * Strand the scroll lock, which is the defect class this exists to catch.
   *
   * On an INTERVAL, not once. A one-shot paint is stripped the moment React
   * hydrates and re-renders the body, and a mutation that the app quietly
   * undoes reports PASS while claiming to have injected a defect — this
   * corpus has shipped that mistake twice.
   */
  await page.addInitScript(() => {
    setInterval(() => {
      document.body.style.setProperty("overflow", "hidden", "important");
    }, 200);
  });
}

/**
 * Two denominators, because they answer different questions.
 *
 * ROUTE steps are the shape of the visit — where they scrolled, what they
 * opened, what they dismissed. Those must be followed for a clean verdict to
 * mean anything, and they are what the threshold gates on.
 *
 * RECORDED DEAD TAPS are content: the reader tapped `span.is-filled` on THEIR
 * report, and most such selectors name something that is not on ours. Failing
 * to find one says nothing about the page's health, so folding it into the
 * same fraction would drag every run to inconclusive — measured at 42% against
 * the route's 90% on the first session tried.
 */
let routeTotal = 0;
let routeDone = 0;
let tapsPresent = 0;
let tapsTried = 0;
const faults = [];
try {
  const res = await page.goto(`${ORIGIN}/report/${TOKEN}`, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  if (!res || !res.ok()) {
    fail(`report did not load (${res ? res.status() : "no response"}) — INCONCLUSIVE`);
  }
  await page.waitForTimeout(6000);
  await page
    .locator(".cky-btn-accept")
    .click({ timeout: 4000 })
    .catch(() => {});
  await page.waitForTimeout(800);

  const cdp = engine === chromium ? await ctx.newCDPSession(page) : null;

  for (const [i, step] of steps.entries()) {
    const isTap = step.event === "dead_click";
    const r = await perform(step, page, cdp).catch(() => ({ tapped: false, exists: false }));

    if (isTap) {
      tapsTried += 1;
      if (!r.exists) {
        console.log(`  ${i + 1}. dead tap on ${step.selector} — not on this report`);
        continue;
      }
      tapsPresent += 1;
      const blocked = await blockedControlAt(page, step.selector).catch(() => null);
      if (blocked) {
        // A control that is here and cannot be used. This is the reader's dead
        // tap happening again, and it is evidence no report probe has ever
        // been able to produce.
        faults.push(`the reader's dead tap on ${step.selector} lands on a disabled ${blocked}`);
        console.log(`  ${i + 1}. dead tap on ${step.selector} — REPEATS (disabled ${blocked})`);
        continue;
      }
      console.log(`  ${i + 1}. dead tap on ${step.selector} — ordinary content, not a control`);
    } else {
      routeTotal += 1;
      if (!r.tapped) {
        console.log(`  ${i + 1}. ${step.event} — could not perform`);
        continue;
      }
      routeDone += 1;
      console.log(`  ${i + 1}. ${step.event} — ok`);
    }

    const found = await inspect(page, cdp);
    for (const f of found) faults.push(`after ${step.event}: ${f}`);
    if (found.length) console.log(`      ${found.join("; ")}`);
  }
} catch (err) {
  console.log(`exception: ${String(err).slice(0, 200)}`);
  await browser.close();
  process.exit(3);
}
await browser.close();

for (const t of thrown) faults.push(`the page threw: ${t}`);

const share = routeTotal === 0 ? 0 : routeDone / routeTotal;
console.log(
  `\nfollowed ${routeDone} of ${routeTotal} route step(s); ` +
    `${tapsPresent} of ${tapsTried} recorded dead tap(s) exist on this report`
);

if (faults.length > 0) {
  console.log(`REPRODUCED:\n  ${[...new Set(faults)].join("\n  ")}`);
  process.exit(1);
}
if (share < MIN_REPLAYED_SHARE) {
  console.log(
    `only ${Math.round(share * 100)}% of the route could be followed — ` +
      `a clean run here is not evidence. INCONCLUSIVE`
  );
  process.exit(3);
}
console.log("clean — the reader's own route reproduces nothing");
process.exit(0);
