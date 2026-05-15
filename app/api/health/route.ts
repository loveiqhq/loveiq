import { NextResponse } from "next/server";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";

const REQUIRED_ENV_VARS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY"];

// Liveness probe. Externally reachable (uptime monitors, load balancers) so the
// response body MUST NOT reveal which env vars are missing, which third-party
// services are configured, or anything else that helps an attacker fingerprint
// the deployment. Diagnostics live in the server logs only.

async function pingSupabase(): Promise<boolean> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return false;
  try {
    const res = await fetchWithTimeout(`${process.env.SUPABASE_URL}/rest/v1/`, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      cache: "no-store",
      timeoutMs: 3000,
    });
    return res.ok;
  } catch {
    return false;
  }
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

export async function GET() {
  const missingEnv = REQUIRED_ENV_VARS.filter((envName) => !process.env[envName]);

  const [supabaseOk, resendOk, kvOk] = await Promise.all([pingSupabase(), pingResend(), pingKv()]);

  // KV is optional — null means "not configured, in-memory fallback active".
  // Treat null as healthy; only `false` (configured but unreachable) fails.
  const kvHealthy = kvOk !== false;
  const healthy = missingEnv.length === 0 && supabaseOk && resendOk && kvHealthy;

  if (!healthy) {
    // Diagnostic detail goes to the server log so operators can debug
    // without leaking config to anonymous callers.
    logger.warn(
      {
        missingEnvCount: missingEnv.length,
        missingEnv,
        supabaseOk,
        resendOk,
        kvOk,
      },
      "Health check failed"
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
