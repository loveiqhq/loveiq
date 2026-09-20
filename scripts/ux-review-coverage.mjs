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

const PROJECT = "244778";

/**
 * A crash and a finding must not share an exit code.
 *
 * Every read here can fail — an expired PostHog key, a 503, a Supabase
 * timeout — and an unhandled rejection exits 1, which is exactly what this
 * script uses to mean "misses found". A caller reading the code cannot tell
 * the difference, and in the three-hourly workflow a dead key would look like
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

const subsRes = await fetch(
  `${url}/rest/v1/survey_submission?select=id,posthog_session_id,created_date_time` +
    `&created_date_time=gte.${since}&posthog_session_id=not.is.null&limit=1000`,
  { headers: { apikey: key, Authorization: `Bearer ${key}` } }
);
if (!subsRes.ok) {
  console.error(`supabase ${subsRes.status}`);
  process.exit(2);
}
const subs = (await subsRes.json()).filter((s) => SAFE_ID.test(s.posthog_session_id ?? ""));
if (subs.length === 0) {
  console.log(`no submissions with a session id in the last ${DAYS} days`);
  process.exit(0);
}

const inList = subs.map((s) => `'${s.posthog_session_id}'`).join(",");
const window = `INTERVAL ${DAYS + 3} DAY`;

const [observedRows, recordedRows, triggerRows] = await Promise.all([
  hog(`SELECT DISTINCT toString(properties.session_id) FROM events
       WHERE event='$recording_observed' AND timestamp > now() - ${window}
         AND properties.session_id IN (${inList})`),
  hog(`SELECT DISTINCT session_id FROM raw_session_replay_events
       WHERE min_first_timestamp > now() - ${window} AND session_id IN (${inList})`),
  hog(`SELECT toString($session_id), ${TRIGGERS.map((t) => `countIf(event='${t}')`).join(", ")}
       FROM events WHERE timestamp > now() - ${window} AND $session_id IN (${inList})
       GROUP BY 1`),
]);

const observed = new Set(observedRows.map((r) => String(r[0])));
const recorded = new Set(recordedRows.map((r) => String(r[0])));
const triggers = new Map(triggerRows.map((r) => [String(r[0]), r.slice(1).map(Number)]));

const misses = [];
let noRecording = 0;
let noTrigger = 0;
// Counted over `subs`, not `observed.size`. The observed SET covers every
// session a scanner opened, including visitors who never finished a survey, so
// printing its size next to the per-submission tallies made the four rows fail
// to add up to the total and invited the reader to hunt for a missing case.
let seen = 0;
for (const s of subs) {
  const sid = s.posthog_session_id;
  if (observed.has(sid)) {
    seen += 1;
    continue;
  }
  if (!recorded.has(sid)) {
    noRecording += 1;
    continue;
  }
  const counts = triggers.get(sid) ?? [];
  if (counts.every((n) => n === 0)) {
    noTrigger += 1;
    continue;
  }
  misses.push({ sid, submissionId: s.id, at: s.created_date_time, counts });
}

console.log(`submissions in the last ${DAYS} days : ${subs.length}`);
console.log(`  observed by a scanner            : ${seen}`);
console.log(`  no recording (not a miss)        : ${noRecording}`);
console.log(`  recording but no trigger event   : ${noTrigger}`);
console.log(`  MISSED — could have been seen    : ${misses.length}\n`);

for (const m of misses) {
  const detail = TRIGGERS.map((t, i) => `${t}=${m.counts[i] ?? 0}`).join(" ");
  console.log(`  ${m.sid}  submission ${m.submissionId}  ${String(m.at).slice(0, 16)}`);
  console.log(`      ${detail}`);
}

if (misses.length > 0) {
  console.log(
    `\n${misses.length} finished reader(s) had a recording and a trigger and were never opened.`
  );

  if (!process.argv.includes("--enqueue")) {
    console.log(`Re-run with --enqueue to send them back to the scanners that match.`);
    process.exit(1);
  }

  const scannerRes = await fetch(
    `https://eu.posthog.com/api/projects/${PROJECT}/vision/scanners/`,
    { headers: { Authorization: `Bearer ${need("POSTHOG_API_KEY")}` } }
  );
  if (!scannerRes.ok) {
    console.error(`could not list scanners: ${scannerRes.status}`);
    process.exit(2);
  }
  const scannerList = (await scannerRes.json()).results ?? [];

  /** trigger event -> scanner. Taken from each scanner's own query. */
  const byTrigger = new Map();
  for (const sc of scannerList) {
    for (const ev of sc.query?.events ?? []) {
      if (ev?.id) byTrigger.set(String(ev.id), sc);
    }
  }

  let queued = 0;
  let failed = 0;
  // Oldest reader first, so a standing backlog drains from the end that is
  // closest to expiring rather than being re-queued newest-first forever.
  const ordered = [...misses].sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const batch = ordered.slice(0, MAX_ENQUEUE);
  const held = ordered.length - batch.length;
  for (const m of batch) {
    for (const [i, trigger] of TRIGGERS.entries()) {
      if ((m.counts[i] ?? 0) === 0) continue;
      const sc = byTrigger.get(trigger);
      if (!sc) continue;
      const res = await fetch(
        `https://eu.posthog.com/api/projects/${PROJECT}/vision/scanners/${sc.id}/observe/`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${need("POSTHOG_API_KEY")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ session_id: m.sid }),
        }
      );
      const ok = res.ok;
      if (ok) queued += 1;
      else failed += 1;
      const body = await res.text();
      // The workflow id is the only handle on queued work, so print it.
      const detail = ok
        ? ` ${String(JSON.parse(body || "{}").workflow_id ?? "").slice(-13)}`
        : ` — ${body.slice(0, 120)}`;
      console.log(
        `  ${ok ? "queued " : "FAILED "} ${m.sid.slice(0, 13)} -> ${sc.name.padEnd(24)} (${trigger})${detail}`
      );
    }
  }
  console.log(`\n${queued} observation(s) queued, ${failed} failed.`);
  // Printed, never swallowed: a standing backlog has to be visible or the run
  // looks identical whether it caught up or fell further behind.
  if (held > 0) {
    console.log(`${held} reader(s) held for the next run (cap ${MAX_ENQUEUE}) — oldest go first.`);
  }
  /**
   * Exit 0 when the gap was CLOSED, not when there was no gap.
   *
   * The read-only mode exits 1 on a miss, which is right for a check. But
   * --enqueue is a remediation, and it runs unattended every three hours: if
   * finding-and-fixing misses failed the job, the workflow would be red on
   * every normal day and nobody would look at it by the second week. A real
   * failure — a refused enqueue — still exits 2.
   */
  if (failed > 0) process.exit(2);
  process.exit(0);
}
console.log("every finished reader with a recording was opened by a scanner.");
process.exit(0);
