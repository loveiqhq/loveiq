import { supabaseFetch } from "@features/admin/server/supabase";
import { FAILURE_PHRASE, OUTAGE_PHRASE } from "@features/brain/server/health";
import { readAll } from "@features/brain/server/read-all";
import { CRON_MAX_AGE_MS } from "@features/cron/server/cron-stall";

/**
 * HOW THE BRAIN IS DOING, in its own words: a window of days against the window before.
 * Plan item G9. Marcus wants the agents "benchmarked, so nobody relies on false
 * confidence", and the brain is held to the same standard.
 *
 * Read on demand with the `brain_health` tool, and written once a week as a notice by the
 * `brain-health` job, straight after that week's test batteries, so it reaches Claude on
 * its own. Every figure comes from a record the brain already keeps: `brain_query` (each
 * tool call; the batteries' own calls are counted apart) and `cron_run` (each job run, and
 * each battery's result). Nothing here is a model's judgement.
 */

/**
 * The brain's scheduled jobs and how stale each may get, straight from the stall watcher's
 * table (roughly 2-3x each schedule), so the report and the hourly watchdog never disagree
 * about what "stopped running" means.
 */
const brainJobs = () =>
  Object.entries(CRON_MAX_AGE_MS).filter(([name]) => name.startsWith("brain-"));

export const BATTERIES = ["brain-battery-retrieval", "brain-battery-mcp"] as const;

export interface CallRow {
  created_at: string;
  surface: string | null;
  tool: string | null;
  query: string | null;
  source_count: number | null;
  content_score: number | null;
  latency_ms: number | null;
  error: string | null;
}

export interface WindowStats {
  calls: number;
  bySurface: Array<[string, number]>;
  byTool: Array<[string, number]>;
  searches: number;
  weak: number;
  empty: number;
  failures: number;
  outages: number;
  refusals: number;
  failuresByTool: Array<[string, number]>;
  topRefusals: Array<[string, number]>;
  p50: number | null;
  p95: number | null;
  slowest: Array<[string, number]>;
  unanswered: Array<{ query: string; times: number; best: number | null }>;
}

const countBy = <T>(items: T[], key: (t: T) => string): Array<[string, number]> => {
  const m = new Map<string, number>();
  for (const i of items) m.set(key(i), (m.get(key(i)) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
};

const percentile = (sorted: number[], p: number): number | null =>
  sorted.length ? sorted[Math.floor(p * (sorted.length - 1))]! : null;

/**
 * An error's reason, grouped: its first sentence on one line, before any JSON body. Seen
 * live: "Query failed (400): {...column x does not exist}" differed per column and split
 * one reason into many, and "github returned 401:\n{" carried its line breaks along.
 */
const refusalKey = (error: string) => {
  const head = error
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?]) |:? ?\{/)[0]!
    .trim();
  return head.length > 90 ? `${head.slice(0, 87)}...` : head;
};

/**
 * One window's figures. A search is WEAK when it found something but the best match
 * scored under `floor` on content alone, which is exactly when the reader was shown the
 * weak-match warning; EMPTY when it found nothing.
 */
