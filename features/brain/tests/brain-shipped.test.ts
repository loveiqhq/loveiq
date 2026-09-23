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

  /** A merge and the branch commit it brings in carry the same line; the merge has the PR. */
  it("lists a change once, keeping the merge that names its pull request", () => {
    const out = shippedEntries([
      merge(266, "Docs now match.", "2026-09-23"),
      branch("Docs now match.", "2026-09-23"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].pr).toBe(266);
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
