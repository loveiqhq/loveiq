import { parseUtmSource } from "@features/admin/server/metric-library";

export interface TrustDescriptor {
  source: string;
  mode: "live" | "derived" | "sampled" | "materialized";
  sampleSize: number;
  lastUpdated: string | null;
  freshnessHours: number | null;
  warning: string | null;
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "our",
  "that",
  "the",
  "their",
  "this",
  "to",
  "we",
  "with",
  "you",
  "your",
]);

const SEMANTIC_EXPANSIONS = new Map<string, string[]>([
  ["shame", ["judgment", "self-judgment", "embarrassment", "insecure"]],
  ["uncertainty", ["unsure", "not sure", "confused", "depends", "unclear"]],
  ["desire", ["libido", "wanting sex", "sex drive", "want more"]],
  ["confidence", ["body confidence", "self-worth", "secure"]],
  ["reconnecting", ["repairing", "close", "connection", "repair"]],
  ["pain", ["discomfort", "hurt", "physical pain"]],
  ["slow", ["hesitation", "stalled", "delay", "inactive"]],
  ["fraud", ["duplicate", "bot", "spam", "suspicious"]],
]);

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function clampDays(days: number, min = 7, max = 365): number {
  if (Number.isNaN(days)) return 30;
  return Math.min(Math.max(days, min), max);
}

export function makeSince(days: number): string | null {
  return days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : null;
}

export function parseUtmTracker(tracker: string | null): Record<string, string> {
  if (!tracker?.trim()) return {};
  try {
    const parsed = JSON.parse(tracker) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, value]) => typeof value === "string" && value.trim().length > 0)
        .map(([key, value]) => [key, String(value).trim()])
    );
  } catch {
    return { raw: tracker.trim() };
  }
}

export function parseUtmMedium(tracker: string | null): string {
  const parsed = parseUtmTracker(tracker);
  return parsed.utm_medium || parsed.medium || "unknown";
}

export function parseUtmCampaign(tracker: string | null): string {
  const parsed = parseUtmTracker(tracker);
  return parsed.utm_campaign || parsed.campaign || "unknown";
}

export function classifyPlacement(tracker: string | null): string {
  const parsed = parseUtmTracker(tracker);
  const combined = Object.values(parsed).join(" ").toLowerCase();
  if (!combined) return "Hosted";
  if (/(embed|widget|iframe|partner)/.test(combined)) return "Embedded";
  if (/(paid|meta|google|campaign|newsletter|email|social)/.test(combined)) return "Campaign";
  return parsed.utm_source ? "Channel Landing" : "Hosted";
}

export function hoursSince(iso: string | null): number | null {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return null;
  return round1((Date.now() - time) / 3_600_000);
}

export function buildTrustDescriptor(input: {
  source: string;
  mode: TrustDescriptor["mode"];
  sampleSize: number;
  lastUpdated: string | null;
  staleAfterHours?: number;
  warning?: string | null;
}): TrustDescriptor {
  const freshnessHours = hoursSince(input.lastUpdated);
  const staleAfterHours = input.staleAfterHours ?? 24;
  const warning =
    input.warning ??
    (input.sampleSize === 0
      ? "No rows available for the selected window."
      : freshnessHours != null && freshnessHours > staleAfterHours
        ? `Data is stale (${freshnessHours}h old).`
        : null);

  return {
    source: input.source,
    mode: input.mode,
    sampleSize: input.sampleSize,
    lastUpdated: input.lastUpdated,
    freshnessHours,
    warning,
  };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const lower = sorted.at(middle - 1);
  const upper = sorted.at(middle);
  return sorted.length % 2 === 0
    ? lower != null && upper != null
      ? round1((lower + upper) / 2)
      : null
    : upper != null
      ? round1(upper)
      : null;
}

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function tokenizeSemantic(value: string): string[] {
  const normalized = normalizeToken(value);
  if (!normalized) return [];

  const baseTokens = normalized
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
  const expanded = new Set(baseTokens);

  for (const token of baseTokens) {
    const expansions: string[] = SEMANTIC_EXPANSIONS.get(token) ?? [];
    for (const expansion of expansions) {
      expanded.add(expansion);
    }
  }

  for (const [root, expansions] of SEMANTIC_EXPANSIONS.entries()) {
    if (expansions.some((expansion) => normalized.includes(expansion))) {
      expanded.add(root);
    }
  }

  return [...expanded];
}

