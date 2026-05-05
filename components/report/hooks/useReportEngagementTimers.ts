"use client";

import { useEffect, useRef } from "react";
import {
  trackReportEngagement,
  type ReportEngagementThreshold,
  type ReportEngagementType,
} from "@/lib/analytics";

const MILESTONES: ReadonlyArray<ReportEngagementThreshold> = [60, 300, 600];

interface UseReportEngagementTimersArgs {
  /** Pass `null` while report data is still loading; the hook will not start until non-null. */
  reportType: ReportEngagementType | null;
  archetype: string | null;
}

/**
 * Active-time engagement tracker for the report page. Fires
 * `report_engagement_1min`, `report_engagement_5min`, `report_engagement_10min`
 * once each, only counting time while the tab is visible. Tracks max scroll
 * depth (% of scrollable height) and includes it in each milestone payload.
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
}
