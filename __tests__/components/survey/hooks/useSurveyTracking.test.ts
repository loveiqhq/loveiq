// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import type { SurveyQuestion } from "@/data/survey-data";

import { useSurveyTracking } from "@/components/survey/hooks/useSurveyTracking";

// --- Helpers ---

const SESSION_KEY = "loveiq-survey-session";

function makeQuestion(overrides: Partial<SurveyQuestion> = {}): SurveyQuestion {
  return {
    qId: "q1",
    cId: 1,
    chapter: "Chapter A",
    question: "Test question?",
    answerType: "single",
    options: ["Yes", "No"],
    required: true,
    guide: "",
    ...overrides,
  };
}

function mockSessionStorage() {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    store,
  };
}

// --- Tests ---

describe("useSurveyTracking", () => {
  let ss: ReturnType<typeof mockSessionStorage>;
  let mockFetch: ReturnType<typeof vi.fn>;
  let mockSendBeacon: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();

    // Mock sessionStorage
    ss = mockSessionStorage();
    Object.defineProperty(globalThis, "sessionStorage", {
      value: ss,
      writable: true,
      configurable: true,
    });

    // Mock crypto.randomUUID
    Object.defineProperty(globalThis, "crypto", {
      value: { randomUUID: vi.fn().mockReturnValue("test-uuid-1234") },
      writable: true,
      configurable: true,
    });

    // Mock performance.now
    vi.spyOn(globalThis.performance, "now").mockReturnValue(0);

    // Mock fetch
    mockFetch = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = mockFetch;

    // Mock sendBeacon
    mockSendBeacon = vi.fn().mockReturnValue(true);
    Object.defineProperty(globalThis.navigator, "sendBeacon", {
      value: mockSendBeacon,
      writable: true,
      configurable: true,
    });

    // Set CSRF cookie
    document.cookie = "__csrf=test-csrf-token; path=/";
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    // Reset visibilityState to default
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      writable: true,
      configurable: true,
    });
  });

  it("generates and stores a session ID in sessionStorage on mount", () => {
    renderHook(() => useSurveyTracking(0, false, makeQuestion()));

    expect(ss.setItem).toHaveBeenCalledWith(SESSION_KEY, "test-uuid-1234");
  });

  it("uses existing session ID from sessionStorage when present", () => {
    ss.store[SESSION_KEY] = "existing-session-id";
    ss.getItem.mockImplementation((key: string) => ss.store[key] ?? null);

    renderHook(() => useSurveyTracking(0, false, makeQuestion()));

    // Should not generate a new UUID since one already exists
    expect(crypto.randomUUID).not.toHaveBeenCalled();
    // setItem should not be called for the session key since it already exists
    const sessionSetCalls = ss.setItem.mock.calls.filter(([k]: [string]) => k === SESSION_KEY);
    expect(sessionSetCalls).toHaveLength(0);
  });

  it("trackNavigation queues an event in the buffer without flushing below threshold", async () => {
    const { result } = renderHook(() => useSurveyTracking(0, false, makeQuestion()));

    act(() => {
      result.current.trackNavigation("forward");
    });

    // Below FLUSH_SIZE (5), so fetch should not have been called yet
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("flushes when buffer reaches 5 events", async () => {
    const { result } = renderHook(() => useSurveyTracking(0, true, makeQuestion()));

    await act(async () => {
      result.current.trackNavigation("forward");
      result.current.trackNavigation("back");
      result.current.trackNavigation("forward");
      result.current.trackNavigation("back");
      result.current.trackNavigation("forward");
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/survey-tracking",
      expect.objectContaining({ method: "POST" })
    );

    const bodyStr = (mockFetch.mock.calls[0][1] as RequestInit).body as string;
    const body = JSON.parse(bodyStr);
    expect(body.events).toHaveLength(5);
  });

  it("flushes immediately on 'complete' direction", async () => {
    const { result } = renderHook(() => useSurveyTracking(0, true, makeQuestion()));

    await act(async () => {
      result.current.trackNavigation("complete");
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const bodyStr = (mockFetch.mock.calls[0][1] as RequestInit).body as string;
    const body = JSON.parse(bodyStr);
    expect(body.events[0].direction).toBe("complete");
  });

  it("flushes immediately on 'abandon' direction", async () => {
    const { result } = renderHook(() => useSurveyTracking(0, false, makeQuestion()));

    await act(async () => {
      result.current.trackNavigation("abandon");
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const bodyStr = (mockFetch.mock.calls[0][1] as RequestInit).body as string;
    const body = JSON.parse(bodyStr);
    expect(body.events[0].direction).toBe("abandon");
  });

  it("sends correct event shape including all required fields", async () => {
    const question = makeQuestion({ qId: "q42", chapter: "Relationships" });
    const { result } = renderHook(() => useSurveyTracking(7, true, question));

    await act(async () => {
      result.current.trackNavigation("complete");
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const bodyStr = (mockFetch.mock.calls[0][1] as RequestInit).body as string;
    const body = JSON.parse(bodyStr);
    const event = body.events[0];

    expect(event.sessionId).toBe("test-uuid-1234");
    expect(event.qId).toBe("q42");
    expect(event.chapter).toBe("Relationships");
    expect(event.questionIndex).toBe(7);
    expect(typeof event.timeSpentMs).toBe("number");
    expect(event.answered).toBe(true);
    expect(event.direction).toBe("complete");
    expect(typeof event.timestamp).toBe("string");
  });

  it("cleans up the interval timer on unmount", () => {
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");

    const { unmount } = renderHook(() => useSurveyTracking(0, false, makeQuestion()));

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it("flushes buffered events on the 15s periodic interval", async () => {
    const { result } = renderHook(() => useSurveyTracking(0, false, makeQuestion()));

    // Add some events (below flush threshold)
    act(() => {
      result.current.trackNavigation("forward");
      result.current.trackNavigation("back");
    });

    expect(mockFetch).not.toHaveBeenCalled();

    // Advance time by 15 seconds to trigger the interval
    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const bodyStr = (mockFetch.mock.calls[0][1] as RequestInit).body as string;
    const body = JSON.parse(bodyStr);
    expect(body.events).toHaveLength(2);
  });

  it("does not flush on interval when buffer is empty", async () => {
    renderHook(() => useSurveyTracking(0, false, makeQuestion()));

    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("uses sendBeacon on visibilitychange to hidden with abandon event", async () => {
    const question = makeQuestion({ qId: "qVis", chapter: "Chapter B" });
    renderHook(() => useSurveyTracking(2, false, question));

    // Trigger visibilitychange to hidden
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      writable: true,
      configurable: true,
    });

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(mockSendBeacon).toHaveBeenCalledTimes(1);
    expect(mockSendBeacon).toHaveBeenCalledWith("/api/survey-tracking", expect.any(Blob));

    // Verify the beacon blob contains an abandon event
    const beaconBlob: Blob = mockSendBeacon.mock.calls[0][1];
    const beaconText = await beaconBlob.text();
    const beaconBody = JSON.parse(beaconText);
    expect(beaconBody.events.at(-1).direction).toBe("abandon");
    expect(beaconBody.events.at(-1).qId).toBe("qVis");
  });

  it("does not call sendBeacon when visibilityState is visible", async () => {
    renderHook(() => useSurveyTracking(0, false, makeQuestion()));

    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      writable: true,
      configurable: true,
    });

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(mockSendBeacon).not.toHaveBeenCalled();
  });

  it("does not track when question is undefined", () => {
    const { result } = renderHook(() => useSurveyTracking(0, false, undefined));

    act(() => {
      result.current.trackNavigation("forward");
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("sends x-csrf-token header on flush", async () => {
    const { result } = renderHook(() => useSurveyTracking(0, false, makeQuestion()));

    await act(async () => {
      result.current.trackNavigation("complete");
    });

    const callHeaders = (mockFetch.mock.calls[0][1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(callHeaders["x-csrf-token"]).toBeTruthy();
  });
});
