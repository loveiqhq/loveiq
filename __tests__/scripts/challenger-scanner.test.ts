/**
 * Champion/challenger: the rules that make the comparison mean anything.
 *
 * A scanner observes a given session once, ever, so an edited prompt can never
 * be measured against the old one on the same recordings — the only honest
 * experiment is two scanners on one trigger event. That shape has three ways to
 * go quietly wrong, and each is pinned here:
 *
 *   1. the two do not watch the same sessions, so the score compares populations
 *   2. the challenger speaks to the team before it has earned it
 *   3. the second scanner's finding is filed as a `duplicate`, which the ledger
 *      score EXCLUDES — the comparison would then measure fetch order
 *
 * The verifier half is a SOURCE test: that script runs its whole flow as
 * top-level statements, so importing it reaches PostHog, Supabase and Slack.
 * Same technique as ux-finding-ledger.test.ts, for the same reason.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { UX_SCANNERS } from "../../features/ux-review/server/scanners";
// @ts-expect-error -- .mjs helper, no types
import { championChallengerPairs } from "../../scripts/lib/challenger-pairs.mjs";
// @ts-expect-error -- .mjs helper, no types
import { scannersByTrigger } from "../../scripts/lib/scanners-by-trigger.mjs";

const RAW = readFileSync(resolve(process.cwd(), "scripts/verify-ux-findings.mjs"), "utf8");
/** Comments stripped: prose describing a guard must not satisfy a test for it. */
const SRC = RAW.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const challengers = UX_SCANNERS.filter((s) => s.role === "challenger");
const champions = UX_SCANNERS.filter((s) => s.role === "champion");

describe("the challenger scanner", () => {
  /**
   * NO CHALLENGER NEED BE RUNNING for these rules to be worth pinning. The
   * first experiment ended 2026-09-21 and the machinery stayed, because the
   * next one will use it. A suite that only passes while an experiment is live
   * goes red the moment one ends, which teaches people to delete the suite.
   *
   * So: every rule below holds for whatever challengers exist, and the naming
   * convention is proved against a constructed one so it can never go vacuous.
   */
  it("watches the same trigger event as a champion, or it is not a comparison", () => {
    for (const c of challengers) {
      const rival = champions.find((p) => p.triggerEvent === c.triggerEvent);
      expect(
        rival,
        `${c.name} watches "${c.triggerEvent}", which no champion watches — ` +
          `the two would be scored on different populations`
      ).toBeDefined();
    }
  });

  it("is named distinctly, because the ledger scores by scanner_name", () => {
    const names = UX_SCANNERS.map((s) => s.name);
    expect(new Set(names).size, "two scanners share a name").toBe(names.length);
  });

  it("does not ask for a cause, which is the thing being tested", () => {
    // The champion's measured failure is invented causation: 20 of its 38
    // labelled findings name an unlock or checkout press our own events say
    // never happened. A challenger that still asks "why" is not a challenger.
    for (const c of challengers) {
      expect(c.prompt).toMatch(/[Nn]ever name a control/);
      expect(c.prompt).toMatch(/[Nn]ever (state|explain)/);
    }
  });

  it("every scanner declares a role, so none defaults into the channel", () => {
    for (const s of UX_SCANNERS) {
      expect(["champion", "challenger"], `${s.name} has role ${s.role}`).toContain(s.role);
    }
  });
});

describe("the verifier keeps a challenger out of the channel", () => {
  it("never opens a pull request for one", () => {
    expect(SRC).toMatch(/reproduced && !DRY_RUN && !CLASSIFY_ONLY && !isChallenger\(scannerName\)/);
  });

  it("never posts its verdict into a reader's thread", () => {
    /**
     * By INTENT, not by exact expression. This pinned the whole ternary and
     * went red the day a second reason to stay quiet was added beside it — the
     * guard still held, the assertion did not. Assert that the challenger is
     * part of whatever suppresses delivery, however that condition grows.
     */
    const line = SRC.split("\n").find((l) =>
      l.includes("await deliverVerdict(sessionId, verdict)")
    );
    expect(line, "the main delivery call must exist to be guarded").toBeTruthy();
    expect(line, "a challenger must never reach a thread").toMatch(/isChallenger\(scannerName\)/);
    expect(line).toMatch(/"suppressed"/);
  });

  it("still records it, or the experiment cannot be scored at all", () => {
    // Suppression must stop DELIVERY, never the ledger write. The recordFinding
    // call sits after the delivery line with no challenger condition on it.
    const afterDelivery = SRC.slice(SRC.indexOf('"suppressed"'));
    expect(afterDelivery).toMatch(/await recordFinding\(/);
    expect(afterDelivery).not.toMatch(/if \(isChallenger[^)]*\)\s*continue/);
  });
});

