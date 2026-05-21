// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

const mockTrackReportEngagement = vi.fn();
vi.mock("@features/analytics/client", () => ({
  trackReportEngagement: (...args: unknown[]) => mockTrackReportEngagement(...args),
}));

import { useReportEngagementTimers } from "@features/report/ui/hooks/useReportEngagementTimers";

const setVisibility = (state: "visible" | "hidden") => {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  });
};

const setScrollGeometry = ({
  scrollY,
  innerHeight,
  scrollHeight,
}: {
  scrollY: number;
  innerHeight: number;
  scrollHeight: number;
}) => {
  Object.defineProperty(window, "scrollY", { value: scrollY, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: innerHeight, configurable: true });
  Object.defineProperty(document.documentElement, "scrollHeight", {
    value: scrollHeight,
    configurable: true,
  });
};

describe("useReportEngagementTimers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockTrackReportEngagement.mockReset();
    setVisibility("visible");
    setScrollGeometry({ scrollY: 0, innerHeight: 800, scrollHeight: 1600 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not start until reportType is non-null", () => {
    const { rerender } = renderHook(
      ({ rt }: { rt: "full_report" | null }) =>
        useReportEngagementTimers({ reportType: rt, archetype: null }),
      { initialProps: { rt: null } }
    );

    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(mockTrackReportEngagement).not.toHaveBeenCalled();

    rerender({ rt: "full_report" });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(mockTrackReportEngagement).toHaveBeenCalledTimes(1);
    expect(mockTrackReportEngagement).toHaveBeenCalledWith(
      60,
      "full_report",
      null,
      0 // scrollDepthPct — tests above do not scroll, so the observed max is 0
    );
  });

  it("fires 1min, 5min, 10min in sequence with cumulative active time", () => {
    renderHook(() =>
      useReportEngagementTimers({ reportType: "locked", archetype: "Emotional Voyeur" })
    );

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(mockTrackReportEngagement).toHaveBeenCalledTimes(1);
    expect(mockTrackReportEngagement).toHaveBeenNthCalledWith(
      1,
      60,
      "locked",
      "Emotional Voyeur",
      0 // scrollDepthPct
    );

    act(() => {
      vi.advanceTimersByTime(240_000); // total 5 min
    });
    expect(mockTrackReportEngagement).toHaveBeenCalledTimes(2);
    expect(mockTrackReportEngagement).toHaveBeenNthCalledWith(
      2,
      300,
      "locked",
      "Emotional Voyeur",
      0 // scrollDepthPct
    );

    act(() => {
      vi.advanceTimersByTime(300_000); // total 10 min
    });
    expect(mockTrackReportEngagement).toHaveBeenCalledTimes(3);
    expect(mockTrackReportEngagement).toHaveBeenNthCalledWith(
      3,
      600,
      "locked",
      "Emotional Voyeur",
      0 // scrollDepthPct — tests above do not scroll, so the observed max is 0
    );
  });

  it("fires each milestone only once", () => {
    renderHook(() => useReportEngagementTimers({ reportType: "full_report", archetype: "Sage" }));

    act(() => {
      // Run for 12 minutes — past the 10min milestone, ensure no extra fires.
      vi.advanceTimersByTime(720_000);
    });

    expect(mockTrackReportEngagement).toHaveBeenCalledTimes(3);
  });

  it("pauses counting while document.visibilityState is hidden", () => {
    renderHook(() => useReportEngagementTimers({ reportType: "full_report", archetype: null }));

    // 30s visible
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(mockTrackReportEngagement).not.toHaveBeenCalled();

    // 5min hidden — should not count toward active time
    setVisibility("hidden");
    act(() => {
      vi.advanceTimersByTime(300_000);
    });
    expect(mockTrackReportEngagement).not.toHaveBeenCalled();

    // 30s more visible — total active = 60s, should fire 1min event
    setVisibility("visible");
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(mockTrackReportEngagement).toHaveBeenCalledTimes(1);
    expect(mockTrackReportEngagement).toHaveBeenCalledWith(
      60,
      "full_report",
      null,
      0 // scrollDepthPct — tests above do not scroll, so the observed max is 0
    );
  });

  it("includes scroll_depth_pct based on max scrollY observed", () => {
    setScrollGeometry({ scrollY: 0, innerHeight: 800, scrollHeight: 1600 });
    renderHook(() => useReportEngagementTimers({ reportType: "full_report", archetype: "Sage" }));

    // Simulate scroll halfway through (window.scrollY = 400 of 800 scrollable = 50%).
    setScrollGeometry({ scrollY: 400, innerHeight: 800, scrollHeight: 1600 });
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });

    // Scroll back up — max should be retained at 50.
    setScrollGeometry({ scrollY: 0, innerHeight: 800, scrollHeight: 1600 });
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(mockTrackReportEngagement).toHaveBeenCalledWith(60, "full_report", "Sage", 50);
  });

  it("clamps scroll_depth_pct to 100 even when scrollable height is 0", () => {
    setScrollGeometry({ scrollY: 0, innerHeight: 1000, scrollHeight: 800 });
    renderHook(() => useReportEngagementTimers({ reportType: "essentials", archetype: null }));

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(mockTrackReportEngagement).toHaveBeenCalledWith(60, "essentials", null, 100);
  });

  it("cleans up the interval on unmount so no events fire after", () => {
    const { unmount } = renderHook(() =>
      useReportEngagementTimers({ reportType: "full_report", archetype: null })
    );

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    unmount();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(mockTrackReportEngagement).not.toHaveBeenCalled();
  });
});
