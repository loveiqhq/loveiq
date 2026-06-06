import { describe, it, expect, vi } from "vitest";

// The route imports server-only helpers at module load; stub them so importing
// the pure `topNWithOther` export never touches auth/db/env.
vi.mock("@features/admin/server/auth", () => ({ verifyAdminSession: vi.fn() }));
vi.mock("@features/admin/server/roles", () => ({ hasRole: vi.fn() }));
vi.mock("@features/admin/server/supabase", () => ({ supabaseFetch: vi.fn() }));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn(),
  getClientIp: vi.fn(),
}));
vi.mock("@features/admin/server/explorer", () => ({ normalizeLabel: (s: string) => s }));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { topNWithOther } from "@/app/api/admin/analytics/core-kpis/route";

interface Row {
  label: string;
  count: number;
  pct: number;
}

describe("topNWithOther", () => {
  it("returns rows unchanged when count <= n", () => {
    const rows: Row[] = Array.from({ length: 5 }, (_, i) => ({
      label: `L${i}`,
      count: 5 - i,
      pct: (5 - i) * 4,
    }));
    expect(topNWithOther(rows, 10, "label")).toBe(rows);
  });

  it("merges the tail into an 'Other' row that carries a numeric pct (crash regression)", () => {
    // 12 groups → top 10 + Other. The Other row MUST have pct (undefined here was
    // the white-screen crash via toBarItems → r.pct.toFixed(1)).
    const rows: Row[] = Array.from({ length: 12 }, (_, i) => ({
      label: `L${i}`,
      count: 12 - i,
      pct: 12 - i,
    }));
    const result = topNWithOther(rows, 10, "label");

    expect(result).toHaveLength(11);
    const other = result[10] as Row;
    expect(other.label).toBe("Other");
    expect(typeof other.pct).toBe("number");
    expect(Number.isNaN(other.pct)).toBe(false);
    // tail = L10 (count2,pct2) + L11 (count1,pct1)
    expect(other.count).toBe(3);
    expect(other.pct).toBeCloseTo(3.0, 5);
  });

  it("Other.pct equals the rounded sum of the merged rows' pct", () => {
    const rows: Row[] = [
      { label: "A", count: 100, pct: 50.0 },
      { label: "B", count: 60, pct: 30.0 },
      { label: "C", count: 12, pct: 6.1 },
      { label: "D", count: 11, pct: 5.6 },
      { label: "E", count: 9, pct: 4.6 },
      { label: "F", count: 7, pct: 3.7 }, // merged from here on (n=5)
    ];
    const result = topNWithOther(rows, 5, "label");
    expect(result).toHaveLength(6);
    const other = result[5] as Row;
    expect(other.count).toBe(7);
    expect(other.pct).toBeCloseTo(3.7, 5);
  });
});