export function windowStats(rows: CallRow[], floor: number): WindowStats {
  const searches = rows.filter((r) => r.tool === "search_company_context");
  const isEmpty = (r: CallRow) => r.source_count === 0;
  const isWeak = (r: CallRow) =>
    (r.source_count ?? 0) > 0 && r.content_score !== null && r.content_score < floor;
  const errored = rows.filter((r) => r.error);
  const outage = errored.filter((r) => r.error!.includes(OUTAGE_PHRASE));
  const failure = errored.filter(
    (r) => !r.error!.includes(OUTAGE_PHRASE) && r.error!.includes(FAILURE_PHRASE)
  );
  const refusal = errored.filter(
    (r) => !r.error!.includes(OUTAGE_PHRASE) && !r.error!.includes(FAILURE_PHRASE)
  );
  const latencies = (list: CallRow[]) =>
    list
      .map((r) => r.latency_ms)
      .filter((n): n is number => typeof n === "number")
      .sort((a, b) => a - b);
  const all = latencies(rows);
  const tools = countBy(rows, (r) => r.tool ?? "unknown");
  const slowest = tools
    .filter(([, n]) => n >= 10)
    .map(([tool]): [string, number] => [
      tool,
      percentile(latencies(rows.filter((r) => (r.tool ?? "unknown") === tool)), 0.95) ?? 0,
    ])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const asked = new Map<string, { query: string; times: number; best: number | null }>();
  for (const r of searches.filter((s) => isEmpty(s) || isWeak(s))) {
    const query = (r.query ?? "").replace(/\s+/g, " ").trim();
    if (!query) continue;
    const key = query.toLowerCase();
    const seen = asked.get(key) ?? { query, times: 0, best: null };
    seen.times++;
    if (r.content_score !== null && !isEmpty(r)) {
      seen.best = Math.max(seen.best ?? 0, r.content_score);
    }
    asked.set(key, seen);
  }
  return {
    calls: rows.length,
    bySurface: countBy(rows, (r) => r.surface ?? "unknown"),
    byTool: tools,
    searches: searches.length,
    weak: searches.filter(isWeak).length,
    empty: searches.filter(isEmpty).length,
    failures: failure.length,
    outages: outage.length,
    refusals: refusal.length,
    failuresByTool: countBy([...failure, ...outage], (r) => r.tool ?? "unknown"),
    topRefusals: countBy(refusal, (r) => refusalKey(r.error!)).slice(0, 4),
    p50: percentile(all, 0.5),
    p95: percentile(all, 0.95),
    slowest,
    unanswered: [...asked.values()].sort(
      (a, b) => b.times - a.times || (a.best ?? -1) - (b.best ?? -1)
    ),
  };
}

export interface BatteryRun {
  at: string;
  ok: boolean;
  total?: number;
  clean?: number;
  failing: string[];
  flaky: string[];
  known?: number;
  error?: string;
}

/** A battery's cron_run row. Its summary is JSON, written by `brain-battery.ts --record`. */
export function parseBatteryRun(row: {
  started_at: string;
  status: string;
  error_message: string | null;
}): BatteryRun {
  const at = row.started_at;
  if (row.status !== "success") {
    return { at, ok: false, failing: [], flaky: [], error: row.error_message ?? "no reason" };
  }
  try {
    const s = JSON.parse(row.error_message ?? "") as Partial<BatteryRun>;
    if (typeof s.total !== "number" || typeof s.clean !== "number") throw new Error("shape");
    return {
      at,
      ok: true,
      total: s.total,
      clean: s.clean,
      failing: Array.isArray(s.failing) ? s.failing.map(String) : [],
      flaky: Array.isArray(s.flaky) ? s.flaky.map(String) : [],
      ...(typeof s.known === "number" ? { known: s.known } : {}),
    };
  } catch {
    return { at, ok: false, failing: [], flaky: [], error: "its result could not be read" };
  }
}

export interface JobHealth {
  name: string;
  maxAgeMs: number;
  runs: number;
  errors: number;
  lastError: { at: string; message: string } | null;
  lastRunAt: string | null;
  stale: boolean;
}

export function jobHealth(
  rows: Array<{
    cron_name: string;
    status: string;
    started_at: string;
    error_message: string | null;
  }>,
  lastRuns: Map<string, string | null>,
  nowMs: number
): JobHealth[] {
  return brainJobs().map(([name, maxAgeMs]) => {
    const mine = rows.filter((r) => r.cron_name === name);
    const errors = mine.filter((r) => r.status !== "success");
    const last = errors.at(-1);
    const lastRunAt =
      mine
        .map((r) => r.started_at)
        .sort()
        .at(-1) ??
      lastRuns.get(name) ??
      null;
    return {
      name,
      maxAgeMs,
      runs: mine.length,
      errors: errors.length,
      lastError: last ? { at: last.started_at, message: last.error_message ?? "no message" } : null,
      lastRunAt,
      stale: lastRunAt === null || nowMs - Date.parse(lastRunAt) > maxAgeMs,
    };
  });
}

