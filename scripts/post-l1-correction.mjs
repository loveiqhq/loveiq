/**
 * ONE-OFF: correct the false L1 clearances, then delete this file.
 *
 * Fourteen findings were answered "loop back to an earlier screen (L1) passes
 * in production now" by `verify-no-survey-restart.mjs`, which loads
 * /report/<token> and never opens the survey — so it could not see what those
 * recordings described and returned clean on every device. Eight of the
 * fourteen had a Slack thread and were posted into it; the other six had no
 * submission and were only ever recorded.
 *
 * The claims were true. `scripts/probes/verify-survey-loop.mjs` reproduces the
 * loop on every device and the fix is on main.
 *
 * This exists as a script plus a manual workflow because the Slack token is a
 * CI secret and is deliberately absent from .env.local — nothing can post to
 * Slack from a laptop, which is a property worth keeping. Remove both once it
 * has run.
 *
 *   node scripts/post-l1-correction.mjs            # dry, prints and posts nothing
 *   node scripts/post-l1-correction.mjs --post
 */
const SESSIONS = [
  "01a0a18f-d672-7150-8886-39f9a5fdfe69",
  "01a0a576-a11d-70e3-8427-184f0f4fe939",
  "01a0a59b-f92a-7f25-b7ec-1f7f4074e0c3",
  "01a0a745-5da4-785f-8007-449dd1e899a2",
  "01a0a9ab-19a7-7d2d-a8f7-8431122c6af5",
  "01a0ab4c-5184-74ab-969b-c32bc44c7bf5",
  "01a0adcd-1c55-7971-a1b9-7b5018334ad6",
  "01a0aea6-1880-76e8-a8b5-b29068a5d28a",
];

const POST = process.argv.includes("--post");
const TEXT =
  "\u{1F501} *Correction — the verdict above was wrong.*\n\n" +
  "This thread was told that “loop back to an earlier screen (L1)” _passes in production " +
  "now_. It does not. The probe that answered only ever loaded `/report/<token>` and never " +
  "opened the survey, so it could not see what this recording described. It returned clean on " +
  "every device and we read that as proof.\n\n" +
  "The recording was right. After finishing the survey, pressing Back from the report landed the " +
  "reader on the survey's intro screen — “Let's prepare you well to discover your sexual " +
  "archetypes” — with their progress apparently gone.\n\n" +
  "`scripts/probes/verify-survey-loop.mjs` now reproduces it on every device, and the fix is on " +
  "main: that screen is replaced by “You've already finished your assessment” with a " +
  "button straight to the report.";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`missing ${name}`);
    process.exit(2);
  }
  return v;
}

const url = requireEnv("SUPABASE_URL");
const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const head = { apikey: key, Authorization: `Bearer ${key}` };

async function threadFor(sessionId) {
  const subs = await fetch(
    `${url}/rest/v1/survey_submission?posthog_session_id=eq.${encodeURIComponent(sessionId)}&select=id&limit=1`,
    { headers: head }
  );
  if (!subs.ok) return null;
  const id = (await subs.json())[0]?.id;
  if (!id) return null;
  const msgs = await fetch(
    `${url}/rest/v1/slack_journey_message?survey_submission_id=eq.${id}&select=message_ts&limit=1`,
    { headers: head }
  );
  if (!msgs.ok) return null;
  return (await msgs.json())[0]?.message_ts ?? null;
}

console.log(POST ? "POSTING\n" : "DRY RUN — nothing will be posted\n");
console.log(`--- message ---\n${TEXT}\n---------------\n`);

let posted = 0;
let missing = 0;
let failed = 0;
for (const session of SESSIONS) {
  const ts = await threadFor(session);
  if (!ts) {
    console.log(`  ${session}  NO THREAD — skipped`);
    missing += 1;
    continue;
  }
  if (!POST) {
    console.log(`  ${session}  thread ${ts}  (would post)`);
    continue;
  }
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireEnv("SLACK_BOT_TOKEN")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel: requireEnv("SLACK_JOURNEY_CHANNEL_ID"),
      thread_ts: ts,
      text: TEXT,
    }),
  });
  const json = await res.json();
  if (json.ok) {
    posted += 1;
    console.log(`  ${session}  thread ${ts}  POSTED`);
  } else {
    failed += 1;
    console.log(`  ${session}  thread ${ts}  FAILED: ${json.error}`);
  }
}

console.log(`\n${posted} posted · ${missing} without a thread · ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
