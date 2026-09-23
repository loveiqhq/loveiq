/**
 * Open a draft pull request carrying a reproduction.
 *
 * SPLIT OUT SO IT CAN BE TESTED. `verify-ux-findings.mjs` runs its whole flow
 * as top-level statements — importing it reaches PostHog, Supabase and Slack —
 * so nothing could exercise this without doing the real thing. It is the only
 * part of the verifier that WRITES to GitHub, and it was the only part with no
 * test: live in CI since it was written, never once executed, because no
 * finding has reproduced yet.
 *
 * This module has no side effects on import.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { isSafeSessionId } from "../../features/ux-review/server/review.ts";

/**
 * Criteria a reproduction may open a pull request for.
 *
 * Narrow on purpose. Each of these has a probe that fails before a fix and
 * passes after, so "reproduced" is a fact rather than a reading. The remaining
 * criteria (E1's wider error class, S1's scroll heuristics, M1) still go to a
 * human in the thread.
 */
export const AUTO_PR_CRITERIA = new Set(["C1", "D1", "Z1", "B1", "L1"]);

/**
 * L1 JOINED 2026-09-18, BY MEASURING.
 *
 * It is the only criterion that has ever reproduced: 24 of 35 findings over
 * thirty days, and the two reproductions the ledger holds are both L1. It was
 * excluded because its only probe, `verify-no-survey-restart.mjs`, loads
 * /report/<token> and never opens the survey — it returned clean on every
 * device and the verifier posted "passes in production now" into eight
 * readers' threads about a defect that was real.
 *
 * `verify-survey-loop.mjs` now covers that half and has been shown to report
 * both answers against PRODUCTION, which is the standard this set is supposed
 * to hold: exit 1 on six devices before the fix, exit 0 on the same six after
 * it, exit 3 on an unreachable origin, and now exit 1 again under MUTATE=1,
 * which withholds the completed-report key the fix added. The MUTATE mode
 * exists precisely because the defect is fixed — a probe that can only pass is
 * as useless as one that can only fail.
 *
 * What this changes: if the survey loop regresses, the pipeline opens a DRAFT
 * pull request carrying the reproduction instead of only replying in a thread.
 * It still never merges and never generates a fix.
 */

/**
 * Z1 IS BACK, AND THE REASON IT LEFT WAS WRONG.
 *
 * It was removed on 2026-09-16 because `verify-input-zoom.mjs` returned exit 3,
 * "could not measure", on every device on every run since it was written. That
 * removal was right — a probe that has never measured anything must not file
 * pull requests — but the diagnosis recorded here was not. It said the survey
 * engine "derives its position from the ANSWERS, not from that index".
 *
 * It does not. `useSurveyState.loadState()` reads `parsed.currentIndex || 0`
 * with no clamp, and `SurveyEngine` renders a plain
 * `orderedQuestions[currentIndex]`. Seeding the index has always worked.
 *
 * Two real causes, both now fixed:
 *   1. The probe set only the localStorage answers blob. `loadInitialStep()`
 *      also needs the sessionStorage STEP, or the engine never mounts and you
 *      sit on the intro. Both halves already existed in the corpus, in two
 *      different probes; scripts/lib/survey-nav.mjs puts them together.
 *   2. It asked for question 37, which is "Which age range are you in?" — a
 *      question with no text input. The country search is index 35.
 *
 * Verified 2026-09-17 against production: clean gives exit 0 with a real
 * reading (16px, safe), MUTATE=1 gives exit 1, and a question with no input
 * still gives 3. Membership is re-earned by measuring, never by argument.
 */

const gitIn = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

/**
 * Open a DRAFT pull request carrying the reproduction.
 *
 * What this does NOT do is write the fix. A script can reproduce
 * deterministically; choosing the change is judgement, and a generated diff
 * merged on a green probe is how you ship a confident wrong fix. So the PR
 * carries the evidence — which criterion, which session, which viewport, which
 * probe failed and its output — and the fix is added on the branch afterwards.
 * It is never merged automatically.
 *
 * Guarded by UX_REVIEW_OPEN_PR so it cannot fire from a laptop by accident.
 */
