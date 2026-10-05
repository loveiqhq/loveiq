/**
 * One persona walk on staging: the survey answered as that archetype, the report, the
 * paywall, a test-card purchase and the unlocked report, recorded screen by screen for
 * the judge (scripts/walkers/judge.ts).
 *
 * Staging only, and it refuses anything else. A walk submits a real survey, pays and
 * triggers the report emails. On staging all of that is harmless:
 * - staging has its own database, never production's;
 * - Stripe is in test mode, and the walk pays with the 4242 test card;
 * - staging's Slack alerts go to #brain, not the team's channels;
 * - every email goes to Resend's test inbox (delivered+<walk>@resend.dev), which accepts
 *   and discards it;
 * - analytics hosts are blocked in the browser, so no walk reaches GA4, PostHog or Clarity.
 *
 *   npx tsx scripts/walkers/walk.ts --persona "Spark Seeker" --device "Pixel 7"
 *   npx tsx scripts/walkers/walk.ts --persona "Spark Seeker" --device "Desktop Chrome" --no-pay
 *
 * Writes <WALK_OUT or walks>/<slug>/walk.json plus the screenshots it names. Exit 0 when the
 * walk reached the end, whatever it found on the way; 1 when it could not finish; 2 on bad
 * input.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chromium, devices, webkit, type Locator, type Page } from "playwright";

import { surveyQuestions, type SurveyQuestion } from "@/data/survey-data";

import { stagingCookies } from "../probes/staging-cookie.mjs";
import personasFile from "./personas.json";
import {
  emptyLog,
  plantsFor,
  scrubEvent,
  truthOf,
  type Escape,
  type Plants,
  type Quit,
  type WalkLog,
} from "./plants";
import { PLANS, type Plan } from "./rotation";

export const STAGING = "https://staging.loveiq.org";
/**
 * Production's code on staging's database: the staging project's build of `main`, with its
 * Preview settings (staging's Supabase, Stripe test keys, staging's site address), checked
 * 2026-10-01. The proof walks run here, so what they prove is what production runs.
 */
export const MAIN_ON_STAGING = "https://loveiq-staging-git-main-loveiq.vercel.app";
/** Blocked in the browser: a walk is not a visitor and must never reach analytics. */
export const ANALYTICS =
  /googletagmanager|google-analytics|googleadservices|doubleclick|posthog|clarity\.ms|facebook|hotjar/;
/** Each plan's title, as the paywall card and the return page name it. */
export const PLAN_TITLE: Record<Plan, RegExp> = {
  full_report: /just a snapshot/i,
  core: /all your core archetypes/i,
  all_reports: /for you (?:&|and) your partner/i,
};
/**
 * The pre-report wizard's forward button, and its last slide's. That last button is "View
 * your report" on main and "Continue to your report" on the staging branch (since 1 October
 * 2026); knowing only main's name, every walk on staging stopped there from 2 to 5 October.
 */
export const WIZARD_FORWARD = /continue to next slide|view your report|continue to your report/i;
export const WIZARD_LAST = /view your report|continue to your report/i;
/** Each plan's button on the paywall. */
const PLAN_CTA: Record<Plan, RegExp> = {
  full_report: /^unlock my report$/i,
  core: /^unlock now$/i,
  all_reports: /^unlock us$/i,
};

export interface Step {
  n: number;
  kind: string;
  /** ms since the walk started, and since the previous step. */
  at: number;
  ms: number;
  url: string;
  heading: string | null;
  progress?: string;
  qId?: string;
  answer?: unknown;
  note?: string;
  text?: string;
  shot?: string;
  overflowX?: boolean;
  errors?: string[];
}

export interface Walk {
  persona: string;
  device: string;
  plan: Plan | null;
  /** The report read: the default (what loveiq.org shows) or Fatih's V4 (`?v4=1`). */
  report: "default" | "v4";
  origin: string;
  startedAt: string;
  finished: boolean;
  stoppedAt?: string;
  questionsAsked?: number;
  unknownQuestions: string[];
  missingOptions: string[];
  /** The archetype the report API returned, and the one the page shows first. */
  serverArchetype?: string | null;
  assignedArchetype?: string | null;
  prices?: string[];
  paid?: boolean;
  /** The plan the return page says was bought, read from its title. */
  boughtPlan?: Plan | null;
  /** Set when the report could not be scrolled by a finger (body or html overflow:hidden). */
  scrollLocked?: boolean;
  /** What put the paywall in front of the walk: the sticky bar, a lock, or the report itself. */
  paywallOpenedBy?: string;
  locksBefore?: number;
  locksAfter?: number;
  steps: Step[];
  /** Every top-level navigation and every paywall click, in order, ms since the start. */
  timeline: string[];
  consoleErrors: string[];
  failedRequests: string[];
  slowRequests: string[];
  durationMs?: number;
  /** A proof walk's planted behaviours, and any the site would not let it carry out. */
  planted?: string[];
  plantFailures?: string[];
}

const norm = (s: string) =>
  s.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim().toLowerCase();
const BY_TEXT = new Map(surveyQuestions.map((q) => [norm(q.question), q]));

/**
 * Staging, or this machine when asked for explicitly. Never loveiq.org: a walk submits a
 * survey, pays and sends the report emails, and on production all three are real.
 */
export function walkableOrigin(origin: string, allowLocal: boolean): boolean {
  const { hostname, protocol } = new URL(origin);
  if (hostname === "staging.loveiq.org" && protocol === "https:") return true;
  if (origin === MAIN_ON_STAGING) return true;
  return allowLocal && (hostname === "localhost" || hostname === "127.0.0.1");
}

/** A question as the walker recognises it: by the exact words of its heading. */
export function findQuestion(headings: string[]): SurveyQuestion | null {
  for (const h of headings) {
    const q = BY_TEXT.get(norm(h));
    if (q) return q;
  }
  return null;
}

/**
 * Anything that may reach the public Actions log (the summary line, `stoppedAt`) or a Slack
 * post, with the tokens taken out: report tokens, Stripe sessions, and every query string.
 * A navigation error's first line can carry the whole URL of the return page.
 */
/**
 * Why a walk stopped, for the log and the night's message: Playwright's first line, plus
 * what it was waiting for. The first line alone ("locator.click: Timeout 30000ms exceeded.")
 * hid for four nights which button was missing.
 */
export function stoppedAtOf(err: unknown): string {
  const message = String((err as Error)?.message ?? err);
  const waitingFor = /waiting for (.+)/.exec(message)?.[1]?.trim();
  const first = message.split("\n")[0]!;
  return redact(waitingFor ? `${first} (waiting for ${waitingFor})` : first).slice(0, 200);
}

