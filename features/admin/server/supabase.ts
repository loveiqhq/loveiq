import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import { getBreaker } from "@shared/http/circuit-breaker";

const TIMEOUT_MS = 8000;

interface SupabaseFetchOptions {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  /**
   * Override the 8s default. Needed for the few endpoints whose cost is
   * SERVER-side generation rather than transfer — PostgREST builds its 490 KB
   * OpenAPI document from the schema on every request, which reliably exceeds 8s
   * from a Vercel function even though it is fast from a laptop. Keep the default
   * everywhere else: a slow query should fail, not hang.
   */
  timeoutMs?: number;
}

/**
 * Shared Supabase REST API fetch helper for admin routes.
 * Wraps fetchWithTimeout + circuit breaker with standard auth headers.
 */
export async function supabaseFetch(
  path: string,
  options: SupabaseFetchOptions = {}
): Promise<Response> {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase not configured");
  }

  const { method = "GET", body, headers = {} } = options;

  return getBreaker("supabase").fire(() =>
    fetchWithTimeout(`${url}${path}`, {
      method,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        ...headers,
      },
      body,
      timeoutMs: options.timeoutMs ?? TIMEOUT_MS,
    })
  );
}