export function semanticScore(query: string, text: string, keywords: string[] = []): number {
  const queryTokens = tokenizeSemantic(query);
  if (queryTokens.length === 0) return 0;

  const haystack = new Set([
    ...tokenizeSemantic(text),
    ...keywords.flatMap((keyword) => tokenizeSemantic(keyword)),
  ]);

  let score = 0;
  for (const token of queryTokens) {
    if (haystack.has(token)) score += 8;
    if (text.toLowerCase().includes(token)) score += 4;
  }
  if (text.toLowerCase().includes(query.toLowerCase())) score += 10;
  return score;
}

export function excerpt(text: string, length = 140): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= length) return trimmed;
  return `${trimmed.slice(0, length - 1)}…`;
}

export function parseAnswerCount(answers: Record<string, unknown> | null): number {
  return answers ? Object.keys(answers).length : 0;
}

export function sourceLabel(tracker: string | null): string {
  return parseUtmSource(tracker, "Direct");
}

/* ------------------------------------------------------------------ */
/*  Marketing-channel classifier (for the journey-flow Sankey)         */
/* ------------------------------------------------------------------ */

/**
 * Canonical acquisition-channel buckets, in display order. The journey Sankey
 * uses these as its left-edge source nodes. Keep "Other"/"Direct" last.
 */
export const CHANNEL_BUCKETS = [
  "Google Ads",
  "Paid Social",
  "Organic Search",
  "Organic Social",
  "Email",
  "Referral",
  "Direct",
  "Other",
] as const;

export type ChannelBucket = (typeof CHANNEL_BUCKETS)[number];

const SEARCH_ENGINES = new Set([
  "google",
  "bing",
  "yahoo",
  "duckduckgo",
  "ecosia",
  "baidu",
  "yandex",
]);
const SOCIAL_SOURCES = new Set([
  "facebook",
  "fb",
  "instagram",
  "ig",
  "meta",
  "tiktok",
  "twitter",
  "x",
  "linkedin",
  "pinterest",
  "snapchat",
  "reddit",
  "youtube",
  "threads",
]);
const PAID_MEDIA = new Set([
  "cpc",
  "ppc",
  "paid",
  "paidsearch",
  "paid_search",
  "paid-search",
  "paidsocial",
  "paid_social",
  "paid-social",
  "display",
  "banner",
  "sem",
  "ads",
  "cpm",
  "retargeting",
]);
const EMAIL_MEDIA = new Set(["email", "e-mail", "mail", "newsletter"]);
const EMAIL_SOURCES = new Set(["newsletter", "email", "klaviyo", "mailchimp", "resend"]);
const GOOGLE_ADS_SOURCES = new Set([
  "google",
  "googleads",
  "google_ads",
  "adwords",
  "gads",
  "bing",
]);

/**
 * Classify a stored `utm_tracker` JSON blob into one of `CHANNEL_BUCKETS`,
 * using utm_source + utm_medium. Designed for messy real-world UTM data:
 * unknown/missing values fall back to Direct (nothing) or Other (a source we
 * can't place). Pure + deterministic so it's unit-testable.
 */
export function classifyChannel(tracker: string | null): ChannelBucket {
  const parsed = parseUtmTracker(tracker);
  const source = (parsed.utm_source || parsed.source || "").toLowerCase().trim();
  const mediumRaw = (parsed.utm_medium || parsed.medium || "").toLowerCase().trim();
  // GA writes the literal placeholders "(none)" / "(direct)" for untagged
  // traffic — treat them as absent so they bucket correctly (organic / direct).
  const medium = mediumRaw === "(none)" || mediumRaw === "none" ? "" : mediumRaw;

  // Nothing meaningful → direct/typed-in traffic.
  if ((!source || source === "(direct)") && !medium) return "Direct";

  const isPaid = PAID_MEDIA.has(medium);
  const isSocial = SOCIAL_SOURCES.has(source) || /social/.test(medium);
  const isSearchEngine = SEARCH_ENGINES.has(source);

  // Email first — distinctive and easy to misread as "referral".
  if (EMAIL_MEDIA.has(medium) || EMAIL_SOURCES.has(source)) return "Email";

  if (isPaid) {
    if (isSocial) return "Paid Social";
    if (isSearchEngine || GOOGLE_ADS_SOURCES.has(source)) return "Google Ads";
    return "Other";
  }

  // Non-paid from here.
  if (isSearchEngine && (medium === "organic" || medium === "" || medium === "search")) {
    return "Organic Search";
  }
  if (isSocial) return "Organic Social";
  if (medium === "referral" || medium === "ref") return "Referral";

  // A source we couldn't place (and not direct).
  return "Other";
}
