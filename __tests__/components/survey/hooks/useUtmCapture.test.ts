// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useUtmCapture } from "../../../../components/survey/hooks/useUtmCapture";

describe("useUtmCapture", () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
    });
  });

  function setUrl(search: string) {
    // jsdom doesn't allow redefining window.location directly,
    // but we can use delete + defineProperty pattern
    Object.defineProperty(window, "location", {
      value: { search, href: `http://localhost${search}` },
      writable: true,
      configurable: true,
    });
  }

  it("extracts UTM params from URL and stores in localStorage", () => {
    setUrl("?utm_source=google&utm_medium=cpc&utm_campaign=spring");

    // Must reset module cache since useState captures initial value
    vi.resetModules();

    const { result } = renderHook(() => useUtmCapture());

    const parsed = JSON.parse(result.current!);
    expect(parsed).toEqual({
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "spring",
    });
    expect(localStorage.setItem).toHaveBeenCalledWith("loveiq-survey-utm", expect.any(String));
  });

  it("returns null when no UTM params in URL and nothing in localStorage", () => {
    setUrl("");
    vi.resetModules();

    const { result } = renderHook(() => useUtmCapture());
    expect(result.current).toBeNull();
  });

  it("reads from localStorage when URL has no UTM params", () => {
    const stored = JSON.stringify({ utm_source: "newsletter" });
    store["loveiq-survey-utm"] = stored;
    setUrl("");
    vi.resetModules();

    const { result } = renderHook(() => useUtmCapture());
    expect(result.current).toBe(stored);
  });

  it("overwrites localStorage when URL has new UTM params", () => {
    store["loveiq-survey-utm"] = JSON.stringify({ utm_source: "old" });
    setUrl("?utm_source=new");
    vi.resetModules();

    const { result } = renderHook(() => useUtmCapture());
    const parsed = JSON.parse(result.current!);
    expect(parsed.utm_source).toBe("new");
  });

  it("only captures recognized UTM params", () => {
    setUrl("?utm_source=google&not_utm=ignored&utm_content=banner");
    vi.resetModules();

    const { result } = renderHook(() => useUtmCapture());

    const parsed = JSON.parse(result.current!);
    expect(parsed).toEqual({
      utm_source: "google",
      utm_content: "banner",
    });
    expect(parsed.not_utm).toBeUndefined();
  });
});
