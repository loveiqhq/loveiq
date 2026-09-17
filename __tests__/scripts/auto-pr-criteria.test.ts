/**
 * Every criterion allowed to open a pull request must be backed by a probe that
 * can actually fail.
 *
 * Z1 sat on that list for its whole life while its only probe returned "could
 * not measure" on every run — no MUTATE mode, no demonstration it could ever
 * report a defect. Nothing bad happened only because the three-way exit
 * contract held. This makes that a property of the repository rather than
 * something somebody has to notice.
 *
 * MUTATE support is a PROXY for "can fail", not proof of it — the honest check
 * is running each probe twice against production, which takes minutes per
 * device and cannot live in a unit test. It catches the case that actually
 * occurred: a criterion filing PRs on a probe nobody ever proved could fail.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

// @ts-expect-error -- .mjs helper, no types
import { AUTO_PR_CRITERIA } from "../../scripts/lib/replay-pr.mjs";

const VERIFIER = resolve(process.cwd(), "scripts/verify-ux-findings.mjs");

/** Criterion id -> probe filenames, read from the verifier's own CRITERIA list. */
function criteriaProbes(): Map<string, string[]> {
  const src = readFileSync(VERIFIER, "utf8");
  const out = new Map<string, string[]>();
  const re = /id:\s*"([A-Z]\d)",[\s\S]*?probes:\s*\[([\s\S]*?)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const probes = m[2]
      .split(",")
      .map((p) => p.trim().replace(/^"|"$/g, ""))
      .filter(Boolean);
    out.set(m[1], probes);
  }
  return out;
}

describe("auto-PR criteria", () => {
  const probes = criteriaProbes();

  it("reads the criteria list at all", () => {
    // If the regex stops matching, every assertion below passes vacuously.
    expect(probes.size).toBeGreaterThan(5);
    expect([...AUTO_PR_CRITERIA].length).toBeGreaterThan(0);
  });

  it("only lets a criterion file a PR when every probe file exists", () => {
    for (const id of AUTO_PR_CRITERIA) {
      const files = probes.get(id) ?? [];
      expect(files.length, `${id} may open a PR but has no probe`).toBeGreaterThan(0);
      for (const f of files) {
        expect(existsSync(resolve(process.cwd(), "scripts/probes", f)), `${id}: missing ${f}`).toBe(
          true
        );
      }
    }
  });

  it("requires at least one probe that is shown to be able to fail", () => {
    for (const id of AUTO_PR_CRITERIA) {
      const files = probes.get(id) ?? [];
      const provable = files.filter((f) =>
        readFileSync(resolve(process.cwd(), "scripts/probes", f), "utf8").includes("MUTATE")
      );
      expect(
        provable.length,
        `${id} may open a pull request, but none of its probes (${files.join(", ")}) has a ` +
          `MUTATE mode — nothing demonstrates they can report a defect`
      ).toBeGreaterThan(0);
    }
  });

  it("requires EVERY probe to tell could-not-measure apart from reproduced", () => {
    // Not "at least one", unlike the MUTATE rule above. verify-ux-findings.mjs
    // decides with `results.some((r) => !r.passed && !r.inconclusive)`, so ANY
    // single probe exiting 1 opens the pull request. One probe that answers 1
    // for "the page did not render" is therefore enough to file a PR about a
    // measurement that never happened — which is exactly what
    // verify-nav-heading-clearance and verify-tap-targets did until 2026-09-17.
    for (const id of AUTO_PR_CRITERIA) {
      for (const f of probes.get(id) ?? []) {
        const src = readFileSync(resolve(process.cwd(), "scripts/probes", f), "utf8");
        expect(
          src.includes("process.exit(3)"),
          `${id} may open a pull request and ${f} has no exit 3 — it cannot say ` +
            `"could not measure", so a page that failed to load reads as a reproduction`
        ).toBe(true);
      }
    }
  });

  it("keeps Z1 off the list until its probe can measure", () => {
    // Guarding the specific regression, not just the general rule: verify-input-zoom
    // returns exit 3 on every device because it never reaches a text input.
    expect(AUTO_PR_CRITERIA.has("Z1")).toBe(false);
  });
});
