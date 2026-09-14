/**
 * Score the Replay Vision scanners against fixtures.json.
 *
 * Marcus, 2026-09-11: the criteria "must be explicitly defined and benchmarked
 * against test videos so the team does not rely on false confidence". This is the
 * benchmark half. It reads verdicts straight out of PostHog and grades them
 * against what we already know to be true about each recording.
 *
 *   node scripts/replay-bench/score.mjs            # score what has been scanned
 *   node scripts/replay-bench/score.mjs --selftest # prove the maths, no network
 *
 * BARS, deliberately asymmetric. A missed bug is cheap while a human is in the
 * loop; a false alarm is what destroys trust in the agent and is exactly the
 * "false confidence" the requirement names. So precision is held higher than
 * recall, and an inconclusive verdict counts as a MISS, never a pass.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = "244778";
const MIN_PRECISION = 0.8;
const MIN_RECALL = 0.6;

function apiKey() {
  if (process.env.POSTHOG_API_KEY) return process.env.POSTHOG_API_KEY.trim();
  const env = readFileSync(join(HERE, "..", "..", ".env.local"), "utf8");
  const key = env
    .match(/^POSTHOG_API_KEY=(.*)$/m)?.[1]
    ?.trim()
    .replace(/^["']|["']$/g, "");
  if (!key) throw new Error("POSTHOG_API_KEY missing from env and .env.local");
  return key;
}

/** precision/recall over rows of {expect, verdict}. Pure, so --selftest can check it. */
export function score(rows) {
  // `inconclusive`, a failed run, or a missing observation all count as "no".
  const said = (r) => (r.verdict === "yes" ? "yes" : "no");
  const tp = rows.filter((r) => r.expect === "yes" && said(r) === "yes").length;
  const fp = rows.filter((r) => r.expect === "no" && said(r) === "yes").length;
  const fn = rows.filter((r) => r.expect === "yes" && said(r) === "no").length;
  return {
    tp,
    fp,
    fn,
    precision: tp + fp === 0 ? 1 : tp / (tp + fp),
    recall: tp + fn === 0 ? 1 : tp / (tp + fn),
  };
}

if (process.argv.includes("--selftest")) {
  const s = score([
    { expect: "yes", verdict: "yes" },
    { expect: "yes", verdict: "inconclusive" },
    { expect: "no", verdict: "no" },
    { expect: "no", verdict: "yes" },
  ]);
  const ok = s.tp === 1 && s.fp === 1 && s.fn === 1 && s.precision === 0.5 && s.recall === 0.5;
  console.log(ok ? "selftest ok" : `selftest FAILED: ${JSON.stringify(s)}`);
  process.exit(ok ? 0 : 1);
}

const fixtures = JSON.parse(readFileSync(join(HERE, "fixtures.json"), "utf8"));

/**
 * Session ids are interpolated into HogQL below. This file is committed and so
 * lower risk than the live verifier, but the ids in it are copied from
 * recordings by hand and a future one could be pasted from anywhere — so reject
 * anything that is not UUID-shaped rather than trusting the file.
 */
const BAD_ID = /[^A-Za-z0-9-]/;
const wanted = [
  ...fixtures.known_bad.map((f) => ({ ...f, set: "known_bad" })),
  ...fixtures.known_good_adversarial.map((f) => ({ ...f, set: "adversarial" })),
];

for (const w of wanted) {
  if (!w.session_id || BAD_ID.test(w.session_id)) {
    throw new Error(`fixtures.json: malformed session_id ${JSON.stringify(w.session_id)}`);
  }
}

