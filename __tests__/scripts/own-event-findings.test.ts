/**
 * The verifier does not need a model to notice a dead control.
 *
 * The scanners measure precision 0.20 and recall 0.50 against bars of 0.80 and
 * 0.60, and the repo has already established that prompt hardening does not fix
 * it. Low precision is survivable — every claim is gated by a probe, so a false
 * one costs CI minutes. Low RECALL is not: measured 2026-09-19, of four sessions
 * where a reader pressed a real, dead control, the dead-click scanner flagged
 * ZERO of them.
 *
 * `dead_click` is our own event and carries the pathname and the CSS selector,
 * so that whole class is mechanical. These assertions pin the three properties
 * that make the synthesised findings safe to put in a reader's thread.
 *
 * A source test because the verifier is a script with top-level await that runs
 * on import — the same technique verifier-budget.test.ts uses for the same file.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = readFileSync(resolve(process.cwd(), "scripts/verify-ux-findings.mjs"), "utf8");

describe("findings synthesised from our own dead_click events", () => {
  it("only counts a tap on a REAL control, never on decoration", () => {
    const block = /const OWN_EVENT_FINDINGS = await posthog\(`([\s\S]*?)`\);/.exec(SRC)?.[1] ?? "";
    expect(block, "the own-event query is missing").not.toBe("");
    // 807 of 827 sessions with a dead_click tapped a paragraph. Without this
    // filter the verifier would drive a browser for every one of them and the
    // probe would correctly answer "not a control, not a defect" each time.
    expect(block).toContain("'button'");
    expect(block).toContain("'[role=button'");
    expect(block).toContain("event = 'dead_click'");
  });

  it("phrases them so the classifier routes them to the dead-control probe", () => {
    /**
     * The classifier cannot be imported — this module is a script with
     * top-level await and runs on import — so D1's own regex is lifted out of
     * the source and applied to the sentence the code actually builds. A
     * wording change on either side that stopped them matching would otherwise
     * drop the whole class silently, reported as "no probe covers this claim".
     */
    const d1 = /id: "D1",[\s\S]*?match: (\/.+?\/[a-z]*),/.exec(SRC)?.[1];
    expect(d1, "D1's match regex was not found in the source").toBeTruthy();
    const [, body, flags] = /^\/(.*)\/([a-z]*)$/.exec(d1!)!;
    const re = new RegExp(body, flags);

    const built = /`A reader tapped \$\{sel\} on \$\{path\} \$\{n\} time\(s\) and ([^`]*)`/.exec(
      SRC
    );
    expect(built, "the synthesised sentence changed shape").toBeTruthy();
    const sentence = `A reader tapped button.flex-1 on /survey 3 time(s) and ${built![1]}`;
    expect(re.test(sentence), `D1 no longer matches: ${sentence}`).toBe(true);
  });

  it("says where it came from, so a verdict never implies a model saw it", () => {
    expect(SRC).toContain('"our own dead_click events"');
  });

  it("gives each one a stable id, so the once-ever claim holds across runs", () => {
    // A fresh id per run would re-post the same finding into the same thread
    // every three hours.
    expect(SRC).toContain("`own-dead-click:${sid}`");
    expect(SRC).not.toMatch(/own-dead-click:\$\{(Date\.now|Math\.random)/);
  });

  it("does not add a second finding for a session a scanner already flagged", () => {
    expect(SRC).toContain("seenSessions");
    expect(SRC).toMatch(/if \(seenSessions\.has\(String\(sid\)\)\) continue;/);
  });
});
