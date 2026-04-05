import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { supabaseFetch } from "@/lib/admin/supabase";
import { buildTrustDescriptor, clampDays, round1 } from "@/lib/admin/next-level";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

interface WindowedRow {
  created_date_time?: string | null;
  updated_at?: string | null;
  payment_date_time?: string | null;
}

function inCurrentWindow(dateValue: string | null | undefined, since: string): boolean {
  return !!dateValue && dateValue >= since;
}

function windowValue(row: WindowedRow, field: PropertyKey): string {
  return String(new Map(Object.entries(row)).get(String(field)) ?? "");
}

function splitWindow<T extends WindowedRow>(
  rows: T[],
  field: keyof T,
  since: string
): { current: T[]; prior: T[] } {
  const current = rows.filter((row) => inCurrentWindow(windowValue(row, field), since));
  const prior = rows.filter((row) => !inCurrentWindow(windowValue(row, field), since));
  return { current, prior };
}

function completionRate(rows: Array<{ status: string }>): number {
  if (rows.length === 0) return 0;
  return round1((rows.filter((row) => row.status === "completed").length / rows.length) * 100);
}

function trendLabel(value: number, suffix = ""): string {
  if (value === 0) return `flat${suffix}`;
  return `${value > 0 ? "+" : ""}${value}${suffix}`;
}

function pushItem(
  list: Array<{ title: string; detail: string; href: string }>,
  title: string,
  detail: string,
  href: string
) {
  if (!list.some((item) => item.title === title)) {
    list.push({ title, detail, href });
  }
}

