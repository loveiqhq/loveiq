import { beforeEach, describe, expect, it, vi } from "vitest";

const { googleAdsSearch } = vi.hoisted(() => ({ googleAdsSearch: vi.fn() }));
vi.mock("@shared/http/google-ads", () => ({ googleAdsSearch }));

import { clearAdsCache, fetchAdsSplit } from "@features/admin/server/ap/ads";

describe("fetchAdsSplit", () => {
  beforeEach(() => {
    clearAdsCache();
    googleAdsSearch.mockReset();
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
});
