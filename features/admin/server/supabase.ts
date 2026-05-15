import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import { getBreaker } from "@shared/http/circuit-breaker";

const TIMEOUT_MS = 8000;

interface SupabaseFetchOptions {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
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
      timeoutMs: TIMEOUT_MS,
    })
  );
}
