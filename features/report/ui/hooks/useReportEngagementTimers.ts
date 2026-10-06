"use client";

import { useEffect, useRef } from "react";
import {
  trackReportEngagement,
  type ReportEngagementThreshold,
  type ReportEngagementType,
} from "@features/analytics/client";
import { getCsrfToken } from "@shared/http/csrf-client";

const MILESTONES: ReadonlyArray<ReportEngagementThreshold> = [60, 300, 600];

interface UseReportEngagementTimersArgs {
  /** Pass `null` while report data is still loading; the hook will not start until non-null. */
  reportType: ReportEngagementType | null;
  archetype: string | null;
}

/**
 * Two beacons cannot be sent closer together than this. A reader who alt-tabs
 * repeatedly would otherwise spend their own 30/min rate-limit budget on a
 * timestamp that barely moved.
 */
const SESSION_END_THROTTLE_MS = 5_000;

/**
 * Everything the report page records about HOW LONG the reader was here.
 *
 * Two mechanisms, because neither sees what the other does:
 *
 *  1. The active-time milestones — `report_engagement_1min` / `_5min` / `_10min`,
 *     once each, counting only seconds while the tab is visible, carrying max
 *     scroll depth. Consent-gated, like everything in `analytics_event`.
 *  2. The session close — a beacon on the way out that stamps
 *     `report_session.ended_at`, which is the only record of the moment they
 *     actually left. NOT consent-gated, matching the row it closes, which the
 *     server writes for every reader.
 *
 * Without (2) the measured time on report stopped at the last thing the reader
 * happened to click, so someone who read the final chapter quietly for four
 * minutes and closed the tab was credited up to their last scroll and no
 * further. Without (1) a reader who never scrolls is invisible between the two
 * endpoints.
 *
 * Once started (the first time `reportType` becomes non-null), the timer is
 * locked in for the lifetime of the component — subsequent reportType changes
 * (rare; would require accessPlan to flip without a page reload) do not reset
 * counts. All listeners and the interval are cleaned up on unmount.
 */
export function useReportEngagementTimers({
  reportType,
  archetype,
}: UseReportEngagementTimersArgs) {
  const reportTypeRef = useRef(reportType);
  const archetypeRef = useRef(archetype);

  useEffect(() => {
    reportTypeRef.current = reportType;
  }, [reportType]);

  useEffect(() => {
    archetypeRef.current = archetype;
  }, [archetype]);

  const hasReportType = reportType !== null;

  useEffect(() => {
    if (!hasReportType) return;
    if (typeof window === "undefined") return;

    let activeSeconds = 0;
    let maxScrollDepth = 0;
    const fired = new Set<ReportEngagementThreshold>();
    let intervalId: number | null = null;

    const updateScrollDepth = () => {
      const docEl = document.documentElement;
      const scrollable = docEl.scrollHeight - window.innerHeight;
      const pct =
        scrollable > 0
          ? Math.min(100, Math.max(0, Math.round((window.scrollY / scrollable) * 100)))
          : 100;
      if (pct > maxScrollDepth) maxScrollDepth = pct;
    };

    updateScrollDepth();
    window.addEventListener("scroll", updateScrollDepth, { passive: true });

    intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      activeSeconds += 1;
      const currentReportType = reportTypeRef.current;
      if (!currentReportType) return;
      for (const milestone of MILESTONES) {
        if (activeSeconds >= milestone && !fired.has(milestone)) {
          fired.add(milestone);
          trackReportEngagement(milestone, currentReportType, archetypeRef.current, maxScrollDepth);
        }
      }
      if (fired.size === MILESTONES.length && intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    }, 1000);

    return () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
      window.removeEventListener("scroll", updateScrollDepth);
    };
  }, [hasReportType]);

  /**
   * Close the server-side session on the way out.
   *
   * BOTH events, and `pagehide` is unguarded. The documented pattern pairs
   * `visibilitychange` with `pagehide` because neither alone is reliable — but
   * on a real unload `pagehide` can fire while `visibilityState` is still
   * "visible", so guarding it the way the visibility handler is guarded would
   * silently drop the one case that matters most: the reader closing the tab.
   * A duplicate beacon costs nothing; the server only ever writes `now()`, so
   * re-stamping moves the timestamp forward and never backward.
   *
   * `sendBeacon` rather than `fetch`, because the browser is allowed to kill an
   * ordinary request on unload and is required to deliver a beacon. It cannot
   * set headers, which is why the CSRF token rides in the body.
   */
  useEffect(() => {
    if (!hasReportType) return;
    if (typeof window === "undefined") return;

    let lastSentAt = 0;

    const endSession = () => {
      const submissionId = window.__loveiqReportSubmissionId;
      if (!submissionId) return;
      const now = Date.now();
      if (now - lastSentAt < SESSION_END_THROTTLE_MS) return;
      lastSentAt = now;
      const payload = JSON.stringify({ submission_id: submissionId, _csrf: getCsrfToken() });
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon?.("/api/report-session-end", blob);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") endSession();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", endSession);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", endSession);
    };
  }, [hasReportType]);
}
