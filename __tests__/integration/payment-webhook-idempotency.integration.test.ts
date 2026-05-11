/**
 * Integration test — Stripe webhook idempotency at the database layer.
 *
 * Why this exists:
 *   - The unit test in __tests__/lib/checkout-fulfillment.test.ts mocks
 *     fetchWithTimeout, so it never validates that the actual `payment_webhook_event`
 *     schema enforces idempotency. A schema regression (dropped UNIQUE constraint,
 *     renamed column, RLS misconfig) would silently allow double-processing in prod.
 *   - This test hits a REAL Supabase instance via the same REST pattern fulfillment.ts
 *     uses, inserts a row, attempts to insert a duplicate, and asserts the second
 *     insert is rejected by the unique constraint added in
 *     supabase/migrations/20260430130000_payment_webhook_event_idempotency.sql.
 *
 * Setup:
 *   Set both env vars before running. The test skips silently when either is absent
 *   (so default `npm test` and untrusted PR CI runs don't fail):
 *     - SUPABASE_TEST_URL              e.g. https://<branch-id>.supabase.co
 *     - SUPABASE_TEST_SERVICE_ROLE_KEY service role JWT for that branch
 *
 *   Use a Supabase BRANCH (not production). Create one via Supabase Studio
 *   (Branching → Create branch) or via the Supabase MCP `create_branch` tool.
 *   Run migrations on the branch before pointing this test at it.
 *
 * Run:
 *   SUPABASE_TEST_URL=... SUPABASE_TEST_SERVICE_ROLE_KEY=... npm run test:integration
 */
import { randomUUID } from "crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const SUPABASE_URL = process.env.SUPABASE_TEST_URL;
const SUPABASE_KEY = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const SHOULD_RUN = Boolean(SUPABASE_URL && SUPABASE_KEY);

const describeMaybe = SHOULD_RUN ? describe : describe.skip;

// Unique per-run suffix so concurrent CI jobs / re-runs don't collide. We use
// crypto.randomUUID() rather than Date.now() + Math.random() so the suffix has
// real entropy and the test isn't subject to clock-skew races between parallel
// CI workers that happen to start in the same millisecond.
const TEST_EVENT_ID = `evt_integration_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

async function supabaseFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("apikey", SUPABASE_KEY!);
  headers.set("authorization", `Bearer ${SUPABASE_KEY!}`);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return fetch(`${SUPABASE_URL}${path}`, { ...init, headers });
}

describeMaybe("payment_webhook_event idempotency (real DB)", () => {
  beforeAll(async () => {
    if (!SHOULD_RUN) return;
    // Cleanup any leftover row from a prior aborted run.
    await supabaseFetch(`/rest/v1/payment_webhook_event?stripe_event_id=eq.${TEST_EVENT_ID}`, {
      method: "DELETE",
    });
  });

  afterAll(async () => {
    if (!SHOULD_RUN) return;
    await supabaseFetch(`/rest/v1/payment_webhook_event?stripe_event_id=eq.${TEST_EVENT_ID}`, {
      method: "DELETE",
    });
  });

  it("first insert succeeds; second insert with same stripe_event_id is rejected (unique constraint)", async () => {
    // Build the minimal row shape fulfillment.ts inserts. Columns are derived from
    // the migration history: payment_webhook_event has stripe_event_id (unique),
    // event_type, processed (bool), payment_id (nullable FK), and standard timestamps.
    const payload = {
      stripe_event_id: TEST_EVENT_ID,
      event_type: "checkout.session.completed",
      processed: false,
    };

    const first = await supabaseFetch("/rest/v1/payment_webhook_event", {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: JSON.stringify(payload),
    });
    expect(first.status).toBeGreaterThanOrEqual(200);
    expect(first.status).toBeLessThan(300);
    const firstBody = (await first.json()) as Array<{ id: number; stripe_event_id: string }>;
    expect(firstBody[0]?.stripe_event_id).toBe(TEST_EVENT_ID);

    // Second insert: the unique constraint must reject this.
    // PostgREST surfaces unique violations as HTTP 409 with PG code 23505.
    const second = await supabaseFetch("/rest/v1/payment_webhook_event", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    expect(second.status).toBe(409);
    const secondBody = (await second.json()) as { code?: string };
    expect(secondBody.code).toBe("23505");
  });

  it("payment_webhook_event row is queryable by stripe_event_id (idempotency lookup path)", async () => {
    // fulfillment.ts opens with `payment_webhook_event?stripe_event_id=eq.<id>&select=id,payment_id,processed&limit=1`.
    // If the column shape changes, this query starts returning unexpected fields.
    const res = await supabaseFetch(
      `/rest/v1/payment_webhook_event?stripe_event_id=eq.${TEST_EVENT_ID}&select=id,payment_id,processed&limit=1`
    );
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<{
      id: number;
      payment_id: number | null;
      processed: boolean;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBeTypeOf("number");
    expect(rows[0].processed).toBe(false);
    // payment_id may be null at this point — fulfillment.ts populates it after insert.
    expect(rows[0]).toHaveProperty("payment_id");
  });
});

if (!SHOULD_RUN) {
  // Surface a clear log line so CI shows the test was intentionally skipped, not silently passed.

  console.log(
    "[integration] payment-webhook-idempotency skipped — set SUPABASE_TEST_URL + SUPABASE_TEST_SERVICE_ROLE_KEY to run."
  );
}
