/**
 * F-12: System kill-switch flags.
 *
 * Read by route gates to disable features without redeploying. Cached
 * in-process for 30 s — flips propagate across Vercel instances within
 * that window. Fails OPEN on Supabase error (returns the default value
 * for the flag): a kill switch that requires Supabase to be up isn't
 * useful when Supabase is down.
 *
 * Canonical flags (see migrations 20260525120100, 20260531120000):
 *   survey_submissions
 *   nurture_sequence
 *   report_paywall_enforced
 *   chapter_nudge
 *   pricing_uplift_enabled   — when OFF, all per-visitor price boosts are paused (base prices only)
 *   pay_to_start_checkout    — when OFF, /sexual-archetype sells nothing (20261018120000)
 *   unlock_feedback          — when OFF, the "why didn't you unlock?" email stops (20261019120000)
 *   report_initial_unlock_gate — when ON, surveys submitted from then on meet the EUR 1.99
 *                              gate before their report (20261020090000; read default OFF)
 *   initial_unlock_gift_email  — when ON, E07 gifts the Core Archetype on day 4 to 80% of
 *                              the gate's non-payers (20261020090000; read default OFF)
 *
 * Add new flags by INSERT into system_flags + listing here so callers get
 * type-checked names.
 */

import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import { getBreaker } from "@shared/http/circuit-breaker";
import logger from "@shared/observability/logger";

export type SystemFlagKey =
  | "survey_submissions"
  | "nurture_sequence"
  | "report_paywall_enforced"
  | "chapter_nudge"
  | "pricing_uplift_enabled"
  | "ux_review_alerts"
  | "pay_to_start_checkout"
  | "unlock_feedback"
  | "report_initial_unlock_gate"
  | "initial_unlock_gift_email";

const CACHE_TTL_MS = 30_000;
const FAIL_OPEN_TTL_MS = 5_000;
const FETCH_TIMEOUT_MS = 2000;

interface CacheEntry {
  enabled: boolean;
  expiresAt: number;
}

const cache = new Map<SystemFlagKey, CacheEntry>();

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("supabase_not_configured");
  return { url, serviceRoleKey };
}

/** The flag's rows, or null when Supabase answered with an error. Throws when unreachable. */
async function fetchFlagRows(key: SystemFlagKey): Promise<Array<{ enabled: boolean }> | null> {
  const { url, serviceRoleKey } = getSupabaseConfig();
  return getBreaker("supabase").fire(async () => {
    const res = await fetchWithTimeout(
      `${url}/rest/v1/system_flags?key=eq.${encodeURIComponent(key)}&select=enabled&limit=1`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        timeoutMs: FETCH_TIMEOUT_MS,
      }
    );
    if (!res.ok) return null;
    return (await res.json()) as Array<{ enabled: boolean }>;
  });
}

async function fetchFlag(key: SystemFlagKey): Promise<boolean | null> {
  const rows = await fetchFlagRows(key);
  if (rows === null) return null;
  return rows.length > 0 ? rows[0]!.enabled : null;
}

/**
 * Returns true when the feature is enabled. Defaults to `defaultWhenMissing`
 * when the flag row does not exist OR Supabase is unreachable. For survey/
 * nurture/paywall the safe default is "enabled" — same behavior as before
 * this system existed.
 */
export async function isFeatureEnabled(
  key: SystemFlagKey,
  defaultWhenMissing = true
): Promise<boolean> {
  // Env override: a matching SYSTEM_FLAG_ environment variable (its value the
  // string "true" or "false") short-circuits the DB entirely, so we can preview a
  // flag state on localhost/CI without writing to the shared prod system_flags
  // table. Any other value falls through to the normal lookup.
  const envOverride = process.env[`SYSTEM_FLAG_${key}`];
  if (envOverride === "true" || envOverride === "false") {
    return envOverride === "true";
  }

  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.enabled;

  try {
    const value = await fetchFlag(key);
    const enabled = value === null ? defaultWhenMissing : value;
    cache.set(key, { enabled, expiresAt: now + CACHE_TTL_MS });
    return enabled;
  } catch (err) {
    logger.warn({ err, key }, "system_flags fetch failed - failing to default");
    cache.set(key, {
      enabled: defaultWhenMissing,
      expiresAt: now + FAIL_OPEN_TTL_MS,
    });
    return defaultWhenMissing;
  }
}

/** What readFeatureFlag read: the row's value, or null for no row. Failures are not kept. */
const strictCache = new Map<SystemFlagKey, { value: boolean | null; expiresAt: number }>();

/**
 * The flag for a caller that must not guess: the row's value, `whenMissing` when there is no
 * row, and null when it can't be read. isFeatureEnabled answers a failure with its default,
 * which is right for a switch that gates something (an outage gates nobody) and wrong for a
 * reader who acts on "off" (the EUR 1.99 gate's switch, read by the emails that skip its
 * readers: an unreadable switch must not read as off). Answers read are cached as
 * isFeatureEnabled's are; a failure never is, so the next call asks again.
 */
export async function readFeatureFlag(
  key: SystemFlagKey,
  whenMissing: boolean
): Promise<boolean | null> {
  const envOverride = process.env[`SYSTEM_FLAG_${key}`];
  if (envOverride === "true" || envOverride === "false") {
    return envOverride === "true";
  }

  const now = Date.now();
  const cached = strictCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value ?? whenMissing;

  try {
    const rows = await fetchFlagRows(key);
    if (!Array.isArray(rows)) return null;
    const value = rows.length > 0 ? rows[0]!.enabled === true : null;
    strictCache.set(key, { value, expiresAt: now + CACHE_TTL_MS });
    return value ?? whenMissing;
  } catch (err) {
    logger.warn({ err, key }, "system_flags strict read failed");
    return null;
  }
}

// Test-only: clear the in-process caches; `values` seeds both, as rows read from Supabase.
export function __resetSystemFlagsCacheForTests(values?: Partial<Record<SystemFlagKey, boolean>>) {
  cache.clear();
  strictCache.clear();
  if (values) {
    const now = Date.now();
    for (const [key, enabled] of Object.entries(values)) {
      cache.set(key as SystemFlagKey, { enabled: !!enabled, expiresAt: now + CACHE_TTL_MS });
      strictCache.set(key as SystemFlagKey, { value: !!enabled, expiresAt: now + CACHE_TTL_MS });
    }
  }
}
