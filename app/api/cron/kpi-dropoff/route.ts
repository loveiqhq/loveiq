/**
 * GET /api/cron/kpi-dropoff — daily, before the morning message.
 *
 * Redraws "Drop-off per question, week by week" on the Notion KPI page
 * "Survey Drop-off Rate per Question %". Eman decided on 2026-10-11 that this
 * drill-down lives on that page, not on an admin page; the morning message
 * links to it (conversion-digest).
 *
 * Fails closed: if a week cannot be read or the picture does not render, the
 * page keeps yesterday's chart instead of showing a half-empty one, and the run
 * records an error.
 */
import { NextResponse } from "next/server";
import {
  buildDropoffWeeklyPayload,
  DROPOFF_KPI_PAGE_ID,
  dropoffWeeks,
  fetchQuestionEnds,
  shortDate,
} from "@features/admin/server/dropoff-weekly";
import { uploadNotionPng, upsertMarkedImage } from "@features/brain/server/act/notion";
import { chartPng } from "@features/brain/server/chart";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import { recordCronRun, verifyCronAuth } from "@shared/observability/slack-alert-dedup";
import logger from "@shared/observability/logger";
import { reportingDay } from "@shared/time/reporting-day";
import { signImagePayload } from "@shared/url/signed-image-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** In the image caption, so tomorrow's run replaces this image and nothing else. */
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
    const weeks = dropoffWeeks(now);
    if (weeks.length === 0) throw new Error("no fully tracked week yet");
    const ends = await Promise.all(weeks.map((w) => fetchQuestionEnds(w.since, w.until)));
    const today = reportingDay(now);
    const payload = buildDropoffWeeklyPayload(weeks, ends, shortDate(today));

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
    const action = await upsertMarkedImage(DROPOFF_KPI_PAGE_ID, {
      marker: CHART_MARKER,
      caption: `Updated ${shortDate(today)} by the ${CHART_MARKER}, every morning.`,
      heading: "Drop-off per question, week by week",
      fileUploadId,
    });
    detail = `${action} weeks=${weeks.length} questions=${payload.rows.length}`;
    return NextResponse.json({ ok: true, action, weeks: weeks.length });
  } catch (err) {
    status = "error";
    detail = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "kpi-dropoff failed");
    return NextResponse.json({ ok: false, error: "Internal" }, { status: 500 });
  } finally {
    await recordCronRun("kpi-dropoff", startedAtMs, status, detail);
  }
}
