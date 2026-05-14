import { getBreaker } from "@/lib/circuit-breaker";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import {
  DEFAULT_REPORT_PURCHASE_PLAN_ID,
  REPORT_PURCHASE_PLAN_IDS,
  type ReportPurchasePlanId,
} from "@features/checkout/server/reportPurchase";
import {
  resolveSubmissionAccessContext,
  ensurePersonalReportForSubmission,
} from "@/lib/report/personalReport";
import { parseUtmSource } from "@/lib/survey/utils";

const SUPABASE_TIMEOUT_MS = 8_000;
const QUOTE_VALIDITY_MS = 21 * 24 * 60 * 60 * 1_000;

/**
 * Per-plan discount ladder — source: `Tracking & Pricing - Prices (1).csv` rows 6-9.
 * Essentials + Full Report share the same ladder that deepens to -70% at 14d.
 * All Reports caps at -30% past 72h so the premium tier never free-falls.
 * Multipliers are applied to the quote's `starting_price` (NOT to MSRP).
 */
const ONE_HOUR_MS = 60 * 60 * 1_000;
const PLAN_LADDER_ESSENTIALS_FULL = [
  { delayMs: 0, multiplier: 1, step: 0 },
  { delayMs: 24 * ONE_HOUR_MS, multiplier: 0.9, step: 1 }, // -10%
  { delayMs: 72 * ONE_HOUR_MS, multiplier: 0.7, step: 2 }, // -30%
  { delayMs: 7 * 24 * ONE_HOUR_MS, multiplier: 0.5, step: 3 }, // -50%
  { delayMs: 14 * 24 * ONE_HOUR_MS, multiplier: 0.3, step: 4 }, // -70%
] as const;
const PLAN_LADDER_ALL = [
  { delayMs: 0, multiplier: 1, step: 0 },
  { delayMs: 24 * ONE_HOUR_MS, multiplier: 0.9, step: 1 }, // -10%
  { delayMs: 72 * ONE_HOUR_MS, multiplier: 0.7, step: 2 }, // -30%
  { delayMs: 7 * 24 * ONE_HOUR_MS, multiplier: 0.7, step: 3 }, // cap at -30%
  { delayMs: 14 * 24 * ONE_HOUR_MS, multiplier: 0.7, step: 4 }, // cap at -30%
] as const;
const PLAN_LADDERS = {
  essentials: PLAN_LADDER_ESSENTIALS_FULL,
  full_report: PLAN_LADDER_ESSENTIALS_FULL,
  all_reports: PLAN_LADDER_ALL,
} as const satisfies Record<
  ReportPurchasePlanId,
  ReadonlyArray<{ delayMs: number; multiplier: number; step: number }>
>;

const PRICING_SIGNAL_QIDS = ["15001", "16012", "03005", "03010", "03012"] as const;
const PRICING_SIGNAL_SELECT = [
  "answer_text",
  "normalized_value",
  "survey_question!inner(frontend_qid)",
  "answer_option!fk_ssa_answer_option(option_text)",
].join(",");

/**
 * Pricing buckets — source: `Tracking & Pricing - Prices (1).csv` rows 2-4.
 * Each plan has 3 buckets (A / B / C) with a weighted distribution (20/10/70).
 * MSRP is the struck-out anchor shown in the discount email and modal;
 * `startingCents` is the initial sale price before any ladder discount.
 * The ladder multipliers in `PLAN_LADDERS` are applied to `startingCents`.
 */
export type PricingBucketCode = "A" | "B" | "C";
interface PricingBucket {
  code: PricingBucketCode;
  weight: number; // out of 100
  msrpCents: number;
  startingCents: number;
}
const PLAN_BUCKETS: Record<ReportPurchasePlanId, readonly PricingBucket[]> = {
  essentials: [
    { code: "A", weight: 20, msrpCents: 2999, startingCents: 799 },
    { code: "B", weight: 10, msrpCents: 1999, startingCents: 699 },
    { code: "C", weight: 70, msrpCents: 999, startingCents: 299 },
  ],
  full_report: [
    { code: "A", weight: 20, msrpCents: 6999, startingCents: 999 },
    { code: "B", weight: 10, msrpCents: 5999, startingCents: 899 },
    { code: "C", weight: 70, msrpCents: 4999, startingCents: 499 },
  ],
  all_reports: [
    { code: "A", weight: 20, msrpCents: 35900, startingCents: 9900 },
    { code: "B", weight: 10, msrpCents: 25900, startingCents: 8900 },
    { code: "C", weight: 70, msrpCents: 15900, startingCents: 4999 },
  ],
};

const COUNTRY_CODE_TO_TIER: Record<
  string,
  { multiplier: number; tier: "tier_1" | "tier_2" | "tier_3" | "tier_4" | "tier_5" | "default" }
> = {
  US: { multiplier: 1.2, tier: "tier_1" },
  CH: { multiplier: 1.2, tier: "tier_1" },
  NO: { multiplier: 1.2, tier: "tier_1" },
  DK: { multiplier: 1.2, tier: "tier_1" },
  SG: { multiplier: 1.2, tier: "tier_1" },
  AE: { multiplier: 1.2, tier: "tier_1" },
  DE: { multiplier: 1, tier: "tier_2" },
  FR: { multiplier: 1, tier: "tier_2" },
  UK: { multiplier: 1, tier: "tier_2" },
  GB: { multiplier: 1, tier: "tier_2" },
  NL: { multiplier: 1, tier: "tier_2" },
  SE: { multiplier: 1, tier: "tier_2" },
  CA: { multiplier: 1, tier: "tier_2" },
  AU: { multiplier: 1, tier: "tier_2" },
  PL: { multiplier: 0.8, tier: "tier_3" },
  CZ: { multiplier: 0.8, tier: "tier_3" },
  HU: { multiplier: 0.8, tier: "tier_3" },
  RO: { multiplier: 0.8, tier: "tier_3" },
  GR: { multiplier: 0.8, tier: "tier_3" },
  TR: { multiplier: 0.8, tier: "tier_3" },
  BR: { multiplier: 0.6, tier: "tier_4" },
  MX: { multiplier: 0.6, tier: "tier_4" },
  AR: { multiplier: 0.6, tier: "tier_4" },
  CL: { multiplier: 0.6, tier: "tier_4" },
  CO: { multiplier: 0.6, tier: "tier_4" },
  IN: { multiplier: 0.5, tier: "tier_5" },
  ID: { multiplier: 0.5, tier: "tier_5" },
  PH: { multiplier: 0.5, tier: "tier_5" },
  VN: { multiplier: 0.5, tier: "tier_5" },
};

