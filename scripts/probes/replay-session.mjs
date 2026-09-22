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
 * MUTATE CANNOT FLIP EVERY SESSION, and that is a fact about the session rather
 * than a hole in the probe. It flips one that has either a route step with no
 * dialog open, or a recorded tap whose selector contains a control. A session
 * that scrolled (opening the paywall, which stays open) and then tapped only
 * prose — `h2`, `p`, `div.report-prose` — offers nothing of either kind, so
 * there is no defect of the kind this probe detects to inject. Session
 * 01a0bc7d is exactly that and stays at 0; 01a09bfd and 01a0bf3d flip. Pick a
 * session with taps on controls when using MUTATE as a check.
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
 * And a minimum ABSOLUTE number of steps, because a share cannot see this.
 *
 * Measured over 30 days of report sessions: 450 of 688 have no route steps at
 * all (the probe already exits 3 on those), and another 99 have one or two.
 * **80% sit at two or fewer.** A one-step session scores share 1.0 and would
 * print "clean — the reader's own route reproduces nothing", which is a clean
 * verdict earned by a single scroll. Worse, this probe is registered as
 * claim-scoped, so that verdict counts as EVIDENCE in the scorer — the exact
 * "a clear that could not have disagreed" failure the rest of this pipeline
 * exists to stop.
 *
 * Three is where a sequence starts to mean anything, and it still leaves 139
 * sessions a month replayable — about five a day against a budget of two per
 * run.
 *
 * This withholds a CLEAN verdict only. A fault found while following two steps
 * is still reported, because the faults check runs first: finding a defect on a
 * short route is real, declaring a short route defect-free is not.
 */
const MIN_ROUTE_STEPS = 3;

/**
 * How many things must have been genuinely examined before a clean run counts.
 * A route step with no dialog open, or a recorded tap target that exists here —
 * either is a real look at this reader's session. Three is the same bar as a
 * route, for the same reason: fewer than that is a page load, not a visit.
 */
const MIN_EXAMINED = 3;

/**
 * Events that describe a step we can actually perform on the page.
 *
 * Two events are deliberately NOT here, both because they are not things the
 * reader DID:
 *
 *  - `locked_card_price_shown` fires once on mount behind a one-shot ref when a
 *    price renders. Nothing to tap; it failed on 6 of 6 sessions and quietly
 *    cost every run a point of route coverage.
 *  - `$pageview` is already where we are, and re-navigating would discard the
 *    state the sequence has built up. Performing it was a no-op that always
 *    succeeded, so it padded the denominator with steps that could not fail —
 *    4 of the first session's 9 "route steps" were free passes, which is a
 *    coverage figure flattering itself.
 */