export interface SelfReport {
  days: number;
  since: string;
  until: string;
  /** Null when the usage log could not be read. */
  now: WindowStats | null;
  before: WindowStats | null;
  /** The batteries' own calls in the window, counted apart; null when unknown. */
  testCalls: number | null;
  /** Newest first. Null when unreadable. */
  batteries: Record<(typeof BATTERIES)[number], BatteryRun[]> | null;
  jobs: JobHealth[] | null;
}

const JOB_NAMES = () =>
  brainJobs()
    .map(([name]) => name)
    .join(",");

export async function selfReport(
  days: number,
  floor: number,
  nowMs: number = Date.now()
): Promise<SelfReport> {
  const since = new Date(nowMs - days * 86_400_000).toISOString();
  const beforeSince = new Date(nowMs - 2 * days * 86_400_000).toISOString();
  const enc = encodeURIComponent;

  const [calls, testCalls, runs, batteryRows] = await Promise.all([
    readAll<CallRow>(
      `/rest/v1/brain_query?select=created_at,surface,tool,query:args->>query,source_count,` +
        `content_score,latency_ms,error&created_at=gte.${enc(beforeSince)}` +
        `&surface=neq.mcp-battery&order=id.asc`
    ),
    supabaseFetch(
      `/rest/v1/brain_query?select=id&surface=eq.mcp-battery&created_at=gte.${enc(since)}`,
      { headers: { Prefer: "count=exact", Range: "0-0" } }
    ).then((res) => {
      const total = Number(res.headers.get("content-range")?.split("/")[1]);
      return res.ok && Number.isFinite(total) ? total : null;
    }),
    readAll<{
      cron_name: string;
      status: string;
      started_at: string;
      error_message: string | null;
    }>(
      `/rest/v1/cron_run?select=cron_name,status,started_at,error_message` +
        `&cron_name=in.(${JOB_NAMES()})&started_at=gte.${enc(since)}&order=id.asc`
    ),
    readAll<{
      cron_name: string;
      status: string;
      started_at: string;
      error_message: string | null;
    }>(
      `/rest/v1/cron_run?select=cron_name,status,started_at,error_message` +
        `&cron_name=in.(${BATTERIES.join(",")})&order=id.desc`,
      1000
    ),
  ]).catch(() => [null, null, null, null] as const);

  let jobs: JobHealth[] | null = null;
  if (runs) {
    // A job with no run in the window: when did it last run at all?
    const quiet = brainJobs()
      .map(([name]) => name)
      .filter((n) => !runs.some((r) => r.cron_name === n));
    const lastRuns = new Map<string, string | null>();
    const ok = await Promise.all(
      quiet.map(async (name) => {
        const res = await supabaseFetch(
          `/rest/v1/cron_run?select=started_at&cron_name=eq.${enc(name)}&order=started_at.desc&limit=1`
        );
        if (!res.ok) return false;
        const rows = (await res.json().catch(() => null)) as Array<{ started_at: string }> | null;
        if (!Array.isArray(rows)) return false;
        lastRuns.set(name, rows[0]?.started_at ?? null);
        return true;
      })
    ).catch(() => [false]);
    if (ok.every(Boolean)) jobs = jobHealth(runs, lastRuns, nowMs);
  }

  return {
    days,
    since: since.slice(0, 10),
    until: new Date(nowMs).toISOString().slice(0, 10),
    now: calls
      ? windowStats(
          calls.filter((r) => r.created_at >= since),
          floor
        )
      : null,
    before: calls
      ? windowStats(
          calls.filter((r) => r.created_at < since),
          floor
        )
      : null,
    testCalls,
    batteries: batteryRows
      ? {
          "brain-battery-retrieval": batteryRows
            .filter((r) => r.cron_name === "brain-battery-retrieval")
            .map(parseBatteryRun),
          "brain-battery-mcp": batteryRows
            .filter((r) => r.cron_name === "brain-battery-mcp")
            .map(parseBatteryRun),
        }
      : null,
    jobs,
  };
}

