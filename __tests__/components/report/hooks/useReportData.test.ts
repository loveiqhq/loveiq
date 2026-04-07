// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useReportData } from "@/components/report/hooks/useReportData";

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

  it("returns a missing status when no report session id exists", () => {
    const { result } = renderHook(() => useReportData(null));

    expect(result.current).toEqual({
      data: null,
      status: "missing",
      error: null,
    });
  });

  it("returns report data on a successful fetch", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        userName: "Eman",
        primaryArchetype: "Emotional Voyeur",
        percentages: { "Emotional Voyeur": 63 },
        reportDate: "2026-04-07T22:23:16.851299+00:00",
        diagnostics: null,
      }),
    });
    globalThis.fetch = mockFetch;

    const { result } = renderHook(() => useReportData("02d88f31-eceb-4402-940d-c8cd98d01848"));

    await waitFor(() => {
      expect(result.current.status).toBe("success");
    });

    expect(result.current.data?.primaryArchetype).toBe("Emotional Voyeur");
    expect(result.current.error).toBeNull();
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/report?sessionId=02d88f31-eceb-4402-940d-c8cd98d01848",
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

    const { result } = renderHook(() => useReportData("02d88f31-eceb-4402-940d-c8cd98d01848"));

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });

    expect(result.current.error).toEqual({
      statusCode: 500,
      message: "Unable to process request.",
    });
  });
});