export function redact(text: string): string {
  return text
    .replace(/(https?:\/\/[^\s?"')]+|\/[\w./-]*)\?[^\s"')]*/g, "$1")
    .replace(/rpt_[A-Za-z0-9_-]+/g, "rpt_<token>")
    .replace(/cs_(?:test|live)_[A-Za-z0-9_-]+/g, "cs_<session>")
    .replace(/\/report\/[^/\s"')]+/g, "/report/<token>");
}

/** The persona's answer for a question; name, email and country are set per walk. */
export function answerFor(
  q: SurveyQuestion,
  answers: Record<string, unknown>,
  email: string,
  firstName: string
): unknown {
  if (q.answerType === "open") {
    if (q.inputType === "email") return email;
    // The ZIP / postal code question: a Berlin postal code, not a name.
    return /zip|postal|postcode/i.test(q.question) ? "10967" : firstName;
  }
  if (q.answerType === "country") return "Germany";
  return answers[q.qId] ?? null;
}

export function slugFor(persona: string, device: string): string {
  const s = (x: string) =>
    x
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  return `${s(persona)}--${s(device)}`;
}

/**
 * Seconds a person spends on each kind of question, roughly: the survey promises ~15
 * minutes for ~60 questions. A walk that answers ten times faster than anyone can trips
 * the draft-save rate limit (20 a minute) and reports the bot, not the product.
 * WALK_PACE scales it; 0.2 for a quick local try.
 */
export const THINK_SECONDS: Record<string, number> = {
  scale: 2.5,
  single: 3.5,
  multiple: 5,
  open: 5,
  country: 4,
  unknown: 4,
};

/**
 * Installed in a proof walk's pages before any of the page's own scripts. Plain JS in a
 * string: tsx wraps named functions in a __name() the page has never heard of.
 *
 * 1. The tap track() calls (features/analytics/client.ts): each event goes to the walk.
 * 2. The walk's own watch on the locked chapters' unlock button, the same geometry the
 *    site's cta_seen uses (half of it in view), so the walk knows the truth by itself.
 * 3. The walk's own scroll listener on the report: the deepest point reached, and how deep
 *    it was when the prices first appeared. A smooth jump ends after the walk would have
 *    looked, and a paywall that opens by itself locks the page a moment later; a reading
 *    taken between steps missed both on 2026-10-01 (it said 75 where the site said 100).
 */
export const PROOF_PAGE_SCRIPT = `
window.__loveiqEventTap = function (name, params) {
  try { window.__walkHeard(Date.now(), name, JSON.stringify(params || {})); } catch (e) {}
};
(function () {
  function watch() {
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting && entries[i].intersectionRatio >= 0.5) window.__walkCtaSeen = true;
      }
    }, { threshold: 0.5 });
    var watched = new WeakSet();
    function scan() {
      var els = document.querySelectorAll(".report-premium-overlay__cta");
      for (var i = 0; i < els.length; i++) {
        if (!watched.has(els[i])) { watched.add(els[i]); io.observe(els[i]); }
      }
    }
    if (!document.documentElement) return;
    new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
    scan();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch);
  else watch();
})();
(function () {
  // On every page, checked inside: the survey reaches the report without a page load, so a
  // listener installed only when a document starts on /report/ would never start at all.
  var max = 0;
  var onReport = function () { return location.pathname.indexOf("/report/") === 0; };
  addEventListener("scroll", function () {
    if (!onReport()) return;
    var total = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    var pct = Math.min(100, Math.max(0, Math.round((scrollY / total) * 100)));
    if (pct > max) { max = pct; window.__walkMaxScroll = max; }
  }, { passive: true });
  var pricesOpen = false;
  var mo = new MutationObserver(function () {
    var open = !!document.querySelector(".report-pricing-modal.is-visible");
    // When the plans last appeared, by the page's own clock: the report can open them by
    // itself while the walk waits on a tap, and the walk then timed the offer 10.6 s late.
    if (open && !pricesOpen) window.__walkPricesShownAt = Date.now();
    pricesOpen = open;
    if (!onReport() || window.__walkScrollBeforePrices !== undefined) return;
    if (open) window.__walkScrollBeforePrices = max;
  });
  // In some frames the document has no element yet when this runs; observing null throws.
  // childList too: a picker mounted already open changes no class.
  var start = function () {
    mo.observe(document.documentElement, {
      attributes: true, attributeFilter: ["class"], childList: true, subtree: true,
    });
  };
  if (document.documentElement) start();
  else document.addEventListener("DOMContentLoaded", start);
})();
`;

/** How far down the page is, the way scroll_depth reckons it (shared/observability/uxSignals.ts). */
const scrollPct = (page: Page) =>
  page
    .evaluate(() => {
      const total = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      return Math.min(100, Math.max(0, Math.round((window.scrollY / total) * 100)));
    })
    .catch(() => 0);

function parseArgs(argv: string[]) {
  const get = (k: string) => {
    const i = argv.indexOf(k);
    return i > -1 ? argv[i + 1] : undefined;
  };
  return {
    persona: get("--persona"),
    device: get("--device") ?? "Pixel 7",
    plan: get("--plan") as Plan | undefined,
    report: get("--report") ?? "default",
    pay: !argv.includes("--no-pay"),
    // No trailing slash, or every origin comparison below misses.
    origin: (process.env.WALK_ORIGIN ?? STAGING).replace(/\/+$/, ""),
    out: process.env.WALK_OUT ?? "walks",
    pace: Number(process.env.WALK_PACE ?? "1") || 1,
    // A proof walk plants behaviours and records its events (plants.ts). --seed makes a
    // night's plants repeatable; --quit leaves early, there.
    proof: argv.includes("--proof"),
    seed: get("--seed"),
    quit: get("--quit") as Quit | undefined,
  };
}

interface Screen {
  headings: string[];
  progress: string | null;
  text: string;
}

async function readScreen(page: Page): Promise<Screen> {
  return page
    .evaluate(() => {
      // No named helpers in here: tsx wraps them in a __name() call the page has never heard of.
      const headings = [...document.querySelectorAll("h1, h2, h3")]
        .filter((e) => (e as HTMLElement).offsetParent !== null || e.getClientRects().length > 0)
        .map((e) => (e.textContent ?? "").replace(/\s+/g, " ").trim())
        .filter(Boolean);
      // What is on screen right now, not the page's first lines: a report is one long page.
      // Every visible text node, so a number in a bare <span> ("0% complete") is not missed.
      const inView: string[] = [];
      // An open dialog is what the person is looking at; the page behind it is out of reach.
      const dialog = [...document.querySelectorAll('[aria-modal="true"], [role="dialog"]')].find(
        (d) => (d as HTMLElement).offsetParent !== null || d.getClientRects().length > 0
      );
      const walker = document.createTreeWalker(dialog ?? document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const el = node.parentElement;
        const t = (node.textContent ?? "").replace(/\s+/g, " ").trim();
        // aria-hidden stays in: it is hidden from screen readers, not from eyes.
        if (!el || !t || el.closest("script, style, noscript")) continue;
        const r = el.getBoundingClientRect();
        if (r.bottom <= 0 || r.top >= window.innerHeight || r.width === 0 || r.height === 0)
          continue;
        if (
          getComputedStyle(el).visibility === "hidden" ||
          Number(getComputedStyle(el).opacity) === 0
        )
          continue;
        if (inView.at(-1) !== t) inView.push(t);
      }
      // The bar under every question screen, and only there: "Question n of N". Kept as
      // the share already answered, the number the survey_progress event carries, not
      // the bar's 15% head start.
      const bar = document.querySelector('[role="progressbar"][aria-label="Survey progress"]');
      const at = /Question (\d+) of (\d+)/.exec(bar?.getAttribute("aria-valuetext") ?? "");
      // The header's "PROGRESS 12%" from before the 2026-10-04 redesign. This walk runs
      // from main against staging.loveiq.org, which serves the staging branch; drop this
      // once staging carries the redesign.
      const old = at ? null : /progress\s+(\d+)%/i.exec(document.body?.innerText ?? "");
      return {
        headings,
        progress: at
          ? `${Math.round(((Number(at[1]) - 1) / Number(at[2])) * 100)}%`
          : old
            ? `${old[1]}%`
            : null,
        text: inView.join("\n").slice(0, 1500),
      };
    })
    .catch(() => ({ headings: [], progress: null, text: "" }));
}

async function main(argv: string[]): Promise<number> {
  const opts = parseArgs(argv);
  const persona = personasFile.personas.find((p) => p.archetype === opts.persona);
  if (!persona) {
    const known = personasFile.personas.map((p) => p.archetype).join(", ");
    console.error(`No persona "${opts.persona}". Known: ${known}`);
    return 2;
  }
  if (!walkableOrigin(opts.origin, process.env.WALK_ALLOW_LOCAL === "1")) {
    console.error(
      `Refusing ${opts.origin}: a walk submits, pays and emails, so it runs on staging only.`
    );
    return 2;
  }
  const device = devices[opts.device];
  if (!device) {
    console.error(`Unknown device "${opts.device}".`);
    return 2;
  }
  if (opts.report !== "default" && opts.report !== "v4") {
    console.error(`Unknown report "${opts.report}". Reports: default, v4`);
    return 2;
  }
  if (opts.plan && !PLANS.includes(opts.plan)) {
    console.error(`Unknown plan "${opts.plan}". Plans: ${PLANS.join(", ")}`);
    return 2;
  }
  // By hand, the cheapest plan; the nightly rotation names one (scripts/walkers/rotation.ts).
  const plan: Plan = opts.plan ?? "full_report";
  const slug = slugFor(persona.archetype, opts.device);
  const dir = join(opts.out, slug);
  mkdirSync(dir, { recursive: true });
  const stamp = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14);
  // Short on purpose: the part before the @ may be at most 64 characters, and a persona and
  // device slug can be 40 on their own. Walks run one at a time, so the second is unique.
  const email = `delivered+walk${stamp}@resend.dev`;
  const firstName = "Walker";

  const walk: Walk = {
    persona: persona.archetype,
    device: opts.device,
    plan: opts.pay ? plan : null,
    report: opts.report as Walk["report"],
    origin: opts.origin,
    startedAt: new Date().toISOString(),
    finished: false,
    unknownQuestions: [],
    missingOptions: [],
    steps: [],
    timeline: [],
    consoleErrors: [],
    failedRequests: [],
    slowRequests: [],
  };
  const t0 = Date.now();
  // Stopped at its time limit, or killed: say so in the record rather than vanish.
  process.once("SIGTERM", () => {
    walk.stoppedAt ??= "stopped at its time limit";
    walk.durationMs = Date.now() - t0;
    writeFileSync(join(dir, "walk.json"), JSON.stringify(walk, null, 2) + "\n");
    process.exit(1);
  });
  // Its own limit rather than the shell's, so it holds on any runner (macOS has no
  // `timeout`): 20 minutes, or WALK_TIME_LIMIT_MIN. Set before the browser starts, so a
  // launch that hangs is stopped and recorded too.
  const limitMin = Number(process.env.WALK_TIME_LIMIT_MIN) || 20;
  setTimeout(() => process.kill(process.pid, "SIGTERM"), limitMin * 60_000).unref();
  const engine = device.defaultBrowserType === "webkit" ? webkit : chromium;
  const browser = await engine.launch();
  const ctx = await browser.newContext({ ...device, locale: "en-US", timezoneId: "Europe/Berlin" });
  // The helper is plain JS, so its sameSite is typed string; its values are Playwright's.
  await ctx.addCookies(stagingCookies(opts.origin) as Parameters<typeof ctx.addCookies>[0]);
  // Production is never touched, whatever a page links to or redirects to.
  await ctx.route(/^https:\/\/(www\.)?loveiq\.org\//, (r) => r.abort());
  // A proof walk plants behaviours (plants.ts) and hears every event track() sends.
  const plants: Plants | null = opts.proof
    ? plantsFor(`${opts.seed ?? new Date().toISOString().slice(0, 10)}|${slug}`, {
        phone: Boolean(device.isMobile),
        quit: opts.quit,
      })
    : null;
  const log: WalkLog = emptyLog();
  const heard: Array<{ t: number; event: string; props: Record<string, unknown> }> = [];
  const planted: string[] = [];
  if (plants) {
    await ctx.exposeBinding("__walkHeard", (_src, t: number, name: string, json: string) => {
      try {
        heard.push(scrubEvent({ t, event: name, props: JSON.parse(json) }));
      } catch {
        // One event lost; the proof then shows the measure disagreeing, which is the point.
      }
    });
    await ctx.addInitScript(PROOF_PAGE_SCRIPT);
  }
  const page = await ctx.newPage();
  await page.route(ANALYTICS, (r) => r.abort());

  const mark = (what: string) => walk.timeline.push(`${Date.now() - t0}ms ${what}`);
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) {
      mark(
        `navigated to ${new URL(f.url()).origin}${new URL(f.url()).pathname.replace(/^\/report\/[^/]+/, "/report/<token>").replace(/^\/c\/pay\/.+/, "/c/pay/<session>")}`
      );
    }
  });
  let pending: string[] = [];
  // Ours only: Stripe's checkout page logs its own CSP refusals, which are not ours to fix.
  const noteError = (t: string) => {
    if (!page.url().startsWith(opts.origin)) return;
    walk.consoleErrors.push(t);
    pending.push(t);
  };
  page.on("console", (m) => {
    if (m.type() === "error") noteError(m.text().slice(0, 240));
  });
  page.on("pageerror", (e) => noteError(`uncaught: ${String(e.message).slice(0, 240)}`));
  const startedAt = new WeakMap<object, number>();
  page.on("request", (r) => startedAt.set(r, Date.now()));
  page.on("requestfinished", (r) => {
    const ms = Date.now() - (startedAt.get(r) ?? Date.now());
    const u = new URL(r.url());
    if (u.origin === opts.origin && u.pathname.startsWith("/api/") && ms > 3000) {
      walk.slowRequests.push(`${r.method()} ${u.pathname} ${ms}ms`);
    }
  });
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (r.status() >= 400 && u.origin === opts.origin) {
      walk.failedRequests.push(redact(`${r.status()} ${r.request().method()} ${u.pathname}`));
    }
    // What the server scored, read from the report's own data rather than from the page.
    if (u.origin === opts.origin && u.pathname === "/api/report" && r.ok()) {
      r.json()
        .then((body: { primaryArchetype?: unknown }) => {
          if (typeof body?.primaryArchetype === "string")
            walk.serverArchetype = body.primaryArchetype;
        })
        .catch(() => {});
    }
  });

  let n = 0;
  let last = t0;
  /** A proof walk that left early, as planned: finished, not failed. */
  let quitEarly = false;
  /** When a paywall the walk could not close first appeared, for the press that follows. */
  let paywallLeftOpenAt: number | null = null;
  const record = async (kind: string, extra: Partial<Step> = {}, shoot = true) => {
    n += 1;
    const s = await readScreen(page);
    const shot = shoot ? `${String(n).padStart(3, "0")}-${kind}.png` : undefined;
    if (shot) await page.screenshot({ path: join(dir, shot) }).catch(() => {});
    const overflowX = await page
      .evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
      .catch(() => undefined);
    const now = Date.now();
    walk.steps.push({
      n,
      kind,
      at: now - t0,
      ms: now - last,
      url: new URL(page.url()).pathname.replace(/^\/report\/[^/]+/, "/report/<token>"),
      heading: s.headings[0] ?? null,
      progress: s.progress ?? undefined,
      text: kind === "question" ? undefined : s.text,
      shot,
      overflowX,
      errors: pending.length ? pending : undefined,
      ...extra,
    });
    pending = [];
    last = now;
  };
  // Visible ones only: the report renders hidden twins of its buttons (the desktop modal on
  // a phone), and the first match in the page is often the one nobody can see.
  const button = (name: RegExp) =>
    page.getByRole("button", { name }).filter({ visible: true }).first();
  const visible = (name: RegExp) =>
    button(name)
      .isVisible()
      .catch(() => false);
  const countLocks = () =>
    page
      .evaluate(() => {
        const text = document.body?.innerText ?? "";
        // The default report's locks, then V4's (staging branch): its premium content card
        // and the lock tile on a visual. Measured 2026-10-05: 4 cards and 17 tiles on an
        // unpaid V4 report, none once paid; with only the first two, V4 counted 0 and 0.
        const badges = document.querySelectorAll(
          '[aria-label="Unlock the full report"], .report-premium-overlay, .rv4-premium, .rv4-lockbadge'
        ).length;
        return badges + (text.match(/Unlock it to keep reading/g) ?? []).length;
      })
      .catch(() => -1);

  try {
    if (plants) {
      // A proof walk starts where visitors do, on the landing page, for Time to first action.
      await page.goto(`${opts.origin}/`, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await page.locator("html[data-hydrated]").waitFor({ state: "attached", timeout: 60_000 });
      log.landingShownAt = Date.now();
      await record("landing");
      const landingBanner = button(/^reject all$/i);
      if (
        await landingBanner.waitFor({ state: "visible", timeout: 8_000 }).then(
          () => true,
          () => false
        )
      ) {
        await landingBanner.click();
      }
      if (plants.faq) {
        const question = page.locator("button[aria-controls^='w-faq-panel-']").first();
        if (await question.count()) {
          await question.scrollIntoViewIfNeeded();
          await question.click();
          log.trustActions += 1;
          planted.push("opened an answer in the landing FAQ");
          await page.waitForTimeout(1_500);
        }
      }
      const rest = plants.landingWaitMs - (Date.now() - log.landingShownAt);
      if (rest > 0) await page.waitForTimeout(rest);
      const hero = page
        .getByRole("link", { name: /- hero$/i })
        .filter({ visible: true })
        .first();
      await hero.scrollIntoViewIfNeeded();
      log.ctaPressedAt = Date.now();
      await hero.click();
      await page.waitForURL(/\/survey/, { timeout: 30_000 });
    } else {
      // Landing on the survey: the cookie banner, then the introduction.
      await page.goto(`${opts.origin}/survey`, {
        waitUntil: "domcontentloaded",
        timeout: 120_000,
      });
    }
    await page.locator("html[data-hydrated]").waitFor({ state: "attached", timeout: 60_000 });
    await record("survey-start");
    // The cookie banner arrives a few seconds after the page and covers its lower third.
    const banner = button(/^reject all$/i);
    if (
      await banner.waitFor({ state: "visible", timeout: plants ? 3_000 : 12_000 }).then(
        () => true,
        () => false
      )
    ) {
      await record("cookie-banner");
      await banner.click();
    }
    await button(/continue/i).click();
    await page
      .getByRole("heading", { name: /quality in → magic out/i })
      .waitFor({ timeout: 20_000 });
    // The introduction slides, read the way a careful first-timer reads them.
    for (let i = 1; i <= 8 && (await page.getByRole("checkbox").count()) < 2; i++) {
      await record(`intro-${i}`);
      const next = page.getByRole("button", { name: /^continue|^next/i }).last();
      if (!(await next.isVisible().catch(() => false))) break;
      await next.click();
      await page.waitForTimeout(900);
    }
    if ((await page.getByRole("checkbox").count()) < 2) {
      await button(/skip intro/i)
        .click({ timeout: 5_000 })
        .catch(() => {});
      await page.waitForTimeout(900);
    }
    await record("consent");
    await page.getByRole("checkbox").first().click();
    // The second box holds a link; its centre opens the policy instead of ticking it.
    await page.getByRole("checkbox").nth(1).locator("div").first().click();
    await button(/i agree/i).click();

    // The questions, one screen at a time. The progress bar says this is a question
    // screen; the heading says which question, matched against this checkout's survey-data.
    const seenTypes = new Set<string>();
    /** The question id at each position, counted from 1, for what a backtrack leaves. */
    const askedIds: string[] = [];
    let previous: string | null = null;
    let since = Date.now();
    let asked = 0;
    for (;;) {
      const s = await readScreen(page);
      if (!s.progress) {
        if (asked > 0) break; // past the last question: the processing screen
        if (Date.now() - since > 30_000) throw new Error("the first question never appeared");
        await page.waitForTimeout(500);
        continue;
      }
      const q = findQuestion(s.headings);
      const key = q?.qId ?? s.headings[0] ?? "";
      if (key === previous) {
        if (Date.now() - since > 25_000) {
          await record("stuck", { note: `no way past "${s.headings[0] ?? "?"}"` });
          throw new Error(`stuck on "${s.headings[0] ?? "?"}"`);
        }
        await page.waitForTimeout(400);
        continue;
      }
      const type = q?.answerType ?? "unknown";
      // Counted from 1: the question on screen. Only without a backtrack in the way, which
      // the plant below keeps true by returning to this question before moving on.
      const position = asked + 1;
      if (plants?.quit === "survey" && position === plants.quitAt) {
        log.quitOn = { question: position, progressPct: Number(s.progress.replace("%", "")) };
        log.exit = "survey";
        await page.waitForTimeout(2_000);
        await record("quit", { note: `left the survey on question ${position}, as planned` });
        quitEarly = true;
        break;
      }
      let think = (THINK_SECONDS[type] ?? 4) * 1000 * opts.pace;
      if (plants) {
        const third = surveyQuestions.length / 3;
        if (plants.pace === "slowing" && position > 2 * third) think *= 2.6;
        if (plants.pace === "speeding up" && position <= third) think *= 2.6;
        if (plants.hesitateAt.includes(position)) think += 14_000;
      }
      if (plants && plants.deadNextAt === position) {
        const next = button(/^next$/i);
        const box = await next.boundingBox().catch(() => null);
        if (box && !(await next.isEnabled().catch(() => true))) {
          // A disabled control is pointer-events:none; the tap lands on what is behind it.
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          log.deadTaps.push("disabled_control");
          planted.push(`tapped the disabled Next on question ${position}`);
        }
      }
      await page.waitForTimeout(Math.max(450, think));
      const answeredAt = Date.now();
      let answer: unknown = null;
      let note: string | undefined;
      if (q) {
        answer = answerFor(q, persona.answers, email, firstName);
        note = await answerQuestion(page, q, answer);
        if (note) walk.missingOptions.push(`${q.qId}: ${note}`);
        if (plants?.formError && q.inputType === "email" && log.formErrors === 0) {
          // Enter with a confirmation that does not match: the survey refuses it, once.
          const confirm = page.getByLabel("Confirm email address");
          if (await confirm.isVisible().catch(() => false)) {
            await confirm.fill(`x${String(answer)}`);
            await confirm.press("Enter");
            await page.waitForTimeout(700);
            log.formErrors += 1;
            planted.push(
              "pressed Enter on the email question with a confirmation that does not match"
            );
            await confirm.fill(String(answer));
          }
        }
      } else {
        const h = s.headings[0] ?? "(no heading)";
        walk.unknownQuestions.push(h);
        note = `not in this checkout's survey-data: ${h}`;
        answer = await answerGenerically(page);
      }
      await page.waitForTimeout(300);
      asked += 1;
      // The survey that asks for ever (the loop verify-survey-loop.mjs guards) stops here.
      if (asked > surveyQuestions.length + 10) throw new Error("the survey kept asking questions");
      const shoot = !seenTypes.has(type) || asked % 10 === 1 || !q || !!note;
      seenTypes.add(type);
      // Recorded before Next, so the screenshot shows this question answered, not the next one.
      await record(
        "question",
        {
          qId: q?.qId ?? "unknown",
          answer,
          note,
          ms: Date.now() - answeredAt,
          progress: s.progress,
        },
        shoot
      );
      const next = button(/^next$/i);
      if (plants && plants.backs > 0 && position >= plants.backsAt && log.backs === 0) {
        // Back to an earlier question and on again, then on from here as usual. Each Next on
        // the way back moves the survey on from the question it leaves.
        for (let b = 0; b < plants.backs; b++) {
          await button(/^previous$/i).click();
          await page.waitForTimeout(700);
        }
        for (let b = plants.backs; b > 0; b--) {
          log.commits.push({
            at: Date.now(),
            questionId: askedIds[position - 1 - b] ?? "?",
            position: position - b,
          });
          await next.click();
          await page.waitForTimeout(700);
        }
        log.backs = plants.backs;
        planted.push(
          `went back ${plants.backs} question(s) from question ${position} and came on again`
        );
      }
      if (
        (await next.isVisible().catch(() => false)) &&
        (await next.isEnabled().catch(() => false))
      ) {
        log.commits.push({ at: Date.now(), questionId: q?.qId ?? "?", position });
        await next.click();
      }
      askedIds[position - 1] = q?.qId ?? "?";
      previous = key;
      since = Date.now();
    }
    walk.questionsAsked = asked;
    if (quitEarly) {
      walk.finished = true;
      return 0;
    }
    log.completedSurvey = true;
    // The last question's Next submits: survey_completed, never a survey_answer.
    log.commits.pop();

    // Processing, then the pre-report slides, then the report.
    await record("processing");
    const wizard = page.getByRole("button", { name: WIZARD_FORWARD }).first();
    await wizard.waitFor({ state: "visible", timeout: 90_000 });
    for (let i = 1; i <= 8 && !page.url().includes("/report/"); i++) {
      await record(`pre-report-${i}`);
      const finalSlide = await visible(WIZARD_LAST);
      await wizard.click();
      if (finalSlide) break;
      await page.waitForTimeout(900);
    }
    await page.waitForURL(/\/report\//, { timeout: 60_000 });
    // The token opens this report without the email; it stays out of walk.json and artifacts.
    if (process.env.WALK_DEBUG === "1") console.log(`report: ${page.url()}`);
    if (opts.report === "v4") {
      const v4 = new URL(page.url());
      v4.searchParams.set("v4", "1");
      mark("opened the V4 report (?v4=1)");
      await page.goto(v4.toString(), { waitUntil: "domcontentloaded" });
    }
    const reportAt = Date.now();
    await page
      .locator("html[data-hydrated]")
      .waitFor({ state: "attached", timeout: 60_000 })
      .catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
    await record("report", { ms: Date.now() - reportAt });
    walk.assignedArchetype = await page
      .evaluate(
        (names) => {
          const top = (document.body?.innerText ?? "").slice(0, 4000);
          return (
            names
              .map((name) => ({ name, at: top.indexOf(name) }))
              .filter((x) => x.at > -1)
              .sort((a, b) => a.at - b.at)[0]?.name ?? null
          );
        },
        personasFile.personas.map((p) => p.archetype)
      )
      .catch(() => null);
    walk.locksBefore = await countLocks();

    // What a proof walk needs to know about the report as it reads it.
    const pricesOpen = () =>
      page
        .locator(".report-pricing-modal.is-visible")
        .count()
        .then((c) => c > 0)
        .catch(() => false);
    const ctaSeen = () =>
      page
        .evaluate(() => Boolean((window as { __walkCtaSeen?: boolean }).__walkCtaSeen))
        .catch(() => false);
    /** What the page's own scroll listener saw (PROOF_PAGE_SCRIPT), folded into the log. */
    const readScroll = async () => {
      const seen = await page
        .evaluate(() => {
          const w = window as { __walkMaxScroll?: number; __walkScrollBeforePrices?: number };
          return { max: w.__walkMaxScroll ?? 0, before: w.__walkScrollBeforePrices };
        })
        .catch(() => ({ max: 0, before: undefined }));
      log.reportScrollPct = Math.max(log.reportScrollPct, seen.max);
      if (seen.before !== undefined) log.scrollBeforePaywallPct ??= seen.before;
    };
    /** The prices are in front of the reader: note how far they had read by then. */
    const notePrices = async () => {
      log.pricesShown = true;
      await readScroll();
      log.scrollBeforePaywallPct ??= log.reportScrollPct;
    };
    /**
     * A plant must never stop the walk that pays: what it managed is in the log (so the
     * truth stays true), and what it could not do is said, as a finding about the site.
     */
    const tryPlant = async (what: string, plant: () => Promise<void>) => {
      try {
        await plant();
      } catch (err) {
        walk.plantFailures = [
          ...(walk.plantFailures ?? []),
          `${what}: ${redact(String((err as Error).message).split("\n")[0]!).slice(0, 160)}`,
        ];
        // A chapter drawer left open would cover the rest of the walk. Only that: Escape on an
        // open paywall would close it, a close the walk's truth would not know about.
        if (
          await page
            .getByRole("dialog", { name: "Report chapters" })
            .isVisible()
            .catch(() => false)
        ) {
          await page.keyboard.press("Escape").catch(() => {});
        }
      }
    };
    /** Four taps in well under a second on a report heading nobody can act on. */
    const plantRage = async () => {
      const at = await page
        .evaluate(() => {
          const vh = window.innerHeight;
          for (const h of document.querySelectorAll("h2, h3")) {
            const r = h.getBoundingClientRect();
            if (r.top < 60 || r.bottom > vh - 140 || r.width < 40) continue;
            let live = false;
            for (let el: Element | null = h; el; el = el.parentElement) {
              if (
                el.matches(
                  "a, button, label, summary, [role=button], [onclick], [data-paywall-locked], .report-premium-overlay"
                ) ||
                getComputedStyle(el).cursor === "pointer"
              ) {
                live = true;
                break;
              }
            }
            if (!live) return { x: r.left + Math.min(20, r.width / 2), y: r.top + r.height / 2 };
          }
          return null;
        })
        .catch(() => null);
      if (!at) return;
      for (let i = 0; i < 4; i++) {
        await page.mouse.click(at.x, at.y);
        await page.waitForTimeout(80);
      }
      log.rageBursts = 1;
      // A heading does nothing when tapped, so the same taps are dead taps too.
      log.deadTaps.push("non_interactive");
      planted.push("tapped a report heading four times in under a second");
    };
    /**
     * Open the chapter list and jump twice: the desktop sidebar, or the phone's drawer. The
     * second jump is to the last chapter, so these walks read far down a report some 100
     * screens long, and the scroll measures meet walks at more than one depth.
     */
    const plantChapters = async () => {
      const drawer = page.getByRole("dialog", { name: "Report chapters" });
      for (const nth of [2, -1]) {
        let items = page
          .locator('nav[aria-label="Report sections"]')
          .filter({ visible: true })
          .first()
          .locator("button, a");
        if (device.isMobile) {
          // The phone's header hides while reading down; a small scroll up brings it back,
          // as it does for a person reaching for it.
          await page.evaluate(() => window.scrollBy(0, -240));
          await page.waitForTimeout(700);
          const pill = page.locator(".report-chapter-pill__btn").filter({ visible: true }).first();
          if (!(await pill.isVisible().catch(() => false))) break;
          await pill.click({ timeout: 8_000 });
          log.chapterMoves += 1;
          await page.waitForTimeout(700);
          items = drawer.locator('nav[aria-label="Report sections"]').locator("button, a");
        }
        const item = nth < 0 ? items.last() : items.nth(nth);
        if (!(await item.isVisible().catch(() => false))) break;
        await item.click({ timeout: 8_000 });
        log.chapterMoves += 1;
        await page.waitForTimeout(1_200);
        log.reportScrollPct = Math.max(log.reportScrollPct, await scrollPct(page));
      }
      // Never leave the drawer over the report: the rest of the walk could not reach it.
      if (await drawer.isVisible().catch(() => false)) {
        await page
          .getByRole("button", { name: "Close chapter menu" })
          .click()
          .catch(() => {});
      }
      if (log.chapterMoves) planted.push(`used the chapter list (${log.chapterMoves} taps)`);
    };
    /**
     * The paywall opened and looked at, the reviews moved on, then closed one of four ways
     * (plants.escape) or, for a walk that leaves here, left open.
     */
    const plantPaywallVisit = async () => {
      if (!plants) return;
      if (!(await pricesOpen())) {
        for (const opener of [
          // A V4 locked chapter's row first: a closed V4 chapter's Unlock your report is inert.
          button(/^.+ unlock report$/i),
          button(/^unlock your report$/i),
          button(/^unlock (?!your |the |full )(?:[\w -]+ )?report$/i),
        ]) {
          // Opened by itself while a tap waited: stop here. Inside the picker the next
          // opener's pattern can match a plan's button, and pressing that buys (2026-10-01).
          if (await pricesOpen()) break;
          if (await opener.isVisible().catch(() => false)) {
            // Centred, not just into view: clear of a phone's sticky unlock bar. At once,
            // because the site scrolls smoothly: after 400 ms the opener was still 412 px
            // above the screen, and the tap waited until the picker covered it.
            await opener
              .evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }))
              .catch(() => {});
            await page.waitForTimeout(400);
            if (
              await opener.click({ timeout: 10_000 }).then(
                () => true,
                () => false
              )
            )
              break;
          }
        }
      }
      const shown = await page
        .locator(".report-pricing-modal.is-visible")
        .waitFor({ timeout: 10_000 })
        .then(
          () => true,
          () => false
        );
      if (!shown) return;
      const openedAt = Date.now();
      await notePrices();
      if (plants.reviews) {
        const more = page.getByRole("button", { name: "Next reviews" }).filter({ visible: true });
        if (
          await more
            .first()
            .isVisible()
            .catch(() => false)
        ) {
          await more.first().click();
          log.trustActions += 1;
          planted.push("moved the paywall's reviews on once");
        }
      }
      if (plants.quit === "paywall") {
        await page.waitForTimeout(3_000);
        return;
      }
      const rest = plants.dwellMs - (Date.now() - openedAt);
      if (rest > 0) await page.waitForTimeout(rest);
      let how = plants.escape as Escape;
      // Back closes the paywall only where it added a history entry (Safari); elsewhere
      // it would leave the report, which is not this plant.
      if (
        how === "browser_back" &&
        !(await page
          .evaluate(() =>
            Boolean((history.state as { __loveiqOverlay?: boolean } | null)?.__loveiqOverlay)
          )
          .catch(() => false))
      ) {
        how = "close_button";
      }
      const closeButton = page
        .getByRole("button", { name: "Close pricing modal" })
        .filter({ visible: true });
      const close = async (way: Escape) => {
        if (way === "close_button") await closeButton.first().click();
        else if (way === "escape") await page.keyboard.press("Escape");
        else if (way === "browser_back") await page.goBack();
        else {
          // Beside the dialog, or above it where it fills the width.
          const box = await page.locator(".report-pricing-modal__dialog").first().boundingBox();
          const wide = box ? box.x > 24 : false;
          await page.mouse.click(
            wide ? box!.x / 2 : 6,
            wide ? box!.y + box!.height / 2 : Math.max(4, (box?.y ?? 12) / 2)
          );
        }
      };
      /**
       * When the paywall was seen to close, or null when it did not. Timed by what the page
       * shows, as the site times it (open to close, by its own effect), not from before the
       * tap: a tap on a phone took a second once, and the dwell came out a second short.
       */
      const gone = () =>
        page
          .locator(".report-pricing-modal.is-visible")
          .waitFor({ state: "hidden", timeout: 3_000 })
          .then(
            () => Date.now(),
            () => null
          );
      // A close that throws (a covered button, a Back that timed out) is one that may have
      // left it open, so it takes the same fallback: thrown past it, the paywall stayed open
      // unrecorded, and the plan's press was timed from the wrong opening.
      const closeAndTime = (way: Escape) => close(way).then(gone, gone);
      let closedAt = await closeAndTime(how);
      if (closedAt === null) {
        walk.plantFailures = [
          ...(walk.plantFailures ?? []),
          `closing the paywall with ${how} left it open`,
        ];
        how = "close_button";
        closedAt = await closeAndTime(how);
        if (closedAt === null) {
          // Still open: no close happened, so none is recorded, and the plan's press is timed
          // from this opening, the one the site's price_shown marked.
          walk.plantFailures = [
            ...walk.plantFailures,
            "closing the paywall with close_button left it open",
          ];
          paywallLeftOpenAt = openedAt;
          return;
        }
      }
      log.firstClose = { how, afterMs: closedAt - openedAt };
      planted.push(
        `closed the paywall with ${how} after ${Math.round((closedAt - openedAt) / 1000)} s`
      );
    };
    if (plants) {
      log.reportShown = true;
      log.reportHasLockedCards = (await page.locator(".report-premium-overlay").count()) > 0;
      log.reportScrollPct = await scrollPct(page);
      if (plants.quit === "report") {
        await page.waitForTimeout(8_000);
        // The same rule the measure keeps: prices in front of them is not a bounce.
        log.bounced = !(await pricesOpen());
        if (await pricesOpen()) await notePrices();
        log.lockedCtaSeen = await ctaSeen();
        log.exit = "report";
        await record("quit", { note: "left the report within seconds, as planned" });
        walk.finished = true;
        return 0;
      }
    }

    // Read the report a screen at a time, as far as it lets a free reader go.
    const viewport = page.viewportSize()?.height ?? 800;
    for (let k = 1; k <= 14; k++) {
      const atEnd = await page.evaluate(
        () => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4
      );
      if (atEnd) break;
      // A finger cannot scroll a page whose body is overflow:hidden, but scrollBy can, so
      // a phone walk that scrolls by script checks for the lock a person would hit.
      const locked = await page.evaluate(() =>
        [document.documentElement, document.body].some(
          (e) => getComputedStyle(e).overflowY === "hidden"
        )
      );
      if (locked) {
        walk.scrollLocked = true;
        await record("report-scroll-locked", {
          note: "the page is overflow:hidden: a finger could not scroll it",
        });
        break;
      }
      if (device.isMobile) await page.evaluate((dy) => window.scrollBy(0, dy), viewport * 1.2);
      else await page.mouse.wheel(0, viewport * 1.2);
      await page.waitForTimeout(700);
      if (plants) {
        log.reportScrollPct = Math.max(log.reportScrollPct, await scrollPct(page));
        if (await pricesOpen()) await notePrices();
        if (plants.rage && k === 2 && log.rageBursts === 0)
          await tryPlant("the rage taps", plantRage);
        if (plants.chapters && k === 4 && log.chapterMoves === 0) {
          await tryPlant("the chapter list", plantChapters);
        }
      }
      if (k % 3 === 0) await record(`report-read-${k}`);
    }
    if (plants) {
      log.reportScrollPct = Math.max(log.reportScrollPct, await scrollPct(page));
      await readScroll();
      log.lockedCtaSeen = await ctaSeen();
      if (await pricesOpen()) await notePrices();
    }

    // The paywall, reached the way a person reaches each plan: the sticky "Unlock full
    // report" bar buys the default plan straight away, and the plan picker opens from a lock.
    // The report can also open the picker by itself while the reader scrolls; then it is
    // already in front of them, and the page behind it is out of reach.
    if (plants && (plants.escape !== "none" || plants.quit === "paywall")) {
      await tryPlant("the paywall visit", plantPaywallVisit);
      if (plants.quit === "paywall") {
        log.exit = "paywall";
        await record("quit", { note: "left with the paywall open, as planned" });
        walk.finished = true;
        return 0;
      }
    }
    const toStripe = () => page.url().includes("checkout.stripe.com");
    // Whichever comes first: the picker (the report can open it on a timer or on scroll), or
    // a way in. For the default plan, the sticky bar or the "Unlock the full report" button
    // under the archetype list, both of which go straight to Stripe. For the others, the
    // picker: an archetype row's "Unlock report", a padlock on a locked chart, or (V4) a
    // locked chapter's row, "Core Insecurities of the Spark Seeker Unlock Report". The padlock
    // and that button share the name "Unlock the full report" but not the behaviour, so the
    // padlock is found by its class. A V4 chapter that is closed keeps its "Unlock your
    // report" in an inert body, which is why the chapter row is tried before it.
    const ways: Array<[() => ReturnType<typeof button>, string]> =
      plan === "full_report"
        ? [
            [() => button(/^unlock full report$/i), "the sticky bar"],
            [() => button(/^unlock the full report$/i), "the Unlock the full report button"],
          ]
        : [
            // "Unlock report" on a desktop, "Unlock Spark Seeker report" on a phone.
            [
              () => button(/^unlock (?!your |the |full )(?:[\w -]+ )?report$/i),
              "an archetype row's Unlock report",
            ],
            [
              () => page.locator("button.rv4-lockbadge").filter({ visible: true }).first(),
              "a padlock on a locked chart",
            ],
            [() => button(/^.+ unlock report$/i), "a locked chapter's row"],
            [() => button(/^unlock your report$/i), "a chapter's Unlock your report"],
          ];
    // By the clock, not by the waits: a tap that fails takes its own ten seconds, so the
    // budget leaves room to try each of the ways in.
    const findBy = Date.now() + 45_000;
    const untappable = new Set<string>();
    while (Date.now() < findBy && !walk.paywallOpenedBy) {
      if (
        (await pricesOpen()) ||
        (await button(PLAN_CTA[plan])
          .isVisible()
          .catch(() => false))
      ) {
        walk.paywallOpenedBy = "the report, by itself";
        break;
      }
      for (const [way, how] of ways) {
        // As in the paywall visit: once the picker is open, no other way is tried, or a way's
        // pattern can match a button inside it.
        if (await pricesOpen()) break;
        if (
          !untappable.has(how) &&
          (await way()
            .isVisible()
            .catch(() => false))
        ) {
          // The first price a direct way shows is Stripe's: note how far the reader had read.
          if (plants) {
            await readScroll();
            log.scrollBeforePaywallPct ??= log.reportScrollPct;
          }
          // Centred first, as a reader would bring it up, clear of a phone's sticky unlock bar.
          // A way that still cannot be tapped is passed over for the next one rather than
          // ending the walk: on 2026-10-01 two of four walks waited on a closed V4 chapter's
          // "Unlock your report", which is inert, until they stopped.
          await way()
            .evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }))
            .catch(() => {});
          await page.waitForTimeout(400);
          if (
            !(await way()
              .click({ timeout: 10_000 })
              .then(
                () => true,
                () => false
              ))
          ) {
            mark(`could not tap ${how}; trying another way in`);
            untappable.add(how);
            continue;
          }
          mark(`clicked ${how}`);
          walk.paywallOpenedBy = how;
          break;
        }
      }
      if (!walk.paywallOpenedBy) await page.waitForTimeout(500);
    }
    if (!walk.paywallOpenedBy) throw new Error("no way to the paywall on the report");
    // The default plan's ways in buy straight away, so wait for Stripe rather than race the
    // picker, which the report can open by itself in the same moment: on 2026-09-30 a walk
    // saw the picker appear, Stripe then took the page, and it pressed a button that was no
    // longer there. Only if no checkout opens does the walk look for the picker.
    const direct = plan === "full_report" && walk.paywallOpenedBy !== "the report, by itself";
    if (direct && plants) log.checkoutPlan = plan;
    if (direct) {
      await page.waitForURL(/checkout\.stripe\.com/, { timeout: 45_000 }).catch(() => {});
    } else {
      await Promise.race([
        page.waitForURL(/checkout\.stripe\.com/, { timeout: 45_000 }),
        button(PLAN_CTA[plan]).waitFor({ state: "visible", timeout: 45_000 }),
      ]).catch(() => {});
    }
    let planShownAt = 0;
    if (!toStripe()) {
      await button(PLAN_CTA[plan]).waitFor({ state: "visible", timeout: 5_000 });
      // When the plans appeared, as the page saw it; the walk's own clock only says when it
      // looked, which can be a whole tap later.
      planShownAt =
        (await page
          .evaluate(() => (window as { __walkPricesShownAt?: number }).__walkPricesShownAt)
          .catch(() => undefined)) ??
        paywallLeftOpenAt ??
        Date.now();
      if (plants) await notePrices();
      await page.waitForTimeout(1_500); // the live quote replaces the fallback price
      walk.prices = await page
        .locator(".report-pricing-modal")
        .filter({ visible: true })
        .first()
        .evaluate((el) => [
          ...new Set((el.textContent ?? "").match(/[€$£]\s?\d+(?:[.,]\d{1,2})?/g) ?? []),
        ])
        .catch(() => []);
      await record("paywall");
      if (!opts.pay) {
        walk.finished = true;
        return 0;
      }
      // Stripe may have taken the page while the prices were read.
      if (!toStripe()) {
        if (plants) {
          await readScroll();
          const rest = plants.ctaWaitMs - (Date.now() - planShownAt - 1_500);
          if (rest > 0) await page.waitForTimeout(rest);
          log.planPressedAfterMs = Date.now() - planShownAt;
          log.checkoutPlan = plan;
        }
        mark(`clicked the ${plan} plan's button`);
        await button(PLAN_CTA[plan]).click();
        await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
      }
    }
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2_500);
    await record("stripe-checkout");
    if (plants) log.checkoutPlan ??= plan;
    if (plants?.quit === "checkout") {
      log.exit = "checkout";
      await record("quit", { note: "left Stripe's checkout without paying, as planned" });
      walk.finished = true;
      return 0;
    }
    if (!opts.pay) {
      walk.finished = true;
      return 0;
    }
    // Test mode or nothing: a live session would take a real card's money.
    if (!/\/c\/pay\/cs_test_/.test(page.url()))
      throw new Error("Stripe opened a session that is not in test mode");
    await payWithTestCard(page, email);
    await page.waitForURL((u) => u.origin === opts.origin, { timeout: 120_000 });
    walk.paid = true;
    log.paid = true;
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
    await record("after-payment");
    // Staging's password cookie is Lax since 2026-09-30, so Stripe's redirect back keeps it.
    // Until then it was Strict and staging asked for its password again here (loveiq.org has
    // no gate). If that comes back, the gate keeps the page it was protecting in `next`: go
    // there as a tester would once the password is typed, and say so in the timeline.
    const back = new URL(page.url());
    const next = back.pathname === "/login" ? back.searchParams.get("next") : null;
    if (next?.startsWith("/") && !next.startsWith("//")) {
      await page.goto(`${opts.origin}${next}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
      await record("after-payment-past-gate", {
        note: "staging's password page came back after Stripe; staging only, loveiq.org has no gate",
      });
    }
    // The return page names what was bought: the proof the walk paid for the plan it meant to.
    // Read it while it is the return page; it redirects by itself once the unlock is confirmed.
    if (new URL(page.url()).pathname === "/checkout/return") {
      const receipt = await page.evaluate(() => document.body?.innerText ?? "").catch(() => "");
      walk.boughtPlan = PLANS.find((p) => PLAN_TITLE[p].test(receipt)) ?? null;
      // It polls the unlock (every 2s, up to 15 times) before sending the buyer back.
      await page.waitForURL(/\/report\//, { timeout: 45_000 }).catch(() => {});
      if (!/\/report\//.test(page.url())) {
        mark("the return page did not send the buyer on; clicked Go to unlocked report");
        await page
          .getByRole("link", { name: /^go to unlocked report$/i })
          .click({ timeout: 10_000 })
          .catch(() => {});
      }
    }
    await page.waitForURL(/\/report\//, { timeout: 60_000 });
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(2_000);
    walk.locksAfter = await countLocks();
    await record("unlocked-report");
    walk.finished = true;
    return 0;
  } catch (err) {
    walk.stoppedAt = stoppedAtOf(err);
    await record("failed").catch(() => {});
    // What a screen reader would have been given at the point the walk gave up.
    await page
      .locator("body")
      .ariaSnapshot()
      .then((a) => writeFileSync(join(dir, "failed-aria.txt"), a.slice(0, 60_000)))
      .catch(() => {});
    return 1;
  } finally {
    walk.durationMs = Date.now() - t0;
    if (plants) {
      walk.planted = planted;
      // Only a walk that did what it planned knows the truth; a stopped one knows nothing.
      if (walk.finished) {
        writeFileSync(join(dir, "events.json"), JSON.stringify(heard) + "\n");
        writeFileSync(join(dir, "truth.json"), JSON.stringify(truthOf(log), null, 2) + "\n");
      }
    }
    writeFileSync(join(dir, "walk.json"), JSON.stringify(walk, null, 2) + "\n");
    await browser.close();
    console.log(
      `${walk.persona} on ${walk.device}: ` +
        `${walk.finished ? "finished" : `stopped (${walk.stoppedAt})`} in ` +
        `${Math.round((walk.durationMs ?? 0) / 1000)}s; ${walk.questionsAsked ?? 0} questions, ` +
        `report says ${walk.assignedArchetype ?? "?"}, ${walk.consoleErrors.length} console errors, ` +
        `${walk.failedRequests.length} failed requests`
    );
  }
}

/** Answers one known question with the persona's answer. Returns a note when it could not. */
async function answerQuestion(
  page: Page,
  q: SurveyQuestion,
  answer: unknown
): Promise<string | undefined> {
  switch (q.answerType) {
    case "scale": {
      const n = Number(answer) >= 1 && Number(answer) <= 7 ? Number(answer) : 4;
      await page.getByRole("button", { name: `${n} of 7`, exact: true }).click();
      return answer == null ? "no persona answer; chose 4" : undefined;
    }
    case "single":
    case "multiple": {
      const role = q.answerType === "single" ? "radio" : "checkbox";
      const cards = page.locator(`[role="${role}"]`);
      const labels = await cards.evaluateAll((els) =>
        els.map((e) =>
          (e.querySelector("span span")?.textContent ?? "").replace(/\s+/g, " ").trim()
        )
      );
      const wanted = (Array.isArray(answer) ? answer : [answer]).filter(
        (a): a is string => typeof a === "string"
      );
      const missing: string[] = [];
      for (const label of wanted) {
        const i = labels.indexOf(label.replace(/\s+/g, " ").trim());
        if (i === -1) missing.push(label);
        else await pressChoice(page, cards.nth(i));
      }
      if (missing.length === wanted.length) await pressChoice(page, cards.first());
      return missing.length ? `option not on screen: ${missing.join(" | ")}` : undefined;
    }
    case "country":
      await page.getByPlaceholder(/search for a country/i).fill(String(answer));
      await page
        .getByRole("option", { name: String(answer) })
        .first()
        .click();
      return undefined;
    case "open": {
      await page.getByLabel(q.question, { exact: true }).fill(String(answer));
      const confirm = page.getByLabel("Confirm email address");
      if (await confirm.isVisible().catch(() => false)) await confirm.fill(String(answer));
      return undefined;
    }
    default:
      return `answer type ${String(q.answerType)} not handled`;
  }
}

/**
 * Presses a choice, first opening the collapsed category it sits in.
 *
 * C9 on staging (#411) groups its topics into categories, and a closed category's panel
 * is `inert`. Its checkboxes still have a box, so `isVisible()` says yes, but a click
 * waits out its 30s timeout and the walk stops on C9. The panel's id is what its header
 * button's `aria-controls` names.
 */
async function pressChoice(page: Page, card: Locator): Promise<void> {
  const closed = await card.evaluate((el) => el.closest("[inert]")?.id ?? null);
  if (closed) await page.locator(`button[aria-controls="${closed}"]`).click();
  await card.click();
}

/** A question this checkout does not know (staging can be ahead of main): the first option. */
export async function answerGenerically(page: Page): Promise<string> {
  const radio = page.locator('[role="radio"]').first();
  if (await radio.isVisible().catch(() => false)) {
    await radio.click();
    return "first option";
  }
  const box = page.locator('[role="checkbox"]').first();
  if (await box.isVisible().catch(() => false)) {
    await pressChoice(page, box);
    return "first option";
  }
  const scale = page.getByRole("button", { name: "4 of 7", exact: true });
  if (await scale.isVisible().catch(() => false)) {
    await scale.click();
    return "4 of 7";
  }
  const text = page.getByRole("textbox").first();
  if (await text.isVisible().catch(() => false)) {
    await text.fill("Walker");
    return "Walker";
  }
  return "nothing answerable on screen";
}

/**
 * Stripe's hosted checkout in test mode, paid with the 4242 test card. Fields by the names
 * Stripe gives them. It also asks "I am an AI agent acting on behalf of someone else"; a
 * walk is a script with no model choosing anything, so that box stays as a person leaves it.
 */
async function payWithTestCard(page: Page, email: string): Promise<void> {
  const box = (name: RegExp) =>
    page.getByRole("textbox", { name }).filter({ visible: true }).first();
  const fillIfShown = async (name: RegExp, value: string) => {
    if (
      await box(name)
        .isVisible()
        .catch(() => false)
    )
      await box(name).fill(value);
  };
  await fillIfShown(/^email$/i, email);
  if (
    !(await box(/card number/i)
      .isVisible()
      .catch(() => false))
  ) {
    await page
      .getByRole("button", { name: /^card$/i })
      .first()
      .click({ timeout: 10_000 })
      .catch(() => {});
  }
  await box(/card number/i).fill("4242 4242 4242 4242");
  await box(/expiration/i).fill("12 / 34");
  await box(/cvc/i).fill("123");
  await fillIfShown(/cardholder name|name on card/i, "Walker Test");
  await fillIfShown(/zip|postal/i, "10967");
  // Link's "Save my information for faster checkout" comes ticked on some sessions (US
  // ones, which is where GitHub's runners are) and then requires a phone number. A buyer
  // who only wants to pay unticks it, and so does the walk. If it cannot, the walk stops
  // here and says why, rather than pressing Pay and waiting two minutes for nothing.
  const save = page.getByRole("checkbox", { name: /save my info/i }).first();
  if ((await save.count()) && (await save.isChecked())) {
    await save.uncheck({ timeout: 10_000 });
  }
  await page
    .getByRole("button", { name: /^pay/i })
    .filter({ visible: true })
    .first()
    .click({ timeout: 20_000 });
}

if (process.argv[1]?.endsWith("walk.ts")) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err);
      process.exit(1);
    }
  );
}