const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  ARGENTINA: "AR",
  AUSTRALIA: "AU",
  BELGIUM: "BE",
  BRAZIL: "BR",
  CANADA: "CA",
  CHILE: "CL",
  COLOMBIA: "CO",
  CZECHIA: "CZ",
  "CZECH REPUBLIC": "CZ",
  DENMARK: "DK",
  FRANCE: "FR",
  GERMANY: "DE",
  GREECE: "GR",
  HUNGARY: "HU",
  INDIA: "IN",
  INDONESIA: "ID",
  MEXICO: "MX",
  NETHERLANDS: "NL",
  NORWAY: "NO",
  PHILIPPINES: "PH",
  POLAND: "PL",
  ROMANIA: "RO",
  SINGAPORE: "SG",
  SWEDEN: "SE",
  SWITZERLAND: "CH",
  TURKEY: "TR",
  "UNITED ARAB EMIRATES": "AE",
  "UNITED KINGDOM": "GB",
  "UNITED STATES": "US",
  USA: "US",
  VIETNAM: "VN",
};

const PRICING_SESSION_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PricingExperimentGroup = "A" | "B";
export type PricingDeviceType = "iOS" | "Android" | "Desktop";
export type PricingTrafficSource =
  | "direct"
  | "newsletter"
  | "google"
  | "instagram"
  | "tiktok"
  | "other";
export type PricingBehavioralBucket = "zero" | "light" | "moderate" | "consistent" | "serious";

export interface ReportPriceQuoteSnapshot {
  id: number;
  plan: ReportPurchasePlanId;
  currency: "EUR";
  experimentGroup: PricingExperimentGroup;
  basePriceBucket: string;
  basePriceCents: number;
  /**
   * MSRP / retail anchor for the bucket — this is the strike-out "old price"
   * shown in the discount email and pricing modal. Persisted on the quote row
   * so the strike is stable even if the pricing table changes later.
   */
  msrpCents: number;
  /**
   * Pre-ladder sale price (MSRP × bucket-specific discount: 0.75 for
   * Essentials, 0.5 for Full/All). The time-based discount ladder scales
   * relative to this value, not to MSRP.
   */
  startingPriceCents: number;
  currentPriceCents: number;
  initialPriceCents: number;
  discountMultiplier: number;
  discountStep: number;
  pricingClusterId: string;
  countryTier: string;
  countryMultiplier: number;
  deviceType: PricingDeviceType;
  deviceMultiplier: number;
  trafficSource: PricingTrafficSource;
  trafficMultiplier: number;
  behavioralBucket: PricingBehavioralBucket;
  behavioralMultiplier: number;
  engagementScore: number;
  engagementMultiplier: number;
  reportPreviewViews: number;
  fantasySignalCount: number;
  surveyDurationMs: number | null;
  initialPriceTimestamp: string;
  expiresAt: string;
  checkoutStartedAt: string | null;
  purchasedAt: string | null;
  viewCount: number;
}

interface ServiceFetchOptions {
  body?: string;
  headers?: Record<string, string>;
  method?: string;
  timeoutMs?: number;
}

interface SurveySubmissionContextRow {
  app_user:
    | {
        email?: string | null;
        id?: number | null;
        utm_tracker?: string | null;
        user_profile?:
          | {
              location_primary?: string | null;
            }
          | Array<{
              location_primary?: string | null;
            }>
          | null;
      }
    | Array<{
        email?: string | null;
        id?: number | null;
        utm_tracker?: string | null;
        user_profile?:
          | {
              location_primary?: string | null;
            }
          | Array<{
              location_primary?: string | null;
            }>
          | null;
      }>
    | null;
  duration_ms: number | null;
  id: number;
  user_id: number | null;
  utm_tracker: string | null;
}

interface SubmissionAnswerRow {
  answer_option: {
    option_text?: string | null;
  } | null;
  answer_text: string | null;
  normalized_value: number | null;
  survey_question: {
    frontend_qid: string;
  } | null;
}

interface ReportPriceQuoteRow {
  id: number;
  personal_report_id: number;
  survey_submission_id: number;
  user_id: number | null;
  plan: ReportPurchasePlanId;
  currency: string;
  experiment_group: PricingExperimentGroup;
  base_price_bucket: string;
  base_price: number;
  /** MSRP anchor in EUR (numeric). Nullable for rows written before the 2026-04 pricing migration. */
  msrp?: number | null;
  /** Starting-sale price in EUR (numeric). Nullable for legacy rows. */
  starting_price?: number | null;
  current_price: number;
  initial_price: number;
  discount_step: number;
  discount_multiplier: number;
  pricing_cluster_id: string;
  country_tier: string;
  country_multiplier: number;
  device_type: PricingDeviceType;
  device_multiplier: number;
  traffic_source: PricingTrafficSource;
  traffic_multiplier: number;
  behavioral_bucket: PricingBehavioralBucket;
  behavioral_multiplier: number;
  engagement_score: number;
  engagement_multiplier: number;
  report_preview_views: number;
  fantasy_signal_count: number;
  survey_duration_ms: number | null;
  initial_price_timestamp: string;
  expires_at: string;
  checkout_started_at: string | null;
  purchased_at: string | null;
  metadata: Record<string, unknown> | null;
  view_count: number;
}

interface SessionLockedQuote {
  currentPriceCents: number;
  discountMultiplier: number;
  discountStep: number;
  lockedAt: string;
}

interface StoredSessionLock extends SessionLockedQuote {
  pricingSessionId: string;
}

interface SnapshotOverride {
  currentPriceCents: number;
  discountMultiplier: number;
  discountStep: number;
}

