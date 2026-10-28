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

/**
 * A search ad as a searcher sees it (Marcus, 15 Oct: "the Google display text / ad as a user
 * sees it"): the responsive search ad's first three headlines in Google's slots (a pinned one in
 * its own), its first two descriptions and the address under them. Google mixes the headlines,
 * so this is one of the combinations it shows.
 */
export interface AdPreview {
  headlines: string[];
  descriptions: string[];
  /** "www.loveiq.org/Sexual-Archetype/Test": the final URL's host and the ad's two paths. */
  display: string;
}

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
  /**
   * For a keyword: the ad its searchers saw most, the most shown search ad of the ad group the
   * keyword was shown most from; null when it has none. Absent when the ads couldn't be read.
   */
  ad?: AdPreview | null;
}

type AssetText = { text?: string; pinnedField?: string };

/**
 * The texts in Google's slots: SLOT_1..n, each its pinned asset or else the next unpinned one
 * in the ad's own order.
 */
export function slotTexts(assets: AssetText[] | undefined, slot: string, n: number): string[] {
  const xs = (assets ?? []).filter((a) => (a.text ?? "").trim() !== "");
  const free = xs.filter((a) => !a.pinnedField || !a.pinnedField.startsWith(slot));
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    const pick = xs.find((a) => a.pinnedField === `${slot}_${i}`) ?? free.shift();
    if (pick) out.push(pick.text!.trim());
  }
  return out;
}

/** The address a search ad shows: the final URL's host, then its two display paths. */
export function displayUrl(
  finalUrl: string | undefined,
  path1?: string,
  path2?: string
): string | null {
  let host: string;
  try {
    host = new URL(finalUrl ?? "").host;
  } catch {
    return null;
  }
  return [host, path1, path2].filter((x) => (x ?? "").trim() !== "").join("/");
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

/**
 * Euros from the API's micros, unrounded: a line adds up its rows (a keyword's match types and
 * ad groups) and is rounded to the cent once (round, below), as the card's sum of its rows is.
 */
const euros = (micros: unknown) => num(micros) / 1_000_000;

const cache = new Map<string, { at: number; result: Promise<AdsResult> }>();
const CACHE_MS = 5 * 60_000;

const UNREADABLE = "Google Ads could not be read just now.";

/**
 * Cost, clicks and impressions per campaign and per keyword over [from, to] (the account's
 * days, which are Berlin days). Cached five minutes per range; a failure is not kept, nor a
 * result whose search ads couldn't be read.
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
    if (!r.ok || r.value.keywords.some((l) => l.ad === undefined)) cache.delete(key);
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
  const [campaignRows, keywordRows, adRows] = await Promise.all([
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
      adGroup?: { id?: string };
      adGroupCriterion?: { keyword?: { text?: string } };
      metrics?: { impressions?: string; clicks?: string; costMicros?: string };
    }>(
      "SELECT campaign.id, ad_group.id, ad_group_criterion.keyword.text, metrics.impressions, " +
        `metrics.clicks, metrics.cost_micros FROM keyword_view WHERE ${between}`,
      { oidcToken, timeoutMs: 15_000 }
    ),
    // The search ads shown in the range, for what each keyword's searchers saw. Best-effort: a
    // failure leaves the campaign and keyword figures without their ads.
    googleAdsSearch<{
      adGroup?: { id?: string };
      adGroupAd?: {
        ad?: {
          id?: string;
          finalUrls?: string[];
          responsiveSearchAd?: {
            headlines?: AssetText[];
            descriptions?: AssetText[];
            path1?: string;
            path2?: string;
          };
        };
      };
      metrics?: { impressions?: string };
    }>(
      "SELECT ad_group.id, ad_group_ad.ad.id, ad_group_ad.ad.final_urls, " +
        "ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions, " +
        "ad_group_ad.ad.responsive_search_ad.path1, ad_group_ad.ad.responsive_search_ad.path2, " +
        `metrics.impressions FROM ad_group_ad WHERE ${between} ` +
        "AND ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD' AND metrics.impressions > 0",
      { oidcToken, timeoutMs: 15_000 }
    ).catch((err: unknown) => {
      logger.warn({ err }, "AP: Google Ads search ads read failed");
      return null;
    }),
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
  // Each ad group's most shown search ad over the range (its rows are per day).
  const shownOf = new Map<string, number>();
  const previewOf = new Map<string, AdPreview>();
  for (const r of adRows ?? []) {
    const ad = r.adGroupAd?.ad;
    const rsa = ad?.responsiveSearchAd;
    if (!ad?.id || !rsa) continue;
    shownOf.set(ad.id, (shownOf.get(ad.id) ?? 0) + num(r.metrics?.impressions));
  }
  const topAd = new Map<string, { id: string; shown: number }>();
  for (const r of adRows ?? []) {
    const group = r.adGroup?.id;
    const ad = r.adGroupAd?.ad;
    const rsa = ad?.responsiveSearchAd;
    const display = displayUrl(ad?.finalUrls?.[0], rsa?.path1, rsa?.path2);
    if (!group || !ad?.id || !rsa || !display) continue;
    const shown = shownOf.get(ad.id) ?? 0;
    const best = topAd.get(group);
    if (!best || shown > best.shown || (shown === best.shown && ad.id < best.id)) {
      topAd.set(group, { id: ad.id, shown });
      previewOf.set(group, {
        headlines: slotTexts(rsa.headlines, "HEADLINE", 3),
        descriptions: slotTexts(rsa.descriptions, "DESCRIPTION", 2),
        display,
      });
    }
  }
  // Each keyword's ad group it was shown most from.
  const groupShown = new Map<string, Map<string, number>>();

  const keywords = new Map<string, AdsLine>();
  for (const r of keywordRows) {
    const text = (r.adGroupCriterion?.keyword?.text ?? "").trim().toLowerCase();
    if (!text) continue;
    const campaign = keyOfCampaign.get(r.campaign?.id ?? "") ?? "";
    // A keyword under two campaigns is two lines: its link names the term, not the campaign.
    const key = `${campaign}|${text}`;
    const group = r.adGroup?.id;
    if (group) {
      const g = groupShown.get(key) ?? new Map<string, number>();
      g.set(group, (g.get(group) ?? 0) + num(r.metrics?.impressions));
      groupShown.set(key, g);
    }
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
  for (const [key, line] of keywords) {
    const groups = [...(groupShown.get(key) ?? new Map<string, number>())].sort(
      (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)
    );
    if (adRows !== null) line.ad = groups.map(([g]) => previewOf.get(g)).find(Boolean) ?? null;
  }
  const round = (l: AdsLine) => ({ ...l, cost: Math.round(l.cost * 100) / 100 });
  return {
    ok: true,
    value: {
      campaigns: [...campaigns.values()]
        .map(round)
        .filter((l) => l.cost || l.clicks || l.impressions),
      keywords: [...keywords.values()]
        .map(round)
        .filter((l) => l.cost || l.clicks || l.impressions),
    },
  };
}

/** For tests. */
export function clearAdsCache(): void {
  cache.clear();
}
