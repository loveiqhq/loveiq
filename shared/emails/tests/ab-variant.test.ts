import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { pickEmailVariant, pickFromVariants, emailExperimentTags } from "@shared/emails/ab-variant";

describe("pickEmailVariant", () => {
  it("returns the same variant for the same key + experiment", () => {
    const a = pickEmailVariant("user@example.com", "purchase-full_report");
    const b = pickEmailVariant("user@example.com", "purchase-full_report");
    expect(a).toBe(b);
    expect(["a", "b"]).toContain(a);
  });

  it("normalizes key (case + whitespace) so variants are stable", () => {
    const a = pickEmailVariant("User@Example.com", "x");
    const b = pickEmailVariant("  user@example.com  ", "x");
    expect(a).toBe(b);
  });

  it("can split the same user across experiments", () => {
    // It is possible (but not guaranteed) that two experiments give different
    // variants for the same key. Verify the function honors the experiment
    // salt by spot-checking a key that is known to differ.
    const variantsByExperiment = new Set<string>();
    for (let i = 0; i < 50; i++) {
      variantsByExperiment.add(pickEmailVariant("split@example.com", `exp-${i}`));
      if (variantsByExperiment.size === 2) break;
    }
    expect(variantsByExperiment.size).toBe(2);
  });

  it("approximates a 50/50 split across many keys", () => {
    let aCount = 0;
    let bCount = 0;
    const N = 1000;
    for (let i = 0; i < N; i++) {
      const variant = pickEmailVariant(`user${i}@example.com`, "test");
      if (variant === "a") aCount++;
      else bCount++;
    }
    // Expect roughly 50/50 — allow ±10% tolerance to keep the test stable.
    expect(aCount).toBeGreaterThan(N * 0.4);
    expect(bCount).toBeGreaterThan(N * 0.4);
  });
});

describe("pickFromVariants", () => {
  const ABC = ["a", "b", "c"] as const;

  it("returns the same variant for the same key + experiment", () => {
    const a = pickFromVariants("user@example.com", "report-share", ABC);
    const b = pickFromVariants("user@example.com", "report-share", ABC);
    expect(a).toBe(b);
    expect(ABC).toContain(a);
  });

  it("normalizes case + whitespace", () => {
    const a = pickFromVariants("User@Example.com", "x", ABC);
    const b = pickFromVariants("  user@example.com  ", "x", ABC);
    expect(a).toBe(b);
  });

  it("returns the only entry when given a single-variant list", () => {
    expect(pickFromVariants("anyone", "exp", ["only"] as const)).toBe("only");
  });

  it("throws when variants is empty", () => {
    expect(() => pickFromVariants("k", "e", [])).toThrow();
  });

  it("approximates a 1/3 split across many keys", () => {
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    const N = 3000;
    for (let i = 0; i < N; i++) {
      const variant = pickFromVariants(`user${i}@example.com`, "report-share", ABC);
      counts[variant]++;
    }
    // Expect ~33% each — allow ±8% tolerance.
    expect(counts.a).toBeGreaterThan(N * 0.25);
    expect(counts.b).toBeGreaterThan(N * 0.25);
    expect(counts.c).toBeGreaterThan(N * 0.25);
  });
});

describe("emailExperimentTags", () => {
  /**
   * These tags are the ONLY thing that makes an email A/B test readable. Until
   * 2026-09-19 `pickEmailVariant` picked a template and forgot; five experiments
   * had been running for weeks with results that existed nowhere. Resend echoes
   * tags back on every webhook, which is where the per-arm counters come from.
   */
  it("carries the experiment and the arm", () => {
    expect(emailExperimentTags("survey-complete", "b")).toEqual([
      { name: "exp", value: "survey-complete" },
      { name: "arm", value: "b" },
    ]);
  });

  it("replaces characters Resend rejects instead of dropping the send", () => {
    /**
     * Resend allows ASCII letters, numbers, underscores and dashes in a tag, and
     * REJECTS THE WHOLE SEND otherwise. Losing the email to save the measurement
     * is the wrong trade, so anything else is substituted.
     */
    const [exp, arm] = emailExperimentTags("purchase full_report!", "a/b");
    expect(exp!.value).toBe("purchase_full_report_");
    expect(arm!.value).toBe("a_b");
    for (const t of [exp!, arm!]) {
      expect(t.value, `${t.value} must be tag-safe`).toMatch(/^[A-Za-z0-9_-]*$/);
    }
  });

  it("bounds the length, so a crafted value cannot be stored unbounded", () => {
    const [exp, arm] = emailExperimentTags("x".repeat(500), "y".repeat(500));
    expect(exp!.value.length).toBe(64);
    expect(arm!.value.length).toBe(16);
  });

  it("round-trips every experiment the codebase actually runs", () => {
    // If a live experiment's salt does not survive sanitising, its counters land
    // under a different name than the readout looks for and it silently reports
    // nothing.
    for (const exp of [
      "survey-complete",
      "survey-paused",
      "invite",
      "report-share",
      "purchase-full_report",
      "purchase-all_reports",
    ]) {
      expect(emailExperimentTags(exp, "a")[0]!.value, exp).toBe(exp);
    }
  });
});

describe("every email A/B send is tagged", () => {
  /**
   * The wiring, not the behaviour. Behaviour is covered by the helper tests above
   * and by features/cron/tests/resend-experiment-counters.test.ts; what a future
   * refactor can silently drop is the tag on ONE of the five sends, which makes
   * that experiment quietly unreadable again without failing anything.
   *
   * This is the exact failure mode that let five experiments run for weeks with
   * no results: nothing asserted the arm went anywhere.
   */
  const SEND_SITES = [
    "app/api/survey/route.ts", // survey-complete
    "app/api/cron/survey-paused/route.ts", // survey-paused
    "app/api/invite/route.ts", // invite
    "app/api/report/share/route.ts", // report-share (3-way)
    "features/checkout/server/fulfillment.ts", // purchase-<plan>
  ];

  it("attaches emailExperimentTags at every site that picks a variant", () => {
    for (const site of SEND_SITES) {
      const src = readFileSync(join(process.cwd(), site), "utf8");
      // It picks an arm...
      expect(src, `${site} should pick a variant`).toMatch(/pickEmailVariant|pickFromVariants/);
      // ...so it must also tag the send with it.
      expect(src, `${site} picks an A/B arm but never tags the send`).toContain(
        "emailExperimentTags("
      );
    }
  });

  it("covers every site in the codebase that picks a variant", () => {
    // Guards the list above: a NEW send site that picks an arm and is not listed
    // here would otherwise never be checked.
    const found = execSync(
      "grep -rl 'pickEmailVariant(\\|pickFromVariants(' app features shared --include='*.ts' " +
        "| grep -v '/tests/' | grep -v 'ab-variant.ts' | sort",
      { encoding: "utf8", cwd: process.cwd() }
    )
      .trim()
      .split("\n")
      .filter(Boolean);
    expect(found.sort()).toEqual([...SEND_SITES].sort());
  });
});