const res = await fetch(`https://eu.posthog.com/api/projects/${PROJECT}/query/`, {
  method: "POST",
  headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    query: {
      kind: "HogQLQuery",
      query: `
        SELECT properties.session_id,
               properties.scanner_name,
               properties.scanner_output_verdict,
               properties.scanner_output_confidence,
               substring(toString(properties.scanner_output_reasoning), 1, 300)
        FROM events
        WHERE event = '$recording_observed'
          AND timestamp > now() - INTERVAL 7 DAY
          AND properties.session_id IN (${wanted.map((w) => `'${w.session_id}'`).join(",")})
      `,
    },
  }),
});
if (!res.ok) throw new Error(`query failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
const payload = await res.json();
// PostHog answers a BAD HogQL query with HTTP 200 and an `error` field, so
// checking res.ok alone turns a broken query into "no rows", which this script
// would then read as "not scanned yet" — or, if every fixture were a negative,
// as a clean pass. Fail loudly instead.
if (payload.error) throw new Error(`HogQL error: ${String(payload.error).slice(0, 300)}`);
const { results } = payload;

const rows = wanted.map((w) => {
  const hit = (results ?? []).find((r) => r[0] === w.session_id && r[1] === w.scanner);
  return {
    ...w,
    verdict: hit?.[2] ?? "(not scanned yet)",
    confidence: hit?.[3] ?? null,
    reasoning: hit?.[4] ?? "",
  };
});

for (const r of rows) {
  const said = r.verdict === "yes" ? "yes" : r.verdict;
  // An unscanned row is PENDING, never PASS. A negative that was never scanned
  // would otherwise print PASS and read as evidence the scanner stayed quiet.
  const pending = r.verdict === "(not scanned yet)";
  const pass = (r.expect === "yes") === (r.verdict === "yes");
  console.log(
    `${pending ? "...." : pass ? "PASS" : "FAIL"}  ${r.set.padEnd(11)} ${r.scanner.padEnd(24)} ` +
      `expect=${r.expect} got=${said}` +
      (r.confidence ? ` (${Math.round(Number(r.confidence) * 100)}%)` : "")
  );
  if (r.reasoning) console.log(`      ${r.reasoning.replace(/\s+/g, " ").slice(0, 160)}`);
}

const s = score(rows);
const pending = rows.filter((r) => r.verdict === "(not scanned yet)").length;
console.log(
  `\nprecision ${s.precision.toFixed(2)} (bar ${MIN_PRECISION}) · ` +
    `recall ${s.recall.toFixed(2)} (bar ${MIN_RECALL}) · ` +
    `tp ${s.tp} fp ${s.fp} fn ${s.fn}` +
    (pending ? ` · ${pending} still scanning` : "")
);
if (pending) {
  console.log("incomplete — re-run when the scans finish");
  process.exit(2);
}
const passed = s.precision >= MIN_PRECISION && s.recall >= MIN_RECALL;

/**
 * The audit trail benchmark.md mandates ("commit each revision's results so the
 * iteration is auditable") and which did not exist until 2026-09-14. Written by
 * the scorer rather than by hand, because a hand-written result is exactly the
 * fabricated row the anti-self-grading rule exists to stop: every row here
 * carries the verdict and confidence as PostHog returned them.
 *
 * Named by scanner prompt version, since that is what a run measures. Pass
 * --no-save for a throwaway run.
 */
if (!process.argv.includes("--no-save")) {
  const version = process.env.SCANNER_VERSION ?? "v2";
  const out = join(HERE, "results", `${version}.json`);
  mkdirSync(join(HERE, "results"), { recursive: true });
  writeFileSync(
    out,
    `${JSON.stringify(
      {
        scanner_version: version,
        precision: Number(s.precision.toFixed(4)),
        recall: Number(s.recall.toFixed(4)),
        bars: { precision: MIN_PRECISION, recall: MIN_RECALL },
        passed,
        tp: s.tp,
        fp: s.fp,
        fn: s.fn,
        unresolved: (fixtures.unresolved ?? []).length,
        rows: rows.map((r) => ({
          session_id: r.session_id,
          scanner: r.scanner,
          expect: r.expect,
          got: r.verdict,
          confidence: r.confidence === null ? null : Number(r.confidence),
        })),
      },
      null,
      2
    )}\n`
  );
  console.log(`results written to ${out}`);
}

console.log(passed ? "BARS MET" : "BELOW BAR — do not enable unlabelled posting");
process.exit(passed ? 0 : 1);
