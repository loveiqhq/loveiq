/**
 * Where the server reaches Supabase's data API (PostgREST, `/rest/v1`) and its Auth
 * service (`/auth/v1`).
 *
 * Supabase's own hosting serves both from `SUPABASE_URL`, and each falls back to it, so
 * nothing changes while `SUPABASE_REST_URL` and `SUPABASE_AUTH_URL` are unset. They exist
 * for a host that splits the two. Same shape as `SUPABASE_URL`: an origin, to which the
 * caller appends `/rest/v1/…` or `/auth/v1/…`. An empty value counts as unset.
 *
 * Server-only. The browser and the auth SDK read `NEXT_PUBLIC_SUPABASE_URL`, which this
 * does not touch.
 */
export function supabaseRestUrl(): string | undefined {
  return process.env.SUPABASE_REST_URL?.trim() || process.env.SUPABASE_URL;
}

export function supabaseAuthUrl(): string | undefined {
  return process.env.SUPABASE_AUTH_URL?.trim() || process.env.SUPABASE_URL;
}
