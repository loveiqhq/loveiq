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

import { chromium, devices, webkit, type Page } from "playwright";

import { surveyQuestions, type SurveyQuestion } from "@/data/survey-data";

import { stagingCookies } from "../probes/staging-cookie.mjs";
import personasFile from "./personas.json";
import { PLANS, type Plan } from "./rotation";

export const STAGING = "https://staging.loveiq.org";
/** Blocked in the browser: a walk is not a visitor and must never reach analytics. */
export const ANALYTICS =
  /googletagmanager|google-analytics|googleadservices|doubleclick|posthog|clarity\.ms|facebook|hotjar/;
/** Each plan's title, as the paywall card and the return page name it. */
export const PLAN_TITLE: Record<Plan, RegExp> = {
  full_report: /just a snapshot/i,
  core: /all your core archetypes/i,
  all_reports: /for you (?:&|and) your partner/i,
};
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
      const body = document.body?.innerText ?? "";
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
      // The survey header's "PROGRESS 12%": present on every question screen, and only there.
      const m = /progress\s+(\d+)%/i.exec(body);
      return {
        headings,
        progress: m ? `${m[1]}%` : null,
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
  const engine = device.defaultBrowserType === "webkit" ? webkit : chromium;
  const browser = await engine.launch();
  const ctx = await browser.newContext({ ...device, locale: "en-US", timezoneId: "Europe/Berlin" });
  // The helper is plain JS, so its sameSite is typed string; its values are Playwright's.
  await ctx.addCookies(stagingCookies(opts.origin) as Parameters<typeof ctx.addCookies>[0]);
  // Production is never touched, whatever a page links to or redirects to.
  await ctx.route(/^https:\/\/(www\.)?loveiq\.org\//, (r) => r.abort());
  const page = await ctx.newPage();
  await page.route(ANALYTICS, (r) => r.abort());
  // Killed at the job's per-walk time limit: say so in the record rather than vanish.
  process.once("SIGTERM", () => {
    walk.stoppedAt ??= "stopped at its time limit";
    walk.durationMs = Date.now() - t0;
    writeFileSync(join(dir, "walk.json"), JSON.stringify(walk, null, 2) + "\n");
    process.exit(1);
  });

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
        const badges = document.querySelectorAll(
          '[aria-label="Unlock the full report"], .report-premium-overlay'
        ).length;
        return badges + (text.match(/Unlock it to keep reading/g) ?? []).length;
      })
      .catch(() => -1);

  try {
    // Landing on the survey: the cookie banner, then the introduction.
    await page.goto(`${opts.origin}/survey`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.locator("html[data-hydrated]").waitFor({ state: "attached", timeout: 60_000 });
    await record("survey-start");
    // The cookie banner arrives a few seconds after the page and covers its lower third.
    const banner = button(/^reject all$/i);
    if (
      await banner.waitFor({ state: "visible", timeout: 12_000 }).then(
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

    // The questions, one screen at a time. The header's progress says this is a question
    // screen; the heading says which question, matched against this checkout's survey-data.
    const seenTypes = new Set<string>();
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
      await page.waitForTimeout(Math.max(450, (THINK_SECONDS[type] ?? 4) * 1000 * opts.pace));
      const answeredAt = Date.now();
      let answer: unknown = null;
      let note: string | undefined;
      if (q) {
        answer = answerFor(q, persona.answers, email, firstName);
        note = await answerQuestion(page, q, answer);
        if (note) walk.missingOptions.push(`${q.qId}: ${note}`);
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
      if (
        (await next.isVisible().catch(() => false)) &&
        (await next.isEnabled().catch(() => false))
      ) {
        await next.click();
      }
      previous = key;
      since = Date.now();
    }
    walk.questionsAsked = asked;

    // Processing, then the pre-report slides, then the report.
    await record("processing");
    const wizard = page
      .getByRole("button", { name: /continue to next slide|view your report/i })
      .first();
    await wizard.waitFor({ state: "visible", timeout: 90_000 });
    for (let i = 1; i <= 8 && !page.url().includes("/report/"); i++) {
      await record(`pre-report-${i}`);
      const finalSlide = await visible(/view your report/i);
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
      if (k % 3 === 0) await record(`report-read-${k}`);
    }

    // The paywall, reached the way a person reaches each plan: the sticky "Unlock full
    // report" bar buys the default plan straight away, and the plan picker opens from a lock.
    // The report can also open the picker by itself while the reader scrolls; then it is
    // already in front of them, and the page behind it is out of reach.
    const toStripe = () => page.url().includes("checkout.stripe.com");
    // Whichever comes first: the picker (the report can open it on a timer or on scroll), or
    // a way in. For the default plan, the sticky bar or the "Unlock the full report" button
    // under the archetype list, both of which go straight to Stripe. For the others, the
    // picker: an archetype row's "Unlock report", or a padlock on a locked chart. The padlock
    // and that button share the name "Unlock the full report" but not the behaviour, so the
    // padlock is found by its class.
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
            [() => button(/^unlock your report$/i), "a chapter's Unlock your report"],
          ];
    for (let waited = 0; waited < 20_000 && !walk.paywallOpenedBy; waited += 500) {
      if (
        await button(PLAN_CTA[plan])
          .isVisible()
          .catch(() => false)
      ) {
        walk.paywallOpenedBy = "the report, by itself";
        break;
      }
      for (const [way, how] of ways) {
        if (
          await way()
            .isVisible()
            .catch(() => false)
        ) {
          mark(`clicked ${how}`);
          await way().click();
          walk.paywallOpenedBy = how;
          break;
        }
      }
      if (!walk.paywallOpenedBy) await page.waitForTimeout(500);
    }
    if (!walk.paywallOpenedBy) throw new Error("no way to the paywall on the report");
    await Promise.race([
      page.waitForURL(/checkout\.stripe\.com/, { timeout: 45_000 }),
      button(PLAN_CTA[plan]).waitFor({ state: "visible", timeout: 45_000 }),
    ]).catch(() => {});
    if (!toStripe()) {
      await button(PLAN_CTA[plan]).waitFor({ state: "visible", timeout: 5_000 });
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
      mark(`clicked the ${plan} plan's button`);
      await button(PLAN_CTA[plan]).click();
      await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
    }
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2_500);
    await record("stripe-checkout");
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
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
    await record("after-payment");
    // Staging's password cookie is SameSite=Strict, so the browser leaves it off Stripe's
    // redirect back and staging asks for its password again (loveiq.org has no gate). The
    // gate keeps the page it was protecting in `next`; go there as a tester would once the
    // password is typed.
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
    walk.stoppedAt = redact(String((err as Error).message).split("\n")[0]!).slice(0, 200);
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
        else await cards.nth(i).click();
      }
      if (missing.length === wanted.length) await cards.first().click();
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

/** A question this checkout does not know (staging can be ahead of main): the first option. */
async function answerGenerically(page: Page): Promise<string> {
  const radio = page.locator('[role="radio"]').first();
  if (await radio.isVisible().catch(() => false)) {
    await radio.click();
    return "first option";
  }
  const box = page.locator('[role="checkbox"]').first();
  if (await box.isVisible().catch(() => false)) {
    await box.click();
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
