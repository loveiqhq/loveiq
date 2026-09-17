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
 * REQUEUEING IS NOT DONE HERE, deliberately. PostHog exposes
 * `POST /api/projects/<id>/vision/scanners/<scanner>/observe/`, which answers
 * 403 `API key missing required scope 'replay_scanner:write'` with the token
 * this repo holds — the endpoint is real and our key is read-only for it. An
 * API call that cannot be executed cannot be tested, so this reports the gap
 * and names the scope instead of shipping an untried request. Grant
 * `replay_scanner:write` and the enqueue is a short follow-up.
 *
 *   npx tsx --env-file=.env.local scripts/ux-review-coverage.mjs
 *   DAYS=7 npx tsx scripts/ux-review-coverage.mjs
 *
 * Exit 0 clean, 1 misses found, 2 could not measure.
 */
const PROJECT = "244778";
const DAYS = Number(process.env.DAYS ?? 4);

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

async function hog(query) {
  const res = await fetch(`https://eu.posthog.com/api/projects/${PROJECT}/query/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${need("POSTHOG_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });
  if (!res.ok) throw new Error(`posthog ${res.status}`);
  const payload = await res.json();
  if (payload.error) throw new Error(`posthog query error: ${String(payload.error).slice(0, 160)}`);
  return payload.results ?? [];
}

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
for (const s of subs) {
  const sid = s.posthog_session_id;
  if (observed.has(sid)) continue;
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
console.log(`  observed by a scanner            : ${observed.size}`);
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
    `\n${misses.length} finished reader(s) had a recording and a trigger and were never opened.` +
      `\nRe-queue needs the 'replay_scanner:write' scope on POSTHOG_API_KEY; see the header.`
  );
  process.exit(1);
}
console.log("every finished reader with a recording was opened by a scanner.");
process.exit(0);
