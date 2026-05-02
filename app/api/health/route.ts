import { NextResponse } from "next/server";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import logger from "@/lib/logger";

const REQUIRED_ENV_VARS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY"];

// Liveness probe. Externally reachable (uptime monitors, load balancers) so the
// response body MUST NOT reveal which env vars are missing, which third-party
// services are configured, or anything else that helps an attacker fingerprint
// the deployment. Diagnostics live in the server logs only.
export async function GET() {
  const missingEnv = REQUIRED_ENV_VARS.filter((envName) => !process.env[envName]);

  let supabaseOk = false;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const res = await fetchWithTimeout(`${process.env.SUPABASE_URL}/rest/v1/`, {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        cache: "no-store",
        timeoutMs: 3000,
      });
      supabaseOk = res.ok;
    } catch {
      supabaseOk = false;
    }
  }

  const healthy = missingEnv.length === 0 && supabaseOk;

  if (!healthy) {
    // Diagnostic detail goes to the server log so operators can debug
    // without leaking config to anonymous callers.
    logger.warn(
      {
        missingEnvCount: missingEnv.length,
        missingEnv,
        supabaseOk,
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
