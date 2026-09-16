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
export const AUTO_PR_CRITERIA = new Set(["C1", "D1", "B1"]);

/**
 * Z1 WAS ON THIS LIST AND SHOULD NOT HAVE BEEN. Its only probe,
 * verify-input-zoom.mjs, has never measured anything: it returns exit 3,
 * "could not measure", on every device on every run since it was written, and
 * there is no MUTATE mode proving it could ever fail.
 *
 * Nothing bad happened, because the three-way exit contract holds — only exit 1
 * opens a pull request, and the probe has never produced one. But a criterion
 * that cannot confirm anything has no business on the list that files PRs: the
 * day someone "fixes" that probe by collapsing 3 into 1, every Z1 observation
 * becomes a confident pull request against a measurement that never happened.
 *
 * Why it cannot measure, so the next person does not rediscover it: the probe
 * restores `currentIndex: 37` into localStorage to land on the country search,
 * but the engine derives its position from the ANSWERS, not from that index, so
 * an empty answer set puts it back at question one — where there is no text
 * input. Walking there instead takes 153 seconds per device and still did not
 * reach one in 44 questions. Reaching the country field needs answers
 * synthesised for the questions before it, which nobody has built yet.
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
    git(
      "-c",
      "user.name=loveiq-ux-review",
      "-c",
      "user.email=ec@loveiq.org",
      "commit",
      "-m",
      `test(replay): reproduce ${criterion.id} from session ${short}\n\n` +
        `${criterion.label}, reproduced at ${at} — the size this reader had.\n` +
        `${failed.map((r) => `${r.file}: ${r.tail}`).join("\n")}\n\n` +
        `For Marcus: An automatic check found a real problem in a recording of ` +
        `someone using the site, and reproduced it. No fix yet - this just records it.`
    );
    git("push", "origin", branch);

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
    console.log(`  (could not open a PR: ${String(err.message).split("\n")[0].slice(0, 120)})`);
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