const REPLAYABLE = new Set([
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

/**
 * The same allowlist every other per-session lookup here uses.
 *
 * The first version stripped quotes out of the id before interpolating it,
 * which is escapable: a TRAILING BACKSLASH escapes the closing quote, and
 * `SESSION_ID='x\\'` produced "unterminated string literal" from PostHog — the
 * input had reached the SQL. It failed safe, but only by accident. An allowlist
 * cannot be escaped, and `isSafeSessionId` in review.ts is the same rule; it is
 * restated rather than imported because that file is TypeScript with `@shared`
 * aliases and this probe runs under plain `node`.
 */
const isSafeSessionId = (id) => /^[A-Za-z0-9-]{1,64}$/.test(String(id));

async function sessionPath(sessionId) {
  const rows = await hogQuery(
    `SELECT event, timestamp, properties.$viewport_width, properties.$os,
            properties.target_selector, properties.$current_url
       FROM events
      WHERE properties.$session_id = '${sessionId}'
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

/**
 * The reader's own screen, not ours — a layout defect is width-specific.
 *
 * The SESSION's own events win over the verifier's `DEVICES`, which is the
 * opposite of every other probe here and is deliberate. `DEVICES` is derived
 * from the finding's viewport width alone; these events carry the width AND
 * the operating system, so they can tell an iPhone from an Android at the same
 * width and pick the right engine. `DEVICES` is still read when the session
 * says nothing, because an input that is passed and silently ignored is how a
 * probe ends up running a list nobody chose while its verdict claims otherwise.
 */
function deviceFor(steps) {
  const explicit = process.env.DEVICE;
  if (explicit) return explicit;
  const ios = steps.some((s) => /ios|mac/i.test(s.os));
  const width = steps.map((s) => s.vw).find((w) => w > 0) ?? 0;
  if (width === 0 && !ios) {
    const passed = (process.env.DEVICES ?? "")
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);
    if (passed.length > 0) return passed[0];
  }
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
    const doc = document.documentElement;
    return {
      dialogOpen,
      locked: body.overflow === "hidden" || body.position === "fixed",
      covering,
      scrollable: doc.scrollHeight > window.innerHeight + 100,
      // Which way there is still room to go. A page resting at its end cannot
      // scroll further, and that is not a defect — it is the single commonest
      // reason a real swipe moves nothing (see the $dead_swipe write-up).
      roomBelow: doc.scrollHeight - (window.scrollY + window.innerHeight),
      roomAbove: window.scrollY,
    };
  });

  const faults = [];
  // A lock with a dialog open is the CORRECT behaviour — that is how a modal
  // stops the page behind it moving. Only a lock with nothing open is a fault.
  //
  // Which means an open dialog SUPPRESSES every check below, and the caller has
  // to know that: scrolling this report opens the paywall on its own, it is
  // never dismissed unless the reader's route says so, and from that moment a
  // clean run is clean because nothing could be seen. Measured with MUTATE=1 on
  // a scroll-only route: the injected scroll lock was invisible, three runs out
  // of three.
  if (state.locked && !state.dialogOpen) faults.push("the page was locked with no dialog open");
  if (state.covering.length > 0 && !state.dialogOpen) {
    faults.push(`${state.covering.join(", ")} covers the page with no dialog open`);
  }
  /**
   * SCROLL WHERE THERE IS ROOM, or do not claim anything.
   *
   * This pushed down by a fixed 400px. After the reader's route reaches
   * `scroll_depth_100` the page is resting at its end, 400 more moves nothing,
   * and the probe called that "a real finger could not scroll the page" — then
   * the verifier turned it into "❗ Reproduced in production on Pixel 7" for a
   * reader whose only crime was reading to the bottom. It fired three times in
   * one CI run, on scroll_depth_50, _75 and _100, and it did NOT fire locally,
   * because locally those steps had not driven the page as far.
   *
   * It is also the benign case our own $dead_swipe investigation had already
   * identified: a swipe at the end of a page moves nothing, and on /survey that
   * alone would have produced ~100 false findings a week.
   */
  if (state.scrollable && !state.dialogOpen) {
    const dy = state.roomBelow > 120 ? 400 : state.roomAbove > 120 ? -400 : 0;
    if (dy !== 0) {
      const { moved, real } = await touchScroll(cdp, page, dy);
      // WebKit has no CDP, so a moved page there proves nothing about a finger.
      // The lock-state check above is what covers iOS; see touch.mjs.
      if (real && moved === 0) faults.push("a real finger could not scroll the page");
    }
  }

  /**
   * ASK AGAIN BEFORE ACCUSING ANYONE. The state above is a snapshot, and a
   * paywall that is OPENING locks the body before its root is visible enough to
   * count as shown — mid-animation it is still `opacity: 0`. In that window
   * `dialogOpen` reads false while the page is legitimately immovable, and
   * every check here fires on correct behaviour.
   *
   * That is not hypothetical. The first CI run of this probe reported
   *
   *     CONFIRM 01a0c4c6…  D1  ❗ Reproduced in production on Pixel 7 —
   *     after scroll_depth_50/75/100: a real finger could not scroll the page
   *
   * on a session where scrolling had simply opened the paywall. It was a dry
   * run, so it went nowhere; on a live run that posts "Reproduced in
   * production" under a real reader's submission, which is the single worst
   * thing this pipeline can do.
   *
   * Re-reading costs one evaluate and only ever REMOVES an accusation.
   */
  if (faults.length > 0) {
    const nowOpen = await page.evaluate(() => {
      const shown = (n) => {
        if (!n) return false;
        const cs = getComputedStyle(n);
        if (cs.display === "none" || cs.visibility === "hidden") return false;
        const r = n.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      return [
        ...document.querySelectorAll(
          '[role="dialog"]:not([hidden]), .report-pricing-modal, .share-report-modal'
        ),
      ].some(shown);
    });
    // Deliberately NOT checking opacity here: a dialog mid-fade is open enough
    // to explain a locked page, and the point of the second look is to forgive.
    if (nowOpen) return { faults: [], suppressed: true };
  }

  return { faults, suppressed: state.dialogOpen };
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
  if (!isSafeSessionId(SESSION_ID)) fail(`SESSION_ID is not a session id — INCONCLUSIVE`);
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
   * TWO defects, because one was not visible to every session.
   *
   * The scroll lock alone flipped Android sessions and not iOS ones, and the
   * reason is structural rather than flaky: WebKit exposes no CDP, so the
   * "a real finger could not scroll" check is skipped there by design, and the
   * lock check is suppressed whenever a dialog is open — which on this report
   * is most of the time, because scrolling opens the paywall by itself. On
   * session 01a0bc7d (iPhone 15 Pro) MUTATE=1 therefore exited 0: the probe
   * passed while carrying an injected defect, which is the failure this mode
   * exists to rule out.
   *
   * So it also disables every control. That is what the dead-tap check looks
   * for — a control a finger cannot use under a point the reader tapped — and
   * that check is suppressed by neither the engine nor an open dialog.
   *
   * On an INTERVAL, not once: a one-shot paint is stripped the moment React
   * hydrates and re-renders, and a mutation the app quietly undoes reports PASS
   * while claiming to have injected a defect. This corpus has shipped that
   * mistake twice.
   */
  await page.addInitScript(() => {
    setInterval(() => {
      document.body.style.setProperty("overflow", "hidden", "important");
      for (const el of document.querySelectorAll("button,a[href],input,[role='button']")) {
        el.setAttribute("aria-disabled", "true");
        el.style.setProperty("pointer-events", "none", "important");
      }
    }, 200);
  });
}

let routeTotal = 0;
let routeDone = 0;
/**
 * ROUTE steps inspected with no dialog open — the only ones where a clean
 * answer means anything.
 *
 * Counted here rather than derived as `routeDone - suppressed`, which was wrong
 * and loudly so: `inspect()` also runs after dead taps, so subtracting a count
 * that spans both kinds from a count that spans one produced -14, -23, -27.
 */
let routeCheckable = 0;
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

    const seen = await inspect(page, cdp);
    if (!isTap && !seen.suppressed) routeCheckable += 1;
    for (const f of seen.faults) faults.push(`after ${step.event}: ${f}`);
    if (seen.faults.length) console.log(`      ${seen.faults.join("; ")}`);
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
  `\nfollowed ${routeDone} of ${routeTotal} route step(s), ` +
    `${routeCheckable} of them checkable; ` +
    `${tapsPresent} of ${tapsTried} recorded dead tap(s) exist on this report`
);

if (faults.length > 0) {
  console.log(`REPRODUCED:\n  ${[...new Set(faults)].join("\n  ")}`);
  process.exit(1);
}
/**
 * A CLEAN VERDICT NEEDS SOMETHING TO HAVE BEEN EXAMINED, and the two kinds of
 * check here are examined under very different conditions.
 *
 * The lock and overlay checks are suppressed whenever a dialog is open, because
 * a locked page behind a modal is CORRECT. On this report that is nearly always:
 * scrolling opens the paywall by itself and it stays open unless the reader's
 * own route dismisses it, so on four real sessions measured 2026-09-22 the
 * checkable route steps were 0, 0, 0 and 0. Those runs had been printing
 * "clean — the reader's own route reproduces nothing", which was clean because
 * nothing could be seen. With MUTATE=1 on a scroll-only route the injected
 * scroll lock was invisible three times out of three.
 *
 * The dead-tap check has no such problem: it asks whether a disabled control
 * sits under a point the reader actually tapped, which an open dialog does not
 * forgive. Those same four sessions examined 15, 23, 26 and 29 real elements.
 *
 * So the bar is on what was ACTUALLY examined, from either source. A run that
 * examined nothing says so.
 */
const examined = routeCheckable + tapsPresent;
if (examined < MIN_EXAMINED) {
  console.log(
    `only ${examined} thing(s) could be examined — ${routeCheckable} route step(s) with no ` +
      `dialog open, ${tapsPresent} recorded tap(s) present here. A clean run on that is not ` +
      `evidence. INCONCLUSIVE`
  );
  process.exit(3);
}
if (routeTotal >= MIN_ROUTE_STEPS && share < MIN_REPLAYED_SHARE) {
  console.log(
    `only ${Math.round(share * 100)}% of the route could be followed — ` +
      `a clean run here is not evidence. INCONCLUSIVE`
  );
  process.exit(3);
}
console.log(
  `clean — nothing reproduced across ${routeCheckable} checkable route step(s) ` +
    `and ${tapsPresent} of the reader's own tap targets`
);
process.exit(0);
