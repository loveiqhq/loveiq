import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { jobsDue } from "@features/cron/server/github-jobs";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/**
 * GitHub's own schedule starts this repo's jobs 4.5 to 5.5 hours late and drops
 * the slots that fall due meanwhile: an hourly cron still ran four times a day
 * (2026-09-25). So Vercel's clock starts these (features/cron/server/github-jobs.ts,
 * tested in features/cron/tests/start-github-jobs.test.ts). These pin what each
 * workflow does with the clock's runs.
 */
describe("the jobs the clock starts", () => {
  it("the verifier scores the scanners only when asked, and the clock asks on Mondays", () => {
    const yml = read(".github/workflows/ux-review-verify.yml");
    expect(yml).toMatch(
      /- name: Score the scanners \(weekly\)\n\s+#[^\n]*\n\s+#[^\n]*\n\s+if: format\('\{0\}', inputs\.weekly\) == 'true'/
    );
    const asks = [...Array(7).keys()].flatMap((d) =>
      [...Array(24).keys()]
        .filter((h) =>
          jobsDue(new Date(Date.UTC(2026, 8, 28 + d, h, 41))).some(
            (j) => j.workflow === "ux-review-verify.yml" && j.inputs?.weekly === "true"
          )
        )
        .map((h) => `${d}:${h}`)
    );
    // 2026-09-28 is a Monday: once a week, at 10:41.
    expect(asks).toEqual(["0:10"]);
  });

  it("the verifier and the audit record only the clock's runs", () => {
    for (const [file, step] of [
      ["ux-review-verify.yml", "Record that the verifier ran"],
      ["ux-digest-audit.yml", "Record that the audit ran"],
    ]) {
      const yml = read(`.github/workflows/${file}`);
      const at = yml.indexOf(`- name: ${step}`);
      expect(at, `${file} must still record its runs`).toBeGreaterThan(-1);
      expect(yml.slice(at, at + 200)).toMatch(
        /if: always\(\) && format\('\{0\}', inputs\.on_time\) == 'true'/
      );
    }
  });

  it("the digest audit has a fallback start, and posts once per digest however many run", () => {
    const starts = [...Array(24).keys()].filter((h) =>
      jobsDue(new Date(Date.UTC(2026, 8, 29, h, 41))).some(
        (j) => j.workflow === "ux-digest-audit.yml"
      )
    );
    expect(starts.length).toBeGreaterThanOrEqual(2);
    const script = read("scripts/audit-ux-digest.mjs");
    expect(script).toMatch(/tryClaimSlackAlert\("ux_digest_audit"/);
    expect(script.indexOf("tryClaimSlackAlert(")).toBeLessThan(script.indexOf("await fetch(hook"));
  });
});
