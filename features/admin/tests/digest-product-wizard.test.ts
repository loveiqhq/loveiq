import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));

import { fetchWizardFunnel } from "@features/admin/server/digest-product";

const next = (from: number, to: number, extra: Record<string, unknown> = {}) => ({
  metadata: { from_slide: from, to_slide: to, direction: "next", ...extra },
});

beforeEach(() => {
  mockSupabaseFetch.mockReset();
});

describe("fetchWizardFunnel: the six-slide wizard's chain", () => {
  it("leaves pay to start's four-slide wizard out of the chain", async () => {
    // Pay to start shows slides 0, 3, 4, 5 under wizard_variant: one such reader used to
    // put a 0->3 step between 0->1 and 1->2, and read 1->2 as 9000% kept.
    const rows = [
      ...Array.from({ length: 100 }, () => next(0, 1)),
      ...Array.from({ length: 90 }, () => next(1, 2)),
      next(0, 3, { wizard_variant: "pay_to_start" }),
      next(3, 4, { wizard_variant: "pay_to_start" }),
    ];
    mockSupabaseFetch.mockResolvedValue({ ok: true, json: async () => rows });
    const funnel = await fetchWizardFunnel("2026-10-01T00:00:00Z", "2026-10-08T00:00:00Z");
    expect(funnel.steps.map((s) => `${s.fromSlide}->${s.toSlide}`)).toEqual(["0->1", "1->2"]);
    expect(funnel.steps[1]?.retainedPct).toBe(90);
    expect(funnel.totalForwards).toBe(190);
  });
});
