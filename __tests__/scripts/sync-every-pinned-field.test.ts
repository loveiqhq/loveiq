/**
 * "scanners.ts is the source of truth" was only ever true for the PROMPT.
 *
 * sync-vision-scanners.ts compared the live prompt against git and, if they
 * matched, reported "ok" and moved on — so `samplingMode` and `creditLimit`,
 * which scanners.ts pins and `body()` sends, could sit out of step with
 * PostHog indefinitely. Found on 2026-09-23 when the first change to a
 * non-prompt field (moving two scanners off `focused`, which was skipping a
 * third of their sessions) dry-ran as "ok (prompt matches)" and would have
 * merged as a silent no-op.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = readFileSync(resolve(process.cwd(), "scripts/sync-vision-scanners.ts"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("the scanner sync", () => {
  it("compares sampling mode, not only the prompt", () => {
    expect(SRC).toMatch(/live\.sampling_mode !== scanner\.samplingMode/);
  });

  it("compares the credit cap, not only the prompt", () => {
    expect(SRC).toMatch(/live\.credit_limit !== scanner\.creditLimit/);
  });

  it("only calls a scanner ok when every pinned field matches", () => {
    // The old early-exit — "prompt matches, so skip" — is what made every
    // other field unsyncable.
    expect(SRC).not.toMatch(/if \(live\.scanner_config\?\.prompt === scanner\.prompt\) \{/);
    expect(SRC).toMatch(/if \(drifted\.length === 0\)/);
  });
});
