import { NextResponse } from "next/server";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";

const REQUIRED_ENV_VARS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY"];

// Liveness probe. Externally reachable (uptime monitors, load balancers) so the
// response body MUST NOT reveal which env vars are missing, which third-party
// services are configured, or anything else that helps an attacker fingerprint
// the deployment. Diagnostics live in the server logs only.
//
// CRITICALITY — what makes this probe return 503 ("the site is down"):
//   • a required env var is missing (real misconfiguration), or
//   • Supabase is unreachable (the datastore the whole app depends on).
// Resend, Stripe and Upstash/KV are NOT liveness-critical: email is sent
// after-response (non-blocking), checkout is togglable, and the rate limiter
// falls back to an in-memory store. A blip in any of them leaves the site fully
// usable, so their state is PINGED FOR OBSERVABILITY (logged) but does NOT flip
// the probe to 503. This prevents a non-critical provider hiccup from paging
// on-call with a bogus "service is down" alert (see the 2026-07-01 Resend blip
// that fired a false UptimeRobot outage while every real dependency was up).

async function pingSupabase(): Promise<boolean> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return false;
  // Retry once: a single dropped/slow response shouldn't read as "DB down" when
  // Supabase is actually healthy — this is the one liveness-critical dependency,
  // so a transient blip must not surface as a hard 503.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetchWithTimeout(`${process.env.SUPABASE_URL}/rest/v1/`, {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        cache: "no-store",
        timeoutMs: 4000,
      });
      if (res.ok) return true;
    } catch {
      // fall through and retry
    }
  }
  return false;
}

async function pingResend(): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false;
  try {
    // GET /api-keys is the lightest authenticated endpoint Resend exposes.
    const res = await fetchWithTimeout("https://api.resend.com/api-keys", {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      cache: "no-store",
      timeoutMs: 3000,
    });
    return res.ok;
  } catch {
    return false;
  }
}

// KV is OPTIONAL — when unset we fall back to an in-memory rate-limit store.
// Returns null when not configured (don't penalize healthy), boolean otherwise.
async function pingKv(): Promise<boolean | null> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try {
    // Upstash REST API: /ping returns "PONG" 200 when reachable.
    const res = await fetchWithTimeout(`${url}/ping`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      timeoutMs: 2000,
    });
    return res.ok;
  } catch {
    return false;
  }
}

// R-23: Stripe is OPTIONAL on this site — paywall can be toggled off via env.
// When STRIPE_SECRET_KEY is unset, return null (not unhealthy). Probe is a
// GET against a Stripe API endpoint that requires auth but does NO billing
// operation. GET /v1/balance is the canonical "is Stripe reachable" check
// used by other apps; it's read-only and cheap.
async function pingStripe(): Promise<boolean | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  try {
    const res = await fetchWithTimeout("https://api.stripe.com/v1/balance", {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
      timeoutMs: 2000,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function GET() {
  const missingEnv = REQUIRED_ENV_VARS.filter((envName) => !process.env[envName]);

  const [supabaseOk, resendOk, kvOk, stripeOk] = await Promise.all([
    pingSupabase(),
    pingResend(),
    pingKv(),
    pingStripe(),
  ]);

  // Liveness = required env present + the core datastore reachable. Nothing
  // else can flip the site to "down".
  const healthy = missingEnv.length === 0 && supabaseOk;

  // Non-critical dependencies that are configured but currently unreachable.
  // The site still serves users; we surface this at `warn` for observability
  // (Vercel logs) without failing the probe or paging on-call.
  const degraded = resendOk === false || kvOk === false || stripeOk === false;

  if (!healthy) {
    // Real outage: missing config or the core datastore is down. Diagnostic
    // detail goes to the server log so operators can debug without leaking
    // config to anonymous callers.
    logger.warn(
      { missingEnvCount: missingEnv.length, missingEnv, supabaseOk, resendOk, kvOk, stripeOk },
      "Health check failed (core dependency down)"
    );
  } else if (degraded) {
    logger.warn(
      { resendOk, kvOk, stripeOk },
      "Health check degraded — a non-critical dependency is unreachable (site still up)"
    );
  }

  return NextResponse.json(
    { ok: healthy },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    }
  );
}
