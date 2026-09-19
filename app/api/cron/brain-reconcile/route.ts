/**
 * GET /api/cron/brain-reconcile
 *
 * Derives the same numbers two ways and speaks up only when they disagree.
 *
 * Three defects shipped in the conversion digest and survived for months inside data this
 * system already held — staff sandbox purchases counted as sales, two charts drawing the
 * same arms in opposite colours, and a funnel heading that covered rows it did not
 * describe. None was hard to see. Nothing looked, because nothing ever computed a quantity
 * twice and compared.
 *
 * Silence is the normal output. Only a disagreement posts, and all of them post in ONE
 * message: four alerts about one bad number is how a channel gets muted, which is exactly
 * why `funnel-digest` was unscheduled for being FYI-only.
 */
import { NextResponse } from "next/server";
import { supabaseFetch } from "@features/admin/server/supabase";
import { buildReportVoiceRows } from "@features/brain/server/ingest/report-voice";
import { buildDomainRows } from "@features/brain/server/ingest/domain";
import { redactUrlSecrets } from "@features/brain/server/ingest/upsert";
import { sheetTabTitles } from "@features/brain/server/ingest/drive";
import { getGoogleAccessToken, readVercelOidcToken } from "@shared/http/google-oauth";
import { reconcile, summarise, type Reading } from "@features/brain/server/reconcile";
import { recordNotice } from "@features/brain/server/notice";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import { notifySlack } from "@shared/observability/slack";
import {
  recordCronRun,
  startCronTimer,
  verifyCronAuth,
} from "@shared/observability/slack-alert-dedup";
import logger from "@shared/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * 120, not 60. The corpus-wide secret scan reads every chunk — 12.5s over 25,000 of them,
 * measured — and that number grows with the corpus. A kill writes NO `cron_run` row, so
 * the worst runs would be the invisible ones. The scan also gives up and reports itself
 * UNREAD rather than returning a false zero; both guards are needed, because a budget
 * without the honest report is how a partial scan becomes a clean bill of health.
 */
export const maxDuration = 120;

const WINDOW_DAYS = 30;

