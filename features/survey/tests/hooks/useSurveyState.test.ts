// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useSurveyState } from "@features/survey/ui/hooks/useSurveyState";
import { QUESTION_ORDER_TEST_END, questionOrderArmAt } from "@shared/experiments/questionOrderArm";

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

  it("initial state has empty answers and currentIndex 0", () => {
    const { result } = renderHook(() => useSurveyState());

    expect(result.current.answers).toEqual({});
    expect(result.current.currentIndex).toBe(0);
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

  describe("C13 arm", () => {
    // Hashes to the variant (e2e/surveyArm.ts), so "control" below can only come from
    // the draft rule, never from the coin.
    const VARIANT_ID = "00000000-0000-4000-8000-000000000001";
    // Hashes to control (e2e/surveyArm.ts), so "variant" can only come from the test's end.
    const CONTROL_ID = "00000000-0000-4000-8000-000000000007";
    const lastPersisted = () => {
      const writes = ls.setItem.mock.calls.filter(([key]) => key === STORAGE_KEY);
      return JSON.parse(writes.at(-1)![1] as string) as Record<string, unknown>;
    };

    beforeEach(() => {
      sessionStorage.setItem("loveiq-survey-session", VARIANT_ID);
    });

    afterEach(() => {
      sessionStorage.clear();
    });

    it("keeps a draft saved before C13 in the control order, and records that", () => {
      ls.store[STORAGE_KEY] = JSON.stringify({
        answers: { "00001": "x" },
        currentIndex: 12,
        startedAt: "2026-10-01T10:00:00.000Z",
        prefilled: [],
      });
      const { result } = renderHook(() => useSurveyState());
      expect(result.current.orderArm).toBe("control");
      expect(lastPersisted().orderArm).toBe("control");
    });

    it("asks a fresh run the new order whatever its session drew, and records that", () => {
      // A session that drew control, so "variant" can only come from the test's end.
      sessionStorage.setItem("loveiq-survey-session", CONTROL_ID);
      const { result } = renderHook(() => useSurveyState());
      expect(result.current.orderArm).toBe("variant");
      expect(lastPersisted().orderArm).toBe("variant");
    });

    /**
     * What the server will stamp (questionOrderArmAt over the session id and the run's start)
     * must be the order the run is asked, or the stamp says one order and the reader saw the
     * other. The server reads the same session id and the `startedAt` this state submits.
     */
    const stampOf = (sessionId: string, startedAt: string) =>
      questionOrderArmAt(sessionId, Date.parse(startedAt));
    const BEFORE_END = new Date(Date.parse(QUESTION_ORDER_TEST_END) - 3 * 86_400_000).toISOString();

    it("begins a landing card's run, answered before the test ended, when the survey opens", () => {
      sessionStorage.setItem("loveiq-survey-session", CONTROL_ID);
      ls.store[STORAGE_KEY] = JSON.stringify({
        answers: { "01002": 3 },
        currentIndex: 0,
        startedAt: BEFORE_END,
        prefilled: ["01002"],
      });
      const { result } = renderHook(() => useSurveyState());
      expect(result.current.orderArm).toBe("variant");
      expect(Date.parse(result.current.startedAt)).toBeGreaterThanOrEqual(
        Date.parse(QUESTION_ORDER_TEST_END)
      );
      expect(stampOf(CONTROL_ID, result.current.startedAt)).toBe(result.current.orderArm);
      expect(lastPersisted().startedAt).toBe(result.current.startedAt);
      // The landing card's answer stays, and stays out of the flow.
      expect(result.current.answers).toEqual({ "01002": 3 });
      expect(result.current.prefilled).toEqual(["01002"]);
    });

    it("keeps the start of a run begun during the test, so its stamp is the arm it recorded", () => {
      sessionStorage.setItem("loveiq-survey-session", CONTROL_ID);
      ls.store[STORAGE_KEY] = JSON.stringify({
        answers: {},
        currentIndex: 0,
        startedAt: BEFORE_END,
        prefilled: [],
        orderArm: "control",
      });
      const { result } = renderHook(() => useSurveyState());
      expect(result.current.orderArm).toBe("control");
      expect(result.current.startedAt).toBe(BEFORE_END);
      expect(stampOf(CONTROL_ID, result.current.startedAt)).toBe(result.current.orderArm);
    });

    it("reopens a draft in the arm it recorded", () => {
      ls.store[STORAGE_KEY] = JSON.stringify({
        answers: { "00001": "x" },
        currentIndex: 12,
        startedAt: "2026-10-07T10:00:00.000Z",
        prefilled: [],
        orderArm: "variant",
      });
      const { result } = renderHook(() => useSurveyState());
      expect(result.current.orderArm).toBe("variant");
    });
  });
});
