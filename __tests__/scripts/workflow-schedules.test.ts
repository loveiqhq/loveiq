import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const crons = (yml: string) => [...yml.matchAll(/- cron: "([^"]+)"/g)].map((m) => m[1]);

/**
 * GitHub drops and delays this repo's scheduled runs (from 2026-09-14 the
 * verifier ran 4-6 times a day on an 8-a-day cron, and every schedule here
 * starts 4.5 to 5.5 hours late: docs/runbooks/COMPANY_BRAIN.md). These pin the
 * answers.
 */
describe("schedules GitHub is allowed to drop", () => {
  it("the verifier runs hourly, and its weekly step is gated on a cron that exists", () => {
    const yml = read(".github/workflows/ux-review-verify.yml");
    const all = crons(yml);
    expect(all).toContain("41 * * * *");
    const gate = /github\.event\.schedule == '([^']+)'/.exec(yml)?.[1];
    expect(all, "the weekly step's gate names a schedule that never fires").toContain(gate);
    // In the same minute as the hourly run, a Monday would start two runs.
    expect(gate?.split(" ")[0]).not.toBe("41");
  });

  it("the digest audit has fallbacks, and posts once per digest however many run", () => {
    expect(crons(read(".github/workflows/ux-digest-audit.yml")).length).toBeGreaterThanOrEqual(3);
    const script = read("scripts/audit-ux-digest.mjs");
    expect(script).toMatch(/tryClaimSlackAlert\("ux_digest_audit"/);
    expect(script.indexOf("tryClaimSlackAlert(")).toBeLessThan(script.indexOf("await fetch(hook"));
  });
});
