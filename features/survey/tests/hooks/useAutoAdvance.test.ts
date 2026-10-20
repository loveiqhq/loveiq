// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useAutoAdvance } from "@features/survey/ui/hooks/useAutoAdvance";

describe("useAutoAdvance", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to disabled when no persisted preference exists", () => {
    const { result } = renderHook(() => useAutoAdvance());

    expect(result.current.autoAdvance).toBe(false);
  });

  it("restores the persisted preference from local storage", () => {
    localStorage.setItem("loveiq-survey-autoadvance", "true");

    const { result } = renderHook(() => useAutoAdvance());

    expect(result.current.autoAdvance).toBe(true);
  });

  it("toggles and persists the preference", () => {
    const { result } = renderHook(() => useAutoAdvance());

    act(() => {
      result.current.toggleAutoAdvance();
    });

    expect(result.current.autoAdvance).toBe(true);
    expect(localStorage.getItem("loveiq-survey-autoadvance")).toBe("true");

    act(() => {
      result.current.toggleAutoAdvance();
    });

    expect(result.current.autoAdvance).toBe(false);
    expect(localStorage.getItem("loveiq-survey-autoadvance")).toBe("false");
  });
});
