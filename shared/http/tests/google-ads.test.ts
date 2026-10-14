import { beforeEach, describe, expect, it, vi } from "vitest";

const getDelegatedToken = vi.fn();
vi.mock("@shared/http/google-oauth", () => ({
  getDelegatedToken: (...a: unknown[]) => getDelegatedToken(...a),
}));
const fetchWithTimeout = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...a: unknown[]) => fetchWithTimeout(...a),
}));

import { ADWORDS_SCOPE, googleAdsSearch } from "@shared/http/google-ads";

const page = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
  text: async () => "QUERY_ERROR",
});

describe("googleAdsSearch", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getDelegatedToken.mockResolvedValue("ads-token");
  });

  it("reads as ec@ with the adwords scope, and follows every page", async () => {
    fetchWithTimeout
      .mockResolvedValueOnce(page({ results: [{ n: 1 }, { n: 2 }], nextPageToken: "p2" }))
      .mockResolvedValueOnce(page({ results: [{ n: 3 }] }));
    expect(await googleAdsSearch("SELECT campaign.id FROM campaign")).toEqual([
      { n: 1 },
      { n: 2 },
      { n: 3 },
    ]);
    expect(getDelegatedToken.mock.calls[0]?.slice(0, 2)).toEqual(["ec@loveiq.org", ADWORDS_SCOPE]);
    const bodies = fetchWithTimeout.mock.calls.map(([, init]) =>
      JSON.parse(String((init as { body: string }).body))
    );
    expect(bodies).toEqual([
      { query: "SELECT campaign.id FROM campaign" },
      { query: "SELECT campaign.id FROM campaign", pageToken: "p2" },
    ]);
  });

  it("is null without a token, and throws when Google refuses the query", async () => {
    getDelegatedToken.mockResolvedValueOnce(null);
    expect(await googleAdsSearch("SELECT x FROM campaign")).toBeNull();
    expect(fetchWithTimeout).not.toHaveBeenCalled();

    fetchWithTimeout.mockResolvedValueOnce(page({}, 400));
    await expect(googleAdsSearch("SELECT x FROM campaign")).rejects.toThrow(/400 QUERY_ERROR/);
  });
});
