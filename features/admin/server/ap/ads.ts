/**
 * Google Ads per campaign and per keyword for a range, read from the Ads API itself (the
 * account's own figures: cost, clicks, impressions), for the Traffic page's campaign and
 * search-term rows and its cost-vs-quality chart. The ad spend total stays the GA4 figure the
 * other pages use (adCostByDay); this is its split.
 *
 * Our own records meet these by the link's tags: every live campaign's Final URL suffix sets
 * utm_campaign (its snake-case name) and utm_term={keyword}, so a finisher's tracker names the
 * campaign and the keyword their ad click came through.
 */
import { googleAdsSearch } from "@shared/http/google-ads";
import logger from "@shared/observability/logger";

export interface AdsLine {
  /** What our trackers hold for it: utm_campaign for a campaign, the keyword text for a term. */
  key: string;
  /** As Google Ads names it. */
  name: string;
  /** For a keyword: its campaign's key. */
  campaign?: string;
  cost: number;
  clicks: number;
  impressions: number;
}

export interface AdsSplit {
  campaigns: AdsLine[];
  keywords: AdsLine[];
}

export type AdsResult = { ok: true; value: AdsSplit } | { ok: false; error: string };

/** "Price + Time Test" -> "price_time_test": what a campaign without a suffix is tagged as. */
export function snakeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** utm_campaign from a Final URL suffix ("utm_source=google&…&utm_campaign=performance_max&…"). */
export function suffixCampaign(suffix: string | null | undefined): string | null {
  if (!suffix) return null;
  const v = new URLSearchParams(suffix.replace(/^[?&]/, "")).get("utm_campaign");
  return v && !v.includes("{") ? v.toLowerCase() : null;
}

const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
};

/** Euros to the cent, from the API's micros. */
const euros = (micros: unknown) => Math.round(num(micros) / 10_000) / 100;

const cache = new Map<string, { at: number; result: Promise<AdsResult> }>();
const CACHE_MS = 5 * 60_000;

const UNREADABLE = "Google Ads could not be read just now.";

/**
 * Cost, clicks and impressions per campaign and per keyword over [from, to] (the account's
 * days, which are Berlin days). Cached five minutes per range; a failure is not kept.
 */
export function fetchAdsSplit(
  from: string,
  to: string,
  oidcToken?: string | null,
  now = Date.now()
): Promise<AdsResult> {
  const key = `${from}|${to}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_MS) return hit.result;
  const result = readAdsSplit(from, to, oidcToken).catch((err: unknown): AdsResult => {
    logger.warn({ err }, "AP: Google Ads read failed");
    return { ok: false, error: UNREADABLE };
  });
  cache.set(key, { at: now, result });
  void result.then((r) => {
    if (!r.ok) cache.delete(key);
  });
  if (cache.size > 50) cache.delete(cache.keys().next().value!);
  return result;
}

async function readAdsSplit(
  from: string,
  to: string,
  oidcToken?: string | null
): Promise<AdsResult> {
  const between = `segments.date BETWEEN '${from}' AND '${to}'`;
  const [campaignRows, keywordRows] = await Promise.all([
    googleAdsSearch<{
      customer?: { currencyCode?: string };
      campaign?: { id?: string; name?: string; finalUrlSuffix?: string };
      metrics?: { impressions?: string; clicks?: string; costMicros?: string };
    }>(
      "SELECT customer.currency_code, campaign.id, campaign.name, campaign.final_url_suffix, " +
        `metrics.impressions, metrics.clicks, metrics.cost_micros FROM campaign WHERE ${between}`,
      { oidcToken, timeoutMs: 15_000 }
    ),
    googleAdsSearch<{
      campaign?: { id?: string };
      adGroupCriterion?: { keyword?: { text?: string } };
      metrics?: { impressions?: string; clicks?: string; costMicros?: string };
    }>(
      "SELECT campaign.id, ad_group_criterion.keyword.text, metrics.impressions, metrics.clicks, " +
        `metrics.cost_micros FROM keyword_view WHERE ${between}`,
      { oidcToken, timeoutMs: 15_000 }
    ),
  ]);
  if (!campaignRows || !keywordRows) return { ok: false, error: UNREADABLE };
  // The account reports in euros; no rate is invented here.
  const currency = campaignRows.find((r) => r.customer?.currencyCode)?.customer?.currencyCode;
  if (currency && currency !== "EUR")
    return { ok: false, error: `Google Ads reports in ${currency}.` };

  const campaigns = new Map<string, AdsLine>();
  const keyOfCampaign = new Map<string, string>();
  for (const r of campaignRows) {
    const id = r.campaign?.id ?? "";
    const name = r.campaign?.name ?? "";
    const key = suffixCampaign(r.campaign?.finalUrlSuffix) ?? snakeName(name);
    keyOfCampaign.set(id, key);
    const line = campaigns.get(key) ?? { key, name, cost: 0, clicks: 0, impressions: 0 };
    line.cost += euros(r.metrics?.costMicros);
    line.clicks += num(r.metrics?.clicks);
    line.impressions += num(r.metrics?.impressions);
    campaigns.set(key, line);
  }
  const keywords = new Map<string, AdsLine>();
  for (const r of keywordRows) {
    const text = (r.adGroupCriterion?.keyword?.text ?? "").trim().toLowerCase();
    if (!text) continue;
    const campaign = keyOfCampaign.get(r.campaign?.id ?? "") ?? "";
    // A keyword under two campaigns is two lines: its link names the term, not the campaign.
    const key = `${campaign}|${text}`;
    const line = keywords.get(key) ?? {
      key: text,
      name: text,
      campaign,
      cost: 0,
      clicks: 0,
      impressions: 0,
    };
    line.cost += euros(r.metrics?.costMicros);
    line.clicks += num(r.metrics?.clicks);
    line.impressions += num(r.metrics?.impressions);
    keywords.set(key, line);
  }
  const round = (l: AdsLine) => ({ ...l, cost: Math.round(l.cost * 100) / 100 });
  return {
    ok: true,
    value: {
      campaigns: [...campaigns.values()]
        .filter((l) => l.cost || l.clicks || l.impressions)
        .map(round),
      keywords: [...keywords.values()]
        .filter((l) => l.cost || l.clicks || l.impressions)
        .map(round),
    },
  };
}

/** For tests. */
export function clearAdsCache(): void {
  cache.clear();
}
