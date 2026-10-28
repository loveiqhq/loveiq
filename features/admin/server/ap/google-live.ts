/**
 * Google Analytics and Google Ads tables read live from Google's own APIs, for the range asked:
 * what the brain's daily copy (one table each, sessions_daily and campaign_daily) leaves out.
 * The data catalog lists them and the raw data explorer reads them, a range at a time.
 *
 * Nothing here is stored. A read is cached for fifteen minutes per table and range; Google's
 * last two days still move (late hits, conversions counted on the click's day).
 */
import {
  ga4Date,
  num,
  queryGsc,
  runGa4Report,
  type Ga4Row,
} from "@features/brain/server/ingest/google";
import { googleAdsSearch } from "@shared/http/google-ads";
import { getGoogleAccessToken } from "@shared/http/google-oauth";

type Row = Record<string, unknown>;

/** The GA4 property's first day, the Ads account's first day with spend, Search Console's. */
export const GA4_FROM = "2025-12-30";
export const ADS_FROM = "2026-04-24";
export const GSC_FROM = "2026-01-02";
/** GA4 reports our custom event parameters from this day, when they were set up. */
export const GA4_PARAMS_FROM = "2026-08-27";

/**
 * A page path as it may be shown: a report link holds its reader's access token, so every one
 * is written as the route it is.
 */
