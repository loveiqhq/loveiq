/**
 * The autofix workflow is the only thing in this repo that lets a model write
 * product code, so the properties that make it safe are pinned rather than
 * assumed. None of them is about the model being good; all of them are about
 * what happens when it is not.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const WF = readFileSync(resolve(process.cwd(), ".github/workflows/generate-fix.yml"), "utf8");
const PROVE = readFileSync(resolve(process.cwd(), ".github/workflows/prove-fix.yml"), "utf8");

describe("the generate-and-prove workflow", () => {
  it("never merges anything", () => {
    // A proven fix is still a proposal. The merge click is also the label this
    // pipeline learns from, so automating it would destroy the only signal
    // that does not come from our own machinery.
    expect(WF).not.toMatch(/gh pr merge|--auto|--merge|--squash|--rebase/);
  });

  it("runs the proof gate, and after the model rather than before", () => {
    expect(WF).toContain("node scripts/prove-fix.mjs");
    const proposed = WF.indexOf("Propose a fix");
    const proved = WF.indexOf("node scripts/prove-fix.mjs");
    expect(proposed).toBeGreaterThan(-1);
    expect(proved).toBeGreaterThan(proposed);
  });

  it("opens the PR only after the proof, never alongside it", () => {
    // `gh pr create` before the gate would put unproven work in the queue
    // wearing the same badge as proven work.
    expect(WF.indexOf("gh pr create")).toBeGreaterThan(WF.indexOf("node scripts/prove-fix.mjs"));
  });

  it("is dispatch-only", () => {
    // On a schedule it would generate a queue of pull requests nobody reads,
    // which is how a useful tool becomes noise.
    const on = WF.slice(WF.indexOf("\non:"), WF.indexOf("permissions:"));
    expect(on).toContain("workflow_dispatch");
    expect(on).not.toContain("schedule");
    expect(on).not.toMatch(/\n\s{2}push:/);
  });

  it("skips cleanly when the subscription token is absent", () => {
    // A job that is red for a configuration gap teaches people to ignore red.
    expect(WF).toContain("CLAUDE_CODE_OAUTH_TOKEN");
    expect(WF).toMatch(/ready=false/);
    expect(WF).toMatch(/steps\.token\.outputs\.ready == 'true'/);
  });

  it("uses the subscription, not an API key", () => {
    expect(WF).not.toContain("ANTHROPIC_API_KEY");
  });

  it("passes user input through the environment, never into the shell", () => {
    /**
     * `${{ }}` inside `run:` is substituted before bash sees it, so a defect
     * description containing a quote is command execution on the runner.
     * Semgrep's run-shell-injection rule blocks this shape and it has failed
     * main before.
     *
     * Parsed, not split on text. The first version of this test split the file
     * on `run:` and every block therefore ran to the end of the file, swallowing
     * the `env:` sections of later steps — which is exactly where these values
     * are SUPPOSED to be. It failed against a correct workflow.
     */
    const doc = parse(WF) as {
      jobs: Record<string, { steps: Array<{ name?: string; run?: string }> }>;
    };
    for (const job of Object.values(doc.jobs)) {
      for (const step of job.steps) {
        if (!step.run) continue;
        expect(step.run, `input interpolated into the run: of "${step.name}"`).not.toMatch(
          /\$\{\{\s*(inputs|github\.event)\./
        );
      }
    }
  });

  it("does put them in env, so the step can still read them", () => {
    // The control for the assertion above: it would also pass if the workflow
    // simply never referenced its inputs at all.
    const doc = parse(WF) as {
      jobs: Record<string, { steps: Array<{ env?: Record<string, string> }> }>;
    };
    const envs = Object.values(doc.jobs)
      .flatMap((j) => j.steps)
      .flatMap((s) => Object.values(s.env ?? {}));
    expect(envs.some((v) => /\$\{\{\s*inputs\.defect/.test(String(v)))).toBe(true);
  });

  /**
   * Provable before it is trusted. A healthy production has nothing to fix, so
   * without this the only way to find out whether the machine works is to wait
   * for a customer to hit something — which is not verification, it is hope.
   */
  it("can be pointed at a past commit so it is testable at all", () => {
    const doc = parse(WF) as {
      on: { workflow_dispatch: { inputs: Record<string, unknown> } };
    };
    expect(Object.keys(doc.on.workflow_dispatch.inputs)).toContain("base_ref");
  });

  it("proves against the SAME commit the model was given", () => {
    // Proving against main while the model worked from an older commit compares
    // two unrelated things, and would certify a fix for a defect already gone.
    const doc = parse(WF) as {
      jobs: Record<string, { steps: Array<{ name?: string; env?: Record<string, string> }> }>;
    };
    const proveStep = Object.values(doc.jobs)
      .flatMap((j) => j.steps)
      .find((s) => s.name === "Prove it");
    expect(String(proveStep?.env?.BASE_REF)).toContain("inputs.base_ref");
  });

  it("tells the model what is wrong, not how to fix it", () => {
    expect(WF).toContain("What the visitor experiences");
    expect(WF).toContain("Do NOT edit the probe");
  });
});

describe("the standalone proof workflow", () => {
  it("fails the job when a fix is not proven", () => {
    // Exit 1 means NOT PROVEN. A job that goes green on that has a colour that
    // means nothing.
    expect(PROVE).toContain("exit $code");
    expect(PROVE).not.toMatch(/continue-on-error:\s*true/);
  });
});
