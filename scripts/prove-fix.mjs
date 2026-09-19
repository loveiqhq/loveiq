/**
 * Decide, mechanically, whether a candidate fix is PROVEN.
 *
 * This is the gate Phase 5 needs, and it is deliberately not a generator. A fix
 * can come from a model, a codemod or a person; what makes it safe to merge is
 * that something outside the author checked it, and every step here is a
 * command with an exit code rather than an opinion. The repo already concluded
 * that the gate has to sit outside the model — this is that principle applied
 * to the fix rather than to the finding.
 *
 * The obligation, all of which must hold:
 *
 *   1. the probe REPRODUCES on the base commit (exit 1) — otherwise there is
 *      nothing to fix and the "fix" proves nothing
 *   2. the diff stays inside an allowlist and under a line cap
 *   3. the probe is CLEAN on the fix commit (exit 0)
 *   4. the probe STILL reproduces on base when re-run — a first result that
 *      does not repeat is a flake, and a flake that happens to fail once would
 *      otherwise certify any diff at all
 *   5. the repo gate passes on the fix (lint, tests, build)
 *   6. no OTHER probe starts claiming a defect that is not one
 *
 * THE PROBE RUNS AGAINST A BUILD OF THE COMMIT, not against production. Pointing
 * it at the live site would prove something about whatever is deployed, which is
 * neither of the two commits under test — the claim would be unfalsifiable and
 * quietly meaningless. So each side is built and served on its own port.
 *
 * Worktrees, never the working checkout: other sessions commit in this repo, and
 * a harness that checks out commits underneath them is a way to lose work.
 *
 *   FIX_REF=my-branch PROBE=verify-survey-loop.mjs node scripts/prove-fix.mjs
 *   PROBE_ENV='{"URL_PATH":"/survey"}' ...
 *
 * Exit 0 proven · 1 NOT proven (the interesting case) · 2 could not decide.
 */
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Paths a generated fix may touch.
 *
 * Presentation only. Everything that moves money, grants access, changes the
 * database or answers a webhook is excluded — not because a fix there would
 * necessarily be wrong, but because a probe cannot prove it right, and this
 * harness must never certify more than it measured. A UI probe that goes green
 * says nothing about whether a payment still settles.
 */
const ALLOW = [
  /^features\/[a-z-]+\/ui\//,
  /^shared\/ui\//,
  /^app\/globals\.css$/,
  // Tests are allowed and welcome: they change no runtime behaviour, so the
  // probe's verdict still covers everything that ships, and a fix that brings
  // its own regression test is strictly better than one that does not.
  /^features\/[a-z-]+\/tests\//,
  /^__tests__\//,
];
const DENY = [
  /^app\/api\//,
  /^supabase\/migrations\//,
  /^shared\/auth\//,
  /^shared\/http\//,
  /^proxy\.ts$/,
  /^\.github\//,
  /^package(-lock)?\.json$/,
  /payment|stripe|webhook|checkout/i,
  /**
   * THE PROBE MAY NOT BE PART OF THE FIX.
   *
   * The first version of this allowlist permitted scripts/probes/. That is a
   * hole big enough to drive the whole harness through: a "fix" could edit the
   * probe until it stopped failing, and every step below would then certify it
   * — reproduces on base with the old probe, passes on the fix with the new
   * one. The before/after would be measuring two different questions and the
   * green light would mean nothing at all.
   *
   * A probe change is a legitimate thing to want, and today's consent-gate work
   * is exactly that. It just cannot ride along inside something this harness is
   * asked to bless; it goes through review on its own.
   */
  /^scripts\//,
];
const MAX_CHANGED_LINES = Number(process.env.MAX_CHANGED_LINES ?? 40);

/** A test file changes no runtime behaviour, so it does not count against the cap. */
export const isTest = (f) =>
  /(^|\/)__tests__\//.test(f) || /\/tests\//.test(f) || /\.test\./.test(f);

