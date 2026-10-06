import { describe, expect, it } from "vitest";

import { isRealDate } from "@/app/api/mcp/route";

/**
 * Found in the real call log, not imagined: `get_business_numbers` was called with
 * `since: "2026-09-31"`. September has thirty days. The shape pattern accepted it,
 * the query ran, zero rows came back, and nothing said why — so an impossible input
 * is indistinguishable from "nothing happened in that period".
 */
describe("isRealDate", () => {
  it("accepts a day that exists", () => {
    for (const d of ["2026-09-15", "2026-02-28", "2024-02-29", "2026-12-31"])
      expect(isRealDate(d), d).toBe(true);
  });

  it("rejects a day that does NOT exist but looks like one", () => {
    // Every one of these passes /^\d{4}-\d{2}-\d{2}$/ and none of them is a date.
    for (const d of ["2026-09-31", "2026-02-30", "2026-04-31", "2026-02-29"])
      expect(isRealDate(d), d).toBe(false);
  });

  it("rejects an impossible month or day outright", () => {
    for (const d of ["2026-13-01", "2026-00-10", "2026-01-00", "2026-01-32"])
      expect(isRealDate(d), d).toBe(false);
  });

  it("rejects anything not shaped like a date at all", () => {
    for (const d of [
      "",
      "yesterday",
      "2026-9-15",
      "26-09-15",
      "2026/09/15",
      "2026-09-15T00:00:00Z",
    ])
      expect(isRealDate(d), d).toBe(false);
  });

  it("does not silently roll a bad date forward", () => {
    // The actual failure mode: JS turns 2026-09-31 into 2026-10-01, so a query runs
    // against the wrong month rather than refusing.
    expect(new Date(Date.parse("2026-09-31T00:00:00Z")).toISOString().slice(0, 10)).toBe(
      "2026-10-01"
    );
    expect(isRealDate("2026-09-31")).toBe(false);
  });
});
