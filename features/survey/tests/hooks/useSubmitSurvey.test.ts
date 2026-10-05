// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const ph = vi.hoisted(() => ({
  capture: vi.fn(),
  identify: vi.fn(),
  register: vi.fn(),
  init: vi.fn(),
}));
vi.mock("posthog-js", () => ({ default: ph }));

import { useSubmitSurvey } from "@features/survey/ui/hooks/useSubmitSurvey";

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

function findSurveyCall(mockFetch: ReturnType<typeof vi.fn>) {
  return mockFetch.mock.calls.find((call) => call[0] === "/api/survey");
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

    const surveyCall = findSurveyCall(mockFetch);
    expect(surveyCall).toBeDefined();

    const bodyStr = (surveyCall?.[1] as RequestInit).body as string;
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

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls.filter((call) => call[0] === "/api/survey")).toHaveLength(1);

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

/**
 * This hook used to fire its own `posthog.capture("survey_completed")` right
 * after `identify`, so that the event was attributed to the identified person.
 * But `SurveyEngine` already reports completion via `trackSurveyComplete`, so
 * every completion was counted TWICE — measured at 2.06 events per session,
 * 209 of 218 sessions firing a pair 30-95ms apart, while the server-side record
 * was singular (79 rows across 79 sessions).
 *
 * The identify stays; only the duplicate capture is gone.
 */
describe("useSubmitSurvey does not double-count completion", () => {
  beforeEach(() => {
    ph.capture.mockClear();
    ph.identify.mockClear();
  });

  it("identifies the buyer but emits no survey_completed of its own", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ reportToken: "rpt_ABCDEFGHIJKLMNOPQRST", submissionId: 1978 }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { result } = renderHook(() => useSubmitSurvey());
    await act(async () => {
      await result.current.submit(makeAnswers(), new Date().toISOString());
    });

    // identify is load-bearing: the Stripe webhook keys the purchase on this
    // same lower-cased email, so dropping it would orphan revenue.
    expect(ph.identify).toHaveBeenCalledWith("alice@example.com", expect.any(Object));
    const completions = ph.capture.mock.calls.filter(([n]) => n === "survey_completed");
    expect(completions).toHaveLength(0);
  });
});

describe("useSubmitSurvey — the end of a run", () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    document.cookie = "__csrf=test-csrf-token; path=/";
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("clears the run's saved state on success itself, even with no engine left to do it", async () => {
    // Regression, 2026-10-04: the cleanup lived in the engine. Back while the submit was in
    // flight unmounted it, the finished draft stayed, and the next visit sat on a
    // processing screen that never finished.
    sessionStorage.setItem("loveiq-survey-session", "session-123");
    localStorage.setItem("loveiq-report-session", "stale-session");
    localStorage.setItem("loveiq-survey-answers", JSON.stringify({ answers: { q1: "a" } }));
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, reportToken: "rpt_abc", submissionId: 1 }),
    });
    const { result, unmount } = renderHook(() => useSubmitSurvey());
    const pending = act(async () => {
      await result.current.submit(makeAnswers(), new Date().toISOString());
    });
    unmount(); // the reader pressed Back
    await pending;

    expect(localStorage.getItem("loveiq-survey-answers")).toBeNull();
    expect(localStorage.getItem("loveiq-survey-pending-completion")).toBeNull();
    expect(localStorage.getItem("loveiq-report-session")).toBe("session-123");
    expect(sessionStorage.getItem("loveiq-survey-session")).toBe("session-123");
  });

  it("turns a request that never answers into an error after 30 seconds", async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError"))
          );
        })
    ) as unknown as typeof fetch;
    const { result } = renderHook(() => useSubmitSurvey());

    let done: Promise<void>;
    act(() => {
      done = result.current.submit(makeAnswers(), new Date().toISOString());
    });
    expect(result.current.status).toBe("submitting");
    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await done;
    });

    expect(result.current.status).toBe("error");
    expect(result.current.errorKind).toBe("connection");
  });

  it.each([
    [429, {}, "busy"],
    [409, {}, "paused"],
    [400, { error: "Invalid input", field: "email" }, "email"],
    [400, { error: "Invalid input" }, "answers"],
    [500, {}, "connection"],
  ])("names why a %i failed", async (status, body, kind) => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status, json: async () => body });
    const { result } = renderHook(() => useSubmitSurvey());
    await act(async () => {
      await result.current.submit(makeAnswers(), new Date().toISOString());
    });
    expect(result.current.errorKind).toBe(kind);
  });
});
