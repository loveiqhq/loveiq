import { describe, expect, it } from "vitest";

import {
  checkDigest,
  type DigestFacts,
  digestAuditMessage,
  LABEL_GRACE_MS,
  type PrState,
} from "@features/ux-review/server/digest-audit";

/**
 * Each check must be able to say no. The four false claims that motivated this
 * (2026-09-24) are the first cases: a closed-as-wrong PR still "confirmed", "no
 * survey entry" for readers who had one, and "not lost" for readers no survey
 * scanner ever opened.
 */
const AT = Date.parse("2026-09-25T07:18:26Z");
const PR = "https://github.com/loveiqhq/loveiq/pull/282";

const facts = (over: Partial<DigestFacts> = {}): DigestFacts => ({
  at: AT,
  verification: {
    reproduced: 0,
    reproducedItems: [],
    clear: 0,
    inconclusive: 0,
    gap: 0,
    contradicted: 0,
    duplicate: 0,
    undelivered: 0,
    undeliveredSessions: [],
    overturned: 0,
    total: 0,
  },
  coverage: { submissions: 17, observed: 17, unrecorded: 0 },
  finishers: 17,
  threads: new Map(),
  prs: new Map(),
  labelled: [],
  stillUnwatched: [],
  ...over,
});
const item = (over: Record<string, unknown> = {}) => ({
  criterion: "D1",
  urlPath: "/survey",
  delivered: true,
  fromOwnRecords: true,
  heldForAPerson: false,
  sessionId: "a",
  prUrl: null,
  ...over,
});
const failed = (f: DigestFacts) => checkDigest(f).filter((c) => !c.ok);
const pr = (state: PrState["state"], closedMsAgo = 0): PrState => ({
  state,
  closedAt: state === "open" ? null : new Date(AT - closedMsAgo).toISOString(),
});

describe("the digest audit", () => {
  it("passes a digest whose every claim holds", () => {
    expect(
      failed(
        facts({
          verification: {
            ...facts().verification,
            reproduced: 1,
            reproducedItems: [item()],
            undelivered: 1,
            undeliveredSessions: ["b"],
          },
          threads: new Map([
            ["a", true],
            ["b", false],
          ]),
        })
      )
    ).toEqual([]);
  });

  it("catches 'no survey entry' said of a reader who has one", () => {
    const f = facts({
      verification: { ...facts().verification, undelivered: 2, undeliveredSessions: ["b", "c"] },
      threads: new Map([
        ["b", true],
        ["c", false],
      ]),
    });
    expect(failed(f).map((c) => c.detail)).toEqual(["1 of them do have one (b)"]);
  });

  it("holds each confirmed line to the thread it describes", () => {
    const run = (over: Record<string, unknown>, thread: boolean) =>
      failed(
        facts({
          verification: { ...facts().verification, reproducedItems: [item(over)] },
          threads: new Map([["a", thread]]),
        })
      ).length;
    expect(run({ delivered: true }, false)).toBe(1); // "posted", but no thread
    expect(run({ delivered: false }, true)).toBe(1); // "no survey entry", but there is one
    expect(run({ heldForAPerson: true, delivered: true }, true)).toBe(1); // held, yet posted
    expect(run({ heldForAPerson: true, delivered: false }, true)).toBe(0);
  });

  it("will not let a closed-as-wrong pull request count as confirmed", () => {
    const f = facts({
      verification: { ...facts().verification, reproducedItems: [item({ prUrl: PR })] },
      threads: new Map([["a", true]]),
      prs: new Map([[PR, pr("closed", LABEL_GRACE_MS * 2)]]),
    });
    expect(failed(f).map((c) => c.detail)).toEqual([`its pull request was closed unmerged: ${PR}`]);
  });

  it("checks every label against GitHub, allowing the label job its three hours", () => {
    const label = (state: PrState["state"], label: string | null, ago = LABEL_GRACE_MS * 2) =>
      failed(facts({ labelled: [{ prUrl: PR, label }], prs: new Map([[PR, pr(state, ago)]]) }))
        .length;
    expect(label("closed", "disagree")).toBe(0);
    expect(label("merged", "agree")).toBe(0);
    expect(label("closed", "agree")).toBe(1);
    expect(label("closed", null)).toBe(1);
    expect(label("closed", null, LABEL_GRACE_MS / 2)).toBe(0); // not late yet
    expect(label("open", "agree")).toBe(1);
  });

  it("counts the finishers the coverage line speaks for", () => {
    expect(failed(facts({ finishers: 18 }))).toHaveLength(1);
    // One with no recording, said out loud, is not a discrepancy.
    expect(
      failed(facts({ finishers: 18, coverage: { submissions: 17, observed: 17, unrecorded: 1 } }))
    ).toEqual([]);
  });

  it("holds 'not lost' to the readers still unwatched a day later", () => {
    const f = facts({ stillUnwatched: [{ submissionId: 2183, sessionId: "x" }] });
    expect(failed(f).map((c) => c.detail)).toEqual([
      "1 who finished a day or more ago, with a recording, were never opened by the survey " +
        "scanner (submissions 2183)",
    ]);
  });
});

describe("the message when a claim was false", () => {
  it("names the digest in Berlin time and each false claim", () => {
    const [bad] = failed(facts({ finishers: 18 }));
    const text = digestAuditMessage(AT, [bad], "https://github.com/run/1");
    // 07:18 UTC in September is 09:18 in Berlin; h23 so midnight is 00, not 24.
    // "Sept" or "Sep": en-GB's abbreviation changed between ICU versions.
    expect(text).toMatch(/The UX digest sent 25 Sept?, 09:18 said something/);
    expect(text).toContain(`• "of the 17 people who finished the survey": 18 finished, not 17.`);
    expect(text).toContain("<https://github.com/run/1|The full check>");
  });
});