interface BuiltQuotePayload {
  payload: {
    base_price: number;
    base_price_bucket: string;
    msrp: number;
    starting_price: number;
    behavioral_bucket: PricingBehavioralBucket;
    behavioral_multiplier: number;
    checkout_started_at: string | null;
    country_multiplier: number;
    country_tier: string;
    currency: "EUR";
    current_price: number;
    device_multiplier: number;
    device_type: PricingDeviceType;
    discount_multiplier: number;
    discount_step: number;
    experiment_group: PricingExperimentGroup;
    engagement_multiplier: number;
    engagement_score: number;
    expires_at: string;
    fantasy_signal_count: number;
    initial_price: number;
    initial_price_timestamp: string;
    last_viewed_at: string;
    metadata: Record<string, unknown>;
    plan: ReportPurchasePlanId;
    pricing_cluster_id: string;
    purchased_at: string | null;
    report_preview_views: number;
    survey_duration_ms: number | null;
    traffic_multiplier: number;
    traffic_source: PricingTrafficSource;
    updated_date_time: string;
    view_count: number;
  };
  snapshotOverride: SnapshotOverride | null;
}

interface PricingContext {
  personalReportId: number;
  reportToken: string | null;
  submissionId: number;
  surveyDurationMs: number | null;
  previewViews: number;
  userId: number | null;
  userAgent: string | null;
  utmTracker: string | null;
  countryCode: string | null;
  behavioralAnswer: string | null;
  fantasySignalCount: number;
}

function getSupabaseServiceConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("supabase_not_configured");
  }

  return { serviceRoleKey, url };
}

async function supabaseServiceFetch(path: string, options: ServiceFetchOptions = {}) {
  const { url, serviceRoleKey } = getSupabaseServiceConfig();
  const { method = "GET", body, headers = {}, timeoutMs = SUPABASE_TIMEOUT_MS } = options;

  return getBreaker("supabase").fire(() =>
    fetchWithTimeout(`${url}${path}`, {
      body,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        ...headers,
      },
      method,
      timeoutMs,
    })
  );
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function toEuroAmount(cents: number) {
  return Number((cents / 100).toFixed(2));
}

