/**
 * The persona walkers (scripts/walkers/): the answers each persona gives, which walks run
 * tonight, what a walk proves on its own, and what the judge may do and post.
 */
import { describe, expect, it } from "vitest";

import { surveyQuestions } from "@/data/survey-data";
import { getScoringConfig, getScoringConfigSha } from "@features/scoring/logic/config";
import { scoreArchetypes } from "@features/scoring/logic/engine";

import { checkWalk } from "../../scripts/walkers/checks";
import {
  cleanFindings,
  judgeArgs,
  judgeEnv,
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
  WALKS_PER_NIGHT,
  walksFor,
} from "../../scripts/walkers/rotation";
import {
  answerFor,
  findQuestion,
  redact,
  walkableOrigin,
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

  it("buy every plan several times a week", () => {
    for (const plan of PLANS) {
      expect(allWalks(names).filter((w) => w.plan === plan).length, plan).toBeGreaterThanOrEqual(8);
    }
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

  it("move each persona's plan on every week, so all three get bought", () => {
    const plansOf = (name: string) =>
      new Set(
        [0, 1, 2].flatMap((week) =>
          allWalks(names, week)
            .filter((w) => w.persona === name)
            .map((w) => w.plan)
        )
      );
    for (const name of names) expect(plansOf(name).size, name).toBe(PLANS.length);
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
  });

  it("recognises every question by the words of its heading", () => {
    for (const q of surveyQuestions) {
      expect(findQuestion(["Skip to main content", q.question])?.qId).toBe(q.qId);
    }
    // Typographic quotes on screen, straight ones in the data (or the other way round).
    const curly = surveyQuestions.find((q) => q.question.includes("'"));
    if (curly) expect(findQuestion([curly.question.replace(/'/g, "’")])?.qId).toBe(curly.qId);
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
  origin: "https://staging.loveiq.org",
  startedAt: "2026-09-29T02:41:00Z",
  finished: true,
  unknownQuestions: [],
  missingOptions: [],
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

describe("what a walk proves on its own", () => {
  it("passes a walk that finished, named the persona and unlocked what it paid for", () => {
    expect(checkWalk(walk()).every((c) => c.ok)).toBe(true);
  });

  it("says when the report named another archetype", () => {
    const c = checkWalk(walk({ assignedArchetype: "Radiant Performer" })).find((x) => !x.ok);
    expect(c?.what).toContain("Spark Seeker");
    expect(c?.what).toContain("Radiant Performer");
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
