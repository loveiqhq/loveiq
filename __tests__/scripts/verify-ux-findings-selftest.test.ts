/**
 * The verifier's selftest, run on every pull request.
 *
 * It pins the finding classifier, the claim-scoping flags and which probes
 * judge which finding, and until 2026-09-23 it ran only inside the scheduled
 * ux-review-verify job. A change that broke it merged green; the first sign
 * would have been the next scheduled run stopping before it verified anything.
 */
import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

describe("verify-ux-findings", () => {
  it("passes its own selftest", () => {
    const out = execFileSync(
      process.execPath,
      ["--import", "tsx", "scripts/verify-ux-findings.mjs", "--selftest"],
      // No secrets: the selftest needs none, and a sourced .env.local must not
      // be what makes it pass.
      { encoding: "utf8", env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" } }
    );
    // The marker only this selftest prints. An imported module that exits 0 at
    // import time would otherwise pass this with nothing checked.
    expect(out).toContain("verify-ux-findings selftest ok");
  });
});