export function safePath(path: string): string {
  return path.replace(/^\/report\/[^/?#]+/, "/report/[token]");
}

interface LiveTable {
  source: "ga4" | "ads" | "gsc";
  /** The table's first day, when later than its source's. */
  from?: string;
  /** What is asked of Google, for the explorer's "the query". */
  query: string;
  read: (from: string, to: string, oidcToken?: string | null) => Promise<Row[]>;
}

/** A GA4 report over [from, to], every page, as rows of named dimensions and metrics. */
async function ga4(
  from: string,
  to: string,
  dims: string[],
  metrics: string[],
  oidcToken?: string | null
): Promise<Array<{ d: string[]; m: number[] }>> {
  const property = process.env.GA4_PROPERTY_ID;
  if (!property) throw new Error("GA4_PROPERTY_ID is not set");
  const token = await getGoogleAccessToken(Date.now(), oidcToken);
  if (!token) throw new Error("No Google token for Google Analytics");
  const outcome = { truncated: false };
  const rows: Ga4Row[] = await runGa4Report(
    token,
    property,
    {
      dateRanges: [{ startDate: from, endDate: to }],
      dimensions: dims.map((name) => ({ name })),
      metrics: metrics.map((name) => ({ name })),
      keepEmptyRows: false,
    },
    () => false,
    outcome
  );
  // Part of a report is never shown as the whole of it.
  if (outcome.truncated) throw new Error("Google Analytics stopped before the last page");
  return rows.map((r) => ({
    d: (r.dimensionValues ?? []).map((v) => v.value ?? ""),
    m: (r.metricValues ?? []).map((v) => num(v.value)),
  }));
}

/** Euros to the cent, from the Ads API's micros. */
const euros = (micros: unknown) => Math.round(Number(micros ?? 0) / 10_000) / 100;
const count = (v: unknown) => Number(v ?? 0) || 0;
/** Conversions are fractional (data-driven attribution): kept to two decimals. */
const conv = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;

async function ads<T>(query: string, oidcToken?: string | null): Promise<T[]> {
  const rows = await googleAdsSearch<T>(query, { oidcToken, timeoutMs: 20_000 });
  if (!rows) throw new Error("No Google token for Google Ads");
  return rows;
}

type AdsMetrics = {
  metrics?: {
    impressions?: string;
    clicks?: string;
    costMicros?: string;
    conversions?: number | string;
  };
  segments?: { date?: string; device?: string; conversionActionName?: string };
  campaign?: { id?: string; name?: string };
  adGroup?: { name?: string };
  assetGroup?: { name?: string };
};

/** The metrics every Ads table carries, in the explorer's names. */
const adsMetrics = (r: AdsMetrics) => ({
  impressions: count(r.metrics?.impressions),
  clicks: count(r.metrics?.clicks),
  cost_eur: euros(r.metrics?.costMicros),
  conversions: conv(r.metrics?.conversions),
});

const between = (from: string, to: string) => `segments.date BETWEEN '${from}' AND '${to}'`;

/** Google Ads' country criteria, by id, with their names (one read per batch of ids). */
async function countryNames(
  ids: string[],
  oidcToken?: string | null
): Promise<Map<string, string>> {
  const clean = [...new Set(ids)].filter((id) => /^\d+$/.test(id));
  if (!clean.length) return new Map();
  const rows = await ads<{ geoTargetConstant?: { id?: string; name?: string } }>(
    `SELECT geo_target_constant.id, geo_target_constant.name FROM geo_target_constant WHERE geo_target_constant.id IN (${clean.join(", ")})`,
    oidcToken
  );
  return new Map(rows.map((r) => [r.geoTargetConstant?.id ?? "", r.geoTargetConstant?.name ?? ""]));
}

/** Adds rows that share a key (the metrics summed), so a table never repeats a key. */
function merge(rows: Row[], key: string[], sum: string[]): Row[] {
  const by = new Map<string, Row>();
  for (const r of rows) {
    const k = key.map((c) => String(r[c] ?? "")).join("\u0000");
    const had = by.get(k);
    if (!had) {
      by.set(k, { ...r });
      continue;
    }
    for (const c of sum) had[c] = Math.round((Number(had[c]) + Number(r[c])) * 100) / 100;
  }
  return [...by.values()];
}

/** GA4's own custom dimensions (event and user parameters our tags send), by their names. */
const GA4_PARAMS: Array<[string, string]> = [
  ["customEvent:archetype", "Archetype"],
  ["customEvent:bucket", "Price bucket"],
  ["customEvent:discount_step", "Discount step"],
  ["customEvent:experiment_group", "Pricing arm"],
  ["customEvent:plan", "Plan"],
  ["customEvent:plan_needed", "Plan needed"],
  ["customEvent:pricing_cluster_id", "Pricing cluster"],
  ["customEvent:report_type", "Report type"],
  ["customEvent:section_id", "Section"],
  ["customEvent:source", "Source"],
  ["customEvent:surface", "Surface"],
  ["customEvent:traffic_source", "Traffic source"],
  ["customEvent:variant", "Variant"],
  ["customUser:contact_question_arm", "Email question arm (user)"],
  ["customUser:forced_paywall_arm", "Pay pop-up arm (user)"],
  ["customUser:landing_variant", "Landing version (user)"],
];

/** In turn, a few at a time: GA4 answers at most ten requests at once per property. */
async function inBatches<T, R>(items: T[], size: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(...(await Promise.all(items.slice(i, i + size).map(f))));
  return out;
}

/** Google Ads' AGE_RANGE_25_34 and MALE as people read them. */
function demographic(value: string | undefined): string | null {
  if (!value) return null;
  const age = value.match(/^AGE_RANGE_(\d+)_(\d+|UP)$/);
  if (age) return age[2] === "UP" ? `${age[1]}+` : `${age[1]}–${age[2]}`;
  if (value.endsWith("UNDETERMINED")) return "Unknown";
  return value.charAt(0) + value.slice(1).toLowerCase();
}

/** The calendar months of [from, to], each cut to the range. */
function monthsOf(from: string, to: string): Array<{ from: string; to: string }> {
  const out: Array<{ from: string; to: string }> = [];
  let start = from;
  while (start <= to) {
    const [y, m] = start.split("-").map(Number) as [number, number];
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    out.push({ from: start, to: last < to ? last : to });
    start = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  }
  return out;
}

/** Search Console's rows for [from, to] by the dimensions asked, every page of them. */
async function gsc(
  from: string,
  to: string,
  dimensions: string[],
  oidcToken?: string | null
): Promise<Array<{ keys: string[]; clicks: number; impressions: number; position: number }>> {
  const site = process.env.SEARCH_CONSOLE_SITE;
  if (!site) throw new Error("SEARCH_CONSOLE_SITE is not set");
  const token = await getGoogleAccessToken(Date.now(), oidcToken);
  if (!token) throw new Error("No Google token for Search Console");
  const outcome = { truncated: false };
  const rows = await queryGsc(
    token,
    site,
    { startDate: from, endDate: to, dimensions, rowLimit: 25_000, dataState: "all" },
    () => false,
    outcome
  );
  // Part of a report is never shown as the whole of it.
  if (outcome.truncated) throw new Error("Search Console stopped before the last page");
  return rows.map((r) => ({
    keys: r.keys ?? [],
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    position: r.position ?? 0,
  }));
}

export const LIVE_TABLES: Record<string, LiveTable> = {
  site_daily: {
    source: "ga4",
    query:
      "GA4 runReport · dimensions: date · metrics: sessions, totalUsers, newUsers, screenPageViews, engagedSessions, bounceRate, averageSessionDuration, eventCount, keyEvents, ecommercePurchases",
    read: async (from, to, oidc) =>
      (
        await ga4(
          from,
          to,
          ["date"],
          [
            "sessions",
            "totalUsers",
            "newUsers",
            "screenPageViews",
            "engagedSessions",
            "bounceRate",
            "averageSessionDuration",
            "eventCount",
            "keyEvents",
            "ecommercePurchases",
          ],
          oidc
        )
      ).map(({ d, m }) => ({
        date: ga4Date(d[0]!),
        sessions: m[0],
        users: m[1],
        new_users: m[2],
        page_views: m[3],
        engaged_sessions: m[4],
        bounce_rate: Math.round(m[5]! * 10_000) / 10_000,
        avg_session_seconds: Math.round(m[6]! * 10) / 10,
        events: m[7],
        key_events: m[8],
        purchases: m[9],
      })),
  },
  acquisition_daily: {
    source: "ga4",
    query:
      "GA4 runReport · dimensions: date, sessionDefaultChannelGroup, sessionSourceMedium, sessionCampaignName, deviceCategory, country · metrics: sessions, activeUsers, newUsers, engagedSessions, userEngagementDuration, keyEvents, screenPageViews",
    read: async (from, to, oidc) =>
      (
        await ga4(
          from,
          to,
          [
            "date",
            "sessionDefaultChannelGroup",
            "sessionSourceMedium",
            "sessionCampaignName",
            "deviceCategory",
            "country",
          ],
          [
            "sessions",
            "activeUsers",
            "newUsers",
            "engagedSessions",
            "userEngagementDuration",
            "keyEvents",
            "screenPageViews",
          ],
          oidc
        )
      ).map(({ d, m }) => ({
        date: ga4Date(d[0]!),
        channel: d[1],
        source_medium: d[2],
        campaign: d[3],
        device: d[4],
        country: d[5],
        sessions: m[0],
        users: m[1],
        new_users: m[2],
        engaged_sessions: m[3],
        engagement_seconds: m[4],
        key_events: m[5],
        page_views: m[6],
      })),
  },
  landing_pages_daily: {
    source: "ga4",
    query:
      "GA4 runReport · dimensions: date, landingPage (a report link written /report/[token]) · metrics: sessions, engagedSessions, newUsers, keyEvents",
    read: async (from, to, oidc) =>
      merge(
        (
          await ga4(
            from,
            to,
            ["date", "landingPage"],
            ["sessions", "engagedSessions", "newUsers", "keyEvents"],
            oidc
          )
        ).map(({ d, m }) => ({
          date: ga4Date(d[0]!),
          landing_page: safePath(d[1]!),
          sessions: m[0],
          engaged_sessions: m[1],
          new_users: m[2],
          key_events: m[3],
        })),
        ["date", "landing_page"],
        ["sessions", "engaged_sessions", "new_users", "key_events"]
      ),
  },
  pages_daily: {
    source: "ga4",
    query:
      "GA4 runReport · dimensions: date, pagePath (a report link written /report/[token]) · metrics: screenPageViews, activeUsers, userEngagementDuration",
    read: async (from, to, oidc) =>
      merge(
        (
          await ga4(
            from,
            to,
            ["date", "pagePath"],
            ["screenPageViews", "activeUsers", "userEngagementDuration"],
            oidc
          )
        ).map(({ d, m }) => ({
          date: ga4Date(d[0]!),
          page: safePath(d[1]!),
          views: m[0],
          users: m[1],
          engagement_seconds: m[2],
        })),
        ["date", "page"],
        ["views", "users", "engagement_seconds"]
      ),
  },
  events_daily: {
    source: "ga4",
    query:
      "GA4 runReport · dimensions: date, eventName · metrics: eventCount, totalUsers, keyEvents",
    read: async (from, to, oidc) =>
      (
        await ga4(from, to, ["date", "eventName"], ["eventCount", "totalUsers", "keyEvents"], oidc)
      ).map(({ d, m }) => ({
        date: ga4Date(d[0]!),
        event: d[1],
        events: m[0],
        users: m[1],
        key_events: m[2],
      })),
  },
  conversion_action_daily: {
    source: "ads",
    query:
      "SELECT segments.date, campaign.id, campaign.name, segments.conversion_action_name, metrics.conversions, metrics.all_conversions, metrics.conversions_value FROM campaign WHERE segments.date BETWEEN … AND …",
    read: async (from, to, oidc) =>
      (
        await ads<
          AdsMetrics & {
            metrics?: { allConversions?: number | string; conversionsValue?: number | string };
          }
        >(
          `SELECT segments.date, campaign.id, campaign.name, segments.conversion_action_name, metrics.conversions, metrics.all_conversions, metrics.conversions_value FROM campaign WHERE ${between(from, to)}`,
          oidc
        )
      ).map((r) => ({
        date: r.segments?.date ?? null,
        campaign_id: r.campaign?.id ?? null,
        campaign_name: r.campaign?.name ?? null,
        conversion_action: r.segments?.conversionActionName ?? null,
        conversions: conv(r.metrics?.conversions),
        all_conversions: conv(r.metrics?.allConversions),
        conversion_value: conv(r.metrics?.conversionsValue),
      })),
  },
  search_term_daily: {
    source: "ads",
    query:
      "SELECT segments.date, campaign.name, ad_group.name, search_term_view.search_term, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM search_term_view WHERE segments.date BETWEEN … AND …",
    read: async (from, to, oidc) =>
      merge(
        (
          await ads<AdsMetrics & { searchTermView?: { searchTerm?: string } }>(
            `SELECT segments.date, campaign.name, ad_group.name, search_term_view.search_term, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM search_term_view WHERE ${between(from, to)}`,
            oidc
          )
        ).map((r) => ({
          date: r.segments?.date ?? null,
          campaign_name: r.campaign?.name ?? null,
          ad_group: r.adGroup?.name ?? null,
          search_term: r.searchTermView?.searchTerm ?? null,
          ...adsMetrics(r),
        })),
        ["date", "campaign_name", "ad_group", "search_term"],
        ["impressions", "clicks", "cost_eur", "conversions"]
      ),
  },
  keyword_daily: {
    source: "ads",
    query:
      "SELECT segments.date, campaign.name, ad_group.name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM keyword_view WHERE segments.date BETWEEN … AND …",
    read: async (from, to, oidc) =>
      (
        await ads<
          AdsMetrics & { adGroupCriterion?: { keyword?: { text?: string; matchType?: string } } }
        >(
          `SELECT segments.date, campaign.name, ad_group.name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM keyword_view WHERE ${between(from, to)}`,
          oidc
        )
      ).map((r) => ({
        date: r.segments?.date ?? null,
        campaign_name: r.campaign?.name ?? null,
        ad_group: r.adGroup?.name ?? null,
        keyword: r.adGroupCriterion?.keyword?.text ?? null,
        match_type: r.adGroupCriterion?.keyword?.matchType?.toLowerCase() ?? null,
        ...adsMetrics(r),
      })),
  },
  ad_group_daily: {
    source: "ads",
    query:
      "SELECT segments.date, campaign.name, ad_group.name, metrics.* FROM ad_group, and the same FROM asset_group (Performance Max), WHERE segments.date BETWEEN … AND …",
    read: async (from, to, oidc) => {
      const fields =
        "metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions";
      const [groups, assets] = await Promise.all([
        ads<AdsMetrics>(
          `SELECT segments.date, campaign.name, ad_group.name, ${fields} FROM ad_group WHERE ${between(from, to)}`,
          oidc
        ),
        ads<AdsMetrics>(
          `SELECT segments.date, campaign.name, asset_group.name, ${fields} FROM asset_group WHERE ${between(from, to)}`,
          oidc
        ),
      ]);
      return [
        ...groups.map((r) => ({
          date: r.segments?.date ?? null,
          campaign_name: r.campaign?.name ?? null,
          kind: "Ad group",
          group_name: r.adGroup?.name ?? null,
          ...adsMetrics(r),
        })),
        ...assets.map((r) => ({
          date: r.segments?.date ?? null,
          campaign_name: r.campaign?.name ?? null,
          kind: "Asset group",
          group_name: r.assetGroup?.name ?? null,
          ...adsMetrics(r),
        })),
      ];
    },
  },
  device_daily: {
    source: "ads",
    query:
      "SELECT segments.date, campaign.name, segments.device, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date BETWEEN … AND …",
    read: async (from, to, oidc) =>
      (
        await ads<AdsMetrics>(
          `SELECT segments.date, campaign.name, segments.device, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE ${between(from, to)}`,
          oidc
        )
      ).map((r) => ({
        date: r.segments?.date ?? null,
        campaign_name: r.campaign?.name ?? null,
        device: r.segments?.device?.toLowerCase().replace(/_/g, " ") ?? null,
        ...adsMetrics(r),
      })),
  },
  geo_daily: {
    source: "ads",
    query:
      "SELECT segments.date, campaign.name, geographic_view.country_criterion_id, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM geographic_view WHERE segments.date BETWEEN … AND … (location of presence and area of interest added together; the country named from geo_target_constant)",
    read: async (from, to, oidc) => {
      const rows = await ads<AdsMetrics & { geographicView?: { countryCriterionId?: string } }>(
        `SELECT segments.date, campaign.name, geographic_view.country_criterion_id, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM geographic_view WHERE ${between(from, to)}`,
        oidc
      );
      const names = await countryNames(
        rows.map((r) => r.geographicView?.countryCriterionId ?? ""),
        oidc
      );
      return merge(
        rows.map((r) => {
          const id = r.geographicView?.countryCriterionId ?? "";
          return {
            date: r.segments?.date ?? null,
            campaign_name: r.campaign?.name ?? null,
            country: names.get(id) || (id ? `Country ${id}` : null),
            ...adsMetrics(r),
          };
        }),
        ["date", "campaign_name", "country"],
        ["impressions", "clicks", "cost_eur", "conversions"]
      );
    },
  },
  hours_daily: {
    source: "ga4",
    query:
      "GA4 runReport · dimensions: date, hour · metrics: sessions, totalUsers, engagedSessions, keyEvents, screenPageViews",
    read: async (from, to, oidc) =>
      (
        await ga4(
          from,
          to,
          ["date", "hour"],
          ["sessions", "totalUsers", "engagedSessions", "keyEvents", "screenPageViews"],
          oidc
        )
      ).map(({ d, m }) => ({
        date: ga4Date(d[0]!),
        hour: Number(d[1]),
        sessions: m[0],
        users: m[1],
        engaged_sessions: m[2],
        key_events: m[3],
        page_views: m[4],
      })),
  },
  tech_daily: {
    source: "ga4",
    query:
      "GA4 runReport · dimensions: date, deviceCategory, operatingSystem, browser · metrics: sessions, totalUsers, engagedSessions, keyEvents",
    read: async (from, to, oidc) =>
      (
        await ga4(
          from,
          to,
          ["date", "deviceCategory", "operatingSystem", "browser"],
          ["sessions", "totalUsers", "engagedSessions", "keyEvents"],
          oidc
        )
      ).map(({ d, m }) => ({
        date: ga4Date(d[0]!),
        device: d[1],
        os: d[2],
        browser: d[3],
        sessions: m[0],
        users: m[1],
        engaged_sessions: m[2],
        key_events: m[3],
      })),
  },
  landing_sources_daily: {
    source: "ga4",
    query:
      "GA4 runReport · dimensions: date, landingPage (a report link written /report/[token]), sessionSourceMedium, deviceCategory · metrics: sessions, engagedSessions, newUsers, keyEvents",
    read: async (from, to, oidc) =>
      merge(
        (
          await ga4(
            from,
            to,
            ["date", "landingPage", "sessionSourceMedium", "deviceCategory"],
            ["sessions", "engagedSessions", "newUsers", "keyEvents"],
            oidc
          )
        ).map(({ d, m }) => ({
          date: ga4Date(d[0]!),
          landing_page: safePath(d[1]!) || "(not set)",
          source_medium: d[2],
          device: d[3],
          sessions: m[0],
          engaged_sessions: m[1],
          new_users: m[2],
          key_events: m[3],
        })),
        ["date", "landing_page", "source_medium", "device"],
        ["sessions", "engaged_sessions", "new_users", "key_events"]
      ),
  },
  page_events_daily: {
    source: "ga4",
    query:
      "GA4 runReport · dimensions: date, eventName, pagePath (a report link written /report/[token]) · metrics: eventCount, totalUsers",
    read: async (from, to, oidc) =>
      merge(
        (
          await ga4(from, to, ["date", "eventName", "pagePath"], ["eventCount", "totalUsers"], oidc)
        ).map(({ d, m }) => ({
          date: ga4Date(d[0]!),
          event: d[1],
          page: safePath(d[2]!),
          events: m[0],
          users: m[1],
        })),
        ["date", "event", "page"],
        ["events", "users"]
      ),
  },
  cities_daily: {
    source: "ga4",
    query:
      "GA4 runReport · dimensions: date, country, city · metrics: sessions, totalUsers, engagedSessions, keyEvents",
    read: async (from, to, oidc) =>
      (
        await ga4(
          from,
          to,
          ["date", "country", "city"],
          ["sessions", "totalUsers", "engagedSessions", "keyEvents"],
          oidc
        )
      ).map(({ d, m }) => ({
        date: ga4Date(d[0]!),
        country: d[1],
        city: d[2],
        sessions: m[0],
        users: m[1],
        engaged_sessions: m[2],
        key_events: m[3],
      })),
  },
  new_returning_daily: {
    source: "ga4",
    query:
      "GA4 runReport · dimensions: date, newVsReturning · metrics: sessions, totalUsers, engagedSessions, keyEvents",
    read: async (from, to, oidc) =>
      (
        await ga4(
          from,
          to,
          ["date", "newVsReturning"],
          ["sessions", "totalUsers", "engagedSessions", "keyEvents"],
          oidc
        )
      ).map(({ d, m }) => ({
        date: ga4Date(d[0]!),
        visitor: d[1] || "(not set)",
        sessions: m[0],
        users: m[1],
        engaged_sessions: m[2],
        key_events: m[3],
      })),
  },
  event_params_daily: {
    source: "ga4",
    from: GA4_PARAMS_FROM,
    query:
      "GA4 runReport, once per custom dimension (customEvent:archetype, bucket, discount_step, experiment_group, plan, plan_needed, pricing_cluster_id, report_type, section_id, source, surface, traffic_source, variant; customUser:contact_question_arm, forced_paywall_arm, landing_variant) · dimensions: date, eventName, the dimension · metrics: eventCount, totalUsers · rows without the parameter left out",
    read: async (from, to, oidc) =>
      (
        await inBatches(GA4_PARAMS, 4, async ([api, label]) =>
          (await ga4(from, to, ["date", "eventName", api], ["eventCount", "totalUsers"], oidc))
            .filter(({ d }) => d[2] !== "" && d[2] !== "(not set)")
            .map(({ d, m }) => ({
              date: ga4Date(d[0]!),
              event: d[1],
              parameter: label,
              value: d[2],
              events: m[0],
              users: m[1],
            }))
        )
      ).flat(),
  },
  demographics_daily: {
    source: "ads",
    query:
      "SELECT segments.date, campaign.name, ad_group.name, ad_group_criterion.age_range.type (or .gender.type), metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM age_range_view (and gender_view) WHERE segments.date BETWEEN … AND … AND metrics.impressions > 0",
    read: async (from, to, oidc) => {
      type Demo = AdsMetrics & {
        adGroupCriterion?: { ageRange?: { type?: string }; gender?: { type?: string } };
      };
      const fields =
        "metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions";
      const [ages, genders] = await Promise.all([
        ads<Demo>(
          `SELECT segments.date, campaign.name, ad_group.name, ad_group_criterion.age_range.type, ${fields} FROM age_range_view WHERE ${between(from, to)} AND metrics.impressions > 0`,
          oidc
        ),
        ads<Demo>(
          `SELECT segments.date, campaign.name, ad_group.name, ad_group_criterion.gender.type, ${fields} FROM gender_view WHERE ${between(from, to)} AND metrics.impressions > 0`,
          oidc
        ),
      ]);
      const row = (r: Demo, kind: string, value: string | undefined) => ({
        date: r.segments?.date ?? null,
        campaign_name: r.campaign?.name ?? null,
        ad_group: r.adGroup?.name ?? null,
        kind,
        value: demographic(value),
        ...adsMetrics(r),
      });
      return [
        ...ages.map((r) => row(r, "Age", r.adGroupCriterion?.ageRange?.type)),
        ...genders.map((r) => row(r, "Gender", r.adGroupCriterion?.gender?.type)),
      ];
    },
  },
  impression_share_daily: {
    source: "ads",
    query:
      "SELECT segments.date, campaign.name, metrics.search_impression_share, metrics.search_top_impression_share, metrics.search_absolute_top_impression_share, metrics.search_budget_lost_impression_share, metrics.search_rank_lost_impression_share FROM campaign WHERE segments.date BETWEEN … AND … AND campaign.advertising_channel_type = 'SEARCH' AND metrics.impressions > 0",
    read: async (from, to, oidc) => {
      type Shares = {
        searchImpressionShare?: number;
        searchTopImpressionShare?: number;
        searchAbsoluteTopImpressionShare?: number;
        searchBudgetLostImpressionShare?: number;
        searchRankLostImpressionShare?: number;
      };
      const rows = await ads<{
        segments?: { date?: string };
        campaign?: { name?: string };
        metrics?: Shares;
      }>(
        `SELECT segments.date, campaign.name, metrics.search_impression_share, metrics.search_top_impression_share, metrics.search_absolute_top_impression_share, metrics.search_budget_lost_impression_share, metrics.search_rank_lost_impression_share FROM campaign WHERE ${between(from, to)} AND campaign.advertising_channel_type = 'SEARCH' AND metrics.impressions > 0`,
        oidc
      );
      const share = (v: number | undefined) =>
        v === undefined ? null : Math.round(Number(v) * 10_000) / 10_000;
      return rows.map((r) => ({
        date: r.segments?.date ?? null,
        campaign_name: r.campaign?.name ?? null,
        impression_share: share(r.metrics?.searchImpressionShare),
        top_share: share(r.metrics?.searchTopImpressionShare),
        absolute_top_share: share(r.metrics?.searchAbsoluteTopImpressionShare),
        lost_to_budget: share(r.metrics?.searchBudgetLostImpressionShare),
        lost_to_rank: share(r.metrics?.searchRankLostImpressionShare),
      }));
    },
  },
  ads_hours_daily: {
    source: "ads",
    query:
      "SELECT segments.date, segments.hour, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date BETWEEN … AND … AND metrics.impressions > 0",
    read: async (from, to, oidc) =>
      (
        await ads<AdsMetrics & { segments?: { hour?: number } }>(
          `SELECT segments.date, segments.hour, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE ${between(from, to)} AND metrics.impressions > 0`,
          oidc
        )
      ).map((r) => ({
        date: r.segments?.date ?? null,
        hour: Number(r.segments?.hour ?? 0),
        campaign_name: r.campaign?.name ?? null,
        ...adsMetrics(r),
      })),
  },
  search_ads_daily: {
    source: "ads",
    query:
      "SELECT segments.date, campaign.name, ad_group.name, ad_group_ad.ad.id, ad_group_ad.ad.type, ad_group_ad.status, ad_group_ad.ad.final_urls, ad_group_ad.ad.responsive_search_ad.headlines, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM ad_group_ad WHERE segments.date BETWEEN … AND … AND metrics.impressions > 0",
    read: async (from, to, oidc) =>
      (
        await ads<
          AdsMetrics & {
            adGroupAd?: {
              status?: string;
              ad?: {
                id?: string;
                type?: string;
                finalUrls?: string[];
                responsiveSearchAd?: { headlines?: Array<{ text?: string }> };
              };
            };
          }
        >(
          `SELECT segments.date, campaign.name, ad_group.name, ad_group_ad.ad.id, ad_group_ad.ad.type, ad_group_ad.status, ad_group_ad.ad.final_urls, ad_group_ad.ad.responsive_search_ad.headlines, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM ad_group_ad WHERE ${between(from, to)} AND metrics.impressions > 0`,
          oidc
        )
      ).map((r) => ({
        date: r.segments?.date ?? null,
        campaign_name: r.campaign?.name ?? null,
        ad_group: r.adGroup?.name ?? null,
        ad_id: r.adGroupAd?.ad?.id ?? null,
        ad_type: r.adGroupAd?.ad?.type?.toLowerCase().replace(/_/g, " ") ?? null,
        status: r.adGroupAd?.status?.toLowerCase() ?? null,
        headlines:
          (r.adGroupAd?.ad?.responsiveSearchAd?.headlines ?? [])
            .map((h) => h.text ?? "")
            .filter(Boolean)
            .join(" | ") || null,
        final_url: r.adGroupAd?.ad?.finalUrls?.[0] ?? null,
        ...adsMetrics(r),
      })),
  },
  pmax_search_categories: {
    source: "ads",
    query:
      "Per Performance Max campaign with impressions in the range, and per month of it: SELECT campaign_search_term_insight.category_label, metrics.impressions, metrics.clicks, metrics.conversions FROM campaign_search_term_insight WHERE segments.date BETWEEN … AND … AND campaign_search_term_insight.campaign_id = …",
    read: async (from, to, oidc) => {
      const campaigns = await ads<{ campaign?: { id?: string; name?: string } }>(
        `SELECT campaign.id, campaign.name FROM campaign WHERE campaign.advertising_channel_type = 'PERFORMANCE_MAX' AND ${between(from, to)} AND metrics.impressions > 0`,
        oidc
      );
      const ids = new Map<string, string>();
      for (const c of campaigns)
        if (c.campaign?.id && /^\d+$/.test(c.campaign.id))
          ids.set(c.campaign.id, c.campaign.name ?? c.campaign.id);
      const jobs = monthsOf(from, to).flatMap((m) =>
        [...ids].map(([id, name]) => ({ m, id, name }))
      );
      const out = await inBatches(jobs, 3, async ({ m, id, name }) =>
        (
          await ads<{
            campaignSearchTermInsight?: { categoryLabel?: string };
            metrics?: { impressions?: string; clicks?: string; conversions?: number | string };
          }>(
            `SELECT campaign_search_term_insight.category_label, metrics.impressions, metrics.clicks, metrics.conversions FROM campaign_search_term_insight WHERE ${between(m.from, m.to)} AND campaign_search_term_insight.campaign_id = '${id}'`,
            oidc
          )
        ).map((r) => ({
          date: m.from,
          month_to: m.to,
          campaign_name: name,
          category: r.campaignSearchTermInsight?.categoryLabel || "Uncategorized",
          impressions: count(r.metrics?.impressions),
          clicks: count(r.metrics?.clicks),
          conversions: conv(r.metrics?.conversions),
        }))
      );
      return merge(
        out.flat(),
        ["date", "campaign_name", "category"],
        ["impressions", "clicks", "conversions"]
      );
    },
  },
  change_history: {
    source: "ads",
    query:
      "SELECT change_event.change_date_time, change_event.user_email (its domain only), change_event.client_type, change_event.change_resource_type, change_event.resource_change_operation, change_event.changed_fields, campaign.name FROM change_event WHERE change_event.change_date_time within the range and the last 30 days LIMIT 10000",
    read: async (from, to, oidc) => {
      // Google keeps 30 days of change history.
      const oldest = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
      const start = from > oldest ? from : oldest;
      if (start > to) return [];
      const next = new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
      return (
        await ads<{
          campaign?: { name?: string };
          changeEvent?: {
            resourceName?: string;
            changeDateTime?: string;
            userEmail?: string;
            clientType?: string;
            changeResourceType?: string;
            resourceChangeOperation?: string;
            changedFields?: string;
          };
        }>(
          `SELECT change_event.change_date_time, change_event.user_email, change_event.client_type, change_event.change_resource_type, change_event.resource_change_operation, change_event.changed_fields, campaign.name FROM change_event WHERE change_event.change_date_time >= '${start}' AND change_event.change_date_time < '${next}' ORDER BY change_event.change_date_time DESC LIMIT 10000`,
          oidc
        )
      ).map((r) => {
        const e = r.changeEvent ?? {};
        const words = (v: string | undefined) => v?.toLowerCase().replace(/_/g, " ") ?? null;
        return {
          date: e.changeDateTime?.slice(0, 10) ?? null,
          change_id: e.resourceName?.split("/").pop() ?? null,
          time: e.changeDateTime?.slice(11, 19) ?? null,
          // Who, by their organization only: a person's address stays out of the admin.
          changed_by: e.userEmail?.includes("@") ? e.userEmail.split("@")[1]!.toLowerCase() : null,
          client: words(e.clientType),
          resource: words(e.changeResourceType),
          operation: words(e.resourceChangeOperation),
          changed_fields: e.changedFields ?? null,
          campaign_name: r.campaign?.name ?? null,
        };
      });
    },
  },
  search_console_daily: {
    source: "gsc",
    query:
      "Search Console searchAnalytics.query · dimensions: date, query, page (a report link written /report/[token]) · clicks, impressions, position · dataState all",
    read: async (from, to, oidc) => {
      // Report links collapse into one page: their position is averaged by impressions.
      const by = new Map<string, { row: Row; clicks: number; impressions: number; at: number }>();
      for (const { keys, clicks, impressions, position } of await gsc(
        from,
        to,
        ["date", "query", "page"],
        oidc
      )) {
        const page = keys[2] ? safePath(keys[2].replace(/^https?:\/\/[^/]+/, "") || "/") : null;
        const k = `${keys[0]}\u0000${keys[1]}\u0000${page}`;
        const had = by.get(k) ?? {
          row: { date: keys[0] ?? null, query: keys[1] ?? null, page },
          clicks: 0,
          impressions: 0,
          at: 0,
        };
        had.clicks += clicks;
        had.impressions += impressions;
        had.at += position * impressions;
        by.set(k, had);
      }
      return [...by.values()].map(({ row, clicks, impressions, at }) => ({
        ...row,
        clicks,
        impressions,
        ctr: impressions ? Math.round((clicks / impressions) * 10_000) / 10_000 : null,
        position: impressions ? Math.round((at / impressions) * 10) / 10 : null,
      }));
    },
  },
};

const cache = new Map<string, { at: number; rows: Promise<Row[]> }>();
const CACHE_MS = 15 * 60_000;

/**
 * A live table's rows over [from, to] (cut to the source's first day), oldest day first; null
 * for a table that is not one. Throws when Google can't be read.
 */
export function liveRows(
  table: string,
  from: string,
  to: string,
  oidcToken?: string | null,
  now = Date.now()
): Promise<Row[]> | null {
  const spec = LIVE_TABLES[table];
  if (!spec) return null;
  const first =
    spec.from ?? (spec.source === "ga4" ? GA4_FROM : spec.source === "gsc" ? GSC_FROM : ADS_FROM);
  const start = from < first ? first : from;
  if (start > to) return Promise.resolve([]);
  const key = `${table}|${start}|${to}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_MS) return hit.rows;
  const rows = spec
    .read(start, to, oidcToken)
    .then((rs) => rs.sort((a, b) => String(a.date).localeCompare(String(b.date))));
  cache.set(key, { at: now, rows });
  rows.catch(() => cache.delete(key));
  if (cache.size > 100) cache.delete(cache.keys().next().value!);
  return rows;
}

/** For tests. */
export function clearLiveCache(): void {
  cache.clear();
}
