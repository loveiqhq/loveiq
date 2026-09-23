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

  describe("preview mode", () => {
    /**
     * `?preview=1` is what makes the report openable on a machine with no
     * Supabase credentials — staging got its own database on 2026-09-21, so a
     * developer laptop has none. Checking a layout at 360px needs the page, not
     * anyone's real answers.
     */
    it("asks the preview endpoint, and needs no session or token to do it", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ primaryArchetype: "Spark Seeker", percentages: {} }),
      });
      globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

      const { result } = renderHook(() =>
        useReportData({
          sessionId: null,
          token: null,
          preview: true,
          previewPlan: "full_report",
          archetypeSlug: "spark-seeker",
        })
      );

      await waitFor(() => expect(result.current.status).toBe("success"));

      const url = String(mockFetch.mock.calls[0]?.[0] ?? "");
      expect(url).toContain("/api/report/preview");
      expect(url).toContain("archetype=spark-seeker");
      expect(url).toContain("plan=full_report");
      // The real endpoint must not be touched: it would 404 without an identifier
      // anyway, and the point is that nothing about the live path changes.
      expect(url).not.toContain("/api/report?");
    });

    it("leaves the real endpoint alone when preview is off", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ primaryArchetype: "Emotional Voyeur", percentages: {} }),
      });
      globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

      const { result } = renderHook(() => useReportData({ token: "rpt_abcdefghij0123456789" }));

      await waitFor(() => expect(result.current.status).toBe("success"));
      const url = String(mockFetch.mock.calls[0]?.[0] ?? "");
      expect(url).toContain("/api/report?");
      expect(url).not.toContain("/preview");
    });
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
