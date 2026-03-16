// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { usePartialSave } from "../../../../components/survey/hooks/usePartialSave";

// Mock surveySession
vi.mock("../../../../components/survey/hooks/surveySession", () => ({
  getSessionId: vi.fn(() => "550e8400-e29b-41d4-a716-446655440000"),
}));

// Mock csrf-client
vi.mock("../../../../lib/csrf-client", () => ({
  getCsrfToken: vi.fn(() => "mock-csrf-token"),
}));

describe("usePartialSave", () => {
  const mockFetch = vi.fn().mockResolvedValue({ ok: true });
  const mockSendBeacon = vi.fn().mockReturnValue(true);

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    Object.defineProperty(navigator, "sendBeacon", {
      value: mockSendBeacon,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    cleanup();
    mockFetch.mockClear();
    mockSendBeacon.mockClear();
  });

  it("savePartial() calls fetch with correct payload", () => {
    const { result } = renderHook(() =>
      usePartialSave({ "00000": "alice@test.com" }, 1, "2026-01-01T00:00:00.000Z", null)
    );

    act(() => {
      result.current.savePartial();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/survey-partial",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-csrf-token": "mock-csrf-token",
        }),
      })
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.sessionId).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(body.answers).toEqual({ "00000": "alice@test.com" });
    expect(body.currentIndex).toBe(1);
  });

  it("savePartial() skips when no answers", () => {
    const { result } = renderHook(() => usePartialSave({}, 0, "2026-01-01T00:00:00.000Z", null));

    act(() => {
      result.current.savePartial();
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("sends beacon on visibilitychange to hidden", () => {
    renderHook(() =>
      usePartialSave({ "00000": "alice@test.com" }, 1, "2026-01-01T00:00:00.000Z", null)
    );

    // Simulate visibility change
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      writable: true,
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(mockSendBeacon).toHaveBeenCalledWith("/api/survey-partial", expect.any(Blob));
  });

  it("includes utmTracker when provided", () => {
    const utm = JSON.stringify({ utm_source: "google" });
    const { result } = renderHook(() =>
      usePartialSave({ "00000": "alice@test.com" }, 1, "2026-01-01T00:00:00.000Z", utm)
    );

    act(() => {
      result.current.savePartial();
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.utmTracker).toBe(utm);
  });
});
