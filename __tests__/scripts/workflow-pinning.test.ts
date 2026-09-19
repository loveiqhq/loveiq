/**
 * Every GitHub Action is pinned to a commit, never to a tag.
 *
 * A tag is a movable pointer: whoever controls the action repository can make
 * `@v4` mean different code tomorrow, and that code runs with our repository
 * secrets. A commit SHA cannot move.
 *
 * Fifteen of the sixteen workflows already did this. `survey-db-sync.yml` did
 * not, and nothing would have said so — found by hand on 2026-09-19, which is
 * exactly the kind of check that should not depend on someone looking.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const DIR = resolve(process.cwd(), ".github/workflows");

describe("GitHub Actions are pinned to commits", () => {
  it("has no workflow trusting a movable tag", () => {
    const offenders: string[] = [];
    for (const name of readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f))) {
      const lines = readFileSync(join(DIR, name), "utf8").split("\n");
      for (const [i, line] of lines.entries()) {
        // Commented-out examples are not executed, so they are not a risk —
        // but a `uses:` that runs must carry a 40-character SHA.
        if (/^\s*#/.test(line)) continue;
        const m = /^\s*(-\s*)?uses:\s*(\S+)/.exec(line);
        if (!m) continue;
        const ref = m[2];
        // A local action (./path) has no ref to pin.
        if (ref.startsWith("./")) continue;
        if (!/@[0-9a-f]{40}$/.test(ref)) offenders.push(`${name}:${i + 1} ${ref}`);
      }
    }
    expect(offenders, `these run third-party code from a movable tag`).toEqual([]);
  });
});
