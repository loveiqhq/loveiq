import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCountRows, mockSupabaseFetch } = vi.hoisted(() => ({
  mockCountRows: vi.fn(async () => 0),
  mockSupabaseFetch: vi.fn(
    async () => new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } })
  ),
}));
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: mockSupabaseFetch,
  countRows: mockCountRows,
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { fetchFunnelStages } from "@features/admin/server/digest-metrics";

/**
 * The daily digest's first number is the site's visitors. Pay to start's ad page is not
 * the free funnel's top: a campaign there would move that number by itself, so its
 * visits (labelled pay_to_start by proxy.ts) are left out. Untagged rows stay in.
 */
describe("the digest's visitor count", () => {
  beforeEach(() => vi.clearAllMocks());

  it("leaves pay to start's visits out, and keeps every untagged one", async () => {
    await fetchFunnelStages("2026-10-17T00:00:00.000Z", "2026-10-18T00:00:00.000Z");
    const visitorQuery = (mockCountRows.mock.calls as unknown as Array<[string]>)
      .map(([path]) => path)
      .find((path) => path.includes("event_type=eq.unique_visitor"));
    expect(visitorQuery).toContain(
      "&or=(landing_variant.is.null,landing_variant.neq.pay_to_start)"
    );
  });
});
