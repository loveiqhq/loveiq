// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { captureUtmFromUrl, getStoredUtm, GLOBAL_UTM_KEY, LEGACY_UTM_KEY } from "@shared/url/utm";

describe("lib/utm", () => {
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
    Object.defineProperty(window, "location", {
      value: { search, href: `http://localhost${search}` },
      writable: true,
      configurable: true,
    });
  }

  describe("captureUtmFromUrl", () => {
    it("captures UTM params from URL and stores in localStorage", () => {
      setUrl("?utm_source=facebook&utm_medium=paid&utm_campaign=loveiq_core_test1");

      const result = captureUtmFromUrl();

      const parsed = JSON.parse(result!);
      expect(parsed).toEqual({
        utm_source: "facebook",
        utm_medium: "paid",
        utm_campaign: "loveiq_core_test1",
      });
      expect(localStorage.setItem).toHaveBeenCalledWith(GLOBAL_UTM_KEY, expect.any(String));
      expect(localStorage.setItem).toHaveBeenCalledWith(LEGACY_UTM_KEY, expect.any(String));
    });

    it("returns null when no UTM params in URL", () => {
      setUrl("");
      expect(captureUtmFromUrl()).toBeNull();
    });

    it("only captures recognized UTM keys", () => {
      setUrl("?utm_source=tiktok&other_param=ignored&utm_content=video_hook");

      const result = captureUtmFromUrl();
      const parsed = JSON.parse(result!);

      expect(parsed).toEqual({
        utm_source: "tiktok",
        utm_content: "video_hook",
      });
      expect(parsed.other_param).toBeUndefined();
    });

    it("captures all five UTM params when present", () => {
      setUrl(
        "?utm_source=google&utm_medium=paid&utm_campaign=branded&utm_term=love_quiz&utm_content=headline_v2"
      );

      const result = captureUtmFromUrl();
      const parsed = JSON.parse(result!);

      expect(parsed).toEqual({
        utm_source: "google",
        utm_medium: "paid",
        utm_campaign: "branded",
        utm_term: "love_quiz",
        utm_content: "headline_v2",
      });
    });

    it("writes to both global and legacy storage keys", () => {
      setUrl("?utm_source=email");
      captureUtmFromUrl();

      expect(localStorage.setItem).toHaveBeenCalledWith(GLOBAL_UTM_KEY, expect.any(String));
      expect(localStorage.setItem).toHaveBeenCalledWith(LEGACY_UTM_KEY, expect.any(String));
    });

    it("handles localStorage errors gracefully", () => {
      setUrl("?utm_source=test");
      vi.stubGlobal("localStorage", {
        getItem: vi.fn(() => {
          throw new Error("storage full");
        }),
        setItem: vi.fn(() => {
          throw new Error("storage full");
        }),
        removeItem: vi.fn(),
      });

      // Should not throw, returns the in-memory value
      expect(() => captureUtmFromUrl()).not.toThrow();
    });
  });

  describe("getStoredUtm", () => {
    it("reads from global key when available", () => {
      const data = JSON.stringify({ utm_source: "facebook" });
      store[GLOBAL_UTM_KEY] = data;

      expect(getStoredUtm()).toBe(data);
    });

    it("falls back to legacy key when global key is absent", () => {
      const data = JSON.stringify({ utm_source: "newsletter" });
      store[LEGACY_UTM_KEY] = data;

      expect(getStoredUtm()).toBe(data);
    });

    it("prefers global key over legacy key", () => {
      store[GLOBAL_UTM_KEY] = JSON.stringify({ utm_source: "new" });
      store[LEGACY_UTM_KEY] = JSON.stringify({ utm_source: "old" });

      const parsed = JSON.parse(getStoredUtm()!);
      expect(parsed.utm_source).toBe("new");
    });

    it("returns null when nothing is stored", () => {
      expect(getStoredUtm()).toBeNull();
    });

    it("handles localStorage errors gracefully", () => {
      vi.stubGlobal("localStorage", {
        getItem: vi.fn(() => {
          throw new Error("access denied");
        }),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      });

      expect(getStoredUtm()).toBeNull();
    });
  });
});
