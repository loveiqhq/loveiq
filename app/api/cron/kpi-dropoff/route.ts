/**
 * GET /api/cron/kpi-dropoff — daily, before the morning message.
 *
 * Keeps the Notion KPI page "Survey Drop-off Rate per Question %" current. Eman decided
 * on 2026-10-11 that this KPI's report lives on that page, not on an admin page; the
 * morning message links to it (conversion-digest). Three things on the page are this
 * job's, each found again by CHART_MARKER and replaced, everything else left alone:
 *
 *  1. the summary callout at the top: last full week, where people left most, anything
 *     worse than usual, and the two survey tests;
 *  2. the picture "Drop-off per question, week by week";
 *  3. the rows of its data table on "KPI report data", which the page's charts, table and
 *     filters read (`dropoff-notion.ts`): only rows whose numbers moved are written.
 *
 * Writes with NOTION_KPI_TOKEN, a Notion connection of its own that the brain's crawl
 * cannot see (see dropoff-notion.ts). Fails closed: without it, or if any week cannot be
 * read, nothing is written and the page keeps yesterday's numbers. After that each part
 * is written on its own, so one failing part does not hold back the others, and any
 * failure marks the run as an error.
 */
import { NextResponse } from "next/server";
import {
  allTrafficEnds,
  buildDropoffRows,
  buildHeadline,
  fetchDropoffRuns,
  readSurveyTests,
  SURVEY_TESTS,
  tallyRuns,
} from "@features/admin/server/dropoff-report";
import {
  applySync,
  DROPOFF_DATA_DATABASE_ID,
  planSync,
  readDropoffRows,
} from "@features/admin/server/dropoff-notion";
import {
  buildDropoffWeeklyPayload,
  DROPOFF_KPI_PAGE_ID,
  dropoffWeeks,
  MAX_WEEKS,
  shortDate,
} from "@features/admin/server/dropoff-weekly";
import {
  uploadNotionPng,
  upsertMarkedCallout,
  upsertMarkedImage,
  withNotionDeadline,
} from "@features/brain/server/act/notion";
import { chartPng } from "@features/brain/server/chart";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import { recordCronRun, verifyCronAuth } from "@shared/observability/slack-alert-dedup";
import logger from "@shared/observability/logger";
import { reportingDay, reportingDayStart } from "@shared/time/reporting-day";
import { signImagePayload } from "@shared/url/signed-image-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** In the image caption and the callout, so tomorrow's run replaces them and nothing else. */
export const CHART_MARKER = "kpi-dropoff job";

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
    const base = process.env.NEXT_PUBLIC_SITE_URL;
    if (!base) throw new Error("NEXT_PUBLIC_SITE_URL is unset");
    // The job's own Notion connection, which the brain's crawl cannot see (dropoff-notion.ts).
    const token = process.env.NOTION_KPI_TOKEN?.trim();
    if (!token) throw new Error("NOTION_KPI_TOKEN is unset");
    const now = new Date(startedAtMs);
    const today = reportingDay(now);
    /**
     * Four more complete weeks are read than are shown, so the oldest week shown still has
     * the four before it for its usual level, and that level holds still as weeks pass.
     */
    const weeks = dropoffWeeks(now, MAX_WEEKS + 4);
    if (weeks.length === 0) throw new Error("no fully tracked week yet");
    const showFrom = Math.max(0, weeks.filter((w) => !w.partial).length - MAX_WEEKS);
    const shown = weeks.slice(showFrom);

    /**
     * Rows are written until 170 seconds in, then left for tomorrow: a normal day writes
     * about one week of rows in about a minute. Past that line the picture is skipped too.
     * The hard stop is the Notion deadline at 270 seconds: no Notion call starts, or waits
     * to retry, unless it can end by then, so the run is recorded under the 300-second
     * ceiling whatever Notion does.
     */
    const isOutOfTime = () => Date.now() - startedAtMs > 170_000;
    const notionDeadline = startedAtMs + 270_000;

    // Everything is read before anything is written.
    const firstLaunch = Math.min(...SURVEY_TESTS.map((t) => t.launch));
    const [testRuns, runsByWeek] = await Promise.all([
      fetchDropoffRuns(new Date(firstLaunch), reportingDayStart(today)),
      Promise.all(weeks.map((w) => fetchDropoffRuns(w.since, w.until))),
    ]);
    const tallies = runsByWeek.map(tallyRuns);
    const shownTallies = tallies.slice(showFrom);
    const rows = buildDropoffRows(weeks, tallies, today, showFrom);

    const problems: string[] = [];
    const part = async <T>(name: string, run: () => Promise<T>): Promise<T | null> => {
      try {
        return await withNotionDeadline(notionDeadline, run);
      } catch (err) {
        logger.error({ err, part: name }, "kpi-dropoff part failed");
        problems.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      }
    };

    const callout = await part("summary", () =>
      upsertMarkedCallout(DROPOFF_KPI_PAGE_ID, {
        marker: CHART_MARKER,
        emoji: "📉",
        lines: buildHeadline({
          rows,
          weeks: shown,
          tallies: shownTallies,
          tests: readSurveyTests(testRuns, today),
          today,
          marker: CHART_MARKER,
        }),
        token,
      })
    );

    const image = await part("picture", async () => {
      // After a slow summary, yesterday's picture stays rather than the run overrunning.
      if (isOutOfTime()) throw new Error("out of time, left for tomorrow");
      const payload = buildDropoffWeeklyPayload(
        shown,
        shownTallies.map(allTrafficEnds),
        shortDate(today)
      );
      const { d, s } = await signImagePayload(payload);
      const url = new URL("/api/admin/digest-image/dropout-weekly", base);
      url.searchParams.set("d", d);
      url.searchParams.set("s", s);
      const png = await chartPng(url.toString());
      if (!png) throw new Error("the chart did not render");
      const fileUploadId = await uploadNotionPng(
        Buffer.from(png, "base64"),
        `dropoff-per-question-${today}.png`,
        token
      );
      return upsertMarkedImage(DROPOFF_KPI_PAGE_ID, {
        marker: CHART_MARKER,
        caption: `Updated ${shortDate(today)} by the ${CHART_MARKER}, every morning.`,
        heading: "Drop-off per question, week by week",
        fileUploadId,
        token,
      });
    });

    const sync = await part("rows", async () => {
      // From the first week shown, so a stale row in it goes even when nothing replaces it.
      const existing = await readDropoffRows(
        DROPOFF_DATA_DATABASE_ID,
        reportingDay(shown[0]!.since),
        { token, isOutOfTime }
      );
      const result = await applySync(
        DROPOFF_DATA_DATABASE_ID,
        planSync(rows, existing),
        isOutOfTime,
        token
      );
      if (result.failed > 0)
        throw new Error(`${result.failed} writes failed: ${result.firstError}`);
      if (result.pending > 0) throw new Error(`${result.pending} writes left for tomorrow`);
      return result;
    });

    detail =
      `summary=${callout ?? "failed"} picture=${image ?? "failed"} weeks=${shown.length} rows=${rows.length}` +
      (sync ? ` created=${sync.created} updated=${sync.updated} archived=${sync.archived}` : "") +
      (problems.length ? ` | ${problems.join(" | ")}` : "");
    if (problems.length > 0) {
      status = "error";
      return NextResponse.json({ ok: false, error: "Internal" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, weeks: shown.length, rows: rows.length });
  } catch (err) {
    status = "error";
    detail = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "kpi-dropoff failed");
    return NextResponse.json({ ok: false, error: "Internal" }, { status: 500 });
  } finally {
    await recordCronRun("kpi-dropoff", startedAtMs, status, detail);
  }
}
