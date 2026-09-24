import { describe, expect, it } from "vitest";
import { shippedEntries } from "@features/brain/server/shipped";

const merge = (pr: number, line: string, date: string) => ({
  sha: `m${pr}abcdef0`,
  commit: {
    message: `merge: something (#${pr})\n\nfeat(x): something\n\nFor Marcus: ${line}`,
    committer: { date: `${date}T20:00:00Z` },
  },
});
const branch = (line: string, date: string) => ({
  sha: "b1234567890",
  commit: {
    message: `feat(x): something\n\nlong body\n\nFor Marcus: ${line}`,
    committer: { date: `${date}T19:00:00Z` },
  },
});

describe("shippedEntries", () => {
  it("reads the For Marcus line, the date and the pull request, newest first", () => {
    const out = shippedEntries([
      merge(266, "Docs now match.", "2026-09-23"),
      merge(265, "Fewer dead ends.", "2026-09-22"),
    ]);
    expect(out).toEqual([
      { date: "2026-09-23", pr: 266, sha: "m266abc", text: "Docs now match." },
      { date: "2026-09-22", pr: 265, sha: "m265abc", text: "Fewer dead ends." },
    ]);
  });

  /** Older commits wrapped the line at 80 columns; the first line alone cut it mid-sentence. */
  it("reads a wrapped For Marcus paragraph whole, and stops at the next blank line", () => {
    const out = shippedEntries([
      {
        sha: "w1234567",
        commit: {
          message:
            "fix: x\n\nFor Marcus: When someone taps a button and nothing happens, we\n" +
            "now notice it the same day.\n\nSigned-off-by: someone",
          committer: { date: "2026-09-17T10:00:00Z" },
        },
      },
    ]);
    expect(out[0]!.text).toBe(
      "When someone taps a button and nothing happens, we now notice it the same day."
    );
  });

  /** A merge and the branch commit it brings in carry the same line; the merge has the PR. */
  it("lists a change once, keeping the merge that names its pull request", () => {
    const out = shippedEntries([
      merge(266, "Docs now match.", "2026-09-23"),
      branch("Docs now match.", "2026-09-23"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].pr).toBe(266);
  });

  /**
   * A PULL REQUEST'S OWN COMMITS DID NOT "REACH MAIN" ONE BY ONE. GitHub lists every
   * commit reachable from main, so each branch commit came back beside the merge that
   * brought it in, each with its own For Marcus line: 66 "changes" for one day, measured
   * on production. Only main's first-parent history is what landed.
   */
  it("lists only main's own history, not the commits inside a merged pull request", () => {
    const out = shippedEntries([
      {
        sha: "m2",
        parents: [{ sha: "m1" }, { sha: "b2" }],
        commit: {
          message: "merge: two (#2)\n\nFor Marcus: Second change.",
          committer: { date: "2026-09-23T21:00:00Z" },
        },
      },
      {
        sha: "b2",
        parents: [{ sha: "m1" }],
        commit: {
          message: "fix: part of two\n\nFor Marcus: A branch commit inside two.",
          committer: { date: "2026-09-23T20:00:00Z" },
        },
      },
      {
        sha: "m1",
        parents: [{ sha: "d0" }, { sha: "b1" }],
        commit: {
          message: "merge: one (#1)\n\nFor Marcus: First change.",
          committer: { date: "2026-09-23T19:00:00Z" },
        },
      },
      {
        sha: "b1",
        parents: [{ sha: "d0" }],
        commit: {
          message: "fix: part of one\n\nFor Marcus: A branch commit inside one.",
          committer: { date: "2026-09-23T18:00:00Z" },
        },
      },
      {
        sha: "d0",
        parents: [{ sha: "x" }],
        commit: {
          message: "fix: pushed straight to main\n\nFor Marcus: A direct commit.",
          committer: { date: "2026-09-23T17:00:00Z" },
        },
      },
    ]);
    expect(out.map((e) => e.text)).toEqual(["Second change.", "First change.", "A direct commit."]);
  });

  it("keeps a direct commit to main, which has no pull request number", () => {
    const out = shippedEntries([branch("Hotfix for the paywall.", "2026-09-20")]);
    expect(out).toEqual([
      { date: "2026-09-20", pr: null, sha: "b123456", text: "Hotfix for the paywall." },
    ]);
  });

  it("skips commits with no For Marcus line, and one whose line is empty", () => {
    const out = shippedEntries([
      { sha: "x", commit: { message: "chore: bump", committer: { date: "2026-09-20T00:00:00Z" } } },
      {
        sha: "y",
        commit: {
          message: "fix: y\n\nFor Marcus:   ",
          committer: { date: "2026-09-20T00:00:00Z" },
        },
      },
    ]);
    expect(out).toEqual([]);
  });

  it("takes the last For Marcus line when a message quotes an earlier one", () => {
    const out = shippedEntries([
      {
        sha: "z",
        commit: {
          message:
            "fix: z\n\nThe old line said\nFor Marcus: wrong\nwas stale.\n\nFor Marcus: right",
          committer: { date: "2026-09-21T00:00:00Z" },
        },
      },
    ]);
    expect(out[0].text).toBe("right");
  });
});
