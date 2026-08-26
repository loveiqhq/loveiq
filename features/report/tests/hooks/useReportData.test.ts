// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useReportData } from "@features/report/ui/hooks/useReportData";
import { REPORT_SESSION_KEY, SURVEY_SESSION_KEY } from "@features/survey/ui/hooks/surveySession";

describe("useReportData", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    document.cookie = "__csrf=test-csrf-token; path=/";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("forwards the staging preview_archetype from the page URL to the API", async () => {
    // The parameter lives on the report PAGE url; the hook has to copy it onto the
    // API call or the override silently does nothing. The API ignores it on
    // production, so forwarding it unconditionally is safe.
    window.history.replaceState({}, "", "/report/rpt_x?preview_archetype=Spark%20Seeker");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ primaryArchetype: "Spark Seeker", percentages: {} }),
    });
    globalThis.fetch = mockFetch;

    renderHook(() => useReportData({ token: "rpt_x", sessionId: null }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
    const requested = String(mockFetch.mock.calls[0]?.[0]);
    expect(requested).toContain("preview_archetype=Spark+Seeker");
    window.history.replaceState({}, "", "/");
  });

  it("sends no preview_archetype when the page url has none", async () => {
    window.history.replaceState({}, "", "/report/rpt_x");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ primaryArchetype: "Spark Seeker", percentages: {} }),
    });
    globalThis.fetch = mockFetch;

    renderHook(() => useReportData({ token: "rpt_x", sessionId: null }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
    expect(String(mockFetch.mock.calls[0]?.[0])).not.toContain("preview_archetype");
  });

  it("returns a missing status when no report session id exists", () => {
    const { result } = renderHook(() => useReportData({ sessionId: null }));

    expect(result.current).toMatchObject({
      data: null,
      status: "missing",
      error: null,
      challenge: null,
    });
    expect(typeof result.current.retry).toBe("function");
  });

  it("returns report data on a successful fetch", async () => {
    sessionStorage.setItem(SURVEY_SESSION_KEY, "02d88f31-eceb-4402-940d-c8cd98d01848");
    localStorage.setItem(REPORT_SESSION_KEY, "stale-report-session");
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("pricing-session-123");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        accessPlan: null,
        userName: "Eman",
        userEmail: "eman@example.com",
        primaryArchetype: "Emotional Voyeur",
        percentages: { "Emotional Voyeur": 63 },
        reportDate: "2026-04-07T22:23:16.851299+00:00",
        diagnostics: null,
        snapshotAnswers: {
          currentSexualSatisfaction: 3,
          importanceOfSex: 5,
        },
        pricingQuotes: null,
      }),
    });
    globalThis.fetch = mockFetch;

    const { result } = renderHook(() =>
      useReportData({ sessionId: "02d88f31-eceb-4402-940d-c8cd98d01848" })
    );

    await waitFor(() => {
      expect(result.current.status).toBe("success");
    });

    expect(result.current.data?.primaryArchetype).toBe("Emotional Voyeur");
    expect(result.current.data?.userEmail).toBe("eman@example.com");
    expect(result.current.data?.snapshotAnswers).toEqual({
      currentSexualSatisfaction: 3,
      importanceOfSex: 5,
    });
    expect(result.current.error).toBeNull();
    expect(localStorage.getItem(REPORT_SESSION_KEY)).toBe("02d88f31-eceb-4402-940d-c8cd98d01848");
    expect(sessionStorage.getItem(SURVEY_SESSION_KEY)).toBeNull();
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/report?sessionId=02d88f31-eceb-4402-940d-c8cd98d01848&pricingSessionId=pricing-session-123",
      expect.objectContaining({
        headers: expect.objectContaining({ "x-csrf-token": "test-csrf-token" }),
      })
    );
  });

  it("captures the API status code and message on failure", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "Unable to process request." }),
    });

    const { result } = renderHook(() =>
      useReportData({ sessionId: "02d88f31-eceb-4402-940d-c8cd98d01848" })
    );

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });

    expect(result.current.error).toEqual({
      statusCode: 500,
      message: "Unable to process request.",
    });
  });
});
