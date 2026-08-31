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
  /**
   * The +2 EUR surcharge once a reader's paywall countdown has run out. Off by
   * default: with it off the report and the checkout charge exactly what they charged
   * before the surcharge existed, so it can be killed without a deploy.
   */
  | "report_urgency_surcharge_enabled";

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

async function fetchFlag(key: SystemFlagKey): Promise<boolean | null> {
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
    const rows = (await res.json()) as Array<{ enabled: boolean }>;
    return rows.length > 0 ? rows[0]!.enabled : null;
  });
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

// Test-only: clear the in-process cache.
export function __resetSystemFlagsCacheForTests(values?: Partial<Record<SystemFlagKey, boolean>>) {
  cache.clear();
  if (values) {
    const now = Date.now();
    for (const [key, enabled] of Object.entries(values)) {
      cache.set(key as SystemFlagKey, { enabled: !!enabled, expiresAt: now + CACHE_TTL_MS });
    }
  }
}
