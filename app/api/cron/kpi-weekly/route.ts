/**
 * GET /api/cron/kpi-weekly — daily, before the morning message.
 *
 * Keeps 📊 KPI in Notion live (Eman, 2026-10-12: "make sure it is always updated"). Every
 * High and Medium KPI our own data can measure (kpi-weekly.ts) is computed per week, and
 * written to three places, each on its own so one failing does not hold back the others:
 *
 *  1. 📊 KPI: the live columns of each measured KPI's row (last full week, week before,
 *     change, the last 8 weeks, this week so far, updated);
 *  2. each High KPI's page: the summary at the top, found again by KPI_MARKER;
 *  3. "KPI weekly numbers" on "KPI report data": a row per KPI, week and slice, which the
 *     charts on the KPI pages read. A week two weeks past its Sunday is final: its rows
 *     are created when missing and otherwise left alone.
 *
 * Writes with NOTION_KPI_TOKEN, the connection the brain's crawl cannot see. Fails closed:
 * without it, or if any week or the ad spend cannot be read, nothing is written and Notion
 * keeps yesterday's numbers. Any failed part marks the run as an error.
 */
import { NextResponse } from "next/server";
import { fetchDropoffRuns, tallyRuns } from "@features/admin/server/dropoff-report";
import { FIRST_TRACKED_MONDAY } from "@features/admin/server/dropoff-weekly";
import {
  KPI_NUMBERS_DATABASE_ID,
  kpiColumnProperties,
  kpiRowProperties,
  kpiRowValue,
  readKpiPages,
  readKpiRows,
} from "@features/admin/server/kpi-notion";
import {
  buildKpiRows,
  dropoffColumns,
  fetchKpiWeek,
  isFrozenWeek,
  kpiCallout,
  kpiColumns,
  kpiWeeks,
  summarize,
  weekContexts,
} from "@features/admin/server/kpi-weekly";
import { applyRowSync, planRowSync } from "@features/admin/server/notion-row-sync";
import {
  updateNotionPage,
  upsertMarkedCallout,
  withNotionDeadline,
} from "@features/brain/server/act/notion";
import { adCostByDay } from "@features/brain/server/ingest/analytics";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import { recordCronRun, verifyCronAuth } from "@shared/observability/slack-alert-dedup";
import logger from "@shared/observability/logger";
import { reportingDay } from "@shared/time/reporting-day";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** In each High KPI page's summary, so tomorrow's run replaces it and nothing else. */
export const KPI_MARKER = "kpi-weekly job";

/** The drop-off KPI's row: its own job keeps its page; this one keeps its columns. */
const DROPOFF_KPI_TITLE = "Survey Drop-off Rate per Question %";

export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }

  const startedAtMs = Date.now();
  let status: "success" | "error" = "success";
  let detail: string | undefined;
  try {
    const token = process.env.NOTION_KPI_TOKEN?.trim();
    if (!token) throw new Error("NOTION_KPI_TOKEN is unset");
    const now = new Date(startedAtMs);
    const today = reportingDay(now);
    const weeks = kpiWeeks(now);
    if (weeks.length === 0) throw new Error("no week to show");

    /**
     * Rows are written until 170 seconds in, then left for tomorrow. No Notion call starts,
     * or waits to retry, past 270 seconds (withNotionDeadline), so the run is recorded
     * under the 300-second ceiling whatever Notion does.
     */
    const isOutOfTime = () => Date.now() - startedAtMs > 170_000;
    const notionDeadline = startedAtMs + 270_000;

    // Everything is read before anything is written.
    const [data, ad, runs] = await Promise.all([
      Promise.all(weeks.map((w) => fetchKpiWeek(w.since, w.until))),
      adCostByDay(),
      Promise.all(
        weeks.map((w) =>
          reportingDay(w.since) >= FIRST_TRACKED_MONDAY ? fetchDropoffRuns(w.since, w.until) : null
        )
      ),
    ]);
    // adCostByDay reads failures as "no spend data": the cost rows would be trashed and the
    // run recorded as a success.
    if (ad.to === null) throw new Error("Google Ads spend could not be read");
    const contexts = weekContexts(weeks, ad, today);
    const rows = buildKpiRows(data, contexts);
    const summaries = summarize(rows, data, contexts);
    const dropoff = dropoffColumns(
      weeks,
      runs.map((r) => (r ? tallyRuns(r) : null)),
      today
    );

    const problems: string[] = [];
    const part = async <T>(name: string, run: () => Promise<T>): Promise<T | null> => {
      try {
        return await withNotionDeadline(notionDeadline, run);
      } catch (err) {
        logger.error({ err, part: name }, "kpi-weekly part failed");
        problems.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      }
    };

    const pages = await part("kpi pages", () => readKpiPages(token));

    const table = await part("kpi table", async () => {
      if (!pages) throw new Error("📊 KPI could not be read");
      const writes: Array<[string, Record<string, unknown>]> = [
        ...summaries.map((s): [string, Record<string, unknown>] => [
          s.kpi.title,
          kpiColumnProperties(kpiColumns(s), today),
        ]),
        [DROPOFF_KPI_TITLE, kpiColumnProperties(dropoff, today)],
      ];
      const missing = writes.filter(([title]) => !pages.has(title)).map(([title]) => title);
      for (const [title, props] of writes) {
        const id = pages.get(title);
        if (id) await updateNotionPage(id, props, token);
      }
      if (missing.length > 0) throw new Error(`not in 📊 KPI: ${missing.join("; ")}`);
      return writes.length - missing.length;
    });

    const callouts = await part("kpi page summaries", async () => {
      if (!pages) throw new Error("📊 KPI could not be read");
      let n = 0;
      for (const s of summaries.filter((x) => x.kpi.high)) {
        const id = pages.get(s.kpi.title);
        if (!id) continue; // reported by the table part
        await upsertMarkedCallout(id, {
          marker: KPI_MARKER,
          emoji: "📈",
          lines: kpiCallout(s, today, KPI_MARKER),
          token,
        });
        n += 1;
      }
      return n;
    });

    const sync = await part("rows", async () => {
      const existing = await readKpiRows(KPI_NUMBERS_DATABASE_ID, reportingDay(weeks[0]!.since), {
        token,
        isOutOfTime,
      });
      const result = await applyRowSync(
        KPI_NUMBERS_DATABASE_ID,
        planRowSync(rows, existing, kpiRowValue, (week) => isFrozenWeek(week, today)),
        isOutOfTime,
        kpiRowProperties,
        token
      );
      if (result.failed > 0)
        throw new Error(`${result.failed} writes failed: ${result.firstError}`);
      if (result.pending > 0) throw new Error(`${result.pending} writes left for tomorrow`);
      return result;
    });

    detail =
      `weeks=${weeks.length} kpis=${summaries.length} table=${table ?? "failed"} pages=${callouts ?? "failed"} rows=${rows.length}` +
      (sync ? ` created=${sync.created} updated=${sync.updated} archived=${sync.archived}` : "") +
      (problems.length ? ` | ${problems.join(" | ")}` : "");
    if (problems.length > 0) {
      status = "error";
      return NextResponse.json({ ok: false, error: "Internal" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, weeks: weeks.length, rows: rows.length });
  } catch (err) {
    status = "error";
    detail = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "kpi-weekly failed");
    return NextResponse.json({ ok: false, error: "Internal" }, { status: 500 });
  } finally {
    await recordCronRun("kpi-weekly", startedAtMs, status, detail);
  }
}
