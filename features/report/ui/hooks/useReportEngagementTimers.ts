"use client";

import { useEffect, useRef } from "react";
import {
  pageEmailVia,
  trackReportActiveMinute,
  trackReportEngagement,
  type ReportEngagementThreshold,
  type ReportEngagementType,
} from "@features/analytics/client";
import { getCsrfToken } from "@shared/http/csrf-client";
import { isGuidedTourActive } from "@shared/ui/guided-tour-state";

const MILESTONES: ReadonlyArray<ReportEngagementThreshold> = [60, 300, 600];

/** The active minute's length: the seconds #report-reactivations waits for. */
const ACTIVE_MINUTE_SECONDS = 60;

/**
 * How long one touch, click, wheel turn or key press keeps the reader counted as there. The
 * plain `scroll` event is not one of them: a reloaded page can restore its scroll position by
 * itself, and mouse movement is a cursor passing over the page, not reading.
 */
const INPUT_WINDOW_MS = 30_000;
const INPUT_EVENTS = ["pointerdown", "touchstart", "wheel", "keydown"] as const;

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
 * Three mechanisms, because none sees what the others do:
 *
 *  1. The active-time milestones — `report_engagement_1min` / `_5min` / `_10min`,
 *     once each, counting only seconds while the tab is visible, carrying max
 *     scroll depth.
 *  2. The session close — a beacon on the way out that stamps
 *     `report_session.ended_at`, which is the only record of the moment they
 *     actually left. NOT consent-gated, matching the row it closes, which the
 *     server writes for every reader.
 *  3. The active minute — `report_active_1min`, once: sixty seconds on screen
 *     with a touch, click, wheel turn or key press in the last thirty. Visible
 *     seconds alone also count a tab the browser reopened in front, which then
 *     sat there; this one needs the reader's hand. #report-reactivations posts a
 *     returning reader only once it arrives (attribution/server/reactivation-post.ts).
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

    // The active minute (3 above). The email is the page's as it was opened: later URL edits
    // (a Stripe return's `?anchor=` dropped, an exit page) say nothing about how they came.
    const via = pageEmailVia(window.location.search);
    let inputAt = Number.NEGATIVE_INFINITY;
    let inputSeconds = 0;
    let activeMinuteSent = false;
    const markInput = () => {
      inputAt = Date.now();
    };
    for (const type of INPUT_EVENTS) {
      window.addEventListener(type, markInput, { passive: true, capture: true });
    }

    const updateScrollDepth = () => {
      // The guided tour's own trip down the page is not how far the reader read.
      if (isGuidedTourActive()) return;
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
      if (!activeMinuteSent && Date.now() - inputAt <= INPUT_WINDOW_MS) {
        inputSeconds += 1;
        if (inputSeconds >= ACTIVE_MINUTE_SECONDS) {
          activeMinuteSent = true;
          trackReportActiveMinute(currentReportType, via);
        }
      }
      // Past ten minutes the marks are done, but a reader who only starts reading then still
      // gets their minute counted.
      if (fired.size === MILESTONES.length && activeMinuteSent && intervalId !== null) {
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
      for (const type of INPUT_EVENTS) {
        window.removeEventListener(type, markInput, { capture: true });
      }
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
      // A string, not a Blob (features/analytics/client.ts persistAnalyticsEvent).
      const payload = JSON.stringify({ submission_id: submissionId, _csrf: getCsrfToken() });
      navigator.sendBeacon?.("/api/report-session-end", payload);
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
