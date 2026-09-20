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

const RAW = readFileSync(resolve(process.cwd(), "scripts/verify-ux-findings.mjs"), "utf8");
/** Comments stripped: prose describing a guard must not satisfy a test for it. */
const SRC = RAW.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const challengers = UX_SCANNERS.filter((s) => s.role === "challenger");
const champions = UX_SCANNERS.filter((s) => s.role === "champion");

describe("the challenger scanner", () => {
  it("watches the same trigger event as a champion, or it is not a comparison", () => {
    expect(challengers.length).toBeGreaterThan(0);
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
    expect(SRC).toMatch(
      /isChallenger\(scannerName\)\s*\?\s*"suppressed"\s*:\s*await deliverVerdict/
    );
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

  it("matches the naming convention the real challenger uses", () => {
    // The regex and scanners.ts must agree, or the report is silently empty.
    const chall = UX_SCANNERS.find((s) => s.role === "challenger");
    const champ = UX_SCANNERS.find(
      (s) => s.role === "champion" && s.triggerEvent === chall!.triggerEvent
    );
    const by = new Map<string, object>([
      [champ!.name, e(0, 38, 20)],
      [chall!.name, e(1, 1)],
    ]);
    expect(championChallengerPairs(by), `"${chall!.name}" did not pair`).toHaveLength(1);
  });
});