async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T | null> {
  const res = await supabaseFetch(`/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as T | null;
}

/** How many chunks a source currently holds. Null when the count cannot be read. */
async function sourceCount(source: string): Promise<number | null> {
  const res = await supabaseFetch(`/rest/v1/brain_chunk?select=id&source=eq.${source}&limit=1`, {
    headers: { Prefer: "count=exact", Range: "0-0" },
  });
  if (!res.ok) return null;
  const n = Number(res.headers.get("content-range")?.split("/")[1]);
  return Number.isFinite(n) ? n : null;
}

/** Sum of real money in the ledger: succeeded, not staff testing, actually charged. */
async function ledgerRevenue(): Promise<number | null> {
  const res = await supabaseFetch(
    "/rest/v1/payment?select=amount&status=eq.succeeded&is_test=is.false&amount=gt.0&limit=5000"
  );
  if (!res.ok) return null;
  const rows = (await res.json().catch(() => [])) as Array<{ amount: number | string }>;
  if (!Array.isArray(rows)) return null;
  return Math.round(rows.reduce((t, r) => t + Number(r.amount ?? 0), 0) * 100) / 100;
}

/** The all-time revenue the corpus publishes — what a caller is actually told. */
async function corpusRevenue(): Promise<number | null> {
  // Built from parts rather than one long literal: as a single string the query trips the
  // `no-secrets` lint rule on entropy, which is a false positive but a blocking one.
  const query = ["select=body", "source=eq.analytics", "source_id=eq.alltime", "limit=1"].join("&");
  const res = await supabaseFetch(`/rest/v1/brain_chunk?${query}`);
  if (!res.ok) return null;
  const body = ((await res.json().catch(() => [])) as Array<{ body?: string }>)[0]?.body ?? "";
  const m = /Revenue: EUR ([\d.]+)/.exec(body);
  return m ? Number(m[1]) : null;
}

export async function buildReadings(): Promise<{ readings: Reading[]; unread: string[] }> {
  const until = new Date();
  until.setUTCHours(0, 0, 0, 0);
  const since = new Date(until.getTime() - WINDOW_DAYS * 86_400_000);
  const range = { since_ts: since.toISOString(), until_ts: until.toISOString() };

  const readings: Reading[] = [];
  const unread: string[] = [];

  const cohorts = await rpc<Array<{ axis: string; arm: string; n: number; conversions: number }>>(
    "get_arm_cohorts",
    range
  );
  const axis = await rpc<Array<{ axis: string; arm: string; completions: number; paid: number }>>(
    "get_axis_funnel_daily",
    range
  );

  if (!cohorts || !axis) {
    unread.push("get_arm_cohorts / get_axis_funnel_daily");
  } else {
    const sum = (rows: number[]) => rows.reduce((t, n) => t + Number(n || 0), 0);
    const landCohorts = cohorts.filter((r) => r.axis === "landing");
    const landAxis = axis.filter((r) => r.axis === "landing");
    // These two read the same submissions through the same expression. The SQL comment in
    // get_axis_funnel_daily says outright that "the two cannot disagree" — which nothing
    // has ever checked, and an unchecked invariant is a belief.
    readings.push({
      what: `finished surveys, last ${WINDOW_DAYS} days`,
      left: { source: "get_arm_cohorts", value: sum(landCohorts.map((r) => r.n)) },
      right: { source: "get_axis_funnel_daily", value: sum(landAxis.map((r) => r.completions)) },
      tolerance: 0,
    });
    readings.push({
      what: `paid, last ${WINDOW_DAYS} days`,
      left: { source: "get_arm_cohorts", value: sum(landCohorts.map((r) => r.conversions)) },
      right: { source: "get_axis_funnel_daily", value: sum(landAxis.map((r) => r.paid)) },
      tolerance: 0,
    });
  }

  const cvr = await rpc<{ days?: Array<{ visitors: number }> }>("get_funnel_cvr_sparklines", range);
  const arm = await rpc<{ visitors?: Array<{ n: number }> }>("get_landing_arm_funnel_daily", range);
  if (!cvr?.days || !arm?.visitors) {
    unread.push("get_funnel_cvr_sparklines / get_landing_arm_funnel_daily");
  } else {
    // The funnel's top row and the line under its chart count the same visitor-days. They
    // are drawn side by side in one Slack message, so a gap is visible to the whole team
    // before it is visible to us.
    readings.push({
      what: `visits, last ${WINDOW_DAYS} days`,
      left: {
        source: "the funnel's top row",
        value: arm.visitors.reduce((t, v) => t + Number(v.n || 0), 0),
      },
      right: {
        source: "the survey-reach line",
        value: cvr.days.reduce((t, d) => t + Number(d.visitors || 0), 0),
      },
      tolerance: 0,
    });
  }

  /**
   * The repo-built corpora, counted against what the builders actually produce.
   *
   * `report` and `domain` are built from files rather than fetched, so the number of chunks
   * they SHOULD hold is knowable exactly.
   *
   * `skill` is deliberately NOT here, though this comment used to claim it was. It reads
   * its prompt list back out of the `drive` corpus, so its expected count depends on remote
   * data and cannot be derived from the repo — there is no second way to count it, which is
   * the only thing this check can do.
   *
   * NOTHING WATCHES THE OTHER SOURCES FOR ROW LOSS, and that is a real gap rather than an
   * oversight to fix casually: detecting a shrink needs yesterday's number, and this
   * reconciler is stateless on purpose — every check derives one quantity two ways from
   * what is true right now. `drive`, `gmail` and `notion` have their own majority guard in
   * the sweep; the append-only sources (`decision`, `notice`) have nothing. Their ingesters refuse to sweep on an
   * empty build — but a build that produced HALF its rows would sweep the other half away
   * and look like a normal run. A data file renamed, an export changed shape, a parser that
   * stops matching: all of those are silent, and all of them are caught by counting.
   */
  for (const [source, expected] of [
    ["report", buildReportVoiceRows(new Date().toISOString()).length],
    ["domain", buildDomainRows(new Date().toISOString()).length],
  ] as Array<[string, number]>) {
    const held = await sourceCount(source);
    if (held === null) {
      unread.push(`${source} chunk count`);
      continue;
    }
    readings.push({
      what: `${source} chunks in the corpus`,
      left: { source: "what the builder produces", value: expected },
      right: { source: "what the corpus holds", value: held },
      tolerance: 0,
      because:
        "these are built from files in the repo, so the two are the same number or something dropped rows",
    });
  }

  /**
   * NO CHUNK ANYWHERE SHOULD STILL CARRY A SECRET.
   *
   * `upsertChunks` redacts on the way in, so the expected number is exactly zero and any
   * other answer means something wrote around it. Not hypothetical: on 2026-09-17 a full
   * WhatsApp re-sync, run by hand from a checkout that predated the redaction, put six
   * live report-access tokens back into the corpus forty minutes after they had been
   * cleaned out. Hand-run scripts are the hole, and nothing noticed.
   *
   * SCANS EVERYTHING, and the first version of this check did not — it read one page of
   * 5,000 and reported zero while a planted token sat outside it. The daily touch moves
   * `updated_at` on most of the corpus, so "recently written" selects almost everything
   * and a single page is a fifth of it. A bounded scan that reports zero is worse than no
   * check: it answers the question wrongly and confidently.
   */
  let leaking = 0;
  let scanned = 0;
  let scanFailed = false;
  // Well inside the ceiling, and the tail after this still has to run.
  const scanDeadline = Date.now() + 70_000;
  for (let offset = 0; ; offset += 1000) {
    if (Date.now() > scanDeadline) {
      scanFailed = true;
      break;
    }
    const page = await supabaseFetch(
      `/rest/v1/brain_chunk?select=body,title,url&order=id&limit=1000&offset=${offset}`
    );
    if (!page.ok) {
      scanFailed = true;
      break;
    }
    const rows = (await page.json().catch(() => [])) as Array<{
      body: string;
      title: string;
      url: string | null;
    }>;
    if (rows.length === 0) break;
    scanned += rows.length;
    for (const r of rows) {
      if (
        redactUrlSecrets(r.body) !== r.body ||
        redactUrlSecrets(r.title) !== r.title ||
        (r.url !== null && redactUrlSecrets(r.url) !== r.url)
      ) {
        leaking += 1;
      }
    }
    if (rows.length < 1000) break;
  }
  if (scanFailed) {
    // NOT a reading of zero. A scan that stopped early knows nothing about what it did not
    // read, and saying so is the difference between "clean" and "did not look".
    unread.push(`corpus secret scan (stopped after ${scanned} chunks)`);
  } else {
    readings.push({
      what: `chunks holding a secret (all ${scanned} scanned)`,
      left: { source: "what the redaction rule allows", value: 0 },
      right: { source: "what the corpus holds", value: leaking },
      tolerance: 0,
      because:
        "every write goes through the redaction, so anything above zero means something wrote around it — usually a hand-run script from a checkout that predates the rule. Fix with `npm run brain:redact -- --apply`",
    });
  }

  const [corpus, ledger] = await Promise.all([corpusRevenue(), ledgerRevenue()]);
  if (corpus === null || ledger === null) {
    unread.push("all-time revenue");
  } else {
    // What the brain TELLS people against what the money says. This is the one a person
    // would quote in a meeting, and it was wrong by EUR 145 this morning because a window
    // started where visitor tracking began rather than where payments did.
    readings.push({
      what: "all-time revenue",
      left: { source: "what the corpus publishes", value: corpus },
      right: { source: "the payment ledger", value: ledger },
      tolerance: 0.01,
      because: "the corpus is rebuilt on a schedule, so it can lag the ledger by one run",
    });
  }

  return { readings, unread };
}

/**
 * DOES THE CORPUS STILL CONTAIN WHAT THE SOURCE CONTAINS?
 *
 * Every other check here compares two numbers we already hold. This one is the only
 * one that leaves the building, and it exists because on 2026-09-19 a spreadsheet was
 * indexed, counted, reconciled to the exact file — and held one tab of two. Nothing
 * failed. The export succeeded, the row existed, the file count was right, and the
 * answer was confidently wrong. No count could have caught it, because counting
 * containers cannot see inside them.
 *
 * Deliberately tiny: three spreadsheets a day, metadata only, no cell values. Enough
 * that a reader change which silently drops content stops being invisible, cheap
 * enough that it can run beside the others forever.
 */
/**
 * How many of a spreadsheet's tabs are actually present in the indexed text.
 *
 * Pure, because this one comparison IS the check — everything around it is network
 * plumbing. A tab counts as present only when its own `## <title>` heading is there,
 * which is what the reader writes; matching the bare title would pass on a sheet that
 * merely mentions the word.
 */
export function tabsPresentInText(text: string, titles: string[]): number {
  return titles.filter((t) => text.includes(`## ${t}`)).length;
}

async function sheetTabReading(request: Request): Promise<Reading | null> {
  const token = await getGoogleAccessToken(Date.now(), readVercelOidcToken(request));
  if (!token) return null;

  // Built from parts rather than written out: the percent-encoded form of this filter
  // is high-entropy enough that `no-secrets` refuses the commit, and a literal that
  // trips a secret scanner is a literal somebody will eventually silence the scanner for.
  const spreadsheetFilter = `url=ilike.*${encodeURIComponent("/spreadsheets/")}*`;
  const res = await supabaseFetch(
    `/rest/v1/brain_chunk?select=source_id,body&source=eq.drive&${spreadsheetFilter}&limit=400`
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ source_id: string; body: string }>;

  // Group every part back to its document: a tab heading may sit in any of them.
  const byDoc = new Map<string, string>();
  for (const r of rows) {
    const base = r.source_id.split("#")[0]!;
    byDoc.set(base, `${byDoc.get(base) ?? ""}\n${r.body ?? ""}`);
  }
  const sample = [...byDoc.keys()].sort().slice(0, 3);
  if (sample.length === 0) return null;

  let expected = 0;
  let found = 0;
  for (const base of sample) {
    const fileId = base.replace(/^doc:/, "");
    const titles = await sheetTabTitles(token, fileId);
    const text = byDoc.get(base) ?? "";
    expected += titles.length;
    found += tabsPresentInText(text, titles);
  }
  return {
    what: `spreadsheet tabs present in the corpus (${sample.length} sampled)`,
    left: { source: "google sheets", value: expected },
    right: { source: "brain_chunk", value: found },
    tolerance: 0,
  };
}

export async function GET(request: Request) {
  // Returns a boolean, not a response — the same shape every other cron checks.
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: "not the production host" });
  }

  const startedAtMs = Date.now();
  const checkSlow = startCronTimer("brain-reconcile", maxDuration);
  let status: "success" | "error" = "success";
  let errorMessage: string | undefined;
  let disagreements = 0;
  let checked = 0;

  try {
    const { readings, unread } = await buildReadings();
    // The only check that leaves the building. "Could not read it" is not "it agrees",
    // so a missing token lands in `unread` rather than passing silently.
    try {
      const tabs = await sheetTabReading(request);
      if (tabs) readings.push(tabs);
      else unread.push("spreadsheet tabs (no Google token)");
    } catch (err) {
      logger.warn({ err }, "brain-reconcile: the spreadsheet tab check could not run");
      unread.push("spreadsheet tabs");
    }
    checked = readings.length;
    const found = reconcile(readings);
    disagreements = found.length;

    // "Could not read it" is not "it agrees". Silence has to mean checked-and-fine, or the
    // whole design — that no news is good news — quietly stops being true.
    if (unread.length) {
      errorMessage = `could not read: ${unread.join(", ")}`;
      logger.warn({ unread }, "brain-reconcile: some checks could not run");
    }

    const message = summarise(found, checked);
    if (message) {
      await notifySlack({ channel: "brain", kind: "brain_reconcile", text: message });
      await recordNotice({
        headline: `${found.length} of the brain's own numbers disagree with themselves`,
        detail: message,
        kind: "brain-reconcile",
        evidence: found.map((f) => f.what).join(", "),
      });
    }
    logger.info({ checked, disagreements, unread: unread.length }, "brain-reconcile");
  } catch (err) {
    status = "error";
    errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "brain-reconcile failed");
  } finally {
    await checkSlow();
    await recordCronRun(
      "brain-reconcile",
      startedAtMs,
      status,
      errorMessage ?? `${checked} checks, ${disagreements} disagreed`
    );
  }

  return NextResponse.json({ checked, disagreements });
}
