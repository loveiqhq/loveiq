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
  /**
   * NULL, not 1, when there is nothing to divide by.
   *
   * `tp + fp === 0 ? 1` reads "nothing was predicted positive, so nothing was
   * wrong, so precision is perfect". It prints `precision 1.00 (bar 0.8)` from
   * zero measurements, and it fed `passed` — so a fixture set that had gone
   * unscanned, or one containing only negatives, could clear the bar without
   * measuring anything. This file's own comment warns about that exact shape
   * for the query-error path; the 0/0 convention re-created it two lines later.
   *
   * Observed for real on 2026-09-17 while simulating the expiry: every fixture
   * read "(not scanned yet)" and the output still said precision 1.00.
   */
  return {
    tp,
    fp,
    fn,
    precision: tp + fp === 0 ? null : tp / (tp + fp),
    recall: tp + fn === 0 ? null : tp / (tp + fn),
  };
}

/**
 * Ledger rows in the shape `score()` takes.
 *
 * Ground truth costs nothing to collect here and never expires: a probe that
 * REPRODUCED the claim proves the scanner was right, and a `clear` from a
 * mutation-proven probe — or a `contradicted` from our own events — proves it
 * was wrong. `inconclusive`, `gap` and `duplicate` carry no verdict and are
 * excluded by the caller.
 *
 * Every row is a YES, by construction: the ledger is written from findings the
 * scanner already flagged. See the recall note at the call site.
 */
export function ledgerRows(findings) {
  return findings.map((f) => ({
    ...f,
    expect: f.outcome === "reproduced" ? "yes" : "no",
    verdict: "yes",
  }));
}

/** "0.20", or "n/a" when the figure is undefined rather than perfect. */
export function fmtScore(v) {
  return v === null ? "n/a" : v.toFixed(2);
}

if (process.argv.includes("--selftest")) {
  const s = score([
    { expect: "yes", verdict: "yes" },
    { expect: "yes", verdict: "inconclusive" },
    { expect: "no", verdict: "no" },
    { expect: "no", verdict: "yes" },
  ]);
  // And the case that used to read as a perfect score: nothing predicted
  // positive, nothing expected positive. Both figures are undefined, and
  // undefined must not be 1.
  const empty = score([
    { expect: "no", verdict: "no" },
    { expect: "no", verdict: "(not scanned yet)" },
  ]);
  /**
   * The ledger's own trap. Every row it produces is a YES, so `fn` is always 0
   * and `score()` computes recall = tp / (tp + 0) = 1.00 — a perfect score from
   * a source that cannot observe a miss. This asserts the trap is real, so the
   * --ledger mode below is never "simplified" into reporting that number.
   */
  const led = score(ledgerRows([{ outcome: "reproduced" }, { outcome: "clear" }]));

  const ok =
    led.fn === 0 &&
    led.recall === 1 &&
    led.precision === 0.5 &&
    s.tp === 1 &&
    s.fp === 1 &&
    s.fn === 1 &&
    s.precision === 0.5 &&
    s.recall === 0.5 &&
    empty.precision === null &&
    empty.recall === null &&
    fmtScore(empty.precision) === "n/a" &&
    fmtScore(0.2) === "0.20";
  console.log(ok ? "selftest ok" : `selftest FAILED: ${JSON.stringify({ s, empty })}`);
  process.exit(ok ? 0 : 1);
}

/**
 * `--ledger`: score from what the probes actually concluded, not from fixtures.
 *
 * WHY. The fixture set is seven hand-curated recordings captured 2026-08-29
 * that EXPIRE 2026-09-28, and they cannot be re-scanned: a scanner observes a
 * given session once, ever. So the only benchmark this system had was about to
 * stop existing, on a known date, with nothing to replace it.
 *
 * The `ux_finding` ledger replaces it and never expires. A probe outcome is
 * ground truth that costs nothing to collect: `reproduced` proves the scanner
 * was right, `clear` and `contradicted` prove it was wrong. Every row is
 * labelled by a mechanical check, not by a person and not by a model.
 *
 * RECALL IS NOT REPORTED, AND THAT IS NOT AN OVERSIGHT. The ledger only ever
 * contains findings the scanner already said YES to, so a session it wrongly
 * passed never enters it and a false negative is unobservable BY CONSTRUCTION.
 * Feeding these rows to score() yields recall 1.00 — a perfect number from a
 * source that cannot see a miss, which is the same "score of nothing" shape
 * that made precision read 1.00 from zero measurements until 2026-09-17. The
 * selftest above pins that trap deliberately. Recall still needs the fixtures,
 * or a future set of sessions labelled independently of the scanner.
 */
