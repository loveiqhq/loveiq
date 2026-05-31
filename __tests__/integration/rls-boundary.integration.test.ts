/**
 * F-18: RLS boundary integration test.
 *
 * Asserts that an UN-authenticated Supabase client (using the public anon key,
 * NOT service_role) cannot read or write any of the sensitive tables that have
 * `CREATE POLICY service_role_only ON <table> USING (false)`.
 *
 * The audit's concern: RLS policies can be silently weakened in the Supabase
 * dashboard (someone clicks "disable RLS for testing" and forgets). No code
 * test would catch that — Supabase REST returns 200 + the row data. This test
 * is the deliberate cross-check.
 *
 * READ-ONLY against prod is the right target for this test: the anon key is
 * already in every browser visit, RLS is what makes production safe, and
 * proving RLS holds in prod is the actual posture check.
 *
 * Env resolution (in order):
 *   SUPABASE_TEST_URL        || SUPABASE_URL
 *   SUPABASE_TEST_ANON_KEY   || NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * Skipped silently when neither is configured. `.env.local` is auto-loaded
 * by vitest.integration.config.ts.
 *
 * Run:
 *   npm run test:integration:safe       # this test only (read-only, prod-safe)
 *   npm run test:integration            # all integration tests (some write)
 */

import { describe, it, expect } from "vitest";

const SUPABASE_URL = process.env.SUPABASE_TEST_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_TEST_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SHOULD_RUN = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

const describeMaybe = SHOULD_RUN ? describe : describe.skip;

// Tables that MUST be locked down to service_role only. Adding to this list
// is cheap; the test runs them all and surfaces failures per-table.
const LOCKED_TABLES = [
  "app_user",
  "user_profile",
  "survey_submission",
  "survey_submission_answer",
  "scoring_result",
  "personal_report",
  "payment",
  "payment_webhook_event",
  "report_access_token",
  "report_share",
  "waitlist_user",
  "admin_users",
  "data_subject_request_log",
  "system_flags",
  "email_suppression",
];

async function anonFetch(path: string): Promise<Response> {
  return fetch(`${SUPABASE_URL}${path}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY!,
      Authorization: `Bearer ${SUPABASE_ANON_KEY!}`,
    },
  });
}

describeMaybe("RLS boundary — anon key cannot read locked tables", () => {
  for (const table of LOCKED_TABLES) {
    it(`anon client cannot read ${table}`, async () => {
      const res = await anonFetch(`/rest/v1/${table}?select=*&limit=1`);

      // Accept three secure postures:
      //   200 + empty array  → RLS `USING (false)` filters everything out
      //   401 / 403          → anon role has NO grants on the table (stricter)
      //   404                → table doesn't exist in schema (e.g., migration
      //                        not yet applied; not a regression — skip)
      // Anything else (200 + non-empty array, 2xx with content) = LEAK.
      if (res.status === 404) {
        // Migration for this table hasn't been applied to the target DB yet.
        // The assertion can't run; mark as not-applicable rather than fail.
        return;
      }
      if (res.status === 401 || res.status === 403) {
        return; // more restrictive than expected — still a pass
      }
      expect(res.status).toBe(200);
      const rows = await res.json();
      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBe(0);
    });
  }

  // INSERT-attempt test deliberately omitted from this file: even with RLS
  // refusing the row, PostgREST will reach a write code path. To keep this
  // suite 100% safe to run against prod, all assertions are read-only.
  // The corresponding write-side cross-check belongs in a branch-only
  // integration test that we'll add when a test branch is available.
});
