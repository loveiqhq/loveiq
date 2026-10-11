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
 *  3. the rows of the page's data table, which its charts, table and filters read
 *     (`dropoff-notion.ts`): only rows whose numbers moved are written.
 *
 * Fails closed: if any week cannot be read, nothing is written and the page keeps
 * yesterday's numbers. After that each part is written on its own, so one failing part
 * does not hold back the others, and any failure marks the run as an error.
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
  shortDate,
} from "@features/admin/server/dropoff-weekly";
import {
  uploadNotionPng,
  upsertMarkedCallout,
  upsertMarkedImage,
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
    const now = new Date(startedAtMs);
    const today = reportingDay(now);
    const weeks = dropoffWeeks(now);
    if (weeks.length === 0) throw new Error("no fully tracked week yet");

    /**
     * Rows are written until four minutes in, then left for tomorrow: a normal day writes
     * about one week of rows, well inside that, and the writes still in flight and the run
     * record fit in the minute left under maxDuration.
     */
    const isOutOfTime = () => Date.now() - startedAtMs > 240_000;

    // Everything is read before anything is written.
    const firstLaunch = Math.min(...SURVEY_TESTS.map((t) => t.launch));
    const [testRuns, runsByWeek] = await Promise.all([
      fetchDropoffRuns(new Date(firstLaunch), reportingDayStart(today)),
      Promise.all(weeks.map((w) => fetchDropoffRuns(w.since, w.until))),
    ]);
    const tallies = runsByWeek.map(tallyRuns);
    const rows = buildDropoffRows(weeks, tallies, today);

    const problems: string[] = [];
    const part = async <T>(name: string, run: () => Promise<T>): Promise<T | null> => {
      try {
        return await run();
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
          weeks,
          tallies,
          tests: readSurveyTests(testRuns, today),
          today,
          marker: CHART_MARKER,
        }),
      })
    );

    const image = await part("picture", async () => {
      const payload = buildDropoffWeeklyPayload(
        weeks,
        tallies.map(allTrafficEnds),
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
        `dropoff-per-question-${today}.png`
      );
      return upsertMarkedImage(DROPOFF_KPI_PAGE_ID, {
        marker: CHART_MARKER,
        caption: `Updated ${shortDate(today)} by the ${CHART_MARKER}, every morning.`,
        heading: "Drop-off per question, week by week",
        fileUploadId,
      });
    });

    const sync = await part("rows", async () => {
      const existing = await readDropoffRows(DROPOFF_DATA_DATABASE_ID, rows[0]?.week ?? today);
      const result = await applySync(
        DROPOFF_DATA_DATABASE_ID,
        planSync(rows, existing),
        isOutOfTime
      );
      if (result.failed > 0)
        throw new Error(`${result.failed} writes failed: ${result.firstError}`);
      if (result.pending > 0) throw new Error(`${result.pending} writes left for tomorrow`);
      return result;
    });

    detail =
      `summary=${callout ?? "failed"} picture=${image ?? "failed"} weeks=${weeks.length} rows=${rows.length}` +
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
    logger.error({ err }, "kpi-dropoff failed");
    return NextResponse.json({ ok: false, error: "Internal" }, { status: 500 });
  } finally {
    await recordCronRun("kpi-dropoff", startedAtMs, status, detail);
  }
}
