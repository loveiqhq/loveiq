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

  /**
   * Every run logs "Ignoring 65 permissions.allow entries … this workspace has
   * not been trusted", and the obvious way to silence it is to mark the
   * workspace trusted. That would apply a developer's LOCAL allowlist inside
   * CI, widening what the model may do past --allowedTools — which is the only
   * permission boundary this job reasons about. The entries being ignored is
   * the safe state.
   */
  it("does not trust the repository's local Claude settings", () => {
    /**
     * Asserted on the EXECUTABLE yaml, not the file. The first version matched
     * the comment directly above the step — the one explaining this very trap —
     * and failed against a correct workflow. That is the second time a source
     * test in this file has reported on its own prose; comments are stripped
     * here for the same reason.
     */
    const code = WF.split("\n")
      .filter((l) => !/^\s*#/.test(l))
      .join("\n");
    expect(code).not.toMatch(/hasTrustDialogAccepted/);
    expect(code).not.toMatch(/dangerously-skip-permissions/);
    // The boundary it DOES rely on must still be there.
    expect(code).toContain("--allowedTools");
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
        /**
         * Widened from inputs/github.event to ANY expression. The narrow
         * version missed a `${{ steps.… }}` I wrote into a run: block myself
         * on 2026-09-19 — machine-generated and harmless in that instance, but
         * the point of the rule is that the shape is uniform, so the one that
         * can carry something hostile is not the first of its kind anyone has
         * to notice.
         */
        expect(
          step.run,
          `an expression is interpolated into the run: of "${step.name}"`
        ).not.toMatch(/\$\{\{/);
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

  /**
   * The bug that killed the first live run. The workflow checked out
   * `base_ref` — a commit from two days earlier — and died at the proof
   * because prove-fix.mjs did not exist yet at that commit. The judge must
   * come from a fixed, CURRENT source; only the product under test is old.
   * Same rule the probe and the precision check already follow.
   */
  it("checks out the judge from main, not from the commit under test", () => {
    const doc = parse(WF) as {
      jobs: Record<
        string,
        { steps: Array<{ name?: string; with?: Record<string, unknown>; run?: string }> }
      >;
    };
    const steps = Object.values(doc.jobs).flatMap((j) => j.steps);
    const checkout = steps.find((st) => JSON.stringify(st).includes("actions/checkout"));
    expect(
      String(checkout?.with?.ref ?? ""),
      "the main checkout must not be moved to base_ref"
    ).not.toContain("base_ref");
    // The old code arrives as a worktree instead.
    expect(steps.some((st) => (st.run ?? "").includes("git worktree add"))).toBe(true);
  });

  it("has the model edit the worktree, not the judge's checkout", () => {
    const doc = parse(WF) as {
      jobs: Record<string, { steps: Array<{ name?: string; "working-directory"?: string }> }>;
    };
    const propose = Object.values(doc.jobs)
      .flatMap((j) => j.steps)
      .find((st) => st.name === "Propose a fix");
    expect(propose?.["working-directory"]).toBeTruthy();
  });

  it("gives the model a worktree it can actually run tools in", () => {
    // A fresh worktree has no node_modules. The model is allowed `npm run lint`
    // and vitest to check its own work; without an install those fail on every
    // call and it edits blind, learning about its change only when the proof
    // refuses it.
    const doc = parse(WF) as {
      jobs: Record<string, { steps: Array<{ "working-directory"?: string; run?: string }> }>;
    };
    const installed = Object.values(doc.jobs)
      .flatMap((j) => j.steps)
      .some((st) => st["working-directory"] === "/tmp/fixtree" && /npm ci/.test(st.run ?? ""));
    expect(installed, "the worktree never gets its dependencies").toBe(true);
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
    // Resolved from the worktree step, which is what actually determined the
    // code the model saw — not re-read from the input, which may be empty.
    expect(String(proveStep?.env?.BASE_REF)).toContain("steps.tree.outputs.base");
  });

  /**
   * A refused attempt must remain readable. The first live run produced a
   * plausible 12-line change that did not work, the proof refused it, and the
   * branch died with the runner — so all anyone learned was "not proven",
   * which does not distinguish a model that misunderstood the defect from a
   * task no small change could satisfy. That difference decides whether to
   * retry, reword, or do it by hand.
   */
  it("keeps a refused attempt so it can be read", () => {
    const doc = parse(WF) as {
      jobs: Record<string, { steps: Array<{ name?: string; if?: string; run?: string }> }>;
    };
    const steps = Object.values(doc.jobs).flatMap((j) => j.steps);
    const keep = steps.find((st) => /Keep the branch/i.test(st.name ?? ""));
    expect(keep, "a refused attempt is discarded with the runner").toBeTruthy();
    // `always()`, or it would be skipped by the very failure it exists for.
    expect(String(keep?.if)).toContain("always()");
    // A branch, not a pull request: unproven work must not sit in the review
    // queue wearing the same badge as proven work.
    expect(keep?.run ?? "").not.toMatch(/gh pr create/);
  });

  /**
   * A model that errors or exhausts its turns must still leave its work. The
   * first attempt at a substantial defect hit "Reached max turns (40)" and every
   * later step skipped — including the two whose only job is preserving what was
   * tried, so the run produced a bare failure and nothing to read.
   */
  it("commits partial work even when the model itself failed", () => {
    const doc = parse(WF) as {
      jobs: Record<string, { steps: Array<{ name?: string; if?: string }> }>;
    };
    const steps = Object.values(doc.jobs).flatMap((j) => j.steps);
    for (const name of ["Commit whatever it changed", "Show what it proposed"]) {
      const step = steps.find((st) => st.name === name);
      expect(String(step?.if), `"${name}" is skipped by the failure it exists for`).toContain(
        "always()"
      );
    }
  });

  /**
   * The three ways proposing can fail need opposite responses, and a bare
   * "failure" makes them indistinguishable:
   *
   *   session limit -> wait; nothing about the task was wrong
   *   max turns     -> the defect is too big for one pass; split it
   *   anything else -> a real error worth reading
   *
   * Both of the first two happened on 2026-09-19 and both were reported simply
   * as a failed run, whose natural reading is "the model could not do it" —
   * wrong in both cases.
   */
  it("names a usage limit rather than reporting a generic failure", () => {
    expect(WF).toMatch(/session limit/i);
    expect(WF).toMatch(/Reached max turns/i);
    // The step's own exit code must survive the pipe into tee, or every run
    // would report success regardless.
    expect(WF).toContain("PIPESTATUS[0]");
    expect(WF).toMatch(/exit \$code/);
  });

  it("gives the model enough turns for a real defect", () => {
    const turns = Number(/--max-turns (\d+)/.exec(WF)?.[1]);
    expect(turns, "40 was not enough for the first real defect tried").toBeGreaterThanOrEqual(80);
  });

  it("prints the proposed diff, so a failed run is not opaque", () => {
    const doc = parse(WF) as {
      jobs: Record<string, { steps: Array<{ name?: string; run?: string }> }>;
    };
    const shown = Object.values(doc.jobs)
      .flatMap((j) => j.steps)
      .some((st) => /git diff HEAD~1/.test(st.run ?? ""));
    expect(shown).toBe(true);
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
