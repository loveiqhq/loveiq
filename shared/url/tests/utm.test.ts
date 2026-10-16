// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  captureUtmFromUrl,
  getStoredUtm,
  GLOBAL_UTM_KEY,
  LEGACY_UTM_KEY,
  withoutTrackingParams,
} from "@shared/url/utm";

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

describe("captureUtmFromUrl — Meta's click id and the referring site", () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: vi.fn(),
    });
  });

  afterEach(() => {
    delete (document as { referrer?: string }).referrer;
  });

  function visit(search: string, referrer = "") {
    Object.defineProperty(window, "location", {
      value: { search, href: `https://www.loveiq.org/${search}`, hostname: "www.loveiq.org" },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(document, "referrer", { value: referrer, configurable: true });
  }

  it("keeps the referring site's hostname, never its address, as detail on a tagged visit", () => {
    visit("?utm_source=newsletter&utm_medium=email", "https://mail.google.com/mail/u/0/#inbox");
    expect(JSON.parse(captureUtmFromUrl()!)).toEqual({
      utm_source: "newsletter",
      utm_medium: "email",
      referrer_host: "mail.google.com",
    });
  });

  it("stores an untagged visit's referrer only when nothing is stored yet", () => {
    visit("", "https://www.google.com/search?q=love+quiz");
    expect(JSON.parse(captureUtmFromUrl()!)).toEqual({ referrer_host: "www.google.com" });

    // A campaign stored earlier is never replaced by an untagged visit.
    const earlier = JSON.stringify({ utm_source: "instagram", utm_medium: "paid" });
    store = { [GLOBAL_UTM_KEY]: earlier };
    vi.mocked(localStorage.setItem).mockClear();
    visit("", "https://www.bing.com/");
    expect(captureUtmFromUrl()).toBeNull();
    expect(localStorage.setItem).not.toHaveBeenCalled();
    expect(getStoredUtm()).toBe(earlier);
  });

  it("keeps Meta's click id without faking a source, capped and cleaned", () => {
    visit(`?fbclid=%3CIwAR2-x_Y${"z".repeat(300)}`, "https://l.facebook.com/");
    const stored = JSON.parse(captureUtmFromUrl()!) as Record<string, string>;
    expect(stored.utm_source).toBeUndefined();
    expect(stored.referrer_host).toBe("l.facebook.com");
    expect(stored.fbclid).toMatch(/^IwAR2-x_Yz+$/);
    expect(stored.fbclid).toHaveLength(200);

    // Alone it is detail too: an earlier campaign stays (pricing reads its utm_source).
    const earlier = JSON.stringify({ utm_source: "google", utm_medium: "cpc", gclid: "a" });
    store = { [GLOBAL_UTM_KEY]: earlier };
    visit("?fbclid=IwAR3");
    expect(captureUtmFromUrl()).toBeNull();
    expect(getStoredUtm()).toBe(earlier);

    // With a campaign it joins it.
    visit("?utm_source=facebook&utm_medium=paid&fbclid=IwAR4");
    expect(JSON.parse(captureUtmFromUrl()!)).toEqual({
      utm_source: "facebook",
      utm_medium: "paid",
      fbclid: "IwAR4",
    });
  });

  it("skips our own pages and Stripe's checkout as a referrer", () => {
    for (const referrer of [
      "https://www.loveiq.org/",
      "https://staging.loveiq.org/report/x",
      "https://checkout.stripe.com/c/pay/cs_live_x",
      "not a url",
    ]) {
      store = {};
      visit("", referrer);
      expect(captureUtmFromUrl(), referrer).toBeNull();
    }
  });
});

describe("withoutTrackingParams", () => {
  it("drops every campaign and ad-click parameter a Google Ads landing carries", () => {
    // The exact shape stored in ux_finding.url_path on 2026-09-20.
    const landing =
      "/?utm_source=google&utm_medium=cpc&utm_campaign=price_time_test&utm_term=what%20is%20my%20type" +
      "&matchtype=p&network=g&gad_source=1&gad_campaignid=24064185005&gbraid=0AAA&gclid=Cj0KCQ";
    expect(withoutTrackingParams(landing)).toBe("/");
  });

  it("keeps what changes the page, in order", () => {
    expect(withoutTrackingParams("/report/x?utm_source=email&v2=1&gclid=a&offer=1")).toBe(
      "/report/x?v2=1&offer=1"
    );
  });

  it("matches the growing families by prefix, and other networks' click ids", () => {
    expect(
      withoutTrackingParams("/s?utm_id=1&UTM_Source=x&gad_new=2&fbclid=3&msclkid=4&wbraid=5")
    ).toBe("/s");
  });

  it("leaves a path with no query alone", () => {
    expect(withoutTrackingParams("/survey")).toBe("/survey");
  });
});
