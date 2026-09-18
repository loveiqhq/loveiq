// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, act } from "@testing-library/react";

const mockTrackReportEngagement = vi.fn();
vi.mock("@features/analytics/client", () => ({
  trackReportEngagement: (...args: unknown[]) => mockTrackReportEngagement(...args),
}));

vi.mock("@shared/http/csrf-client", () => ({
  getCsrfToken: () => "csrf-from-cookie",
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

/**
 * The beacon that finally closes `report_session`.
 *
 * `ended_at` had never been written — 0 of 11,230 rows — so the measured time on
 * the report stopped at the last thing the reader happened to click, and two
 * /admin cards rendered blank. This is the only thing that records the moment
 * they actually left.
 */
describe("useReportEngagementTimers — session close beacon", () => {
  let sent: Array<{ url: string; body: string }>;

  beforeEach(() => {
    // This suite has no global auto-cleanup, so hooks mounted by the describe
    // above are still listening — without this, one `hidden` fires seven
    // beacons and the throttle looks broken when it is not.
    cleanup();
    vi.useFakeTimers();
    setVisibility("visible");
    setScrollGeometry({ scrollY: 0, innerHeight: 800, scrollHeight: 1600 });
    sent = [];
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: (url: string, blob: Blob) => {
        // jsdom's Blob.text() is async; read the buffered text synchronously
        // through the constructor argument instead.
        sent.push({ url, body: (blob as Blob & { __text?: string }).__text ?? "" });
        return true;
      },
    });
    // Capture the payload at construction — Blob.text() cannot be awaited inside
    // a synchronous unload handler, and that is the whole point of a beacon.
    const RealBlob = globalThis.Blob;
    vi.stubGlobal(
      "Blob",
      class extends RealBlob {
        __text: string;
        constructor(parts: BlobPart[], options?: BlobPropertyBag) {
          super(parts, options);
          this.__text = parts.map(String).join("");
        }
      }
    );
    window.__loveiqReportSubmissionId = 2113;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete window.__loveiqReportSubmissionId;
  });

  const mount = () =>
    renderHook(() => useReportEngagementTimers({ reportType: "full_report", archetype: null }));

  const hide = () => {
    setVisibility("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
  };

  it("posts the submission and a CSRF token when the tab is hidden", () => {
    mount();
    hide();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe("/api/report-session-end");
    expect(JSON.parse(sent[0]!.body)).toEqual({
      submission_id: 2113,
      _csrf: "csrf-from-cookie",
    });
  });

  /**
   * `pagehide` is deliberately NOT guarded on visibilityState. On a real unload
   * it can fire while the document still reads "visible", so guarding it the way
   * the visibility handler is guarded would drop the one case that matters most:
   * the reader closing the tab.
   */
  it("still fires on pagehide while the document reads visible", () => {
    mount();
    setVisibility("visible");
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(sent).toHaveLength(1);
  });

  it("throttles a reader who alt-tabs repeatedly", () => {
    mount();
    hide();
    setVisibility("visible");
    hide();
    hide();
    expect(sent).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(5_001);
    });
    hide();
    expect(sent).toHaveLength(2);
  });

  it("sends nothing when there is no submission context", () => {
    delete window.__loveiqReportSubmissionId;
    mount();
    hide();
    expect(sent).toHaveLength(0);
  });

  it("sends nothing before the report has loaded", () => {
    renderHook(() => useReportEngagementTimers({ reportType: null, archetype: null }));
    hide();
    expect(sent).toHaveLength(0);
  });

  it("stops listening once the page unmounts", () => {
    const { unmount } = mount();
    unmount();
    hide();
    expect(sent).toHaveLength(0);
  });
});