function fromEuroAmount(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.round(value * 100);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeSessionLock(value: unknown): SessionLockedQuote | null {
  if (!isRecord(value)) {
    return null;
  }

  const currentPriceCents = value.currentPriceCents;
  const discountMultiplier = value.discountMultiplier;
  const discountStep = value.discountStep;
  const lockedAt = value.lockedAt;

  if (
    typeof currentPriceCents !== "number" ||
    !Number.isFinite(currentPriceCents) ||
    typeof discountMultiplier !== "number" ||
    !Number.isFinite(discountMultiplier) ||
    typeof discountStep !== "number" ||
    !Number.isInteger(discountStep) ||
    typeof lockedAt !== "string"
  ) {
    return null;
  }

  return {
    currentPriceCents,
    discountMultiplier,
    discountStep,
    lockedAt,
  };
}

function isPricingSessionId(value: string) {
  return PRICING_SESSION_ID_REGEX.test(value);
}

function getSessionLocks(
  metadata: Record<string, unknown> | null | undefined
): StoredSessionLock[] {
  if (!metadata) {
    return [];
  }

  const rawSessionLocks = metadata.sessionLocks;
  if (Array.isArray(rawSessionLocks)) {
    return rawSessionLocks.flatMap((entry) => {
      if (!isRecord(entry)) {
        return [];
      }

      const pricingSessionId =
        typeof entry.pricingSessionId === "string" && isPricingSessionId(entry.pricingSessionId)
          ? entry.pricingSessionId
          : null;
      const normalized = normalizeSessionLock(entry);

      return pricingSessionId && normalized ? [{ pricingSessionId, ...normalized }] : [];
    });
  }

  if (!isRecord(rawSessionLocks)) {
    return [];
  }

  const locks: StoredSessionLock[] = [];
  for (const [pricingSessionId, value] of Object.entries(rawSessionLocks)) {
    if (!isPricingSessionId(pricingSessionId)) {
      continue;
    }

    const normalized = normalizeSessionLock(value);
    if (normalized) {
      locks.push({ pricingSessionId, ...normalized });
    }
  }

  return locks;
}

function getSessionLockedQuote({
  metadata,
  pricingSessionId,
}: {
  metadata: Record<string, unknown> | null | undefined;
  pricingSessionId?: string | null;
}) {
  if (!pricingSessionId) {
    return null;
  }

  return (
    getSessionLocks(metadata).find((entry) => entry.pricingSessionId === pricingSessionId) ?? null
  );
}

function mergeSessionLockedQuote({
  existingMetadata,
  pricingSessionId,
  sessionLockedQuote,
}: {
  existingMetadata: Record<string, unknown> | null | undefined;
  pricingSessionId?: string | null;
  sessionLockedQuote?: SessionLockedQuote | null;
}) {
  const metadata = isRecord(existingMetadata) ? { ...existingMetadata } : {};

  if (!pricingSessionId || !sessionLockedQuote) {
    return metadata;
  }

  const prunedLocks = [
    { pricingSessionId, ...sessionLockedQuote },
    ...getSessionLocks(existingMetadata).filter(
      (entry) => entry.pricingSessionId !== pricingSessionId
    ),
  ]
    .sort((left, right) => right.lockedAt.localeCompare(left.lockedAt))
    .slice(0, 12);

  metadata.sessionLocks = prunedLocks;
  return metadata;
}

export function formatReportPrice(cents: number, currency = "EUR") {
  return new Intl.NumberFormat("en-IE", {
    currency,
    style: "currency",
  }).format(cents / 100);
}

export function normalizePriceEnding(rawCents: number) {
  const rounded = Math.max(49, Math.round(rawCents));
  const euroFloor = Math.floor(rounded / 100);
  const candidates = [
    euroFloor * 100 + 49,
    euroFloor * 100 + 99,
    (euroFloor + 1) * 100 + 49,
    (euroFloor + 1) * 100 + 99,
  ];

  return candidates.find((candidate) => candidate >= rounded) ?? rounded;
}

export function getPricingExperimentGroup(personalReportId: number): PricingExperimentGroup {
  return hashString(`experiment:${personalReportId}`) % 2 === 0 ? "A" : "B";
}

/**
 * Deterministic bucket selection using the hash-of-personalReportId seeded
 * against the weighted distribution (A=20%, B=10%, C=70%). One bucket per
 * user — the same code (A/B/C) is applied across all three plans so the
 * tier ladder stays monotonic (Full Report ≥ Essentials, All ≥ Full).
 */
function pickBucket(plan: ReportPurchasePlanId, personalReportId: number): PricingBucket {
  // eslint-disable-next-line security/detect-object-injection -- plan is a closed union of internal purchase-plan ids.
  const buckets = PLAN_BUCKETS[plan];
  const draw = hashString(`bucket:${personalReportId}`) % 100;
  let running = 0;
  for (const bucket of buckets) {
    running += bucket.weight;
    if (draw < running) {
      return bucket;
    }
  }
  // Weights sum to 100; the loop always returns, but fall through defensively.
  // Callers only pass non-empty `buckets`, so the final index is defined.
  return buckets[buckets.length - 1]!;
}

function bucketFromCode(
  plan: ReportPurchasePlanId,
  code: string | null | undefined
): PricingBucket | null {
  if (!code) return null;
  // eslint-disable-next-line security/detect-object-injection -- plan is a closed union.
  const buckets = PLAN_BUCKETS[plan];
  return buckets.find((bucket) => bucket.code === code) ?? null;
}

function normalizeCountryCode(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const collapsed = trimmed.toUpperCase();
  if (collapsed.length === 2) {
    return collapsed;
  }

  // eslint-disable-next-line security/detect-object-injection -- normalized country labels resolve against a static internal dictionary.
  return COUNTRY_NAME_TO_CODE[collapsed] ?? null;
}

function getCountryPricing(code: string | null) {
  const resolvedCode = normalizeCountryCode(code);
  return (
    // eslint-disable-next-line security/detect-object-injection -- normalized ISO country codes only index a static pricing tier table.
    (resolvedCode ? COUNTRY_CODE_TO_TIER[resolvedCode] : null) ?? {
      multiplier: 0.9,
      tier: "default" as const,
    }
  );
}

export function getDeviceTypeFromUserAgent(
  userAgent: string | null | undefined
): PricingDeviceType {
  const normalized = (userAgent ?? "").toLowerCase();

  if (
    normalized.includes("iphone") ||
    normalized.includes("ipad") ||
    normalized.includes("ipod") ||
    (normalized.includes("mac os") && normalized.includes("mobile"))
  ) {
    return "iOS";
  }

  if (normalized.includes("android")) {
    return "Android";
  }

  return "Desktop";
}

function getDeviceMultiplier(deviceType: PricingDeviceType) {
  switch (deviceType) {
    case "iOS":
      return 1.15;
    case "Desktop":
      return 1.05;
    case "Android":
      return 0.95;
    default:
      return 1;
  }
}

function normalizeTrafficSource(value: string | null | undefined): PricingTrafficSource {
  const normalized = value?.trim().toLowerCase() ?? "";

  if (!normalized || normalized === "(direct)" || normalized === "direct") {
    return "direct";
  }

  if (normalized.includes("newsletter") || normalized.includes("email")) {
    return "newsletter";
  }

  if (normalized.includes("google")) {
    return "google";
  }

  if (normalized.includes("instagram") || normalized === "ig") {
    return "instagram";
  }

  if (normalized.includes("tiktok") || normalized.includes("tik tok")) {
    return "tiktok";
  }

  return "other";
}

function getTrafficMultiplier(trafficSource: PricingTrafficSource) {
  switch (trafficSource) {
    case "direct":
      return 1.1;
    case "newsletter":
      return 1;
    case "google":
      return 1.1;
    case "instagram":
      return 0.85;
    case "tiktok":
      return 0.65;
    case "other":
    default:
      return 0.95;
  }
}

function normalizeBehavioralAnswer(value: string | null | undefined) {
  return (value ?? "").replace(/[^\d+,-]/g, "").trim();
}

export function getBehavioralPricing(answer: string | null | undefined): {
  bucket: PricingBehavioralBucket;
  multiplier: number;
} {
  const normalized = normalizeBehavioralAnswer(answer);

  if (!normalized || normalized === "0") {
    return { bucket: "zero", multiplier: 0.7 };
  }

  if (normalized.includes("1500")) {
    return { bucket: "serious", multiplier: 1.2 };
  }

  if (normalized.includes("700")) {
    return { bucket: "serious", multiplier: 1.2 };
  }

  if (normalized.includes("300")) {
    return { bucket: "consistent", multiplier: 1.1 };
  }

  if (normalized.includes("100")) {
    return { bucket: "moderate", multiplier: 1 };
  }

  return { bucket: "light", multiplier: 0.9 };
}

export function getEngagementScore({
  fantasySignalCount,
  previewViews,
  surveyDurationMs,
}: {
  fantasySignalCount: number;
  previewViews: number;
  surveyDurationMs: number | null;
}) {
  let score = 0;

  if ((surveyDurationMs ?? 0) > 8 * 60 * 1_000) {
    score += 20;
  }

  if (previewViews >= 2) {
    score += 20;
  }

  if (fantasySignalCount > 0) {
    score += 20;
  }

  return score;
}

function getEngagementMultiplier(engagementScore: number) {
  return engagementScore >= 40 ? 1.1 : 1;
}

export function getDiscountAdjustment({
  initialPriceTimestamp,
  now = new Date(),
  plan = "full_report",
}: {
  initialPriceTimestamp: string;
  now?: Date;
  plan?: ReportPurchasePlanId;
}) {
  const initialTimestampMs = new Date(initialPriceTimestamp).getTime();
  const ageMs = Math.max(0, now.getTime() - initialTimestampMs);

  // eslint-disable-next-line security/detect-object-injection -- plan is a closed union.
  const ladder = PLAN_LADDERS[plan];
  let resolved: (typeof ladder)[number] = ladder[0];

  for (const candidate of ladder) {
    if (ageMs >= candidate.delayMs) {
      resolved = candidate;
    }
  }

  return resolved;
}

function getUserProfileLocation(
  profile:
    | {
        location_primary?: string | null;
      }
    | Array<{
        location_primary?: string | null;
      }>
    | null
) {
  if (Array.isArray(profile)) {
    return profile[0]?.location_primary ?? null;
  }

  return profile?.location_primary ?? null;
}

function getSubmissionAppUser(appUser: SurveySubmissionContextRow["app_user"]) {
  return Array.isArray(appUser) ? (appUser[0] ?? null) : (appUser ?? null);
}

function buildPricingClusterId({
  baseBucket,
  behavioralBucket,
  countryTier,
  deviceType,
  discountStep,
  engagementScore,
  experimentGroup,
  plan,
  trafficSource,
}: {
  baseBucket: string;
  behavioralBucket: PricingBehavioralBucket;
  countryTier: string;
  deviceType: PricingDeviceType;
  discountStep: number;
  engagementScore: number;
  experimentGroup: PricingExperimentGroup;
  plan: ReportPurchasePlanId;
  trafficSource: PricingTrafficSource;
}) {
  const engagementBand = engagementScore >= 40 ? "engaged" : "standard";
  return [
    experimentGroup,
    plan,
    baseBucket,
    countryTier,
    deviceType.toLowerCase(),
    trafficSource,
    behavioralBucket,
    engagementBand,
    `d${discountStep}`,
  ].join("-");
}

function toSnapshot(
  row: ReportPriceQuoteRow,
  override?: SnapshotOverride | null
): ReportPriceQuoteSnapshot {
  // Backfill msrp + starting_price for legacy rows that predate the 2026-04
  // pricing migration. Fall back to the bucket catalogue if the row matches a
  // known bucket code, else to the stored initial_price so the snapshot is
  // always numerically self-consistent.
  const catalogueBucket = bucketFromCode(row.plan, row.base_price_bucket);
  const initialCents = fromEuroAmount(row.initial_price);
  const msrpCents =
    row.msrp != null ? fromEuroAmount(row.msrp) : (catalogueBucket?.msrpCents ?? initialCents);
  const startingCents =
    row.starting_price != null
      ? fromEuroAmount(row.starting_price)
      : (catalogueBucket?.startingCents ?? initialCents);

  return {
    id: row.id,
    plan: row.plan,
    currency: "EUR",
    experimentGroup: row.experiment_group,
    basePriceBucket: row.base_price_bucket,
    basePriceCents: fromEuroAmount(row.base_price),
    msrpCents,
    startingPriceCents: startingCents,
    currentPriceCents: override?.currentPriceCents ?? fromEuroAmount(row.current_price),
    initialPriceCents: initialCents,
    discountMultiplier: override?.discountMultiplier ?? row.discount_multiplier,
    discountStep: override?.discountStep ?? row.discount_step,
    pricingClusterId: row.pricing_cluster_id,
    countryTier: row.country_tier,
    countryMultiplier: row.country_multiplier,
    deviceType: row.device_type,
    deviceMultiplier: row.device_multiplier,
    trafficSource: row.traffic_source,
    trafficMultiplier: row.traffic_multiplier,
    behavioralBucket: row.behavioral_bucket,
    behavioralMultiplier: row.behavioral_multiplier,
    engagementScore: row.engagement_score,
    engagementMultiplier: row.engagement_multiplier,
    reportPreviewViews: row.report_preview_views,
    fantasySignalCount: row.fantasy_signal_count,
    surveyDurationMs: row.survey_duration_ms,
    initialPriceTimestamp: row.initial_price_timestamp,
    expiresAt: row.expires_at,
    checkoutStartedAt: row.checkout_started_at,
    purchasedAt: row.purchased_at,
    viewCount: row.view_count,
  };
}

async function getPricingContext({
  reportSessionId,
  reportToken,
  submissionId,
  userAgent,
}: {
  reportSessionId?: string | null;
  reportToken?: string | null;
  submissionId?: number | null;
  userAgent?: string | null;
}): Promise<PricingContext | null> {
  const accessContext = await resolveSubmissionAccessContext({
    reportSessionId,
    reportToken,
    submissionId,
  });

  if (!accessContext?.submissionId) {
    return null;
  }

  const personalReport = await ensurePersonalReportForSubmission({
    reportToken: reportToken ?? null,
    submissionId: accessContext.submissionId,
  });

  if (!personalReport?.id) {
    return null;
  }

  const [submissionResponse, answersResponse, previewResponse] = await Promise.all([
    supabaseServiceFetch(
      `/rest/v1/survey_submission?id=eq.${accessContext.submissionId}&select=id,user_id,utm_tracker,duration_ms,app_user!fk_survey_submission_user(id,email,utm_tracker,user_profile(location_primary))&limit=1`
    ),
    supabaseServiceFetch(
      `/rest/v1/survey_submission_answer?survey_submission_id=eq.${accessContext.submissionId}&select=${PRICING_SIGNAL_SELECT}&survey_question.frontend_qid=in.(${PRICING_SIGNAL_QIDS.join(",")})`
    ),
    supabaseServiceFetch(
      `/rest/v1/report_session?personal_report_id=eq.${personalReport.id}&select=id`
    ),
  ]);

  if (!submissionResponse.ok || !answersResponse.ok || !previewResponse.ok) {
    throw new Error("pricing_context_lookup_failed");
  }

  const submissionRows = (await submissionResponse.json()) as SurveySubmissionContextRow[];
  const answerRows = (await answersResponse.json()) as SubmissionAnswerRow[];
  const previewRows = (await previewResponse.json()) as Array<{ id: number }>;
  const submissionRow = submissionRows[0];

  if (!submissionRow) {
    return null;
  }

  const appUser = getSubmissionAppUser(submissionRow.app_user);
  const countryAnswer =
    answerRows.find((row) => row.survey_question?.frontend_qid === "15001")?.answer_option
      ?.option_text ??
    answerRows.find((row) => row.survey_question?.frontend_qid === "15001")?.answer_text ??
    getUserProfileLocation(appUser?.user_profile ?? null);
  const behavioralAnswer =
    answerRows.find((row) => row.survey_question?.frontend_qid === "16012")?.answer_option
      ?.option_text ??
    answerRows.find((row) => row.survey_question?.frontend_qid === "16012")?.answer_text ??
    null;

  const fantasySignalCount = answerRows.reduce((count, row) => {
    const qid = row.survey_question?.frontend_qid;
    const optionText =
      row.answer_option?.option_text?.toLowerCase() ?? row.answer_text?.toLowerCase() ?? "";

    if (qid === "03005" && optionText.includes("fantasy")) {
      return count + 1;
    }

    if (
      qid === "03010" &&
      (optionText.includes("adventurous") ||
        optionText.includes("taboo") ||
        optionText.includes("edge") ||
        optionText.includes("high-risk"))
    ) {
      return count + 1;
    }

    if (qid === "03012" && (row.normalized_value ?? 0) >= 5) {
      return count + 1;
    }

    return count;
  }, 0);

  return {
    personalReportId: personalReport.id,
    reportToken: reportToken ?? null,
    submissionId: accessContext.submissionId,
    surveyDurationMs: submissionRow.duration_ms ?? null,
    previewViews: previewRows.length,
    userId: submissionRow.user_id ?? accessContext.userId,
    userAgent: userAgent ?? null,
    utmTracker: submissionRow.utm_tracker ?? appUser?.utm_tracker ?? null,
    countryCode: countryAnswer ?? null,
    behavioralAnswer,
    fantasySignalCount,
  };
}

async function fetchStoredQuote({
  personalReportId,
  plan,
}: {
  personalReportId: number;
  plan: ReportPurchasePlanId;
}) {
  const response = await supabaseServiceFetch(
    `/rest/v1/report_price_quote?personal_report_id=eq.${personalReportId}&plan=eq.${plan}&select=*&limit=1`
  );

  if (!response.ok) {
    throw new Error("pricing_quote_lookup_failed");
  }

  const rows = (await response.json()) as ReportPriceQuoteRow[];
  return rows[0] ?? null;
}

async function fetchStoredQuoteById(quoteId: number) {
  const response = await supabaseServiceFetch(
    `/rest/v1/report_price_quote?id=eq.${quoteId}&select=*&limit=1`
  );

  if (!response.ok) {
    throw new Error("pricing_quote_lookup_failed");
  }

  const rows = (await response.json()) as ReportPriceQuoteRow[];
  return rows[0] ?? null;
}

function buildQuotePayload({
  context,
  existingQuote,
  regenerateInitialPrice,
  now,
  plan,
  pricingSessionId,
}: {
  context: PricingContext;
  existingQuote?: ReportPriceQuoteRow | null;
  regenerateInitialPrice: boolean;
  now: Date;
  plan: ReportPurchasePlanId;
  pricingSessionId?: string | null;
}): BuiltQuotePayload {
  const experimentGroup =
    existingQuote?.experiment_group ?? getPricingExperimentGroup(context.personalReportId);

  // Resolve the bucket — either read the stored code (with MSRP/starting
  // sourced from the row when present) or pick fresh for a brand-new quote.
  const existingBucketFromCode = existingQuote
    ? bucketFromCode(plan, existingQuote.base_price_bucket)
    : null;
  const bucket = existingQuote
    ? {
        code:
          (existingBucketFromCode?.code as PricingBucketCode | undefined) ??
          ((existingQuote.base_price_bucket as PricingBucketCode) || "B"),
        weight: existingBucketFromCode?.weight ?? 0,
        msrpCents:
          existingQuote.msrp != null
            ? fromEuroAmount(existingQuote.msrp)
            : (existingBucketFromCode?.msrpCents ?? fromEuroAmount(existingQuote.base_price)),
        startingCents:
          existingQuote.starting_price != null
            ? fromEuroAmount(existingQuote.starting_price)
            : (existingBucketFromCode?.startingCents ?? fromEuroAmount(existingQuote.base_price)),
      }
    : pickBucket(plan, context.personalReportId);

  const countryPricing = getCountryPricing(context.countryCode);
  const deviceType = existingQuote?.device_type ?? getDeviceTypeFromUserAgent(context.userAgent);
  const deviceMultiplier = existingQuote?.device_multiplier ?? getDeviceMultiplier(deviceType);
  const trafficSource =
    existingQuote?.traffic_source ??
    normalizeTrafficSource(parseUtmSource(context.utmTracker) ?? null);
  const trafficMultiplier =
    existingQuote?.traffic_multiplier ?? getTrafficMultiplier(trafficSource);
  const behavioralPricing = existingQuote
    ? {
        bucket: existingQuote.behavioral_bucket,
        multiplier: existingQuote.behavioral_multiplier,
      }
    : getBehavioralPricing(context.behavioralAnswer);
  const engagementScore =
    existingQuote?.engagement_score ??
    getEngagementScore({
      fantasySignalCount: context.fantasySignalCount,
      previewViews: context.previewViews,
      surveyDurationMs: context.surveyDurationMs,
    });
  const engagementMultiplier =
    existingQuote?.engagement_multiplier ?? getEngagementMultiplier(engagementScore);

  const initialPriceTimestamp =
    !regenerateInitialPrice && existingQuote?.initial_price_timestamp
      ? existingQuote.initial_price_timestamp
      : now.toISOString();

  // Initial price rules (Tracking & Pricing - Prices (1).csv + MVP doc):
  //   Group A  → initial = starting (no contextual adjustments).
  //   Group B  → initial = min(msrp, starting × country × device × traffic ×
  //              behavioral × engagement). The MVP doc's "Full Dynamic Pricing
  //              Engine" lives in Group B — uplift flows through to what the
  //              user is charged, not just analytics.
  // Normalize to .49/.99 endings, then re-clamp to MSRP so All Reports' flat
  // .00 MSRP (e.g. €259.00 / €159.00) doesn't drift above the retail anchor.
  const groupBInitialRaw =
    bucket.startingCents *
    countryPricing.multiplier *
    deviceMultiplier *
    trafficMultiplier *
    behavioralPricing.multiplier *
    engagementMultiplier;
  const computedInitialCents = Math.min(
    bucket.msrpCents,
    normalizePriceEnding(
      Math.min(bucket.msrpCents, experimentGroup === "A" ? bucket.startingCents : groupBInitialRaw)
    )
  );
  const initialPriceCents =
    !regenerateInitialPrice && existingQuote?.initial_price != null
      ? fromEuroAmount(existingQuote.initial_price)
      : computedInitialCents;

  const discount = getDiscountAdjustment({
    initialPriceTimestamp,
    now,
    plan,
  });
  // Ladder is applied to initial_price so Group B's contextual uplift flows
  // through to the charged amount. For Group A this equals starting × ladder
  // which matches the xlsx advertised depth; for Group B the depth is
  // relative to the uplifted initial, exactly as the MVP doc specifies.
  const discountedCents = normalizePriceEnding(initialPriceCents * discount.multiplier);
  const previousCurrentPriceCents =
    !regenerateInitialPrice && existingQuote?.current_price != null
      ? fromEuroAmount(existingQuote.current_price)
      : initialPriceCents;
  const currentPriceCents =
    existingQuote?.purchased_at != null
      ? previousCurrentPriceCents
      : Math.min(previousCurrentPriceCents, discountedCents, initialPriceCents);
  const discountStep =
    existingQuote?.purchased_at != null ? existingQuote.discount_step : discount.step;
  const discountMultiplier =
    existingQuote?.purchased_at != null ? existingQuote.discount_multiplier : discount.multiplier;
  const existingSessionLock = getSessionLockedQuote({
    metadata: existingQuote?.metadata,
    pricingSessionId,
  });
  const sessionLockedQuote =
    pricingSessionId == null
      ? null
      : (existingSessionLock ?? {
          currentPriceCents,
          discountMultiplier,
          discountStep,
          lockedAt: now.toISOString(),
        });
  const pricingClusterId = buildPricingClusterId({
    baseBucket: bucket.code,
    behavioralBucket: behavioralPricing.bucket,
    countryTier: countryPricing.tier,
    deviceType,
    discountStep,
    engagementScore,
    experimentGroup,
    plan,
    trafficSource,
  });

  return {
    payload: {
      // `base_price` retained as the MSRP anchor for analytics continuity —
      // legacy dashboards key off the column name. New `msrp` + `starting_price`
      // columns are the canonical source going forward.
      base_price: toEuroAmount(bucket.msrpCents),
      base_price_bucket: bucket.code,
      msrp: toEuroAmount(bucket.msrpCents),
      starting_price: toEuroAmount(bucket.startingCents),
      behavioral_bucket: behavioralPricing.bucket,
      behavioral_multiplier: behavioralPricing.multiplier,
      checkout_started_at: existingQuote?.checkout_started_at ?? null,
      country_multiplier: countryPricing.multiplier,
      country_tier: countryPricing.tier,
      currency: "EUR",
      current_price: toEuroAmount(currentPriceCents),
      device_multiplier: deviceMultiplier,
      device_type: deviceType,
      discount_multiplier: discountMultiplier,
      discount_step: discountStep,
      experiment_group: experimentGroup,
      engagement_multiplier: engagementMultiplier,
      engagement_score: engagementScore,
      expires_at: new Date(now.getTime() + QUOTE_VALIDITY_MS).toISOString(),
      fantasy_signal_count: context.fantasySignalCount,
      initial_price: toEuroAmount(initialPriceCents),
      initial_price_timestamp: initialPriceTimestamp,
      last_viewed_at: now.toISOString(),
      metadata: mergeSessionLockedQuote({
        existingMetadata: {
          ...(isRecord(existingQuote?.metadata) ? existingQuote.metadata : {}),
          generatedAt: now.toISOString(),
          reportToken: context.reportToken,
        },
        pricingSessionId,
        sessionLockedQuote,
      }),
      plan,
      pricing_cluster_id: pricingClusterId,
      purchased_at: existingQuote?.purchased_at ?? null,
      report_preview_views: context.previewViews,
      survey_duration_ms: context.surveyDurationMs,
      traffic_multiplier: trafficMultiplier,
      traffic_source: trafficSource,
      updated_date_time: now.toISOString(),
      view_count: (existingQuote?.view_count ?? 0) + 1,
    },
    snapshotOverride: sessionLockedQuote
      ? {
          currentPriceCents: sessionLockedQuote.currentPriceCents,
          discountMultiplier: sessionLockedQuote.discountMultiplier,
          discountStep: sessionLockedQuote.discountStep,
        }
      : null,
  };
}

async function persistQuote({
  context,
  existingQuote,
  regenerateInitialPrice,
  now,
  plan,
  pricingSessionId,
}: {
  context: PricingContext;
  existingQuote?: ReportPriceQuoteRow | null;
  regenerateInitialPrice: boolean;
  now: Date;
  plan: ReportPurchasePlanId;
  pricingSessionId?: string | null;
}) {
  const builtQuote = buildQuotePayload({
    context,
    existingQuote,
    regenerateInitialPrice,
    now,
    plan,
    pricingSessionId,
  });
  const payload = {
    ...builtQuote.payload,
    created_date_time: existingQuote?.id ? undefined : now.toISOString(),
    personal_report_id: context.personalReportId,
    survey_submission_id: context.submissionId,
    user_id: context.userId,
  };

  if (existingQuote?.id) {
    const response = await supabaseServiceFetch(
      `/rest/v1/report_price_quote?id=eq.${existingQuote.id}`,
      {
        body: JSON.stringify(payload),
        headers: { Prefer: "return=representation" },
        method: "PATCH",
      }
    );

    if (!response.ok) {
      throw new Error("pricing_quote_update_failed");
    }

    const rows = (await response.json()) as ReportPriceQuoteRow[];
    return {
      row: rows[0] ?? null,
      snapshotOverride: builtQuote.snapshotOverride,
    };
  }

  const response = await supabaseServiceFetch("/rest/v1/report_price_quote", {
    body: JSON.stringify(payload),
    headers: { Prefer: "return=representation" },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("pricing_quote_create_failed");
  }

  const rows = (await response.json()) as ReportPriceQuoteRow[];
  return {
    row: rows[0] ?? null,
    snapshotOverride: builtQuote.snapshotOverride,
  };
}

async function resolveQuote({
  context,
  now,
  plan,
  pricingSessionId,
}: {
  context: PricingContext;
  now: Date;
  plan: ReportPurchasePlanId;
  pricingSessionId?: string | null;
}) {
  const existingQuote = await fetchStoredQuote({
    personalReportId: context.personalReportId,
    plan,
  });

  const isExpired =
    existingQuote?.expires_at != null &&
    new Date(existingQuote.expires_at).getTime() <= now.getTime();

  const persisted = await persistQuote({
    context,
    existingQuote,
    regenerateInitialPrice: Boolean(isExpired),
    now,
    plan,
    pricingSessionId,
  });

  if (!persisted.row) {
    throw new Error("pricing_quote_missing_after_persist");
  }

  return toSnapshot(persisted.row, persisted.snapshotOverride);
}

async function getValidatedQuoteForContext({
  context,
  plan,
  pricingSessionId,
  quoteId,
}: {
  context: PricingContext;
  plan: ReportPurchasePlanId;
  pricingSessionId?: string | null;
  quoteId: number;
}) {
  const storedQuote = await fetchStoredQuoteById(quoteId);

  if (
    !storedQuote ||
    storedQuote.plan !== plan ||
    storedQuote.personal_report_id !== context.personalReportId
  ) {
    return null;
  }

  const sessionLockedQuote = getSessionLockedQuote({
    metadata: storedQuote.metadata,
    pricingSessionId,
  });

  return toSnapshot(
    storedQuote,
    sessionLockedQuote
      ? {
          currentPriceCents: sessionLockedQuote.currentPriceCents,
          discountMultiplier: sessionLockedQuote.discountMultiplier,
          discountStep: sessionLockedQuote.discountStep,
        }
      : null
  );
}

export async function getReportPriceQuoteForContext({
  now = new Date(),
  plan = DEFAULT_REPORT_PURCHASE_PLAN_ID,
  pricingSessionId,
  quoteId,
  reportSessionId,
  reportToken,
  submissionId,
  userAgent,
}: {
  now?: Date;
  plan?: ReportPurchasePlanId;
  pricingSessionId?: string | null;
  quoteId?: number;
  reportSessionId?: string | null;
  reportToken?: string | null;
  submissionId?: number | null;
  userAgent?: string | null;
}) {
  const context = await getPricingContext({
    reportSessionId,
    reportToken,
    submissionId,
    userAgent,
  });

  if (!context) {
    return null;
  }

  if (typeof quoteId === "number") {
    const validatedQuote = await getValidatedQuoteForContext({
      context,
      plan,
      pricingSessionId,
      quoteId,
    });

    if (validatedQuote) {
      return validatedQuote;
    }
  }

  return resolveQuote({
    context,
    now,
    plan,
    pricingSessionId,
  });
}

export async function getReportPriceQuotesForContext({
  now = new Date(),
  pricingSessionId,
  reportSessionId,
  reportToken,
  submissionId,
  userAgent,
}: {
  now?: Date;
  pricingSessionId?: string | null;
  reportSessionId?: string | null;
  reportToken?: string | null;
  submissionId?: number | null;
  userAgent?: string | null;
}) {
  const context = await getPricingContext({
    reportSessionId,
    reportToken,
    submissionId,
    userAgent,
  });

  if (!context) {
    return null;
  }

  const results = await Promise.all(
    REPORT_PURCHASE_PLAN_IDS.map(async (plan) => {
      const quote = await resolveQuote({
        context,
        now,
        plan,
        pricingSessionId,
      });
      return [plan, quote] as const;
    })
  );

  return Object.fromEntries(results) as Record<ReportPurchasePlanId, ReportPriceQuoteSnapshot>;
}

export async function markReportPriceQuoteCheckoutStarted({ quoteId }: { quoteId: number }) {
  const response = await supabaseServiceFetch(`/rest/v1/report_price_quote?id=eq.${quoteId}`, {
    body: JSON.stringify({
      checkout_started_at: new Date().toISOString(),
      updated_date_time: new Date().toISOString(),
    }),
    headers: { Prefer: "return=minimal" },
    method: "PATCH",
  });

  if (!response.ok) {
    throw new Error("pricing_quote_checkout_started_update_failed");
  }
}

export async function markReportPriceQuotePurchased({
  paymentId,
  quoteId,
}: {
  paymentId?: number | null;
  quoteId: number;
}) {
  const lookupResponse = await supabaseServiceFetch(
    `/rest/v1/report_price_quote?id=eq.${quoteId}&select=metadata&limit=1`
  );

  if (!lookupResponse.ok) {
    throw new Error("quote_purchase_lookup_failed");
  }

  const lookupRows = (await lookupResponse.json()) as Array<{
    metadata: Record<string, unknown> | null;
  }>;
  const existingMetadata = lookupRows[0]?.metadata ?? {};
  const response = await supabaseServiceFetch(`/rest/v1/report_price_quote?id=eq.${quoteId}`, {
    body: JSON.stringify({
      metadata: paymentId ? { ...existingMetadata, paymentId } : existingMetadata,
      purchased_at: new Date().toISOString(),
      updated_date_time: new Date().toISOString(),
    }),
    headers: { Prefer: "return=minimal" },
    method: "PATCH",
  });

  if (!response.ok) {
    throw new Error("pricing_quote_purchase_update_failed");
  }
}

/**
 * Display helper used by legacy admin screens. Returns the bucket-B MSRP as
 * the default "retail" price — the per-user strike is stored on the quote now
 * and should be read from `ReportPriceQuoteSnapshot.msrpCents` instead.
 */
export function getReportPriceStrikeDisplay(plan: ReportPurchasePlanId) {
  // eslint-disable-next-line security/detect-object-injection -- plan is a closed union of internal purchase-plan ids.
  const bucketList = PLAN_BUCKETS[plan];
  const defaultBucket = bucketList.find((entry) => entry.code === "B") ?? bucketList[0];
  return defaultBucket ? formatReportPrice(defaultBucket.msrpCents) : null;
}

/**
 * Exported so tests + admin tools can read the bucket catalogue.
 */
export function getPricingBucketsForPlan(plan: ReportPurchasePlanId) {
  // eslint-disable-next-line security/detect-object-injection -- plan is a closed union.
  return PLAN_BUCKETS[plan];
}

/**
 * Test-only surface — production code should call `getReportPriceQuoteForContext`
 * which internally invokes `pickBucket`. Exposed here so the bucket-coherence
 * invariant ("same user lands the same A/B/C across all 3 plans") can be
 * asserted directly without mocking the full Supabase fetch chain.
 */
export const __testing__ = { pickBucket };
