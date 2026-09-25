/**
 * Which finished readers did NO scanner ever open?
 *
 * The digest says how many were watched. This says WHICH were not, and — the
 * part that makes it actionable — whether they could have been.
 *
 * A submission is only a miss if the scanners could have seen it: it needs a
 * recording, and it needs to have fired a trigger event one of them queries on
 * (`survey_started`, `report_viewed`, `dead_click`, `rage_click`). A reader who
 * declined recording is not a miss; a reader with a recording, a trigger and 31
 * dead clicks that nobody opened is.
 *
 * Measured 2026-09-18, over the four days since the scanners went live:
 * 54 submissions, 52 with a recording, 43 observed — and 9 misses, of which
 * SEVEN had dead clicks (one with 31, another with 27). They matched every
 * scanner's query and were never looked at.
 *
 * `--enqueue` sends each miss back to the scanners that should have seen it,
 * via `POST /api/projects/<id>/vision/scanners/<scanner>/observe/`. This needs
 * the `replay_scanner:write` scope on POSTHOG_API_KEY — granted 2026-09-18;
 * before that the endpoint answered 403 and this script only reported the gap.
 *
 * ROUTING IS READ FROM THE SCANNERS, NOT GUESSED FROM THEIR NAMES. Each one
 * queries exactly one trigger event and those map 1:1 onto TRIGGERS below, so a
 * session is offered only to the scanners whose own query it actually matched.
 * Sending every session to all four would quadruple the credit spend and hand
 * each scanner recordings outside its subject, which is how a precision number
 * gets ruined by the harness rather than by the model.
 *
 * DRY BY DEFAULT. Enqueuing spends credits and creates observations that land
 * in the digest, so it never happens as a side effect of asking what is missing.
 *
 * The endpoint answers 202 with a `workflow_id` of the form
 * `replay-vision-apply-scanner-<scanner>-<session>` — the work is queued, not
 * done, so an observation appears minutes later and `res.ok` is an
 * acknowledgement rather than a result. The id is derived from the pair, so
 * re-running is idempotent and cannot double-charge a session.
 *
 *   npx tsx --env-file=.env.local scripts/ux-review-coverage.mjs
 *   DAYS=7 npx tsx scripts/ux-review-coverage.mjs
 *   npx tsx --env-file=.env.local scripts/ux-review-coverage.mjs --enqueue
 *
 * Exit 0 clean, 1 misses found, 2 could not measure. With --enqueue, exit 0
 * means the misses were re-queued successfully — see the note at that branch.
 */
import { hogQuery } from "./lib/hogql.mjs";
import { owedScanners, requeueAction, scannersByTrigger } from "./lib/scanners-by-trigger.mjs";

const PROJECT = "244778";

/**
 * A crash and a finding must not share an exit code.
 *
 * Every read here can fail — an expired PostHog key, a 503, a Supabase
 * timeout — and an unhandled rejection exits 1, which is exactly what this
 * script uses to mean "misses found". A caller reading the code cannot tell
 * the difference, and in the hourly workflow a dead key would look like
 * an ordinary day with a few unwatched recordings. 2 means could-not-measure.
 */
