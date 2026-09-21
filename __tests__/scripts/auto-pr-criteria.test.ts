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
 *
 * It looks for `process.env.MUTATE`, not the bare word. Renaming the variable
 * in verify-dead-click-target.mjs — which disables the mutation mode entirely —
 * left this suite green when it matched "MUTATE", because the file's own
 * comments say MUTATE four times. A `contains` on a word that appears in prose
 * asserts nothing; the needle has to be something only the code can satisfy.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

// The set the verifier actually spreads, so this test cannot drift from it.
import { CLAIM_SCOPED_PROBES } from "@/scripts/lib/claim-scoped-probes.mjs";

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
        // `process.env.MUTATE`, not the bare word — see the header. Every probe
        // that has a mutation mode reads the variable exactly once, so this is
        // no weaker for any of them and is far harder to satisfy by accident.
        readFileSync(resolve(process.cwd(), "scripts/probes", f), "utf8").includes(
          "process.env.MUTATE"
        )
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

  it("holds the session-appended probe to the same rules", () => {
    // verify-dead-click-target.mjs is added by the SESSION, not listed under a
    // criterion, so criteriaProbes() cannot see it — but it runs for D1, which
    // may open a pull request. An ungoverned probe on a governed criterion is
    // exactly the hole the two rules above exist to close.
    const verifier = readFileSync(VERIFIER, "utf8");
    const set = /CLICK_TARGET_CRITERIA = new Set\(\[([^\]]*)\]\)/.exec(verifier);
    expect(set, "CLICK_TARGET_CRITERIA is gone or renamed").toBeTruthy();
    const ids = set![1]
      .split(",")
      .map((x) => x.trim().replace(/^"|"$/g, ""))
      .filter(Boolean);
    expect(ids.length).toBeGreaterThan(0);

    // The verifier spreads CLAIM_SCOPED_PROBES rather than naming a file, so
    // this covers EVERY member instead of whichever one a regex matched first.
    // It also still fails if the append is deleted outright, which is what the
    // literal-matching version was really protecting.
    expect(
      verifier.includes("probeFiles.push(...CLAIM_SCOPED_PROBES)"),
      "nothing appends the claim-scoped probes any more"
    ).toBe(true);
    expect(CLAIM_SCOPED_PROBES.size, "CLAIM_SCOPED_PROBES is empty").toBeGreaterThan(0);

    // Only enforced when it can actually reach a PR-opening criterion.
    if (!ids.some((id) => AUTO_PR_CRITERIA.has(id))) return;
    for (const file of CLAIM_SCOPED_PROBES) {
      const path = resolve(process.cwd(), "scripts/probes", file);
      expect(existsSync(path), `${file} is in the set but not on disk`).toBe(true);
      const src = readFileSync(path, "utf8");
      expect(src.includes("process.exit(3)"), `${file} has no exit 3`).toBe(true);
      expect(src.includes("process.env.MUTATE"), `${file} has no MUTATE mode`).toBe(true);
    }
  });

  it("lets Z1 back only because its probe now measures", () => {
    // Z1 was removed on 2026-09-16 when verify-input-zoom returned exit 3 on
    // every run, and restored on 2026-09-17 once it produced a real reading and
    // a MUTATE failure. The two rules above are what actually police this — the
    // point of naming it here is that membership is re-earned by measuring.
    expect(AUTO_PR_CRITERIA.has("Z1")).toBe(true);
    const zProbes = probes.get("Z1") ?? [];
    expect(zProbes).toContain("verify-input-zoom.mjs");
  });
});