if (process.argv.includes("--ledger")) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    // Exit 3, not 2. Exit 2 means "not enough labelled findings yet", which CI
    // reports as a normal state — so a missing secret sharing that code would
    // be announced as a healthy, filling ledger. That is the soft-skip failure
    // three other lanes in this repo already have.
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for --ledger");
    process.exit(3);
  }
  const days = Number(process.env.LEDGER_DAYS ?? 90);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const lRes = await fetch(
    `${url}/rest/v1/ux_finding?select=observation_id,scanner_name,outcome,confidence,criterion` +
      `&outcome=in.(reproduced,clear,contradicted)&created_at=gte.${since}&limit=1000`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  if (!lRes.ok) {
    // Loud, not a zero. An unreadable ledger is not an empty one.
    console.error(`ledger read failed ${lRes.status}: ${(await lRes.text()).slice(0, 200)}`);
    process.exit(3);
  }
  const ledgerFindings = await lRes.json();
  const lRows = ledgerRows(ledgerFindings);
  const ls = score(lRows);

  const byScanner = new Map();
  for (const r of lRows) {
    const e = byScanner.get(r.scanner_name) ?? { right: 0, wrong: 0 };
    if (r.expect === "yes") e.right += 1;
    else e.wrong += 1;
    byScanner.set(r.scanner_name, e);
  }

  console.log(`ledger: ${lRows.length} labelled finding(s) in the last ${days} days\n`);
  for (const [scanner, e] of byScanner) {
    const total = e.right + e.wrong;
    console.log(
      `  ${scanner} — ${e.right}/${total} confirmed by a probe ` +
        `(${fmtScore(total === 0 ? null : e.right / total)})`
    );
  }

  /**
   * A precision figure from a handful of rows is noise, and printing one next
   * to a bar invites reading it as a verdict. Below the floor the number is
   * still shown — hiding it would be its own dishonesty — but no pass is
   * claimed and the exit code says "not measured", not "failed".
   */
  const MIN_SAMPLE = 10;
  console.log(
    `\nprecision ${fmtScore(ls.precision)} (bar ${MIN_PRECISION}) · ` +
      `right ${ls.tp} wrong ${ls.fp} · ` +
      `recall n/a — the ledger holds only findings the scanner flagged, so a miss cannot appear in it`
  );
  if (lRows.length < MIN_SAMPLE) {
    console.log(
      `not enough labelled findings yet (${lRows.length}/${MIN_SAMPLE}) — no verdict claimed`
    );
    process.exit(2);
  }

  if (!process.argv.includes("--no-save")) {
    const out = join(HERE, "results", "ledger.json");
    mkdirSync(join(HERE, "results"), { recursive: true });
    writeFileSync(
      out,
      `${JSON.stringify(
        {
          // Never confusable with a fixture run: different source, different file.
          source: "ux_finding ledger",
          window_days: days,
          scored_at: new Date().toISOString(),
          precision: ls.precision === null ? null : Number(ls.precision.toFixed(4)),
          recall: null,
          recall_note: "unobservable: the ledger contains only findings the scanner flagged",
          bars: { precision: MIN_PRECISION },
          passed: ls.precision !== null && ls.precision >= MIN_PRECISION,
          right: ls.tp,
          wrong: ls.fp,
          by_scanner: Object.fromEntries(byScanner),
        },
        null,
        2
      )}\n`
    );
    console.log(`results written to ${out}`);
  }

  const lPassed = ls.precision !== null && ls.precision >= MIN_PRECISION;
  console.log(lPassed ? "PRECISION BAR MET" : "BELOW PRECISION BAR");
  process.exit(lPassed ? 0 : 1);
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
          -- 180 days, not 7. A scanner observes a session ONCE, EVER, so the
          -- verdict for a fixture is written on the day it is first scanned and
          -- never again. With a 7-day window that made the whole benchmark go
          -- blind a week later: every fixture read "(not scanned yet)", the
          -- script printed dots and exited 2, and no score could be produced
          -- from work that had already been done.
          --
          -- Measured 2026-09-17: all eight fixture observations were written on
          -- 2026-09-14, so this benchmark had four days left. The recordings
          -- themselves expire 2026-09-28 — that limit is real and bounds
          -- re-labelling and re-scanning, but it is not a reason to discard a
          -- verdict that is already recorded.
          AND timestamp > now() - INTERVAL 180 DAY
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
  `\nprecision ${fmtScore(s.precision)} (bar ${MIN_PRECISION}) · ` +
    `recall ${fmtScore(s.recall)} (bar ${MIN_RECALL}) · ` +
    `tp ${s.tp} fp ${s.fp} fn ${s.fn}` +
    (pending ? ` · ${pending} still scanning` : "") +
    (s.precision === null ? " · nothing was predicted positive" : "") +
    (s.recall === null ? " · no fixture expected a defect" : "")
);
if (pending) {
  console.log("incomplete — re-run when the scans finish");
  process.exit(2);
}
// An undefined figure is not a pass. A benchmark that measured nothing has not
// cleared a bar, whatever the arithmetic says.
const passed =
  s.precision !== null &&
  s.recall !== null &&
  s.precision >= MIN_PRECISION &&
  s.recall >= MIN_RECALL;

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
        precision: s.precision === null ? null : Number(s.precision.toFixed(4)),
        recall: s.recall === null ? null : Number(s.recall.toFixed(4)),
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
