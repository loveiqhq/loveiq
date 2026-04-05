import { NextResponse } from "next/server";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

const REQUIRED_ENV_VARS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY"];

export async function GET() {
  const envConfig = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
  };
  const envMap = new Map(Object.entries(envConfig));
  const missingEnv = REQUIRED_ENV_VARS.filter((envName) => !envMap.get(envName));

  let supabaseStatus: "ok" | "error" | "unconfigured" = "unconfigured";
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
      supabaseStatus = res.ok ? "ok" : "error";
    } catch {
      supabaseStatus = "error";
    }
  }

  const healthy = missingEnv.length === 0 && supabaseStatus === "ok";

  return NextResponse.json(
    {
      ok: healthy,
      checks: {
        supabase: supabaseStatus,
        resend: process.env.RESEND_API_KEY ? "configured" : "unconfigured",
        env: missingEnv.length === 0 ? "ok" : `missing: ${missingEnv.join(", ")}`,
      },
    },
    { status: healthy ? 200 : 503 }
  );
}
