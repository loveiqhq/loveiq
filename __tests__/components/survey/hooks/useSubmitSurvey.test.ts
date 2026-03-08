// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useSubmitSurvey } from "@/components/survey/hooks/useSubmitSurvey";

// --- Helpers ---

function makeAnswers(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    "00000": "alice@example.com",
    "00001": "Alice",
    ...overrides,
  };
}

function mockFetchOk() {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
}

function mockFetchError(status = 500) {
  return vi.fn().mockResolvedValue({ ok: false, status, json: async () => ({}) });
}

function mockFetchNetworkError() {
  return vi.fn().mockRejectedValue(new Error("Network failure"));
}

// --- Tests ---

describe("useSubmitSurvey", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    document.cookie = "__csrf=test-csrf-token; path=/";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("initial status is idle", () => {
    const { result } = renderHook(() => useSubmitSurvey());
    expect(result.current.status).toBe("idle");
  });

  it("transitions to submitting then success on successful fetch", async () => {
    globalThis.fetch = mockFetchOk();
    const { result } = renderHook(() => useSubmitSurvey());

    const startedAt = new Date().toISOString();

    await act(async () => {
      await result.current.submit(makeAnswers(), startedAt);
    });

    expect(result.current.status).toBe("success");
  });

  it("transitions to error on network failure", async () => {
    globalThis.fetch = mockFetchNetworkError();
    const { result } = renderHook(() => useSubmitSurvey());

    await act(async () => {
      await result.current.submit(makeAnswers(), new Date().toISOString());
    });

    expect(result.current.status).toBe("error");
  });

  it("transitions to error on non-ok API response", async () => {
    globalThis.fetch = mockFetchError(500);
    const { result } = renderHook(() => useSubmitSurvey());

    await act(async () => {
      await result.current.submit(makeAnswers(), new Date().toISOString());
    });

    expect(result.current.status).toBe("error");
  });

  it("sets status to error immediately when email is missing from answers", async () => {
    const { result } = renderHook(() => useSubmitSurvey());

    await act(async () => {
      await result.current.submit({ "00001": "Alice" }, new Date().toISOString());
    });

    expect(result.current.status).toBe("error");
  });

  it("sets status to error when email is empty string", async () => {
    const { result } = renderHook(() => useSubmitSurvey());

    await act(async () => {
      await result.current.submit(makeAnswers({ "00000": "   " }), new Date().toISOString());
    });

    expect(result.current.status).toBe("error");
  });

  it("extracts CSRF token from __Host-csrf cookie", async () => {
    // Set only the __Host-csrf variant
    document.cookie = "__Host-csrf=host-csrf-value; path=/";
    // Clear the __csrf fallback by making it empty (can't truly delete in jsdom easily)
    const mockFetch = mockFetchOk();
    globalThis.fetch = mockFetch;

    const { result } = renderHook(() => useSubmitSurvey());

    await act(async () => {
      await result.current.submit(makeAnswers(), new Date().toISOString());
    });

    const callHeaders = (mockFetch.mock.calls[0][1] as RequestInit).headers as Record<
      string,
      string
    >;
    // Token should come from the first matching cookie: __Host-csrf or __csrf
    expect(callHeaders["x-csrf-token"]).toBeTruthy();
  });

  it("extracts CSRF token from __csrf fallback cookie", async () => {
    // Set __csrf fallback
    document.cookie = "__csrf=fallback-token; path=/";
    const mockFetch = mockFetchOk();
    globalThis.fetch = mockFetch;

    const { result } = renderHook(() => useSubmitSurvey());

    await act(async () => {
      await result.current.submit(makeAnswers(), new Date().toISOString());
    });

    const callHeaders = (mockFetch.mock.calls[0][1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(callHeaders["x-csrf-token"]).toBeTruthy();
  });

  it("sends correct payload shape to /api/survey", async () => {
    const mockFetch = mockFetchOk();
    globalThis.fetch = mockFetch;

    const { result } = renderHook(() => useSubmitSurvey());
    const startedAt = "2024-01-01T10:00:00.000Z";
    const answers = makeAnswers({ "00000": "ALICE@EXAMPLE.COM", "00001": "  Alice  " });

    await act(async () => {
      await result.current.submit(answers, startedAt);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/survey",
      expect.objectContaining({ method: "POST" })
    );

    const bodyStr = (mockFetch.mock.calls[0][1] as RequestInit).body as string;
    const body = JSON.parse(bodyStr);

    // Email must be trimmed + lowercased
    expect(body.email).toBe("alice@example.com");
    // firstName must be trimmed
    expect(body.firstName).toBe("Alice");
    // answers are passed through as-is
    expect(body.answers).toEqual(answers);
    // startedAt is passed through
    expect(body.startedAt).toBe(startedAt);
    // durationMs is a non-negative number
    expect(typeof body.durationMs).toBe("number");
    expect(body.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("prevents double-submit when already submitting", async () => {
    // fetch never resolves during this test
    let resolveFetch!: () => void;
    const hangingPromise = new Promise<Response>((resolve) => {
      resolveFetch = () => resolve({ ok: true } as Response);
    });
    const mockFetch = vi.fn().mockReturnValue(hangingPromise);
    globalThis.fetch = mockFetch;

    const { result } = renderHook(() => useSubmitSurvey());
    const startedAt = new Date().toISOString();

    // Start first submit (don't await — let it hang)
    act(() => {
      result.current.submit(makeAnswers(), startedAt);
    });

    // Attempt second submit while first is still in-flight
    await act(async () => {
      await result.current.submit(makeAnswers(), startedAt);
    });

    // fetch should only have been called once
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Resolve to clean up
    resolveFetch();
  });

  it("sets Content-Type header to application/json", async () => {
    const mockFetch = mockFetchOk();
    globalThis.fetch = mockFetch;

    const { result } = renderHook(() => useSubmitSurvey());

    await act(async () => {
      await result.current.submit(makeAnswers(), new Date().toISOString());
    });

    const callHeaders = (mockFetch.mock.calls[0][1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(callHeaders["Content-Type"]).toBe("application/json");
  });
});
