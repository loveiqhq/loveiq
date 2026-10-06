/**
 * A PROBE THAT RUNS NOWHERE IS A FILE, NOT A CHECK.
 *
 * `verify-icon-label-gap.mjs` shipped on 2026-09-23 referenced by nothing: it
 * is not attached to a criterion, so `verify-ux-findings.mjs` never called it,
 * and `verify-probe-falsifiability.mjs` discovers probes from `runProbe()`
 * call sites, so the contract harness could not see it either. It caught a real
 * defect the day it was written and would then have sat there forever.
 *
 * This repository has shipped that shape four times — `sync-vision-scanners.ts`
 * in no workflow, three CI lanes skipping on an unset secret, an auto-PR flag
 * that had never once executed. The cost is always the same: a green tree and
 * nothing watching.
 *
 * So: every `verify-*.mjs` must be reachable from something that actually runs
 * — a criterion in the verifier, a `runProbe()` call, or a workflow step.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

/** Everything that could legitimately invoke a probe. */
const invokers = [
  "scripts/verify-ux-findings.mjs",
  "scripts/verify-probe-falsifiability.mjs",
  ...readdirSync(resolve(root, ".github/workflows"))
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .map((f) => `.github/workflows/${f}`),
]
  .map(read)
  .join("\n");

/**
 * THE NINE THAT ALREADY RAN NOWHERE, found when this check was written.
 *
 * Not failed here, because breaking main on somebody else's nine probes is
 * not a fix — but named, because an unnamed backlog is invisible. Each was
 * written for a specific past defect and kept as a reproduction; several may
 * be worth attaching to probe-guard and several may be worth deleting. That is
 * a per-probe call with the person who wrote it.
 *
 * THE LIST MAY ONLY SHRINK. A new orphan fails; removing one from here after
 * wiring it up is the point. The count is asserted so the list cannot quietly
 * grow.
 */
/**
 * Empty since 2026-09-24. Each of the nine was run against production and
 * then wired (verify-inapp-browsers, in probe-guard.yml), replaced by an
 * end-to-end test (the storage one) or deleted. A new probe must be wired.
 */
const KNOWN_ORPHANS = new Set<string>([]);

describe("every probe is run by something", () => {
  const probes = readdirSync(resolve(root, "scripts/probes"))
    .filter((f) => f.startsWith("verify-") && f.endsWith(".mjs"))
    .sort();

  it("finds the probe corpus", () => {
    // If this ever reads zero the loop below passes vacuously, which is the
    // failure mode this whole file exists to prevent.
    expect(probes.length).toBeGreaterThan(10);
  });

  it.each(probes.filter((p) => !KNOWN_ORPHANS.has(p)))(
    "%s is referenced by a verifier, a harness or a workflow",
    (probe) => {
      expect(
        invokers.includes(probe),
        `${probe} is never invoked. Attach it to a criterion in verify-ux-findings.mjs, ` +
          `call it via runProbe(), or add a step in .github/workflows/probe-guard.yml — ` +
          `otherwise it is a file nobody runs.`
      ).toBe(true);
    }
  );

  it("the orphan list only shrinks, and every name on it is real", () => {
    // A stale entry would forgive a probe that has since been wired up, and
    // silently excuse it again if it were ever unwired.
    for (const orphan of KNOWN_ORPHANS) {
      expect(probes, `${orphan} is listed as an orphan but no longer exists`).toContain(orphan);
      expect(
        invokers.includes(orphan),
        `${orphan} IS invoked now — remove it from KNOWN_ORPHANS`
      ).toBe(false);
    }
    expect(KNOWN_ORPHANS.size, "the orphan list grew; wire the new probe up instead").toBe(0);
  });
});