describe("a second scanner on the same session inherits the probe's answer", () => {
  it("replays the cached outcome instead of filing a duplicate", () => {
    expect(SRC, "the run must remember what each probe concluded").toMatch(
      /const outcomeThisRun = new Map\(\)/
    );
    expect(SRC, "and store it after the probe runs").toMatch(/outcomeThisRun\.set\(pairKey/);
    expect(SRC, "and read it back on the duplicate path").toMatch(/outcomeThisRun\.get\(pairKey\)/);
  });

  it("only falls back to 'duplicate' when there is genuinely no answer", () => {
    // The unconditional `outcome: "duplicate"` is the bug: it discards a real
    // verdict the run already computed, and the ledger score drops those rows.
    const dupWrites = SRC.match(/outcome: "duplicate"/g) ?? [];
    expect(dupWrites.length, "one fallback only").toBe(1);
    expect(SRC).toMatch(/answered\s*\?\s*\{[\s\S]{0,200}?\}\s*:[\s\S]{0,120}?outcome: "duplicate"/);
  });

  it("does not re-deliver the inherited verdict", () => {
    // One reader, one thread, one verdict — the reason duplicates existed.
    expect(SRC).toMatch(/\.\.\.answered, criterion: criterion\.id, delivered: false/);
  });
});

describe("the champion/challenger report", () => {
  const e = (right: number, wrong: number, contradicted = 0) => ({ right, wrong, contradicted });

  it("pairs a challenger with the champion named in its own name", () => {
    const by = new Map<string, object>([
      ["LoveIQ report UX", e(0, 38, 20)],
      ["LoveIQ report UX (challenger: observation only)", e(3, 7, 1)],
      ["LoveIQ survey UX", e(2, 28)],
    ]);
    const pairs = championChallengerPairs(by);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].base).toBe("LoveIQ report UX");
    expect(pairs[0].champion).toEqual(e(0, 38, 20));
    expect(pairs[0].challenger).toEqual(e(3, 7, 1));
  });

  it("reports nothing when the challenger has no champion to beat", () => {
    // A challenger whose champion produced no labelled findings cannot be
    // scored against anything, and inventing a zero baseline would hand it a
    // win it never earned.
    const by = new Map<string, object>([["Ghost UX (challenger: observation only)", e(5, 1)]]);
    expect(championChallengerPairs(by)).toEqual([]);
  });

  it("never pairs a champion with itself", () => {
    const by = new Map<string, object>([["LoveIQ report UX", e(0, 38, 20)]]);
    expect(championChallengerPairs(by)).toEqual([]);
  });

  it("matches the naming convention a challenger must use", () => {
    /**
     * Proved against the convention itself, not against whichever challenger
     * happens to be running — there may be none. `<champion> (challenger: …)`
     * is what scanners.ts documents and what the pairing regex expects; if they
     * ever disagree the weekly report is silently empty.
     */
    const champion = UX_SCANNERS.find((s) => s.role === "champion")!;
    const name = `${champion.name} (challenger: observation only)`;
    const by = new Map<string, object>([
      [champion.name, e(0, 38, 20)],
      [name, e(1, 1)],
    ]);
    expect(championChallengerPairs(by), `"${name}" did not pair`).toHaveLength(1);

    // And any challenger that IS running must follow it.
    for (const c of UX_SCANNERS.filter((s) => s.role === "challenger")) {
      expect(c.name, `${c.name} does not follow the convention`).toMatch(/ \(challenger[^)]*\)$/);
    }
  });
});