// ── Rendering ───────────────────────────────────────────────────────────────────────

const n = (x: number) => x.toLocaleString("en-US");
const pct = (part: number, whole: number) =>
  whole ? `${Math.round((part / whole) * 100)}%` : "none";
const secs = (ms: number | null) => (ms === null ? "?" : `${(ms / 1000).toFixed(1)} s`);
const ago = (iso: string, nowMs: number) => {
  const h = (nowMs - Date.parse(iso)) / 3_600_000;
  return h < 48 ? `${Math.max(1, Math.round(h))} hours ago` : `${Math.round(h / 24)} days ago`;
};
const span = (ms: number) =>
  ms < 48 * 3_600_000
    ? `${Math.round(ms / 3_600_000)} hours`
    : `${Math.round(ms / 86_400_000)} days`;

function batteryLine(label: string, runs: BatteryRun[]): string {
  const last = runs[0];
  if (!last) return `- ${label}: no run recorded yet.`;
  const day = last.at.slice(0, 10);
  if (!last.ok) return `- ${label}: the last run (${day}) did not finish: ${last.error}.`;
  const prev = runs.slice(1).find((r) => r.ok);
  const parts = [
    last.failing.length ? `${last.failing.length} failing` : "none failing",
    ...(last.known ? [`${last.known} known`] : []),
    ...(last.flaky.length ? [`${last.flaky.length} passed only on a retry`] : []),
  ];
  return (
    `- ${label}: ${last.clean} of ${last.total} clean on ${day} (${parts.join(", ")})` +
    (prev ? `; the run before, ${prev.clean} of ${prev.total} on ${prev.at.slice(0, 10)}` : "") +
    "." +
    (last.failing.length ? `\n  Failing: ${last.failing.join(", ")}.` : "") +
    (last.flaky.length ? `\n  Only on a retry: ${last.flaky.join(", ")}.` : "")
  );
}

/**
 * The report as prose. `withQuestions: false` leaves out the text of the questions asked:
 * the weekly notice is stored in the searchable corpus, and a question can carry a name
 * or a token the log should keep to itself. The tool, read live, lists them.
 */
