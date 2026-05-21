// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// --- Mocks (must be before imports) ---

vi.mock("@/data/survey-data", () => ({
  surveyQuestions: [
    { qId: "q1", chapter: "Chapter A" },
    { qId: "q2", chapter: "Chapter A" },
    { qId: "q3", chapter: "Chapter B" },
  ],
}));

import { useSurveyState } from "@features/survey/ui/hooks/useSurveyState";

// --- localStorage helpers ---

function mockLocalStorage() {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach((k) => delete store[k]);
    }),
    store,
  };
}

const STORAGE_KEY = "loveiq-survey-answers";
const INDEX_KEY = "loveiq-survey-index";

// --- Tests ---

describe("useSurveyState", () => {
  let ls: ReturnType<typeof mockLocalStorage>;

  beforeEach(() => {
    ls = mockLocalStorage();
    Object.defineProperty(globalThis, "localStorage", {
      value: ls,
      writable: true,
      configurable: true,
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("initial state has empty answers, currentIndex 0, progress 0", () => {
    const { result } = renderHook(() => useSurveyState());

    expect(result.current.answers).toEqual({});
    expect(result.current.currentIndex).toBe(0);
    expect(result.current.progress).toBe(0);
  });

  it("startedAt is a valid ISO string on init", () => {
    const { result } = renderHook(() => useSurveyState());
    expect(() => new Date(result.current.startedAt)).not.toThrow();
    expect(result.current.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("setAnswer stores answer and persists to localStorage", () => {
    const { result } = renderHook(() => useSurveyState());

    act(() => {
      result.current.setAnswer("q1", "yes");
    });

    expect(result.current.answers["q1"]).toBe("yes");
    expect(ls.setItem).toHaveBeenCalledWith(STORAGE_KEY, expect.stringContaining('"q1"'));
  });

  it("getAnswer returns stored value", () => {
    const { result } = renderHook(() => useSurveyState());

    act(() => {
      result.current.setAnswer("q2", 42);
    });

    expect(result.current.getAnswer("q2")).toBe(42);
  });

  it("getAnswer returns null for non-existent key", () => {
    const { result } = renderHook(() => useSurveyState());
    expect(result.current.getAnswer("nonexistent")).toBeNull();
  });

  it("progress counts answered questions and excludes _other keys", () => {
    const { result } = renderHook(() => useSurveyState());

    act(() => {
      result.current.setAnswer("q1", "yes");
      result.current.setAnswer("q1_other", "some text"); // should not count
      result.current.setAnswer("q2", "no");
    });

    // 2 answered out of 3 total questions = 67%
    expect(result.current.progress).toBe(67);
  });

  it("progress is 100 when all questions answered", () => {
    const { result } = renderHook(() => useSurveyState());

    act(() => {
      result.current.setAnswer("q1", "a");
      result.current.setAnswer("q2", "b");
      result.current.setAnswer("q3", "c");
    });

    expect(result.current.progress).toBe(100);
  });

  it("clearState resets to empty and removes localStorage entries", () => {
    const { result } = renderHook(() => useSurveyState());

    act(() => {
      result.current.setAnswer("q1", "yes");
      result.current.setCurrentIndex(2);
    });

    act(() => {
      result.current.clearState();
    });

    expect(result.current.answers).toEqual({});
    expect(result.current.currentIndex).toBe(0);
    expect(ls.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
    expect(ls.removeItem).toHaveBeenCalledWith(INDEX_KEY);
  });

  it("setCurrentIndex updates currentIndex and persists to localStorage", () => {
    const { result } = renderHook(() => useSurveyState());

    act(() => {
      result.current.setCurrentIndex(5);
    });

    expect(result.current.currentIndex).toBe(5);
    expect(ls.setItem).toHaveBeenCalledWith(
      STORAGE_KEY,
      expect.stringContaining('"currentIndex":5')
    );
  });

  it("loads persisted answers and index from localStorage on init", () => {
    const persisted = {
      answers: { q1: "hello", q2: "world" },
      currentIndex: 3,
      startedAt: "2024-01-01T10:00:00.000Z",
    };
    ls.store[STORAGE_KEY] = JSON.stringify(persisted);

    const { result } = renderHook(() => useSurveyState());

    expect(result.current.answers).toEqual({ q1: "hello", q2: "world" });
    expect(result.current.currentIndex).toBe(3);
    expect(result.current.startedAt).toBe("2024-01-01T10:00:00.000Z");
  });

  it("handles corrupted localStorage data gracefully by returning defaults", () => {
    ls.store[STORAGE_KEY] = "not-valid-json{{{{";

    const { result } = renderHook(() => useSurveyState());

    expect(result.current.answers).toEqual({});
    expect(result.current.currentIndex).toBe(0);
    expect(result.current.progress).toBe(0);
  });

  it("handles missing answers field in persisted data gracefully", () => {
    ls.store[STORAGE_KEY] = JSON.stringify({ startedAt: "2024-01-01T00:00:00.000Z" });

    const { result } = renderHook(() => useSurveyState());

    expect(result.current.answers).toEqual({});
    expect(result.current.currentIndex).toBe(0);
  });

  it("setAnswer with array value stores correctly", () => {
    const { result } = renderHook(() => useSurveyState());

    act(() => {
      result.current.setAnswer("q3", ["opt1", "opt2"]);
    });

    expect(result.current.getAnswer("q3")).toEqual(["opt1", "opt2"]);
  });
});