/** Pure, so --selftest can check it without git. */
export function judgeDiff(
  files,
  changedLines,
  { allow = ALLOW, deny = DENY, cap = MAX_CHANGED_LINES } = {}
) {
  if (files.length === 0) return { ok: false, why: "the fix changes nothing" };
  // DENY is checked first and wins: a path matching both must be refused, or
  // adding a broad allow entry would silently unlock a denied one.
  const denied = files.filter((f) => deny.some((re) => re.test(f)));
  if (denied.length > 0)
    return { ok: false, why: `touches paths a probe cannot vouch for: ${denied.join(", ")}` };
  const outside = files.filter((f) => !allow.some((re) => re.test(f)));
  if (outside.length > 0) return { ok: false, why: `outside the allowlist: ${outside.join(", ")}` };
  /**
   * TESTS DO NOT COUNT AGAINST THE CAP.
   *
   * The cap exists to keep a change small enough that a probe's green light
   * plausibly covers it. A test file changes no runtime behaviour, so it cannot
   * widen what the probe failed to check — and counting it punishes exactly the
   * thing worth encouraging.
   *
   * Not theoretical: the consent-gate fix written on 2026-09-19 was 37 lines of
   * product code and 56 of test. Under a flat count it would have been refused
   * for bringing its own regression test.
   *
   * A caller that passes a plain number gets the old, stricter behaviour rather
   * than a silently larger allowance.
   */
  const product = typeof changedLines === "object" ? changedLines.product : changedLines;
  const total = typeof changedLines === "object" ? changedLines.total : changedLines;
  if (product > cap) {
    return { ok: false, why: `${product} changed lines of product code, cap is ${cap}` };
  }
  const testNote = total > product ? `, plus ${total - product} line(s) of tests` : "";
  return {
    ok: true,
    why: `${files.length} file(s), ${product} line(s) of product code${testNote}, all presentation`,
  };
}

if (process.argv.includes("--selftest")) {
  const eq = (got, want, what) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      console.error(`FAIL ${what}: ${JSON.stringify(got)}`);
      process.exit(1);
    }
  };
  eq(judgeDiff([], 0).ok, false, "an empty diff is not a fix");
  eq(judgeDiff(["features/survey/ui/SurveyPage.tsx"], 10).ok, true, "ui change allowed");
  eq(judgeDiff(["app/api/survey/route.ts"], 2).ok, false, "api route refused");
  eq(judgeDiff(["supabase/migrations/x.sql"], 2).ok, false, "migration refused");
  eq(judgeDiff(["features/checkout/ui/Pay.tsx"], 2).ok, false, "deny beats allow");
  eq(judgeDiff(["features/survey/ui/SurveyPage.tsx"], 999).ok, false, "line cap enforced");
  // Tests ride along free. The real consent-gate fix was 37 product + 56 test.
  eq(
    judgeDiff(["features/survey/ui/SurveyPage.tsx", "features/survey/tests/SurveyPage.test.tsx"], {
      total: 93,
      product: 37,
    }).ok,
    true,
    "a fix that brings its own test is not punished for it"
  );
  eq(
    judgeDiff(["features/survey/ui/SurveyPage.tsx"], { total: 200, product: 200 }).ok,
    false,
    "product code is still capped"
  );
  eq(isTest("features/survey/tests/x.test.tsx"), true, "feature tests recognised");
  eq(isTest("__tests__/scripts/x.test.ts"), true, "root tests recognised");
  eq(isTest("features/survey/ui/SurveyPage.tsx"), false, "product code is not a test");
  eq(judgeDiff(["README.md"], 2).ok, false, "unlisted path refused");
  eq(judgeDiff(["features/survey/tests/SurveyPage.test.tsx"], 20).ok, true, "tests allowed");
  // The hole that mattered: a fix must not be able to edit its own judge.
  eq(judgeDiff(["scripts/probes/verify-survey-loop.mjs"], 2).ok, false, "probe edit refused");
  eq(
    judgeDiff(["features/survey/ui/SurveyPage.tsx", "scripts/probes/x.mjs"], 4).ok,
    false,
    "a probe edit smuggled alongside a real fix is still refused"
  );
  console.log("selftest ok");
  process.exit(0);
}

/**
 * Everything below runs only when this file is INVOKED, never when it is
 * imported.
 *
 * `judgeDiff` is the part worth unit-testing — it is where the dangerous
 * mistakes live — and importing it used to execute the harness, which exits 2
 * on a missing FIX_REF. A module whose pure function cannot be reached without
 * running its side effects is a module that will not be tested.
 */