export function openReproductionPr({
  criterion,
  sessionId,
  viewport,
  results,
  cwd = process.cwd(),
}) {
  if (process.env.UX_REVIEW_OPEN_PR !== "1") return null;
  if (!AUTO_PR_CRITERIA.has(criterion.id)) return null;
  // Belt and braces: this value becomes a git ref.
  if (!isSafeSessionId(sessionId)) return null;

  const short = sessionId.slice(0, 8);
  const branch = `replay/${criterion.id.toLowerCase()}-${short}`;
  const at = viewport ? `${viewport.min}px-${viewport.max}px` : "unknown viewport";
  const failed = results.filter((r) => !r.passed && !r.inconclusive);

  const record = {
    criterion: criterion.id,
    label: criterion.label,
    session_id: sessionId,
    recording: `https://eu.posthog.com/project/244778/replay/${sessionId}`,
    viewport: viewport ?? null,
    probes: failed.map((r) => ({ file: r.file, output: r.tail })),
    reproduced: true,
  };

  // Where to come back to. `git checkout -` is NOT good enough: it toggles to
  // the PREVIOUS branch, so on the short-circuit path below — where no branch
  // was ever created — it switched INTO the replay branch left over from an
  // earlier finding, and every later finding in the run would have been
  // committed onto it. Capture the real ref, and only restore if we moved.
  // CI checks out a detached HEAD, where --abbrev-ref prints "HEAD"; fall back
  // to the commit sha so the restore is still exact.
  const git = (...args) => gitIn(cwd, ...args);

  let original;
  try {
    original = git("rev-parse", "--abbrev-ref", "HEAD");
    if (original === "HEAD") original = git("rev-parse", "HEAD");
  } catch {
    return null;
  }
  let switched = false;

  try {
    // A branch that already exists means this reproduction already has a PR.
    const exists = gitIn(cwd, "ls-remote", "--heads", "origin", branch);
    if (exists) return null;

    const dir = "scripts/replay-bench/reproductions";
    mkdirSync(join(cwd, dir), { recursive: true });
    const file = `${dir}/${criterion.id.toLowerCase()}-${short}.json`;
    writeFileSync(join(cwd, file), `${JSON.stringify(record, null, 2)}\n`);

    git("checkout", "-b", branch);
    switched = true;
    git("add", file);
    /**
     * `--no-verify` ON BOTH, and it is not laziness.
     *
     * `.husky/pre-push` runs `npm run lint && npm run typecheck && npm test &&
     * npm run docs:check`. That fires here, inside a probe run, for a commit
     * that adds ONE json file recording a reproduction. It is the wrong work at
     * the wrong time — and it does not merely waste minutes, it FAILS: the
     * verifier step exports SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and
     * SLACK_BOT_TOKEN, and eleven tests behave differently with real
     * credentials in the environment (`expected 503 to be 200`). Same shape as
     * a sourced .env.local, which this repo already knows about.
     *
     * So on 2026-09-21 a genuinely reproduced defect died at
     * `error: failed to push some refs`, and the run stayed green. CI runs the
     * real gate on the PR this opens; the hook here can only ever be a false
     * negative.
     */
    git(
      "-c",
      "user.name=loveiq-ux-review",
      "-c",
      "user.email=ec@loveiq.org",
      "commit",
      "--no-verify",
      "-m",
      `test(replay): reproduce ${criterion.id} from session ${short}\n\n` +
        `${criterion.label}, reproduced at ${at} — the size this reader had.\n` +
        `${failed.map((r) => `${r.file}: ${r.tail}`).join("\n")}\n\n` +
        `For Marcus: An automatic check found a real problem in a recording of ` +
        `someone using the site, and reproduced it. No fix yet - this just records it.`
    );
    git("push", "--no-verify", "origin", branch);

    const body =
      `Reproduced **${criterion.label}** (\`${criterion.id}\`) at **${at}**, the viewport this ` +
      `session reported.\n\n` +
      `- Recording: ${record.recording}\n` +
      `- Probe output:\n\n` +
      failed.map((r) => `\`\`\`\n${r.file}\n${r.tail}\n\`\`\``).join("\n") +
      `\n\n**No fix is included.** The reproduction is deterministic; the fix is not, and a ` +
      `generated diff riding a green probe is how a confident wrong fix ships. Add the change on ` +
      `this branch, then prove it: the probe must FAIL under \`MUTATE=1\` and pass without it.\n\n` +
      `The scanner's criteria have not cleared the benchmark ` +
      `(see \`scripts/replay-bench/results/\`), so treat the diagnosis as unconfirmed even though ` +
      `the reproduction is real.`;

    const url = execFileSync(
      "gh",
      [
        "pr",
        "create",
        "--draft",
        "--base",
        "main",
        "--head",
        branch,
        "--title",
        `${criterion.id}: ${criterion.label} (session ${short})`,
        "--body",
        body,
      ],
      { cwd, encoding: "utf8" }
    ).trim();
    return url;
  } catch (err) {
    // `err.stderr` is the reason; `err.message` is "Command failed: gh …"
    // with the ENTIRE argv echoed after it — and the argv carries a multi-line
    // PR body, so the old `.split("\n")[0]` printed the command, and any
    // attempt to strip that prefix prints a line of the PR body instead. Both
    // throw away the one piece of information worth having, which is how every
    // failure this script has ever had went unexplained. Fall back to the
    // message for a spawn failure, where there is no stderr at all.
    const raw = String(err.stderr || err.message).trim();
    /**
     * THE FIRST LINE IS NOT THE REASON. Taking `.split("\n")[0]` printed
     *
     *   (could not open a PR: [BABEL] Note: The code generator has deoptimised
     *    the styling of data/report-archetypes.ts as it exceeds the max of 500KB)
     *
     * for a failure that was `error: failed to push some refs`. Whatever ran
     * first owns the top of stderr — a babel note, a vite warning, a test
     * runner — and the actual error is hundreds of lines below it. Prefer a
     * line that looks like an error, newest first, and fall back to the tail
     * rather than the head.
     */
    const lines = raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const why =
      [...lines].reverse().find((l) => /^(error|fatal|remote:|gh:|GraphQL:|!)/i.test(l)) ??
      lines.slice(-1)[0] ??
      raw;

    // A blanket refusal to create pull requests is a CONFIGURATION fault, not a
    // problem with this finding: it fails identically for every finding, on
    // every run, until someone ticks a setting in the ORGANISATION that this
    // repository cannot read. It hid here from the day this file was written
    // until 2026-09-20, because one quiet line in a green cron run is not
    // something anybody reads. An annotation is, so raise it to one.
    /**
     * Matched against the CHOSEN reason, not the whole buffer. Against the
     * buffer it fired on 2026-09-21 for a push failure, because this module's
     * own selftest prints that exact sentence while exercising a temp repo —
     * so the run annotated "tick this setting in the organisation" about a
     * setting that was already ticked, and sent somebody to change it.
     */
    if (/not permitted to create or approve pull requests/i.test(why)) {
      console.log(
        "::error title=GitHub Actions cannot open pull requests::" +
          'Tick "Allow GitHub Actions to create and approve pull requests" under Workflow ' +
          "permissions at https://github.com/organizations/loveiqhq/settings/actions " +
          "(see docs/runbooks/SECURITY.md). Until then no reproduction can ever open a PR."
      );
    }
    console.log(`  (could not open a PR: ${why.slice(0, 200)})`);
    return null;
  } finally {
    if (switched) {
      try {
        git("checkout", original);
      } catch {
        /* best effort */
      }
    }
  }
}
