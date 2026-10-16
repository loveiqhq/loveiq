/**
 * The persona walkers (scripts/walkers/): the answers each persona gives, which walks run
 * tonight, what a walk proves on its own, and what the judge may do and post.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { surveyQuestions } from "@/data/survey-data";
import { getScoringConfig, getScoringConfigSha } from "@features/scoring/logic/config";
import { scoreArchetypes } from "@features/scoring/logic/engine";

import { checkWalk } from "../../scripts/walkers/checks";
import {
  cleanFindings,
  judgeArgs,
  judgeEnv,
  loadWalks,
  parseJsonAnswer,
  slackMessage,
  verdictOf,
  type Finding,
  type LoadedWalk,
} from "../../scripts/walkers/judge";
import personasFile from "../../scripts/walkers/personas.json";
import {
  allWalks,
  DEVICES,
  PLANS,
  ROTATION_PLANS,
  WALKS_PER_NIGHT,
  walksFor,
} from "../../scripts/walkers/rotation";
import {
  answerFor,
  ARCHETYPE_ROW_UNLOCK,
  PLAN_CTA,
  PLAN_TITLE,
  findQuestion,
  redact,
  MAIN_ON_STAGING,
  PROOF_PAGE_SCRIPT,
  stoppedAtOf,
  walkableOrigin,
  WIZARD_FORWARD,
  WIZARD_LAST,
  type Walk,
} from "../../scripts/walkers/walk";

const config = getScoringConfig();
const names = personasFile.personas.map((p) => p.archetype);

describe("personas", () => {
  it("were built against the scoring config in use; rebuild them when it changes", () => {
    // npx tsx scripts/walkers/build-personas.ts
    expect(personasFile.scoringConfigSha).toBe(getScoringConfigSha());
  });

  it("cover every archetype once", () => {
    expect([...names].sort()).toEqual([...config.archetypes].sort());
  });

  it.each(personasFile.personas.map((p) => [p.archetype, p]))(
    "%s scores as itself, clearly ahead of the runner-up",
    (archetype, persona) => {
      const { percent } = scoreArchetypes(config, persona.answers as never);
      const ranked = Object.entries(percent).sort((a, b) => b[1] - a[1]);
      expect(ranked[0]![0]).toBe(archetype);
      // A lead this wide survives a question or two answered differently on staging.
      expect(ranked[0]![1] - ranked[1]![1]).toBeGreaterThan(20);
    }
  );

  it("answer only with options the survey offers", () => {
    const byId = new Map(surveyQuestions.map((q) => [q.qId, q]));
    for (const p of personasFile.personas) {
      for (const [qId, answer] of Object.entries(p.answers)) {
        const q = byId.get(qId)!;
        expect(q, qId).toBeDefined();
        if (q.answerType === "scale") expect([1, 2, 3, 4, 5, 6, 7]).toContain(answer);
        else
          for (const a of [answer].flat()) expect(q.options, `${p.archetype} ${qId}`).toContain(a);
      }
    }
  });
});

describe("tonight's walks", () => {
  it("cover every persona on every device once a week", () => {
    const week = [...Array(7).keys()].flatMap((d) =>
      walksFor(new Date(Date.UTC(2026, 9, 5 + d, 2, 41)), names)
    );
    const key = (w: { persona: string; device: string }) => `${w.persona} | ${w.device}`;
    expect(week).toHaveLength(7 * WALKS_PER_NIGHT);
    expect(new Set(week.map(key)).size).toBe(names.length * DEVICES.length);
  });

  it("buy every plan on sale several times a week, and never the retired core", () => {
    for (const plan of ROTATION_PLANS) {
      expect(allWalks(names).filter((w) => w.plan === plan).length, plan).toBeGreaterThanOrEqual(8);
    }
    expect(ROTATION_PLANS).not.toContain("core");
    for (const week of [0, 1, 2]) {
      expect(allWalks(names, week).some((w) => w.plan === "core")).toBe(false);
    }
    // Still a plan a walk can be asked for by hand, where it is sold.
    expect(PLANS).toContain("core");
  });

  it("has each persona buy a different plan on the phone and on the desktop", () => {
    for (const name of names) {
      const plans = allWalks(names)
        .filter((w) => w.persona === name)
        .map((w) => w.plan);
      expect(new Set(plans).size, name).toBe(DEVICES.length);
    }
  });

  it("read one report a night, the default and V4 on alternate nights, both for everyone within two weeks", () => {
    const night = (d: number) => walksFor(new Date(Date.UTC(2026, 9, 5 + d, 2, 41)), names);
    for (const d of [0, 1, 2]) expect(new Set(night(d).map((w) => w.report)).size).toBe(1);
    expect(night(0)[0]!.report).not.toBe(night(1)[0]!.report);
    const fortnight = [...Array(14).keys()].flatMap(night);
    for (const name of names) {
      for (const device of DEVICES) {
        const reports = new Set(
          fortnight.filter((w) => w.persona === name && w.device === device).map((w) => w.report)
        );
        expect(reports.size, `${name} on ${device}`).toBe(2);
      }
    }
  });

  it("move each persona's plan on every week, so every plan on sale gets bought", () => {
    const plansOf = (name: string) =>
      new Set(
        [0, 1, 2].flatMap((week) =>
          allWalks(names, week)
            .filter((w) => w.persona === name)
            .map((w) => w.plan)
        )
      );
    for (const name of names) expect(plansOf(name).size, name).toBe(ROTATION_PLANS.length);
  });

  it("are the same four when a night is run again", () => {
    const a = walksFor(new Date("2026-10-05T02:41:00Z"), names);
    const b = walksFor(new Date("2026-10-05T23:59:00Z"), names);
    expect(b).toEqual(a);
  });
});

describe("a walk", () => {
  it("takes tokens, Stripe sessions and query strings out of anything a log could show", () => {
    expect(
      redact(
        "net::ERR at https://staging.loveiq.org/checkout/return?session_id=cs_test_abc&token=rpt_Zz9"
      )
    ).toBe("net::ERR at https://staging.loveiq.org/checkout/return");
    expect(redact("404 GET /report/rpt_ABC-123")).toBe("404 GET /report/<token>");
    expect(redact("paid on cs_live_xyz")).toBe("paid on cs_<session>");
    // A question mark in plain words stays.
    expect(redact('stuck on "What is your name?"')).toBe('stuck on "What is your name?"');
  });

  it("runs on staging, or on this machine when asked, and never on loveiq.org", () => {
    expect(walkableOrigin("https://staging.loveiq.org", false)).toBe(true);
    expect(walkableOrigin("https://loveiq.org", false)).toBe(false);
    expect(walkableOrigin("https://loveiq.org", true)).toBe(false);
    expect(walkableOrigin("https://www.loveiq.org", true)).toBe(false);
    expect(walkableOrigin("http://staging.loveiq.org", false)).toBe(false);
    expect(walkableOrigin("http://localhost:3000", false)).toBe(false);
    expect(walkableOrigin("http://localhost:3000", true)).toBe(true);
    // Production's code on staging's database: the staging project's build of main.
    expect(walkableOrigin(MAIN_ON_STAGING, false)).toBe(true);
    // The PRODUCTION project's build of main has production's settings: never.
    expect(walkableOrigin("https://loveiq-web-git-main-loveiq.vercel.app", false)).toBe(false);
    expect(walkableOrigin("http://loveiq-staging-git-main-loveiq.vercel.app", false)).toBe(false);
  });

  it("gets through the pre-report slides by every name their button has", () => {
    // Main's own names, read from the wizard, so renaming them there fails here first.
    const wizard = readFileSync(
      join(process.cwd(), "features/survey/ui/PreReportWizard.tsx"),
      "utf8"
    );
    // The wizard names its forward button for a screen reader: the last slide's, then the rest.
    const label = /aria-label=\{isLast \? "([^"]+)" : "([^"]+)"\}/.exec(wizard);
    expect(label, "the wizard's forward button names its last slide").not.toBeNull();
    const [, last, next] = label!;
    expect(WIZARD_FORWARD.test(next!)).toBe(true);
    expect(WIZARD_FORWARD.test(last!)).toBe(true);
    expect(WIZARD_LAST.test(last!)).toBe(true);
    expect(WIZARD_LAST.test(next!)).toBe(false);
    // The staging branch's last slide since 2026-10-01, which stopped every walk there.
    expect(WIZARD_FORWARD.test("Continue to your report")).toBe(true);
    expect(WIZARD_LAST.test("Continue to your report")).toBe(true);
  });

  it("says what it was waiting for when it stops", () => {
    const err = new Error(
      "locator.click: Timeout 30000ms exceeded.\nCall log:\n  - waiting for getByRole('button', { name: /view your report/i }).first()\n"
    );
    expect(stoppedAtOf(err)).toBe(
      "locator.click: Timeout 30000ms exceeded. (waiting for getByRole('button', { name: /view your report/i }).first())"
    );
    expect(stoppedAtOf(new Error('stuck on "What is your name?"'))).toBe(
      'stuck on "What is your name?"'
    );
    // What reaches the public log is redacted, waiting-for part included.
    expect(
      stoppedAtOf(new Error("timeout\n  - waiting for navigation to /report/rpt_ABC-123"))
    ).toBe("timeout (waiting for navigation to /report/<token>)");
    // Playwright colours its messages; the log gets only the words.
    expect(stoppedAtOf(new Error("\u001b[2mlocator.click: Timeout\u001b[22m"))).toBe(
      "locator.click: Timeout"
    );
  });

  it("opens the price picker from an archetype row, never with a button inside it", () => {
    // The plans' buttons, read from where they are defined, so a renamed one is checked here.
    const plans = readFileSync(
      join(process.cwd(), "features/checkout/server/reportPurchase.ts"),
      "utf8"
    );
    const labels = [...plans.matchAll(/ctaLabel: "([^"]+)"/g)].map((m) => m[1]!);
    // Pricing 3.0's two plans (features/checkout/server/reportPurchase.ts).
    expect(labels).toEqual(["Continue", "Only Unlock My Highest Scoring Report"]);
    for (const label of labels) expect(ARCHETYPE_ROW_UNLOCK.test(label), label).toBe(false);
    // A row reads "Unlock report", or names its archetype to a screen reader.
    expect(ARCHETYPE_ROW_UNLOCK.test("Unlock report")).toBe(true);
    for (const archetype of new Set(personasFile.personas.map((p) => p.archetype))) {
      expect(ARCHETYPE_ROW_UNLOCK.test(`Unlock ${archetype} report`), archetype).toBe(true);
    }
    for (const other of ["Unlock your report", "Unlock the full report", "Unlock full report"]) {
      expect(ARCHETYPE_ROW_UNLOCK.test(other), other).toBe(false);
    }
  });

  it("knows each plan on both catalogues: main's, and Pricing 3.0's on staging", () => {
    // Main's names are read from its catalogue; staging's 3.0 names are its
    // features/checkout/server/reportPurchase.ts as of 2026-10-05, which main cannot read.
    const plans = readFileSync(
      join(process.cwd(), "features/checkout/server/reportPurchase.ts"),
      "utf8"
    );
    const mainTitle = (plan: string) =>
      new RegExp(`plan: "${plan}"[\\s\\S]*?title: "([^"]+)"`).exec(plans)?.[1] ?? "";
    expect(PLAN_TITLE.full_report.test(mainTitle("full_report"))).toBe(true);
    expect(PLAN_TITLE.all_reports.test(mainTitle("all_reports"))).toBe(true);
    expect(PLAN_TITLE.full_report.test("Only Your Highest Archetype")).toBe(true);
    expect(PLAN_TITLE.all_reports.test("All 14 Archetype Reports")).toBe(true);
    // A receipt names one plan, and is read as that one.
    expect(PLANS.find((p) => PLAN_TITLE[p].test("All 14 Archetype Reports"))).toBe("all_reports");
    expect(PLANS.find((p) => PLAN_TITLE[p].test("Only Your Highest Archetype"))).toBe(
      "full_report"
    );
    for (const name of [
      "Unlock my report",
      "Only Unlock My Highest Scoring Report",
      "Only Unlock This Report",
    ]) {
      expect(PLAN_CTA.full_report.test(name), name).toBe(true);
    }
    for (const name of ["Unlock us", "Continue"]) {
      expect(PLAN_CTA.all_reports.test(name), name).toBe(true);
    }
    // Never another plan's button, an archetype row's, or the wizard's "Continue to…".
    expect(PLAN_CTA.all_reports.test("Continue to your report")).toBe(false);
    expect(PLAN_CTA.full_report.test("Continue")).toBe(false);
    expect(ARCHETYPE_ROW_UNLOCK.test("Only Unlock This Report")).toBe(false);
  });

  it("finds the purchase sequence's list, pay screen and return words by main's own names", () => {
    // What walk.ts --sequence looks for, read from where main renders it, so a rename fails
    // here first instead of stopping the nightly walk.
    const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
    const list = read("features/report/ui/sections/ConstellationSection.tsx");
    for (const name of ["__row", "__name", "__view"]) {
      expect(list).toContain(`report-constellation${name}`);
    }
    expect(list).toMatch(/<PadlockIcon open=\{false\} \/>\s*Unlock\s*</);
    expect(list).toContain('"View report"');
    expect(list).toContain("`View your ${name} report`");
    const paywall = read("features/report/ui/ReportPricingModal.tsx");
    expect(paywall).toContain("`${card.titleLead} the ${targetArchetype} Report`");
    expect(paywall).toContain('"Only Unlock This Report"');
    expect(paywall).toContain("rpg-card--${card.plan}");
    const back = read("features/checkout/ui/CheckoutReturnPage.tsx");
    expect(back).toContain("`Your ${archetype} report is`");
    expect(back).toMatch(/checkout-return__copy">\s*<strong[^>]*>Payment complete\./);
  });

  it("recognises every question by the words of its heading", () => {
    for (const q of surveyQuestions) {
      expect(findQuestion(["Skip to main content", q.question])?.qId).toBe(q.qId);
    }
    // Typographic quotes on screen, straight ones in the data (or the other way round).
    const curly = surveyQuestions.find((q) => q.question.includes("'"));
    if (curly) expect(findQuestion([curly.question.replace(/'/g, "’")])?.qId).toBe(curly.qId);
  });

  it("recognises the email question in the email test's anonymous arm, and answers it with the address", () => {
    const anonymous = findQuestion(["What’s your email? Feel free to use an anonymous one."]);
    expect(anonymous?.qId).toBe("00000");
    // Labelled with the arm's own words, so the walker finds the one field by them.
    expect(anonymous?.question).toBe("What’s your email? Feel free to use an anonymous one.");
    expect(answerFor(anonymous!, {}, "walk@resend.dev", "Walker")).toBe("walk@resend.dev");
    // Today's question is still found as itself.
    expect(findQuestion(["What is your email?"])?.question).toBe("What is your email?");
  });

  it("gives the persona's answer, and its own name, email and country", () => {
    const persona = personasFile.personas[0]!;
    const email = "delivered+walker-test@resend.dev";
    for (const q of surveyQuestions) {
      const a = answerFor(q, persona.answers, email, "Walker");
      if (q.answerType === "open") {
        const expected =
          q.inputType === "email" ? email : /zip|postal/i.test(q.question) ? "10967" : "Walker";
        expect(a, q.qId).toBe(expected);
      } else if (q.answerType === "country") expect(a).toBe("Germany");
      else expect(a).toEqual((persona.answers as Record<string, unknown>)[q.qId]);
    }
  });
});

const walk = (over: Partial<Walk> = {}): Walk => ({
  persona: "Spark Seeker",
  device: "iPhone 15 Pro",
  plan: "full_report",
  report: "default",
  origin: "https://staging.loveiq.org",
  startedAt: "2026-09-29T02:41:00Z",
  finished: true,
  unknownQuestions: [],
  missingOptions: [],
  serverArchetype: "Spark Seeker",
  assignedArchetype: "Spark Seeker",
  paid: true,
  locksBefore: 68,
  locksAfter: 12,
  steps: [],
  timeline: [],
  consoleErrors: [],
  failedRequests: [],
  slowRequests: [],
  durationMs: 7 * 60_000,
  ...over,
});

describe("a proof walk's page script", () => {
  it("is JavaScript a page can run: one error in it and the walk hears nothing at all", () => {
    // On 2026-10-01 a regex lost its backslashes inside this template string, the whole
    // script failed to parse, and a proof walk recorded 0 events.
    expect(() => new Function(PROOF_PAGE_SCRIPT)).not.toThrow();
    expect(PROOF_PAGE_SCRIPT).toContain("window.__loveiqEventTap = function");
  });
});

describe("what a walk proves on its own", () => {
  it("passes a walk that finished, named the persona and unlocked what it paid for", () => {
    expect(checkWalk(walk()).every((c) => c.ok)).toBe(true);
  });

  it("says when the report named another archetype", () => {
    const c = checkWalk(
      walk({ serverArchetype: "Radiant Performer", assignedArchetype: "Radiant Performer" })
    ).find((x) => !x.ok);
    expect(c?.what).toContain("Spark Seeker");
    expect(c?.what).toContain("Radiant Performer");
  });

  it("never passes a report whose score it did not see, whatever the page said", () => {
    const unseen = (w: Walk) =>
      checkWalk(w).some((c) => !c.ok && c.what.includes("never saw its score from the server"));
    // The page matching the persona is a heuristic that happens to agree, not proof.
    expect(unseen(walk({ serverArchetype: undefined }))).toBe(true);
    expect(unseen(walk({ serverArchetype: undefined, assignedArchetype: undefined }))).toBe(true);
    const onTheReport = walk({
      finished: false,
      stoppedAt: "no unlock",
      serverArchetype: undefined,
      steps: [{ n: 1, kind: "report", at: 0, ms: 0, url: "/r", heading: null }],
    });
    expect(unseen(onTheReport)).toBe(true);
    // The server saying it has no archetype is its own failure, not a pass.
    expect(checkWalk(walk({ serverArchetype: null })).some((c) => !c.ok)).toBe(true);
    // A walk that never got to the report has nothing to score: its stop is the finding.
    const early = walk({
      finished: false,
      stoppedAt: "stuck on question 12",
      serverArchetype: undefined,
      assignedArchetype: undefined,
    });
    expect(unseen(early)).toBe(false);
  });

  it("takes the server's archetype as the score, and says when the page led with another", () => {
    // The page text is a heuristic; the report API's answer is the score.
    expect(
      checkWalk(walk({ serverArchetype: "Spark Seeker", assignedArchetype: null })).every(
        (c) => c.ok
      )
    ).toBe(true);
    const split = checkWalk(
      walk({ serverArchetype: "Spark Seeker", assignedArchetype: "Radiant Performer" })
    );
    expect(
      split.some(
        (c) =>
          !c.ok &&
          c.what.includes("server scored Spark Seeker") &&
          c.what.includes("Radiant Performer")
      )
    ).toBe(true);
    const wrong = checkWalk(walk({ serverArchetype: "Radiant Performer" }));
    expect(wrong.some((c) => !c.ok && c.what.startsWith("Answered as Spark Seeker"))).toBe(true);
  });

  it("says when the receipt names another plan than the one it meant to buy", () => {
    expect(checkWalk(walk({ boughtPlan: "full_report" })).every((c) => c.ok)).toBe(true);
    const wrong = checkWalk(walk({ plan: "core", boughtPlan: "full_report" }));
    expect(
      wrong.some(
        (c) => !c.ok && c.what === "Meant to buy core, but the receipt page named full_report."
      )
    ).toBe(true);
    expect(
      checkWalk(walk({ boughtPlan: null })).some((c) => !c.ok && c.what.includes("named no plan"))
    ).toBe(true);
  });

  it("says when paying unlocked nothing", () => {
    expect(checkWalk(walk({ locksAfter: 68 })).some((c) => !c.ok && /Paid for/.test(c.what))).toBe(
      true
    );
    expect(
      checkWalk(walk({ locksAfter: undefined })).some((c) => !c.ok && /Paid for/.test(c.what))
    ).toBe(true);
  });

  it("ignores staging's preview toolbar and reports everything else", () => {
    const toolbar = "Refused to load https://vercel.live/_next-live/feedback/feedback.js because …";
    expect(checkWalk(walk({ consoleErrors: [toolbar] })).every((c) => c.ok)).toBe(true);
    expect(
      checkWalk(walk({ consoleErrors: [toolbar, "TypeError: x is undefined"] })).some((c) => !c.ok)
    ).toBe(true);
  });

  const held = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      what: `check ${i + 1}`,
      ok: true,
      observed: "as it should",
    }));

  it("passes a purchase sequence only when every check held and the walk reached the end", () => {
    const passed = checkWalk(
      walk({ sequence: { mode: "other-first", other: "Minimalist Companion", checks: held(9) } })
    );
    expect(passed.every((c) => c.ok)).toBe(true);
    expect(passed.map((c) => c.what)).toContain(
      "Bought Minimalist Companion from Other Archetypes, then the own report: all 9 sequence checks held."
    );
    // Stopped part-way with every check so far holding (Stripe never came back): the stop is
    // the finding, and nothing says the sequence held.
    const cut = checkWalk(
      walk({
        finished: false,
        stoppedAt: "page.waitForURL: Timeout 120000ms exceeded.",
        sequence: { mode: "other-first", other: "Minimalist Companion", checks: held(2) },
      })
    );
    expect(cut.some((c) => !c.ok && c.what.includes("page.waitForURL"))).toBe(true);
    expect(cut.some((c) => c.what.includes("sequence checks held"))).toBe(false);
    // A sequence that checked nothing never passes.
    expect(
      checkWalk(walk({ sequence: { mode: "other-first", checks: [] } })).some(
        (c) => !c.ok && c.what === "The purchase sequence recorded no checks."
      )
    ).toBe(true);
  });

  it("fails the walk on any failed sequence check, with what was expected and what was seen", () => {
    const leak = {
      what: 'the reader\'s own report (Spark Seeker) still locked, with the "Unlock full report" bar',
      ok: false,
      observed: "0 locks, the bar not shown",
    };
    const stopped = checkWalk(
      walk({
        finished: false,
        stoppedAt: `purchase sequence: expected ${leak.what}; saw ${leak.observed}`,
        sequence: {
          mode: "other-first",
          other: "Minimalist Companion",
          checks: [...held(6), leak],
        },
      })
    );
    expect(stopped.filter((c) => !c.ok).map((c) => c.what)).toContain(
      'Buying Minimalist Companion first: expected the reader\'s own report (Spark Seeker) still locked, with the "Unlock full report" bar; saw 0 locks, the bar not shown.'
    );
    // A failed check fails the walk even in a record that says it reached the end.
    const finished = checkWalk(
      walk({ sequence: { mode: "other-first", other: "Minimalist Companion", checks: [leak] } })
    );
    expect(finished.some((c) => !c.ok && c.what.startsWith("Buying Minimalist Companion"))).toBe(
      true
    );
    expect(finished.some((c) => c.what.includes("sequence checks held"))).toBe(false);
  });

  it("reports a stopped walk, a locked scroll and a sideways page", () => {
    const stopped = checkWalk(walk({ finished: false, stoppedAt: "stuck on question 12" }));
    expect(stopped.some((c) => !c.ok && c.what.includes("stuck on question 12"))).toBe(true);
    expect(checkWalk(walk({ scrollLocked: true })).some((c) => !c.ok)).toBe(true);
    const wide = walk({
      steps: [{ n: 1, kind: "paywall", at: 0, ms: 0, url: "/r", heading: null, overflowX: true }],
    });
    expect(checkWalk(wide).some((c) => !c.ok && c.what.includes("paywall"))).toBe(true);
  });
});

describe("the judge", () => {
  it("can read the three folders and nothing else: no shell, no writing, no web, no other path", () => {
    const args = judgeArgs("sonnet", ["/tmp/walks", "/work/main", "/work/staging/"]);
    expect(args[args.indexOf("--tools") + 1]).toBe("Read,Glob,Grep");
    const allowed = args[args.indexOf("--allowedTools") + 1]!.split(",");
    // Every rule names a folder: a bare "Read" would allow /proc/<pid>/environ.
    expect(allowed).toHaveLength(9);
    for (const rule of allowed)
      expect(rule).toMatch(/^(Read|Glob|Grep)\(\/\/(tmp\/walks|work\/main|work\/staging)\/\*\*\)$/);
    expect(args[args.indexOf("--permission-mode") + 1]).toBe("dontAsk");
    expect(args).toContain("--strict-mcp-config");
  });

  it("starts the judge with its sign-in and none of the job's other secrets", () => {
    const env = judgeEnv({
      PATH: "/bin",
      HOME: "/home/runner",
      CLAUDE_CODE_OAUTH_TOKEN: "t",
      SUPABASE_SERVICE_ROLE_KEY: "s",
      SLACK_BRAIN_WEBHOOK_URL: "w",
      STAGING_PASSWORD: "p",
    } as NodeJS.ProcessEnv);
    expect(Object.keys(env).sort()).toEqual(["CLAUDE_CODE_OAUTH_TOKEN", "HOME", "PATH"]);
    expect(judgeEnv({ USER: "runner", AWS_SECRET_ACCESS_KEY: "x" } as NodeJS.ProcessEnv)).toEqual({
      USER: "runner",
    });
  });

  it("trusts only well-formed findings, and decides repeats by title itself", () => {
    const good = {
      title: "The banner covers Continue.",
      evidence: "…",
      walks: ["w"],
      steps: [3],
      severity: "HIGH?",
    };
    const out = cleanFindings(
      [
        good,
        { ...good, title: "An old one", repeat: false },
        { ...good, title: "A new one", repeat: true },
        { evidence: "no title", walks: ["w"], steps: [1] },
        { title: "no walk", evidence: "…", steps: [1] },
        "nonsense",
      ],
      ["an old one."]
    );
    expect(out.map((f) => [f.title, f.repeat, f.severity])).toEqual([
      ["The banner covers Continue.", false, "low"],
      ["An old one", true, "low"],
      ["A new one", false, "low"],
    ]);
    expect(cleanFindings("not a list", [])).toEqual([]);
  });

  it("reads a verdict whatever its case, and counts anything else as unsure", () => {
    const v = [
      { i: 0, verdict: "Confirmed" },
      { i: 1, verdict: "REFUTED" },
      { i: 2, verdict: "maybe" },
    ];
    expect([0, 1, 2, 3].map((i) => verdictOf(v, i))).toEqual([
      "confirmed",
      "refuted",
      "unsure",
      "unsure",
    ]);
    expect(verdictOf("nope", 0)).toBe("unsure");
  });

  it("finds the JSON in an answer, fenced or not, and nothing in prose", () => {
    expect(parseJsonAnswer<{ a: number }>('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(parseJsonAnswer<{ a: number }>('Here it is: {"a": 2}')).toEqual({ a: 2 });
    expect(parseJsonAnswer("I could not judge these walks.")).toBeNull();
    expect(parseJsonAnswer("{not json}")).toBeNull();
  });

  const loaded: LoadedWalk[] = [
    { slug: "spark-seeker--iphone-15-pro", walk: walk(), checks: checkWalk(walk()) },
    {
      slug: "tender-devotee--desktop-chrome",
      walk: walk({
        persona: "Tender Devotee",
        device: "Desktop Chrome",
        finished: false,
        stoppedAt: "no unlock",
      }),
      checks: checkWalk(
        walk({ persona: "Tender Devotee", finished: false, stoppedAt: "no unlock" })
      ),
    },
  ];
  const finding = (over: Partial<Finding>): Finding => ({
    signal: "CTA visibility",
    severity: "high",
    title: "The cookie banner covers the Continue button on a phone",
    walks: ["spark-seeker--iphone-15-pro"],
    steps: [3],
    evidence: "…",
    why: "…",
    fix: "…",
    main: "same",
    ...over,
  });

  it("loads each walk on its own, so one unreadable record does not lose the others", () => {
    const dir = mkdtempSync(join(tmpdir(), "walks-"));
    try {
      const put = (slug: string, text: string) => {
        mkdirSync(join(dir, slug));
        writeFileSync(join(dir, slug, "walk.json"), text);
      };
      put("a-good", JSON.stringify(walk()));
      put("b-cut-short", '{"persona": "Spark Seeker", "steps": [');
      const { timeline: _t, slowRequests: _s, ...older } = walk();
      put("c-older-walker", JSON.stringify(older));
      put("d-no-persona", JSON.stringify({ steps: [] }));
      mkdirSync(join(dir, "e-no-record"));

      const loaded = loadWalks(dir);
      expect(loaded.map((w) => w.slug)).toEqual([
        "a-good",
        "b-cut-short",
        "c-older-walker",
        "d-no-persona",
      ]);
      expect(loaded[0]!.checks.every((c) => c.ok)).toBe(true);
      expect(loaded[1]!.checks.find((c) => !c.ok)?.what).toBe(
        "Stopped before the end: its record could not be read (it is not valid JSON)."
      );
      expect(loaded[2]!.walk.timeline).toEqual([]);
      expect(loaded[2]!.checks.every((c) => c.ok)).toBe(true);
      expect(loaded[3]!.checks.find((c) => !c.ok)?.what).toContain("it names no persona");

      const text = slackMessage("2026-09-29", loaded, { failed: "no judge tonight" });
      expect(text).toContain("4 walks, 2 reached the end");
      expect(text).toContain("its record could not be read (it is not valid JSON)");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("posts every walk's problems and only the new confirmed findings", () => {
    const text = slackMessage("2026-09-29", loaded, {
      confirmed: [finding({}), finding({ title: "An old one", repeat: true })],
      refuted: 2,
      unsure: 1,
    });
    expect(text).toContain("2 walks, 1 reached the end");
    expect(text).toContain("Stopped before the end: no unlock.");
    expect(text).toContain(
      "The cookie banner covers the Continue button on a phone. Also on loveiq.org."
    );
    expect(text).not.toContain("An old one");
    expect(text).toContain("1 still open from earlier nights");
    expect(text).toContain("2 dropped");
  });

  it("escapes what came from a page or a model, so nothing can ping the channel", () => {
    const text = slackMessage("2026-09-29", loaded, {
      confirmed: [finding({ title: "<!channel> look at this & that" })],
      refuted: 0,
      unsure: 0,
    });
    expect(text).not.toContain("<!channel>");
    expect(text).toContain("&lt;!channel&gt;");
  });

  it("still posts the walks' own checks when the judge could not run", () => {
    const text = slackMessage("2026-09-29", loaded, { failed: "the usage limit" });
    expect(text).toContain("The judge did not run: the usage limit");
    expect(text).toContain("Stopped before the end");
  });
});
