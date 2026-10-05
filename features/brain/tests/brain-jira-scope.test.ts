/**
 * The sweep scopes on the project KEY, not its display name.
 *
 * `PROJECTS` is a list of keys ("GROW"); `meta.project` holds what `named()`
 * returns, which is the display name ("Growth"). An earlier note beside the
 * sweep recommended scoping on `meta.project` with `new Set(PROJECTS)` — that
 * would have compared names against keys, matched nothing, and silently
 * disabled the sweep. A sweep that never deletes looks exactly like a sweep
 * with nothing to do, which is why this is pinned rather than left to review.
 */
import { describe, expect, it } from "vitest";

import { toRow } from "@features/brain/server/ingest/jira";

const issue = (project: { key?: string; name?: string }) => ({
  key: "GROW-1",
  fields: {
    summary: "A ticket",
    status: { name: "Done" },
    issuetype: { name: "Task" },
    project,
    created: "2026-09-01T00:00:00.000Z",
    updated: "2026-09-02T00:00:00.000Z",
  },
});

describe("jira rows carry the project key the sweep scopes on", () => {
  it("records the key, separately from the display name", () => {
    const row = toRow(issue({ key: "GROW", name: "Growth" }), "https://x.atlassian.net", "S")!;
    const meta = row.meta as Record<string, unknown>;

    expect(meta.projectKey).toBe("GROW");
    // Both are kept: the name is what a reader wants to see.
    expect(meta.project).toBe("Growth");
    // The distinction is the bug. If these were the same field, the scope
    // filter would compare "Growth" against PROJECTS and match nothing.
    expect(meta.projectKey).not.toBe(meta.project);
  });

  it("is null when the project carries no key, so the row stays sweepable", () => {
    const row = toRow(issue({ name: "Growth" }), "https://x.atlassian.net", "S")!;
    expect((row.meta as Record<string, unknown>).projectKey).toBeNull();
  });
});