export function renderSelfReport(
  r: SelfReport,
  floor: number,
  opts: { withQuestions: boolean; nowMs?: number }
): string {
  const nowMs = opts.nowMs ?? Date.now();
  const out: string[] = [
    `How the brain did, ${r.since} to ${r.until} (${r.days} day${r.days === 1 ? "" : "s"}), against the ${r.days} before.`,
  ];
  const s = r.now;
  const b = r.before;
  if (!s || !b) {
    out.push(
      "Use, searches, errors and speed: the usage log (brain_query) could not be read, so none of them is reported."
    );
  } else {
    const surfaces =
      s.bySurface.length > 1 ? ` (${s.bySurface.map(([k, v]) => `${k} ${n(v)}`).join(", ")})` : "";
    out.push(
      `Use: ${n(s.calls)} calls from people${surfaces}, against ${n(b.calls)} before.` +
        (r.testCalls !== null
          ? ` The test batteries made ${n(r.testCalls)} more, not counted.`
          : "") +
        (s.byTool.length
          ? ` Most used: ${s.byTool
              .slice(0, 5)
              .map(([k, v]) => `${k} ${n(v)}`)
              .join(", ")}.`
          : "")
    );
    out.push(
      s.searches
        ? `Searches: ${n(s.searches)}. ${n(s.weak)} came back weak (${pct(s.weak, s.searches)}; before, ${pct(b.weak, b.searches)}) ` +
            `and ${n(s.empty)} found nothing (${pct(s.empty, s.searches)}; before, ${pct(b.empty, b.searches)}). ` +
            `Weak means the best match scored under ${floor} on content alone, so the reader was warned.`
        : "Searches: none in this window."
    );
    if (s.unanswered.length) {
      out.push(
        opts.withQuestions
          ? `Asked but not answered well, most asked first:\n` +
              s.unanswered
                .slice(0, 8)
                .map(
                  (q) =>
                    `- "${q.query.length > 80 ? `${q.query.slice(0, 77)}...` : q.query}" ` +
                    `(${q.times === 1 ? "once" : `${q.times} times`}, ` +
                    `${q.best === null ? "nothing found" : `best match ${q.best.toFixed(2)}`})`
                )
                .join("\n") +
              (s.unanswered.length > 8 ? `\n(${s.unanswered.length - 8} more.)` : "")
          : `Asked but not answered well: ${n(s.unanswered.length)} distinct questions. ` +
              "The brain_health tool lists them."
      );
    }
    const broke = s.failures + s.outages;
    out.push(
      `Errors: ${n(s.failures)} calls failed outright (${pct(s.failures, s.calls)}; before, ${pct(b.failures, b.calls)})` +
        (s.outages
          ? `, and the corpus was unreachable on ${n(s.outages)}`
          : ", and the corpus was never unreachable") +
        (broke ? `. By tool: ${s.failuresByTool.map(([k, v]) => `${k} ${n(v)}`).join(", ")}` : "") +
        `. ${n(s.refusals)} ended in an error message instead of an answer (a guard refusing a bad request, or an outside service saying no)` +
        (s.topRefusals.length
          ? `; most often: ${s.topRefusals.map(([k, v]) => `"${k}" ${n(v)}`).join("; ")}.`
          : ".")
    );
    out.push(
      s.p50 === null
        ? "Speed: no timings recorded."
        : `Speed: half of all calls answered within ${secs(s.p50)}, 95% within ${secs(s.p95)} (before, ${secs(b.p95)}).` +
            (s.slowest.length
              ? ` Slowest: ${s.slowest.map(([k, v]) => `${k} (95% within ${secs(v)})`).join(", ")}.`
              : "")
    );
  }

  if (!r.batteries) {
    out.push("Accuracy: the test battery results could not be read.");
  } else {
    out.push(
      "Accuracy, from the weekly test batteries (fixed questions with known answers, run against the live corpus):\n" +
        batteryLine("Search", r.batteries["brain-battery-retrieval"]) +
        "\n" +
        batteryLine("Tools", r.batteries["brain-battery-mcp"])
    );
  }

  if (!r.jobs) {
    out.push("Jobs: the job log (cron_run) could not be read.");
  } else {
    const runs = r.jobs.reduce((t, j) => t + j.runs, 0);
    const errors = r.jobs.reduce((t, j) => t + j.errors, 0);
    const problems = r.jobs.filter((j) => j.errors || j.stale);
    out.push(
      `Jobs: ${r.jobs.length} scheduled, ${n(runs)} runs, ${n(errors)} with an error.` +
        (problems.length
          ? "\n" +
            problems
              .map((j) => {
                const bits: string[] = [];
                if (j.stale) {
                  bits.push(
                    j.lastRunAt
                      ? `last ran ${ago(j.lastRunAt, nowMs)}, and should run at least every ${span(j.maxAgeMs)}`
                      : `has never recorded a run (it should run at least every ${span(j.maxAgeMs)})`
                  );
                }
                if (j.errors) {
                  bits.push(
                    `${j.errors} of ${j.runs} runs failed, the last on ${j.lastError!.at.slice(0, 16).replace("T", " ")} UTC: ` +
                      `"${j.lastError!.message.slice(0, 140)}"`
                  );
                }
                return `- ${j.name}: ${bits.join("; ")}.`;
              })
              .join("\n")
          : " Every job ran on schedule.")
    );
  }
  return out.join("\n\n");
}