/**
 * A SECOND SCANNER ON ONE TRIGGER USED TO DELETE THE FIRST.
 *
 * The re-queue mapped trigger -> scanner in a plain Map, last one wins. That
 * was invisible while every trigger had exactly one scanner, and the moment the
 * challenger joined `report_viewed` it displaced `LoveIQ report UX`: a coverage
 * gap was then re-queued to the EXPERIMENT and never to the scanner that speaks
 * to the team, so those readers stay MISSED for good — coverage counts
 * production observations only — while every run spends challenger credits on a
 * gap it cannot close. Caught by reading a live run's log, not by a test.
 */
describe("re-queueing a recording nothing watched", () => {
  const sc = (id: string, name: string, trigger: string) => ({
    id,
    name,
    query: { events: [{ id: trigger }] },
  });

  it("returns EVERY scanner on a trigger, not just the last one declared", () => {
    const by = scannersByTrigger([
      sc("1", "LoveIQ report UX", "report_viewed"),
      sc("2", "LoveIQ report UX (challenger: observation only)", "report_viewed"),
      sc("3", "LoveIQ survey UX", "survey_started"),
    ]);
    expect(by.get("report_viewed").map((s: { name: string }) => s.name)).toEqual([
      "LoveIQ report UX",
      "LoveIQ report UX (challenger: observation only)",
    ]);
    expect(by.get("survey_started")).toHaveLength(1);
  });

  it("keeps the champion even when the challenger is declared after it", () => {
    // The exact ordering that broke it: PostHog lists by creation, and the
    // challenger is newer than every champion.
    const by = scannersByTrigger([
      sc("1", "LoveIQ report UX", "report_viewed"),
      sc("2", "LoveIQ report UX (challenger: observation only)", "report_viewed"),
    ]);
    const names = by.get("report_viewed").map((s: { name: string }) => s.name);
    expect(names, "the production scanner must still be re-queued").toContain("LoveIQ report UX");
  });

  it("survives a scanner with no query or no events", () => {
    const by = scannersByTrigger([
      { id: "1", name: "broken" },
      { id: "2", name: "empty", query: { events: [] } },
      { id: "3", name: "nameless event", query: { events: [{}] } },
      sc("4", "LoveIQ survey UX", "survey_started"),
    ] as never);
    expect(by.size).toBe(1);
    expect(by.get("survey_started")).toHaveLength(1);
  });
});

/**
 * A READER'S THREAD IS FOR THINGS THAT HAPPENED TO THEM.
 *
 * Measured 2026-09-21: 80 messages had been posted under people's submissions,
 * and 2 of them reported a real problem. 55 said "could not reproduce" and 22
 * said our own scanner had described something that never happened. Both were
 * added before the ledger existed, when not posting meant losing the verdict.
 * The ledger records every outcome now, and the daily digest reports the totals,
 * so the only thing the per-person message still added was noise on top of the
 * two that mattered.
 */
describe("only a real finding reaches a reader's thread", () => {
  const SRC = readFileSync(resolve(process.cwd(), "scripts/verify-ux-findings.mjs"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("posts a reproduction, and an honest could-not-check", () => {
    // `inconclusive` is a request for a human, not a result — it stays.
    expect(SRC).toMatch(/const speaks = reproduced \|\| inconclusive;/);
  });

  it("does not post a could-not-reproduce", () => {
    expect(SRC).toMatch(/isChallenger\(scannerName\) \|\| !speaks \? "suppressed"/);
  });

  it("does not announce our own scanner's mistakes under a customer's name", () => {
    // The contradicted branch must record and stay quiet, never deliverVerdict.
    const branch = SRC.slice(
      SRC.indexOf("const why = contradiction("),
      SRC.indexOf('outcome: "contradicted"')
    );
    expect(branch, "the refuted branch must not post").not.toMatch(/await deliverVerdict\(/);
    expect(branch).toMatch(/const sent = "suppressed";/);
  });

  it("still records every one of them", () => {
    // Suppression must never reach the ledger write — that is the whole reason
    // it is safe to stop posting.
    const calls = SRC.match(/await recordFinding\(/g) ?? [];
    expect(calls.length, "every outcome still writes a row").toBeGreaterThanOrEqual(5);
  });
});