export async function GET(request: Request) {
  const admin = await verifyAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!hasRole(admin.role, "viewer")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-executive-memo",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const days = clampDays(parseInt(url.searchParams.get("days") || "30", 10), 7, 180);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const priorSince = new Date(Date.now() - days * 2 * 86_400_000).toISOString();

  try {
    const [
      submissionsRes,
      waitlistRes,
      investigationsRes,
      experimentsRes,
      decisionsRes,
      reportsRes,
      paymentsRes,
    ] = await Promise.all([
      supabaseFetch(
        `/rest/v1/survey_submission?select=id,status,created_date_time&created_date_time=gte.${priorSince}`,
        { headers: { Range: "0-99999" } }
      ),
      supabaseFetch(
        `/rest/v1/waitlist_user?select=id,created_date_time&created_date_time=gte.${priorSince}`,
        { headers: { Range: "0-99999" } }
      ),
      supabaseFetch(
        `/rest/v1/admin_investigation_case?select=id,title,status,root_cause,updated_at&updated_at=gte.${priorSince}`,
        { headers: { Range: "0-9999" } }
      ),
      supabaseFetch(
        `/rest/v1/admin_experiment?select=id,name,status,decision_date,updated_at&updated_at=gte.${priorSince}`,
        { headers: { Range: "0-9999" } }
      ),
      supabaseFetch(
        `/rest/v1/admin_decision_entry?select=id,title,entry_type,status,updated_at&updated_at=gte.${priorSince}`,
        { headers: { Range: "0-9999" } }
      ),
      supabaseFetch(
        `/rest/v1/personal_report?select=id,created_date_time&created_date_time=gte.${priorSince}`,
        { headers: { Range: "0-99999" } }
      ),
      supabaseFetch(
        `/rest/v1/payment?select=id,status,payment_date_time&payment_date_time=gte.${priorSince}`,
        { headers: { Range: "0-99999" } }
      ),
    ]);

    if (!submissionsRes.ok || !waitlistRes.ok) {
      logger.error(
        { statuses: [submissionsRes.status, waitlistRes.status] },
        "Executive memo core query failed"
      );
      return NextResponse.json({ error: "Unable to generate memo." }, { status: 500 });
    }

    const submissions = (await submissionsRes.json()) as Array<{
      id: number;
      status: string;
      created_date_time: string;
    }>;
    const waitlist = (await waitlistRes.json()) as Array<{ id: number; created_date_time: string }>;
    const investigations = investigationsRes.ok
      ? ((await investigationsRes.json()) as Array<{
          id: number;
          title: string;
          status: string;
          root_cause: string | null;
          updated_at: string;
        }>)
      : [];
    const experiments = experimentsRes.ok
      ? ((await experimentsRes.json()) as Array<{
          id: number;
          name: string;
          status: string;
          decision_date: string | null;
          updated_at: string;
        }>)
      : [];
    const decisions = decisionsRes.ok
      ? ((await decisionsRes.json()) as Array<{
          id: number;
          title: string;
          entry_type: string;
          status: string;
          updated_at: string;
        }>)
      : [];
    const reports = reportsRes.ok
      ? ((await reportsRes.json()) as Array<{ id: number; created_date_time: string }>)
      : [];
    const payments = paymentsRes.ok
      ? ((await paymentsRes.json()) as Array<{
          id: number;
          status: string;
          payment_date_time: string | null;
        }>)
      : [];

    const submissionWindow = splitWindow(submissions, "created_date_time", since);
    const waitlistWindow = splitWindow(waitlist, "created_date_time", since);
    const reportWindow = splitWindow(reports, "created_date_time", since);
    const paymentWindow = splitWindow(payments, "payment_date_time", since);
    const decisionWindow = splitWindow(decisions, "updated_at", since);
    const investigationWindow = splitWindow(investigations, "updated_at", since);

    const currentCompletion = completionRate(submissionWindow.current);
    const priorCompletion = completionRate(submissionWindow.prior);
    const completionDelta = round1(currentCompletion - priorCompletion);
    const submissionDelta = submissionWindow.current.length - submissionWindow.prior.length;
    const waitlistDelta = waitlistWindow.current.length - waitlistWindow.prior.length;
    const activeExperiments = experiments.filter((entry) => entry.status === "active").length;
    const pendingExperimentDecisions = experiments.filter(
      (entry) =>
        entry.decision_date != null &&
        entry.decision_date <= new Date().toISOString().slice(0, 10) &&
        !["completed", "archived"].includes(entry.status)
    ).length;
    const openInvestigations = investigations.filter((entry) => entry.status !== "resolved").length;
    const currentPayments = paymentWindow.current.filter((entry) => entry.status === "paid").length;
    const reportCoverage = reportWindow.current.length;

    const headline =
      completionDelta >= 2
        ? `Completion improved by ${trendLabel(completionDelta, " pts")} while demand stayed ${submissionDelta >= 0 ? "stable to up" : "soft"}.`
        : completionDelta <= -2
          ? `Completion softened by ${trendLabel(completionDelta, " pts")} and needs immediate product review.`
          : `Core conversion was stable over the last ${days} days, with attention shifting to operational follow-through.`;

    const wins: Array<{ title: string; detail: string; href: string }> = [];
    const risks: Array<{ title: string; detail: string; href: string }> = [];
    const watchlist: Array<{ title: string; detail: string; href: string }> = [];
    const actions: Array<{ title: string; detail: string; href: string }> = [];

    if (completionDelta >= 1.5) {
      pushItem(
        wins,
        "Completion trend improved",
        `${currentCompletion}% completion this window versus ${priorCompletion}% in the prior window.`,
        "/admin/strategy"
      );
    }
    if (waitlistDelta > 0) {
      pushItem(
        wins,
        "Top-of-funnel demand rose",
        `${waitlistWindow.current.length} waitlist signups arrived this window, ${trendLabel(waitlistDelta)} versus the previous window.`,
        "/admin/growth"
      );
    }
    if (decisionWindow.current.length > 0) {
      pushItem(
        wins,
        "Decision cadence is active",
        `${decisionWindow.current.length} structured journal entries were logged this window.`,
        "/admin/changelog"
      );
    }
    if (activeExperiments > 0) {
      pushItem(
        wins,
        "Learning loop is running",
        `${activeExperiments} experiments are currently active.`,
        "/admin/experiments"
      );
    }

    if (completionDelta <= -1.5) {
      pushItem(
        risks,
        "Completion is down",
        `${currentCompletion}% completion this window versus ${priorCompletion}% previously.`,
        "/admin/strategy"
      );
    }
    if (openInvestigations > 0) {
      pushItem(
        risks,
        "Open investigations remain",
        `${openInvestigations} investigation cases still need closure.`,
        "/admin/strategy"
      );
    }
    if (reportCoverage === 0 || currentPayments === 0) {
      pushItem(
        risks,
        "Report-to-revenue coverage is thin",
        `Reports: ${reportCoverage}. Paid conversions: ${currentPayments}. Treat monetization readouts as incomplete until this fills in.`,
        "/admin/health"
      );
    }
    if (decisionWindow.current.length === 0) {
      pushItem(
        risks,
        "No recent structured decisions logged",
        "Major changes should be paired with a decision journal entry for follow-through and attribution.",
        "/admin/changelog"
      );
    }

    if (pendingExperimentDecisions > 0) {
      pushItem(
        watchlist,
        "Experiment readouts are overdue",
        `${pendingExperimentDecisions} experiments have crossed their decision date without being closed out.`,
        "/admin/experiments"
      );
    }
    if (investigationWindow.current.length > 0) {
      pushItem(
        watchlist,
        "Operational incidents need context",
        `${investigationWindow.current.length} investigation records were updated in this window.`,
        "/admin/activity"
      );
    }
    if (submissionWindow.current.length > 0 && reportCoverage === 0) {
      pushItem(
        watchlist,
        "Lineage stops before report engagement",
        "Submission volume exists, but report generation is not showing up in the same window.",
        "/admin/journey"
      );
    }

    if (openInvestigations > 0) {
      pushItem(
        actions,
        "Close the oldest investigation cases",
        "Resolve or reassign open cases so strategy reviews are not anchored to stale anomalies.",
        "/admin/strategy"
      );
    }
    if (reportCoverage === 0 || currentPayments === 0) {
      pushItem(
        actions,
        "Audit report and payment instrumentation",
        "The executive memo cannot make strong monetization claims until report and payment events are consistently populated.",
        "/admin/health"
      );
    }
    if (pendingExperimentDecisions > 0) {
      pushItem(
        actions,
        "Schedule experiment decisions",
        "Move overdue experiments into approved, validated, or archived states and capture the readout in the decision journal.",
        "/admin/experiments"
      );
    }
    if (decisionWindow.current.length === 0) {
      pushItem(
        actions,
        "Log this window's major calls",
        "Capture product, scoring, and growth decisions so release impact can be reviewed against actual movement.",
        "/admin/changelog"
      );
    }

    const trust = buildTrustDescriptor({
      source: "executive-memo",
      mode: "derived",
      sampleSize: submissionWindow.current.length,
      lastUpdated:
        submissions[0]?.created_date_time ??
        waitlist[0]?.created_date_time ??
        decisions[0]?.updated_at ??
        null,
      staleAfterHours: 72,
      warning:
        reportCoverage === 0 || currentPayments === 0
          ? "Report and payment coverage is sparse, so memo monetization claims are directional."
          : null,
    });

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      generatedBy: admin.email,
      period: { days, since },
      headline,
      metrics: {
        submissions: {
          current: submissionWindow.current.length,
          prior: submissionWindow.prior.length,
          delta: submissionDelta,
        },
        completionRate: {
          current: currentCompletion,
          prior: priorCompletion,
          delta: completionDelta,
        },
        waitlist: {
          current: waitlistWindow.current.length,
          prior: waitlistWindow.prior.length,
          delta: waitlistDelta,
        },
        activeExperiments,
        openInvestigations,
        reportCoverage,
        paidConversions: currentPayments,
      },
      sections: {
        wins,
        risks,
        watchlist,
        decisions: decisionWindow.current.slice(0, 5).map((entry) => ({
          title: entry.title,
          detail: `${entry.entry_type} · ${entry.status}`,
          href: "/admin/changelog",
        })),
        actions,
      },
      trust,
    });
  } catch (err) {
    logger.error({ err }, "Executive memo error");
    return NextResponse.json({ error: "Unable to generate memo." }, { status: 500 });
  }
}