async function main() {
  const need = (n) => {
    const v = process.env[n];
    if (!v) {
      console.error(`missing ${n}`);
      process.exit(2);
    }
    return v;
  };
  const FIX_REF = need("FIX_REF");
  const PROBE = need("PROBE");
  const BASE_REF = process.env.BASE_REF ?? "origin/main";
  const PROBE_ENV = JSON.parse(process.env.PROBE_ENV ?? "{}");

  const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();
  const step = (n, msg) => console.log(`\n[${n}] ${msg}`);

  let baseSha;
  let fixSha;
  try {
    baseSha = git("rev-parse", BASE_REF);
    fixSha = git("rev-parse", FIX_REF);
  } catch (err) {
    console.error(`could not resolve refs: ${err.message}`);
    process.exit(2);
  }
  if (baseSha === fixSha) {
    console.error("the fix and the base are the same commit — nothing to prove");
    process.exit(2);
  }

  // ---------------------------------------------------------------- 2. the diff
  step(2, "diff is inside the allowlist and under the cap");
  const files = git("diff", "--name-only", `${baseSha}..${fixSha}`).split("\n").filter(Boolean);
  const numstat = git("diff", "--numstat", `${baseSha}..${fixSha}`).split("\n").filter(Boolean);
  // Split so the cap can judge product code alone; see judgeDiff.
  const counted = numstat.reduce(
    (acc, l) => {
      const [add, del, file] = l.split("\t");
      const n = (Number(add) || 0) + (Number(del) || 0);
      acc.total += n;
      if (!isTest(file ?? "")) acc.product += n;
      return acc;
    },
    { total: 0, product: 0 }
  );
  const verdict = judgeDiff(files, counted);
  console.log(`    ${verdict.ok ? "ok" : "REFUSED"} — ${verdict.why}`);
  if (!verdict.ok) {
    console.log("\nNOT PROVEN — the diff was refused before anything was run.");
    process.exit(1);
  }

  // ------------------------------------------------------------ build and serve
  const workRoot = mkdtempSync(join(tmpdir(), "prove-fix-"));
  const trees = [];
  const servers = [];
  const cleanup = () => {
    for (const s of servers) {
      try {
        process.kill(-s.pid, "SIGKILL");
      } catch {
        /* already gone */
      }
    }
    for (const t of trees) {
      try {
        execFileSync("git", ["worktree", "remove", "--force", t], { stdio: "ignore" });
      } catch {
        /* best effort */
      }
    }
    try {
      rmSync(workRoot, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  };
  process.on("exit", cleanup);
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => process.exit(2));

  async function serve(sha, label) {
    const dir = join(workRoot, label);
    git("worktree", "add", "--detach", dir, sha);
    trees.push(dir);
    console.log(`    ${label}: building ${sha.slice(0, 8)}…`);
    execFileSync("npm", ["ci", "--silent"], { cwd: dir, stdio: "ignore" });
    execFileSync("npm", ["run", "build"], { cwd: dir, stdio: "ignore" });
    /**
     * A port the OS says is free, not a random guess.
     *
     * The first version picked a random high port. A collision there does not
     * fail loudly — the readiness check would succeed against whatever was
     * already listening, and the whole proof would then be measuring someone
     * else's server while reporting on ours. Binding port 0 and reading back the
     * assignment is the standard way to ask the OS for one that is actually free.
     */
    const port = await new Promise((resolve, reject) => {
      const probe = createServer();
      probe.once("error", reject);
      probe.listen(0, "127.0.0.1", () => {
        const { port: p } = probe.address();
        probe.close(() => resolve(p));
      });
    });
    const srv = spawn("npm", ["run", "start", "--", "--port", String(port)], {
      cwd: dir,
      detached: true,
      stdio: "ignore",
      env: { ...process.env, PORT: String(port) },
    });
    servers.push(srv);
    const origin = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 90; i += 1) {
      // If our own server died, stop waiting: something answering on this port
      // after that is not ours, and probing it would produce a confident result
      // about the wrong code.
      if (srv.exitCode !== null) throw new Error(`${label} server exited before it was ready`);
      try {
        const res = await fetch(origin, { signal: AbortSignal.timeout(2000) });
        if (res.status > 0) return origin;
      } catch {
        /* not up yet */
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`${label} never became ready on ${port}`);
  }

  function runProbe(origin) {
    try {
      execFileSync("node", [`scripts/probes/${PROBE}`], {
        encoding: "utf8",
        timeout: 10 * 60_000,
        // REPORT_ORIGIN last, deliberately. Spread PROBE_ENV after it and a
        // caller could point the probe at production while this harness reports
        // that it tested the build — the proof would be of something neither
        // commit contains, and it would look identical to a real one.
        env: { ...process.env, ...PROBE_ENV, REPORT_ORIGIN: origin },
      });
      return 0;
    } catch (err) {
      return err.status ?? 1;
    }
  }

  let exitCode = 2;
  try {
    const baseOrigin = await serve(baseSha, "base");
    const fixOrigin = await serve(fixSha, "fix");

    step(1, "the probe REPRODUCES on the base commit");
    const before = runProbe(baseOrigin);
    console.log(`    exit ${before} ${before === 1 ? "(reproduced)" : "(NOT reproduced)"}`);
    if (before !== 1) {
      console.log("\nNOT PROVEN — nothing to fix on the base commit, so the fix proves nothing.");
      process.exit(1);
    }

    step(3, "the probe is CLEAN on the fix commit");
    const after = runProbe(fixOrigin);
    console.log(`    exit ${after} ${after === 0 ? "(clean)" : "(still failing or unmeasurable)"}`);
    if (after !== 0) {
      console.log("\nNOT PROVEN — the probe does not pass on the fix.");
      process.exit(1);
    }

    step(4, "the base still reproduces on a second run (flake guard)");
    const again = runProbe(baseOrigin);
    console.log(`    exit ${again} ${again === 1 ? "(repeatable)" : "(FLAKY)"}`);
    if (again !== 1) {
      console.log(
        "\nNOT PROVEN — the reproduction did not repeat, so the before/after means nothing."
      );
      process.exit(1);
    }

    step(5, "the repo gate passes on the fix");
    const fixDir = join(workRoot, "fix");
    for (const [name, args] of [
      ["lint", ["run", "lint"]],
      ["tests", ["test"]],
    ]) {
      try {
        execFileSync("npm", args, { cwd: fixDir, stdio: "ignore" });
        console.log(`    ${name} ok`);
      } catch {
        console.log(`    ${name} FAILED`);
        console.log("\nNOT PROVEN — the repo gate does not pass on the fix.");
        process.exit(1);
      }
    }
    console.log("    build ok (already built to serve it)");

    step(6, "no other probe claims a defect that is not one");
    /**
     * Run from THIS checkout, not from the fix worktree — the same reason the
     * probe itself is. The judge must be one fixed thing applied to both sides;
     * a fix branch carries its own copy of the corpus and the checker, and using
     * those would let a fix quietly change what it is measured against.
     *
     * It also removes a false verdict: a fix branch from before the corpus
     * existed has no _known-good.json at all, and reading it from there would
     * fail with "not proven" when the honest answer is "could not measure".
     */
    try {
      execFileSync("node", ["scripts/probes/precision-check.mjs"], {
        stdio: "inherit",
        env: { ...process.env, REPORT_ORIGIN: fixOrigin },
      });
      console.log("    precision ok");
    } catch (err) {
      // 1 is a real false positive; anything else is the checker failing to
      // decide, which is not the fix's fault and must not be reported as one.
      if ((err.status ?? 1) === 1) {
        console.log("\nNOT PROVEN — the fix made another probe report a defect that is not one.");
        process.exit(1);
      }
      console.log(`\ncould not decide: the precision check exited ${err.status}`);
      process.exit(2);
    }

    console.log(
      `\nPROVEN — ${PROBE} reproduces on ${baseSha.slice(0, 8)}, passes on ` +
        `${fixSha.slice(0, 8)}, repeats on base, and the gate is green.\n` +
        `A human still merges it.`
    );
    exitCode = 0;
  } catch (err) {
    console.error(`\ncould not decide: ${err.message}`);
    exitCode = 2;
  }
  process.exit(exitCode);
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) await main();
