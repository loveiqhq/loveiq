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

    it("captures gclid and attributes the session to google/cpc when auto-tagged (no utm)", () => {
      setUrl("?gclid=Cj0KCQ_test123");

      const parsed = JSON.parse(captureUtmFromUrl()!);

      expect(parsed).toEqual({
        gclid: "Cj0KCQ_test123",
        utm_source: "google",
        utm_medium: "cpc",
      });
    });

    it("captures gbraid/wbraid (iOS click ids) the same way", () => {
      setUrl("?gbraid=abc123");

      const parsed = JSON.parse(captureUtmFromUrl()!);

      expect(parsed.gbraid).toBe("abc123");
      expect(parsed.utm_source).toBe("google");
      expect(parsed.utm_medium).toBe("cpc");
    });

    it("keeps an explicit utm_source/medium alongside a click id", () => {
      setUrl("?gclid=xyz&utm_source=newsletter&utm_medium=email");

      const parsed = JSON.parse(captureUtmFromUrl()!);

      expect(parsed).toEqual({
        gclid: "xyz",
        utm_source: "newsletter",
        utm_medium: "email",
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

  describe("captureUtmFromUrl — Google Ads ValueTrack detail", () => {
    it("captures matchtype and network, which are not utm_-prefixed", () => {
      // Regression: the allowlist held only utm_* keys plus the click ids, so these
      // two were dropped on capture even though `classifyTraffic` reads them and
      // `trafficLine` renders them into the Slack survey ping. Measured live: ads
      // arrived with utm_campaign and utm_term set and these two null.
      setUrl(
        "?utm_source=google&utm_medium=cpc&utm_campaign=price_time_test" +
          "&utm_term=sexual%20archetype&matchtype=e&network=g&gclid=abc123"
      );
      const json = captureUtmFromUrl();
      expect(json).not.toBeNull();
      const parsed = JSON.parse(json!) as Record<string, string>;
      expect(parsed.matchtype).toBe("e");
      expect(parsed.network).toBe("g");
      // and it must not have disturbed what already worked
      expect(parsed.utm_campaign).toBe("price_time_test");
      expect(parsed.utm_term).toBe("sexual archetype");
      expect(parsed.gclid).toBe("abc123");
    });

    it("omits them entirely when Google does not send them", () => {
      setUrl("?gclid=abc123");
      const parsed = JSON.parse(captureUtmFromUrl()!) as Record<string, string>;
      expect("matchtype" in parsed).toBe(false);
      expect("network" in parsed).toBe(false);
      // the auto-tagging fallback still applies
      expect(parsed.utm_source).toBe("google");
      expect(parsed.utm_medium).toBe("cpc");
    });

    it("does not treat ValueTrack detail alone as a reason to store anything", () => {
      // matchtype/network with no campaign and no click id is not an attribution
      // signal; storing it would overwrite a real earlier first-touch value.
      //
      // Asserting on `json.utm_source` alone is NOT enough — that passes whether
      // or not the bug exists, because the failure mode is storing
      // {matchtype, network} with no utm_source at all. The two assertions that
      // actually bite are: nothing returned, and the earlier value still there.
      store[GLOBAL_UTM_KEY] = JSON.stringify({ utm_source: "newsletter", utm_medium: "email" });
      setUrl("?matchtype=e&network=g");

      expect(captureUtmFromUrl()).toBeNull();
      expect(localStorage.setItem).not.toHaveBeenCalled();
      expect(getStoredUtm()).toBe(
        JSON.stringify({ utm_source: "newsletter", utm_medium: "email" })
      );
    });
  });
});
