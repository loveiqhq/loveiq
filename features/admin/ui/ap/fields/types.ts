/**
 * What every figure on AP-Analytics means, written once and shown in its info card (Marcus's
 * "Field info cards" board, agreed on the 21 Oct 2026 call: every field gets an info icon with
 * the plain words, the formula and the query, and says whether it is an average or a median and
 * whether it counts people or surveys).
 */
import type { SourceKey } from "@features/admin/server/ap/catalog";

/** One table a figure reads, and what it takes from it. */
export interface FieldTable {
  source: SourceKey;
  /** The table's name as the Data sources catalog lists it. */
  table: string;
  /** The columns the figure reads. */
  columns: string;
  /** Which filter-bar settings narrow this table's rows for this figure, and through what. */
  filters: string;
  /** What to know about this table for this figure. */
  watch?: string;
}

export interface FieldDef {
  /** As the page writes it. */
  label: string;
  /** What it means and why it matters, in one or two plain sentences. */
  what: string;
  /** Which way is good, where one is. */
  good?: "up" | "down";
  /**
   * How it is counted, said plainly: the statistic ("Median", "Average", "Share", "Count",
   * "Sum") and the unit it counts ("per person", "per finished survey", "per visit").
   */
  stat: string;
  per: string;
  /** Numerator over denominator (× 100 for a share), or a one-line formula. */
  formula: { num: string; den?: string; mult?: string };
  /** What causes wrong conclusions: exclusions, gaps, counting rules. */
  caveat?: string;
  tables: FieldTable[];
  /**
   * The query behind it, checked against the page's own figure: SQL on the production database,
   * HogQL on PostHog, GAQL on Google Ads, or the GA4 Data API request. `:from` and `:to` are the
   * range's first and last Berlin days (bare, or inside quotes), `:grain` its day/week/month and
   * `:team_visits` the team's own PostHog visits (`IN :team_visits`): the card writes them in
   * (fillRange), so a copied query runs as it is.
   */
  query: { lang: "SQL" | "HogQL" | "GAQL" | "GA4"; text: string };
  /** Other fields' keys, opened in the same card. */
  related?: string[];
}

export type FieldRegistry = Record<string, FieldDef>;

/** Who answers for the definitions, and when they were written. */
export const DEFINITIONS_OWNER = "Eman Cickusic";
export const DEFINITIONS_WRITTEN = "21 Oct 2026";

/** The catalog's names for a source, as its cards and the explorer write them. */
export const SOURCE_PATH: Record<SourceKey, { catalog: string; schema: string; fed: string }> = {
  production: {
    catalog: "Production",
    schema: "Supabase · public",
    fed: "Production database (Supabase): live, written as people use the site",
  },
  posthog: {
    catalog: "PostHog",
    schema: "PostHog · events",
    fed: "PostHog: live, for the visitors whose browsers it records (from 23 Aug 2026)",
  },
  ga4: {
    catalog: "Google Analytics",
    schema: "GA4 · Data API",
    fed: "Google Analytics 4: read live from Google (sessions_daily copied every 15 minutes)",
  },
  ads: {
    catalog: "Google Ads",
    schema: "Google Ads · API",
    fed: "Google Ads: read live from Google (campaign_daily copied every 15 minutes)",
  },
  gsc: {
    catalog: "Search Console",
    schema: "Search Console · API",
    fed: "Google Search Console: read live; its last two or three days still fill in",
  },
};

/** Who looks after a source's data. */
export const SOURCE_OWNER: Record<SourceKey, string> = {
  production: "Engineering (Eman Cickusic)",
  posthog: "Engineering (Eman Cickusic)",
  ga4: "Growth (Mark Oldenburg)",
  ads: "Growth (Mark Oldenburg)",
  gsc: "Growth (Mark Oldenburg)",
};
