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
import { hogQuery } from "../lib/hogql.mjs";
import { championChallengerPairs } from "../lib/challenger-pairs.mjs";
// One list, two callers. See scripts/lib/claim-scoped-probes.mjs for what
// earns a probe a place in it and why an unscoped `clear` is not evidence.
import { clearIsGroundTruth, replayAlone } from "../lib/claim-scoped-probes.mjs";

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
 * REPRODUCED the claim proves the scanner was right, and a `contradicted` from
 * our own events proves it was wrong. A `clear` proves it wrong only when the
 * run was claim-scoped (above). `inconclusive`, `gap` and `duplicate` carry no
 * verdict and are excluded by the caller; an unscoped `clear` now joins them,
 * flagged rather than dropped so the count stays visible.
 *
 * Every row is a YES, by construction: the ledger is written from findings the
 * scanner already flagged. See the recall note at the call site.
 *
 * A person's label outranks the probe: #282 was reproduced, closed as wrong,
 * and scored here as the scanner being right. And a reproduction only the
 * route replay made is set aside until someone labels it, as everywhere else.
 */
export function ledgerRows(findings) {
  return findings.map((f) => {
    const label = f.outcome === "reproduced" ? f.human_label : null;
    return {
      ...f,
      expect: (label ? label === "agree" : f.outcome === "reproduced") ? "yes" : "no",
      verdict: "yes",
      unchecked:
        (f.outcome === "clear" && !clearIsGroundTruth(f)) ||
        (f.outcome === "reproduced" && !label && replayAlone(f.probe_runs)),
    };
  });
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

  /**
   * A `clear` is only evidence when a claim-scoped probe ran.
   *
   * Four shapes, because three of them were real rows in the ledger on
   * 2026-09-21: no probe_runs at all (every row written before the stamp
   * existed), runs that are all unscoped (every L1 report finding), and a
   * D1 run that included verify-dead-click-target with the reader's own
   * element. The fourth pins that `reproduced` is never touched by this — a
   * reproduction is evidence whoever asked.
   */
  const gt = [
    [{ outcome: "clear" }, false],
    [{ outcome: "clear", probe_runs: [] }, false],
    [{ outcome: "clear", probe_runs: [{ file: "a.mjs", claimScoped: false }] }, false],
    [{ outcome: "clear", probe_runs: [{ file: "a.mjs" }, { file: "b.mjs" }] }, false],
    [{ outcome: "clear", probe_runs: [{ file: "a.mjs" }, { claimScoped: true }] }, true],
  ];
  const gtOk = gt.every(([row, want]) => ledgerRows([row])[0].unchecked === !want);
  // A reproduction is evidence regardless, so it must never be set aside...
  const reproducedNeverUnchecked =
    ledgerRows([{ outcome: "reproduced" }])[0].unchecked === false &&
    ledgerRows([{ outcome: "contradicted" }])[0].unchecked === false;
  // ...unless only the replay made it and nobody has looked, and a person's
  // label decides it either way.
  const replay = [{ file: "replay-session.mjs", passed: false, inconclusive: false }];
  const [held, ruledOut, agreed] = ledgerRows([
    { outcome: "reproduced", probe_runs: replay },
    { outcome: "reproduced", probe_runs: replay, human_label: "disagree" },
    { outcome: "reproduced", probe_runs: replay, human_label: "agree" },
  ]);
  const personDecides =
    held.unchecked === true &&
    ruledOut.unchecked === false &&
    ruledOut.expect === "no" &&
    agreed.unchecked === false &&
    agreed.expect === "yes";
  /**
   * The bug this replaced, stated as an assertion: an unscoped `clear` fed to
   * score() is expect:no/verdict:yes, i.e. a false positive. Filtering it out
   * is what stops 59 unanswered questions reading as 59 proofs the scanner
   * lied — so the filter, not just the flag, is what gets pinned.
   */
  const unscoped = ledgerRows([{ outcome: "reproduced" }, { outcome: "clear" }]);
  const filtered = score(unscoped.filter((r) => !r.unchecked));
  const filterMatters = score(unscoped).precision === 0.5 && filtered.precision === 1;

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
    fmtScore(0.2) === "0.20" &&
    gtOk &&
    reproducedNeverUnchecked &&
    personDecides &&
    filterMatters;
  console.log(
    ok
      ? "replay-bench score selftest ok"
      : `selftest FAILED: ${JSON.stringify({ s, empty, gtOk, reproducedNeverUnchecked, personDecides, filterMatters })}`
  );
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
 * was right and `contradicted` proves it wrong. A `clear` proves it wrong only
 * when a claim-scoped probe ran — see clearIsGroundTruth(); the rest are
 * reported as not counted rather than held against the scanner. Every row is
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
      // probe_runs carries `claimScoped`. Omit it and clearIsGroundTruth() reads
      // undefined for every row, so every `clear` falls to unchecked and the
      // scorer silently measures nothing — the failure this whole change is about.
      `,probe_runs,human_label` +
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
  // Scored on what was actually asked. An unscoped `clear` is an open claim,
  // not a false positive, and feeding it to score() as expect:no/verdict:yes
  // counts it against the scanner exactly as before this change.
  const scoredRows = lRows.filter((r) => !r.unchecked);
  const ls = score(scoredRows);

  // Declared before the per-scanner loop, which now uses it too, and a `const`
  // is not hoisted — it threw on first run when it sat lower down.
  const MIN_SAMPLE = 10;

  const byScanner = new Map();
  for (const r of lRows) {
    const e = byScanner.get(r.scanner_name) ?? {
      right: 0,
      wrong: 0,
      contradicted: 0,
      unchecked: 0,
    };
    // An unscoped `clear` is scored as NEITHER. It is not a win for the scanner
    // and not a loss: no probe in that run could have contradicted it, so the
    // claim is simply still open. Counting it as `wrong` is what this change
    // exists to stop.
    if (r.unchecked) e.unchecked += 1;
    else if (r.expect === "yes") e.right += 1;
    else e.wrong += 1;
    // Broken out because it is a DIFFERENT failure from "the probe could not
    // reproduce it". A `contradicted` finding is one our own events refute —
    // the scanner asserted a press nobody made — and it is 20 of the report
    // scanner's 38 wrong answers. Folded into one "wrong" total, the single
    // thing the challenger is trying to fix is invisible.
    if (r.outcome === "contradicted") e.contradicted += 1;
    byScanner.set(r.scanner_name, e);
  }

  console.log(`ledger: ${lRows.length} labelled finding(s) in the last ${days} days\n`);
  for (const [scanner, e] of byScanner) {
    const total = e.right + e.wrong;
    console.log(
      `  ${scanner} — ${e.right}/${total} confirmed by a probe ` +
        `(${fmtScore(total === 0 ? null : e.right / total)}` +
        // Setting unscoped clears aside shrinks some denominators hard — the
        // survey scanner went from 44 to 3 — and 0.67 from three rows reads as
        // a result when it is noise. The pair report below already refuses to
        // call a small sample; this is the same refusal one line earlier.
        (total > 0 && total < MIN_SAMPLE ? `, too few to call` : ``) +
        `)` +
        (e.contradicted ? `, ${e.contradicted} refuted by our own events` : "") +
        // Named, not hidden. A scanner scored on 2 of 70 findings looks precise
        // or hopeless depending on a number you cannot see otherwise.
        (e.unchecked
          ? `, ${e.unchecked} not counted (no claim-scoped probe, or the replay alone)`
          : "")
    );
  }

  /**
   * CHAMPION vs CHALLENGER, paired by name.
   *
   * A challenger is a duplicate scanner on the same trigger event, so the two
   * see the same recordings and one probe run answers both (see the outcome
   * cache in verify-ux-findings.mjs). That makes the delta below a real
   * comparison rather than two populations side by side.
   *
   * Printed separately because the headline precision pools every scanner, and
   * a challenger that is winning would be averaged into a champion that is
   * losing — the experiment would be invisible in its own report.
   */
  const pairs = championChallengerPairs(byScanner);
  if (pairs.length > 0) {
    console.log(`\nchampion vs challenger`);
    const pct = (e) => {
      const t = e.right + e.wrong;
      return t === 0 ? "n/a" : fmtScore(e.right / t);
    };
    for (const { base, champion: champ, challenger: chall } of pairs) {
      const n = (e) => e.right + e.wrong;
      console.log(
        `  ${base}\n` +
          `    champion   ${String(n(champ)).padStart(3)} findings · precision ${pct(champ)} · ${champ.contradicted} refuted by our own events\n` +
          `    challenger ${String(n(chall)).padStart(3)} findings · precision ${pct(chall)} · ${chall.contradicted} refuted by our own events`
      );
      if (n(chall) < MIN_SAMPLE) {
        console.log(
          `    (challenger has ${n(chall)}/${MIN_SAMPLE} labelled findings — too few to call)`
        );
      }
    }
  }

  /**
   * A precision figure from a handful of rows is noise, and printing one next
   * to a bar invites reading it as a verdict. Below the floor the number is
   * still shown — hiding it would be its own dishonesty — but no pass is
   * claimed and the exit code says "not measured", not "failed".
   */
  console.log(
    `\nprecision ${fmtScore(ls.precision)} (bar ${MIN_PRECISION}) · ` +
      `right ${ls.tp} wrong ${ls.fp}` +
      (lRows.length - scoredRows.length > 0
        ? ` · ${lRows.length - scoredRows.length} not counted (no claim-scoped probe ran, or only the replay confirmed it)`
        : "") +
      ` · ` +
      `recall n/a — the ledger holds only findings the scanner flagged, so a miss cannot appear in it`
  );
  if (scoredRows.length < MIN_SAMPLE) {
    console.log(
      `not enough labelled findings yet (${scoredRows.length}/${MIN_SAMPLE}) — no verdict claimed`
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

/** One HogQL query, returning its result rows. Fails loudly, like the fixture
 *  query below: PostHog answers a BAD query with HTTP 200 and an `error` field. */
const hog = (query) =>
  hogQuery(query, { projectId: PROJECT, apiKey: apiKey(), label: "replay-bench" });

/**
 * `--recall`: the half the ledger cannot measure, from evidence the scanner
 * never sees.
 *
 * The ledger only ever holds findings a scanner already flagged, so a session
 * it wrongly passed can never appear in it — recall is unobservable there by
 * construction, which is why --ledger refuses to report one. The fixtures could
 * measure recall, and they expire 2026-09-28 and cannot be re-scanned.
 *
 * Our own `dead_click` event is the way out. It is emitted by
 * `shared/observability/uxSignals.ts` when a reader taps something that does
 * nothing — a mechanical fact, recorded independently of any model, and it
 * never expires. So for a scanner whose JOB is dead controls: every session it
 * OBSERVED that also emitted a dead_click is a session it should have flagged.
 * Restricting to sessions it observed is what makes this a fair denominator —
 * a scanner cannot be blamed for a recording it never watched.
 *
 * ONLY THE CLICK-CAUSE SCANNERS ARE SCORED. A dead_click is not evidence that
 * the survey-UX scanner should have fired; its criteria are different. The
 * others are printed as context and excluded from the verdict, because scoring
 * them against this signal would be measuring the wrong thing precisely.
 *
 * AND ONLY DEAD CLICKS THAT HIT A REAL CONTROL COUNT. This started out as a
 * bare `event = 'dead_click'` join and reported recall 0.06, which was wrong in
 * the scanners' favour to correct: on 30 days of production, 807 of the 827
 * sessions that emitted a dead_click had tapped DECORATION — `div.flex`,
 * `p.font-sans`, `h2.font-serif`. The dead-click scanner's own prompt carries a
 * HARD RULE that a tap on a paragraph is not a defect, so a clear on those
 * sessions is the scanner being RIGHT, and counting it as a miss measures
 * obedience as failure. `verify-dead-click-target.mjs` already draws this line
 * for exactly the same reason; this join now draws it identically.
 *
 * What survives the filter is unambiguous: a reader pressed a button or a link
 * and nothing happened. It is a far smaller set — which is itself the finding,
 * since it means a single miss moves the number a lot, and the verdict is
 * withheld below ten sessions for that reason.
 */
if (process.argv.includes("--recall")) {
  const days = Number(process.env.RECALL_DAYS ?? 30);
  /** Scanners whose stated subject IS the dead/rage click. */
  const CLICK_SCANNERS = /dead-click|rage-click/i;

  /**
   * A real control, in the same terms `selectorFor()` emits them. Kept as one
   * string so the scored set and the named misses below can never drift apart.
   */
  const HIT_A_CONTROL = `(
    startsWith(toString(properties.target_selector), 'button')
    OR startsWith(toString(properties.target_selector), 'a.')
    OR startsWith(toString(properties.target_selector), 'a#')
    OR toString(properties.target_selector) = 'a'
    OR startsWith(toString(properties.target_selector), '[data-track-id')
    OR startsWith(toString(properties.target_selector), '[role=button')
  )`;

  const rows = await hog(`
    SELECT o.scanner, count(DISTINCT o.sid) AS observed, countIf(o.verdict = 'yes') AS flagged
    FROM (
      SELECT toString(properties.session_id) AS sid,
             toString(properties.scanner_name) AS scanner,
             toString(properties.scanner_output_verdict) AS verdict
      FROM events
      WHERE event = '$recording_observed' AND timestamp > now() - INTERVAL ${days} DAY
    ) o
    INNER JOIN (
      SELECT DISTINCT toString(properties.$session_id) AS sid
      FROM events
      WHERE event = 'dead_click' AND timestamp > now() - INTERVAL ${days} DAY
        AND ${HIT_A_CONTROL}
    ) d ON d.sid = o.sid
    GROUP BY o.scanner
    ORDER BY observed DESC
  `);

  console.log(`recall against dead clicks that hit a real control, last ${days} days\n`);
  let scoredObserved = 0;
  let scoredFlagged = 0;
  for (const [scanner, observed, flagged] of rows) {
    const scored = CLICK_SCANNERS.test(String(scanner));
    if (scored) {
      scoredObserved += Number(observed);
      scoredFlagged += Number(flagged);
    }
    const r = Number(observed) === 0 ? null : Number(flagged) / Number(observed);
    console.log(
      `  ${String(scanner).padEnd(26)} ${String(observed).padStart(4)} observed ` +
        `${String(flagged).padStart(4)} flagged  recall ${fmtScore(r)}` +
        (scored ? "" : "   (context only — dead clicks are not this scanner's subject)")
    );
  }

  /**
   * Name the misses, because a rate alone is not actionable — and name the
   * SELECTOR, because that is what turns a miss into a reproduction:
   * `verify-dead-click-target.mjs` takes a URL_PATH and a TARGET_SELECTOR and
   * re-presses the thing the reader pressed. A row here is a ready-made probe
   * invocation, printed underneath it.
   *
   * Same control filter as the scored set above. An earlier version thresholded
   * on raw dead-click COUNT, which sorted the list by whoever tapped the most
   * paragraphs and buried the real misses — the session at the top had 117 dead
   * clicks and every one of them was decoration.
   */
  const worst = await hog(`
    SELECT o.sid, o.scanner, d.path, d.sel, d.n
    FROM (
      SELECT toString(properties.session_id) AS sid, toString(properties.scanner_name) AS scanner
      FROM events
      WHERE event='$recording_observed' AND timestamp > now() - INTERVAL ${days} DAY
        AND properties.scanner_output_verdict = 'no'
    ) o
    INNER JOIN (
      SELECT toString($session_id) AS sid,
             toString(properties.pathname) AS path,
             toString(properties.target_selector) AS sel,
             count() AS n
      FROM events
      WHERE event IN ('dead_click','rage_click')
        AND timestamp > now() - INTERVAL ${days} DAY
        AND ${HIT_A_CONTROL}
      GROUP BY sid, path, sel
    ) d ON d.sid = o.sid
    ORDER BY d.n DESC
    LIMIT 10
  `);

  if (worst.length > 0) {
    console.log(`\nmissed — a scanner watched these and cleared them:\n`);
    for (const [sid, scanner, path, sel, n] of worst) {
      console.log(
        `  ${String(sid).slice(0, 13)}  ${String(scanner).padEnd(26)}` +
          `${String(n).padStart(3)}x  ${path} ${sel}`
      );
      console.log(
        `      URL_PATH='${path}' TARGET_SELECTOR='${sel}' \\\n` +
          `        node scripts/probes/verify-dead-click-target.mjs`
      );
    }
  }

  const recall = scoredObserved === 0 ? null : scoredFlagged / scoredObserved;
  console.log(
    `\nrecall ${fmtScore(recall)} (bar ${MIN_RECALL}) · ` +
      `${scoredFlagged} flagged of ${scoredObserved} observed sessions where a reader ` +
      `pressed a real control and nothing happened`
  );
  if (scoredObserved < 10) {
    console.log(`not enough observed sessions yet (${scoredObserved}/10) — no verdict claimed`);
    process.exit(2);
  }
  const passed = recall !== null && recall >= MIN_RECALL;
  console.log(passed ? "RECALL BAR MET" : "BELOW RECALL BAR");
  process.exit(passed ? 0 : 1);
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

// Through the shared client: it states the row limit PostHog otherwise
// applies silently at 100, and throws on the 200-with-error reply that would
// otherwise read as "not scanned yet". Bounded to the fixture list, which is
// eight rows today — stated anyway, because the next query might not be.
const results = await hog(`
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
      `);

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