// BOTH events: this module uses top-level await, and Node reports a throw
// there as an uncaught exception rather than an unhandled rejection. Listening
// for only the latter left the exit code at 1 — verified, not assumed.
for (const signal of ["unhandledRejection", "uncaughtException"]) {
  process.on(signal, (err) => {
    console.error(`could not measure: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  });
}
/**
 * REJECT AN ARGUMENT WE DO NOT UNDERSTAND.
 *
 * The window is an env var, not a flag, and `--days 7` was accepted in silence
 * and measured four days while the header said seven. A measurement that
 * answers a question nobody asked is worse than one that refuses.
 */
{
  const known = new Set(["--enqueue"]);
  const bad = process.argv.slice(2).filter((a) => !known.has(a));
  if (bad.length > 0) {
    console.error(`unknown argument(s): ${bad.join(" ")}`);
    console.error(`the window is an environment variable: DAYS=7 node ${process.argv[1]}`);
    process.exit(2);
  }
}

/**
 * How far back to look for a reader nothing watched.
 *
 * Was 4 here and 2 in the workflow, on the reasoning that a short window
 * "catches stragglers without reaching back over recordings that have already
 * expired". Measured 2026-09-20: PostHog still holds every recording back to
 * 2026-08-24 — 27 days — and four readers from 2026-09-13 with 17, 36 and 11
 * dead clicks had been sitting unwatched for a week, permanently out of reach
 * of a two-day window. Nothing expires inside a fortnight, so nothing needs to
 * be abandoned inside one.
 */
const DAYS = Number(process.env.DAYS ?? 14);

/**
 * How many observations one run may QUEUE. Bounds the work, not the lookback —
 * the same distinction the verifier's PROBE_BUDGET makes, and the one the two-
 * day window got backwards. A wide window over a standing backlog would
 * otherwise fire hundreds of observations at once; this drains it over
 * successive runs instead, oldest reader first.
 */
const MAX_ENQUEUE = Number(process.env.MAX_ENQUEUE ?? 30);

/** Trigger events the four scanners query on. A session with none of these
 *  matches no scanner, so it is out of scope rather than missed. */
const TRIGGERS = ["survey_started", "report_viewed", "dead_click", "rage_click"];

function need(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`missing ${name}`);
    process.exit(2);
  }
  return v;
}

const hog = (query) =>
  hogQuery(query, { projectId: PROJECT, apiKey: need("POSTHOG_API_KEY"), label: "coverage" });

/** UUID-shaped only: these are interpolated into HogQL. */
const SAFE_ID = /^[0-9a-f-]{36}$/i;

const url = need("SUPABASE_URL");
const key = need("SUPABASE_SERVICE_ROLE_KEY");
const since = new Date(Date.now() - DAYS * 86_400_000).toISOString();

// Declared before the fetch that interpolates it — a `const` is not hoisted.
const SUBMISSIONS_LIMIT = 1000;
const subsRes = await fetch(
  `${url}/rest/v1/survey_submission?select=id,posthog_session_id,created_date_time` +
    `&created_date_time=gte.${since}&posthog_session_id=not.is.null&limit=${SUBMISSIONS_LIMIT}`,
  { headers: { apikey: key, Authorization: `Bearer ${key}` } }
);
if (!subsRes.ok) {
  console.error(`supabase ${subsRes.status}`);
  process.exit(2);
}
const subsRaw = await subsRes.json();
/**
 * A read that came back exactly full was CUT SHORT.
 *
 * PostgREST answers a truncated read with 200 and a short body — no error, no
 * flag. Every figure below is then computed on a slice: `MISSED` would be a
 * count of the readers that happened to fit, and the run would report a
 * coverage percentage it has no basis for. 209 submissions over 14 days today,
 * so this is margin rather than a live bug — but the number is a fact about
 * current volume, not a property of the code, and this is the family of failure
 * that is only ever noticed long afterwards.
 *
 * Exit 2 — "could not measure" — because that is exactly what it is.
 */
if (subsRaw.length >= SUBMISSIONS_LIMIT) {
  console.error(
    `submission read came back at its limit (${subsRaw.length}/${SUBMISSIONS_LIMIT}) — ` +
      `rows are MISSING, so coverage cannot be measured. Narrow DAYS or paginate.`
  );
  process.exit(2);
}
const subs = subsRaw.filter((s) => SAFE_ID.test(s.posthog_session_id ?? ""));
if (subs.length === 0) {
  console.log(`no submissions with a session id in the last ${DAYS} days`);
  process.exit(0);
}

/**
 * Read in both modes now: which scanner owes a reader a look depends on each
 * scanner's trigger and sampling mode, so the list decides what a miss IS.
 */
const scannerRes = await fetch(`https://eu.posthog.com/api/projects/${PROJECT}/vision/scanners/`, {
  headers: { Authorization: `Bearer ${need("POSTHOG_API_KEY")}` },
});
if (!scannerRes.ok) {
  console.error(`could not list scanners: ${scannerRes.status}`);
  process.exit(2);
}
const byTrigger = scannersByTrigger(
  ((await scannerRes.json()).results ?? []).filter((sc) => sc.enabled !== false)
);

const inList = subs.map((s) => `'${s.posthog_session_id}'`).join(",");
const window = `INTERVAL ${DAYS + 3} DAY`;

const [observedRows, recordedRows, triggerRows] = await Promise.all([
  hog(`SELECT DISTINCT toString(properties.session_id), toString(properties.scanner_id) FROM events
       WHERE event='$recording_observed' AND timestamp > now() - ${window}
         AND properties.session_id IN (${inList})`),
  hog(`SELECT DISTINCT session_id FROM raw_session_replay_events
       WHERE min_first_timestamp > now() - ${window} AND session_id IN (${inList})`),
  hog(`SELECT toString($session_id), ${TRIGGERS.map((t) => `countIf(event='${t}')`).join(", ")}
       FROM events WHERE timestamp > now() - ${window} AND $session_id IN (${inList})
       GROUP BY 1`),
]);

const observedBy = new Map();
for (const [sid, scannerId] of observedRows) {
  observedBy.set(String(sid), (observedBy.get(String(sid)) ?? new Set()).add(String(scannerId)));
}
const recorded = new Set(recordedRows.map((r) => String(r[0])));
const triggers = new Map(triggerRows.map((r) => [String(r[0]), r.slice(1).map(Number)]));

const misses = [];
let noRecording = 0;
let noTrigger = 0;
// Counted over `subs`, not `observedBy.size`. The observed set covers every
// session a scanner opened, including visitors who never finished a survey, so
// printing its size next to the per-submission tallies made the four rows fail
// to add up to the total and invited the reader to hunt for a missing case.
let seen = 0;
for (const s of subs) {
  const sid = s.posthog_session_id;
  const seenBy = observedBy.get(sid) ?? new Set();
  const counts = triggers.get(sid) ?? [];
  if (seenBy.size === 0 && !recorded.has(sid)) {
    noRecording += 1;
    continue;
  }
  if (seenBy.size === 0 && counts.every((n) => n === 0)) {
    noTrigger += 1;
    continue;
  }
  // Opened by SOME scanner is not opened by the right one: see owedScanners().
  const missing = owedScanners(counts, TRIGGERS, byTrigger, seenBy);
  if (missing.length === 0) {
    seen += 1;
    continue;
  }
  misses.push({ sid, submissionId: s.id, at: s.created_date_time, counts, missing });
}

console.log(`submissions in the last ${DAYS} days    : ${subs.length}`);
console.log(`  opened by every scanner that owed it : ${seen}`);
console.log(`  no recording (not a miss)            : ${noRecording}`);
console.log(`  recording but no trigger event       : ${noTrigger}`);
console.log(`  MISSED by a scanner that owed a look : ${misses.length}\n`);

for (const m of misses) {
  const detail = TRIGGERS.map((t, i) => `${t}=${m.counts[i] ?? 0}`).join(" ");
  console.log(`  ${m.sid}  submission ${m.submissionId}  ${String(m.at).slice(0, 16)}`);
  console.log(`      ${detail}`);
  console.log(`      never opened by: ${m.missing.map((sc) => sc.name).join(", ")}`);
}

/**
 * READERS WHO LEFT, too. Everything above starts from survey_submission, so it
 * only ever sees people who FINISHED. Measured 2026-09-25 over 7 days: PostHog's
 * "comprehensive" sweep never even tried 48 of 253 watchable survey sessions and
 * 13 of 111 report sessions, mostly people who left partway: the ones the
 * scanners exist for, and nothing sent them back. For each comprehensive
 * scanner, a session that fired its trigger, has 10s of activity (PostHog's
 * own minimum; MIN_WATCHABLE_ACTIVE_MS in review.ts, held equal by a test),
 * ended six hours ago and was never opened by it is
 * owed a look, exactly as a finisher is. Focused scanners skip by design.
 */
const STARTER_DAYS = Number(process.env.STARTER_DAYS ?? 7);
const finisherSids = new Set(subs.map((s) => s.posthog_session_id));
const starters = [];
for (const [trigger, scanners] of byTrigger) {
  if (!/^[$a-z_]+$/.test(trigger)) continue; // interpolated into HogQL below
  for (const sc of scanners) {
    if (sc.sampling_mode !== "comprehensive" || !SAFE_ID.test(String(sc.id))) continue;
    const rows = await hog(`SELECT t.sid, t.at FROM (
        SELECT toString($session_id) AS sid, min(timestamp) AS at FROM events
        WHERE event = '${trigger}' AND timestamp > now() - INTERVAL ${STARTER_DAYS} DAY
          AND timestamp < now() - INTERVAL 6 HOUR
        GROUP BY sid
      ) AS t
      INNER JOIN (
        SELECT session_id AS sid, sum(active_milliseconds) AS active FROM raw_session_replay_events
        WHERE min_first_timestamp > now() - INTERVAL ${STARTER_DAYS + 1} DAY
        GROUP BY session_id
      ) AS r ON r.sid = t.sid
      WHERE r.active >= 10000 AND t.sid NOT IN (
        SELECT DISTINCT toString(properties.session_id) FROM events
        WHERE event = '$recording_observed' AND timestamp > now() - INTERVAL ${STARTER_DAYS + 2} DAY
          AND toString(properties.scanner_id) = '${sc.id}'
      )
      LIMIT 1000`);
    if (rows.length >= 1000) {
      console.error(
        `${sc.name}: 1000 unwatched sessions, the query's cap; the rest wait for later runs`
      );
    }
    for (const [sid, at] of rows) {
      // Finishers are handled above, with their own rule for focused scanners.
      if (!SAFE_ID.test(String(sid)) || finisherSids.has(sid)) continue;
      starters.push({ sid: String(sid), at: new Date(at).toISOString(), sc });
    }
  }
}
console.log(
  `readers who did not finish, never opened by a scanner that watches everything ` +
    `(last ${STARTER_DAYS} days): ${starters.length}`
);

if (misses.length > 0 || starters.length > 0) {
  console.log(
    `\n${misses.length} finished reader(s) and ${starters.length} (session, scanner) pair(s) ` +
      `for readers who left had a recording, a trigger and a scanner that never opened them.`
  );

  if (!process.argv.includes("--enqueue")) {
    console.log(`Re-run with --enqueue to send them back to the scanners that owe them a look.`);
    process.exit(1);
  }

  // Oldest reader first, so a standing backlog drains from the end that is
  // closest to expiring rather than being re-queued newest-first forever.
  const ordered = [
    ...misses.flatMap((m) =>
      m.missing.map((sc) => ({ ...m, at: new Date(m.at).toISOString(), sc }))
    ),
    ...starters,
  ].sort((a, b) => a.at.localeCompare(b.at));
  const api = `https://eu.posthog.com/api/projects/${PROJECT}/vision/scanners`;
  const auth = { Authorization: `Bearer ${need("POSTHOG_API_KEY")}` };
  const counts = { observe: 0, retry: 0, wait: 0, "give-up": 0, refused: 0 };
  let held = 0;
  for (const m of ordered) {
    // The cap bounds the work PostHog is asked to do, so only a queue or a
    // retry spends it. Counting every pair would let old pairs that failed for
    // good take all 30 slots, first in line, on every run.
    if (counts.observe + counts.retry >= MAX_ENQUEUE) {
      held += 1;
      continue;
    }
    const { sc } = m;
    const trigger = TRIGGERS.find((t) => (byTrigger.get(t) ?? []).includes(sc)) ?? "?";
    const label = `${m.sid.slice(0, 13)} -> ${sc.name.padEnd(24)} (${trigger})`;
    const listed = await fetch(`${api}/${sc.id}/observations/?session_id=${m.sid}`, {
      headers: auth,
    });
    if (!listed.ok) {
      counts.refused += 1;
      console.log(`  FAILED   ${label} — could not read its observations (${listed.status})`);
      continue;
    }
    const latest = ((await listed.json()).results ?? []).sort((a, b) =>
      String(b.created_at).localeCompare(String(a.created_at))
    )[0];
    const next = requeueAction(latest);
    if (next.action === "wait" || next.action === "give-up") {
      counts[next.action] += 1;
      console.log(
        `  ${next.action === "wait" ? "waiting " : "given up"} ${label} — ${next.reason}`
      );
      continue;
    }
    const res = await fetch(
      next.action === "retry"
        ? `${api}/${sc.id}/observations/${next.id}/retry/`
        : `${api}/${sc.id}/observe/`,
      {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify(next.action === "retry" ? {} : { session_id: m.sid }),
      }
    );
    const body = await res.text();
    if (res.ok) counts[next.action] += 1;
    else counts.refused += 1;
    // The workflow id is the only handle on queued work, so print it.
    const detail = res.ok
      ? ` ${String(JSON.parse(body || "{}").workflow_id ?? "").slice(-13)}`
      : ` — ${body.slice(0, 120)}`;
    const verb = !res.ok ? "FAILED  " : next.action === "retry" ? "retried " : "queued  ";
    console.log(`  ${verb} ${label}${detail}`);
  }
  console.log(
    `\n${counts.observe} queued, ${counts.retry} retried after a temporary PostHog failure, ` +
      `${counts.wait} still in progress, ${counts["give-up"]} failed for good in PostHog, ` +
      `${counts.refused} refused.`
  );
  // Printed, never swallowed: a standing backlog has to be visible or the run
  // looks identical whether it caught up or fell further behind.
  if (held > 0) {
    console.log(`${held} pair(s) held for the next run (cap ${MAX_ENQUEUE}) — oldest go first.`);
  }
  const failed = counts.refused;
  /**
   * Exit 0 when the gap was CLOSED, not when there was no gap.
   *
   * The read-only mode exits 1 on a miss, which is right for a check. But
   * --enqueue is a remediation, and it runs unattended every hour: if
   * finding-and-fixing misses failed the job, the workflow would be red on
   * every normal day and nobody would look at it by the second week. A real
   * failure — a refused enqueue — still exits 2.
   */
  if (failed > 0) process.exit(2);
  process.exit(0);
}
console.log("every finished reader with a recording was opened by every scanner that owed it.");
process.exit(0);
