import { beforeEach, describe, expect, it, vi } from "vitest";

const { googleAdsSearch } = vi.hoisted(() => ({ googleAdsSearch: vi.fn() }));
vi.mock("@shared/http/google-ads", () => ({ googleAdsSearch }));

import { clearAdsCache, displayUrl, fetchAdsSplit, slotTexts } from "@features/admin/server/ap/ads";

describe("fetchAdsSplit", () => {
  beforeEach(() => {
    clearAdsCache();
    googleAdsSearch.mockReset();
    // The campaigns, the keywords and the search ads: none unless a test says.
    googleAdsSearch.mockResolvedValue([]);
  });

  // Production, 10–23 Oct 2026: "sexual personality test" ran under two criteria (match types)
  // in one campaign, €27.509158 and €13.005644. Rounded per row they made €40.52; the keyword
  // cost €40.51, which is what the Clicks card's rows add up to.
  it("adds a keyword's rows before rounding to the cent", async () => {
    googleAdsSearch
      .mockResolvedValueOnce([
        {
          customer: { currencyCode: "EUR" },
          campaign: { id: "1", name: "Price + Time Test" },
          metrics: { impressions: "355", clicks: "45", costMicros: "40514802" },
        },
      ])
      .mockResolvedValueOnce([
        {
          campaign: { id: "1" },
          adGroupCriterion: { keyword: { text: "sexual personality test" } },
          metrics: { impressions: "255", clicks: "32", costMicros: "27509158" },
        },
        {
          campaign: { id: "1" },
          adGroupCriterion: { keyword: { text: "sexual personality test" } },
          metrics: { impressions: "100", clicks: "13", costMicros: "13005644" },
        },
      ]);
    const r = await fetchAdsSplit("2026-10-10", "2026-10-23");
    expect(r.ok && r.value.keywords).toEqual([
      expect.objectContaining({
        name: "sexual personality test",
        cost: 40.51,
        clicks: 45,
        impressions: 355,
      }),
    ]);
    expect(r.ok && r.value.campaigns[0]?.cost).toBe(40.51);
  });

  // Marcus, 15 Oct: "the Google display text / ad as a user sees it", per keyword.
  it("gives each keyword the most shown search ad of the ad group it was shown most from", async () => {
    const rsa = (h: string[], pinned: Record<number, string> = {}) => ({
      headlines: h.map((text, i) => ({ text, pinnedField: pinned[i] })),
      descriptions: [{ text: "Discover your sexual archetype." }, { text: "Free, 10 minutes." }],
      path1: "Sexual-Archetype",
      path2: "Test",
    });
    googleAdsSearch
      .mockResolvedValueOnce([
        {
          customer: { currencyCode: "EUR" },
          campaign: { id: "1", name: "Search" },
          metrics: { impressions: "300", clicks: "30", costMicros: "30000000" },
        },
      ])
      .mockResolvedValueOnce([
        // "kink test" shown from two ad groups, mostly from 20.
        {
          campaign: { id: "1" },
          adGroup: { id: "10" },
          adGroupCriterion: { keyword: { text: "Kink Test" } },
          metrics: { impressions: "40", clicks: "4", costMicros: "4000000" },
        },
        {
          campaign: { id: "1" },
          adGroup: { id: "20" },
          adGroupCriterion: { keyword: { text: "kink test" } },
          metrics: { impressions: "160", clicks: "16", costMicros: "16000000" },
        },
        // A keyword whose ad group has no search ad (a Performance Max one, say).
        {
          campaign: { id: "1" },
          adGroup: { id: "30" },
          adGroupCriterion: { keyword: { text: "sex quiz" } },
          metrics: { impressions: "100", clicks: "10", costMicros: "10000000" },
        },
      ])
      .mockResolvedValueOnce([
        // Ad group 20 ran two ads over two days: 201 shown 50 + 60, 202 shown 70.
        ...[
          ["2026-10-20", "201", 50],
          ["2026-10-21", "201", 60],
          ["2026-10-20", "202", 70],
        ].map(([day, id, n]) => ({
          segments: { date: day },
          adGroup: { id: "20" },
          adGroupAd: {
            ad: {
              id,
              finalUrls: ["https://www.loveiq.org/?utm_source=google"],
              responsiveSearchAd:
                id === "201"
                  ? rsa(["Am I Normal?", "Take The Test", "LoveIQ"], { 2: "HEADLINE_1" })
                  : rsa(["Other ad"]),
            },
          },
          metrics: { impressions: String(n) },
        })),
        {
          adGroup: { id: "10" },
          adGroupAd: {
            ad: {
              id: "101",
              finalUrls: ["https://www.loveiq.org/"],
              responsiveSearchAd: rsa(["Group ten"]),
            },
          },
          metrics: { impressions: "40" },
        },
      ]);
    const r = await fetchAdsSplit("2026-10-20", "2026-10-21");
    if (!r.ok) throw new Error(r.error);
    const kink = r.value.keywords.find((k) => k.key === "kink test")!;
    // 201 (110 shown) over 202 (70); "LoveIQ" pinned to the first slot, the rest in order.
    expect(kink.ad).toEqual({
      headlines: ["LoveIQ", "Am I Normal?", "Take The Test"],
      descriptions: ["Discover your sexual archetype.", "Free, 10 minutes."],
      display: "www.loveiq.org/Sexual-Archetype/Test",
    });
    expect(r.value.keywords.find((k) => k.key === "sex quiz")!.ad).toBeNull();
    // The query reads search ads only, those shown in the range.
    const q = String(googleAdsSearch.mock.calls[2]![0]);
    expect(q).toContain("FROM ad_group_ad");
    expect(q).toContain("ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD'");
    expect(q).toContain("segments.date BETWEEN '2026-10-20' AND '2026-10-21'");
  });

  it("keeps the campaigns and keywords when the search ads can't be read", async () => {
    googleAdsSearch
      .mockResolvedValueOnce([
        {
          customer: { currencyCode: "EUR" },
          campaign: { id: "1", name: "Search" },
          metrics: { impressions: "1", clicks: "1", costMicros: "1000000" },
        },
      ])
      .mockResolvedValueOnce([
        {
          campaign: { id: "1" },
          adGroup: { id: "10" },
          adGroupCriterion: { keyword: { text: "kink test" } },
          metrics: { impressions: "1", clicks: "1", costMicros: "1000000" },
        },
      ])
      .mockRejectedValueOnce(new Error("quota"));
    const r = await fetchAdsSplit("2026-10-20", "2026-10-21");
    if (!r.ok) throw new Error(r.error);
    // Not read: no ad at all (undefined), rather than "this keyword has none" (null).
    expect(r.value.keywords[0]!.ad).toBeUndefined();
    expect(r.value.keywords[0]!.cost).toBe(1);
    // Nor kept for five minutes: the next look reads Google Ads again.
    await fetchAdsSplit("2026-10-20", "2026-10-21");
    expect(googleAdsSearch).toHaveBeenCalledTimes(6);
  });

  it("keeps a whole read for five minutes", async () => {
    await fetchAdsSplit("2026-10-20", "2026-10-21");
    await fetchAdsSplit("2026-10-20", "2026-10-21");
    expect(googleAdsSearch).toHaveBeenCalledTimes(3);
  });
});

describe("a search ad's slots and address", () => {
  it("fills each slot with its pinned text, else the next unpinned one", () => {
    expect(
      slotTexts(
        [
          { text: "A" },
          { text: "B", pinnedField: "HEADLINE_3" },
          { text: " " },
          { text: "C" },
          { text: "D" },
        ],
        "HEADLINE",
        3
      )
    ).toEqual(["A", "C", "B"]);
    expect(slotTexts(undefined, "DESCRIPTION", 2)).toEqual([]);
    expect(slotTexts([{ text: "Only" }], "DESCRIPTION", 2)).toEqual(["Only"]);
  });
  it("writes the final URL's host and the ad's paths", () => {
    expect(displayUrl("https://www.loveiq.org/x?y=1", "Test", undefined)).toBe(
      "www.loveiq.org/Test"
    );
    expect(displayUrl("https://www.loveiq.org/", "", "")).toBe("www.loveiq.org");
    expect(displayUrl("not a url")).toBeNull();
  });
});
