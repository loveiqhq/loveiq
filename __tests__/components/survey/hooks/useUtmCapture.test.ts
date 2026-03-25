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

  it("returns stored UTM data from global key", () => {
    const data = JSON.stringify({ utm_source: "google", utm_medium: "cpc" });
    store["loveiq-utm"] = data;
    vi.resetModules();

    const { result } = renderHook(() => useUtmCapture());
    expect(result.current).toBe(data);
  });

  it("falls back to legacy key when global key is absent", () => {
    const data = JSON.stringify({ utm_source: "newsletter" });
    store["loveiq-survey-utm"] = data;
    vi.resetModules();

    const { result } = renderHook(() => useUtmCapture());
    expect(result.current).toBe(data);
  });

  it("returns null when nothing is stored", () => {
    vi.resetModules();

    const { result } = renderHook(() => useUtmCapture());
    expect(result.current).toBeNull();
  });

  it("prefers global key over legacy key", () => {
    store["loveiq-utm"] = JSON.stringify({ utm_source: "new" });
    store["loveiq-survey-utm"] = JSON.stringify({ utm_source: "old" });
    vi.resetModules();

    const { result } = renderHook(() => useUtmCapture());
    const parsed = JSON.parse(result.current!);
    expect(parsed.utm_source).toBe("new");
  });

  it("exports UTM_STORAGE_KEY for backward compatibility", async () => {
    const mod = await import("../../../../components/survey/hooks/useUtmCapture");
    expect(mod.UTM_STORAGE_KEY).toBe("loveiq-survey-utm");
  });
});
