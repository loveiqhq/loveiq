import { describe, expect, it } from "vitest";
import { SHARE_SEAT_LIMIT, sharePlanLabel } from "@features/report/server/planAccess";

// Marcus, 2026-10-05: every reader shares with up to two people, paid or not.
describe("free sharing", () => {
  it("gives every reader two seats", () => {
    expect(SHARE_SEAT_LIMIT).toBe(2);
  });

  it("records an unpaid owner's share as 'free' and a buyer's as their plan", () => {
    expect(sharePlanLabel(null)).toBe("free");
    expect(sharePlanLabel("essentials")).toBe("essentials");
    expect(sharePlanLabel("full_report")).toBe("full_report");
    expect(sharePlanLabel("core")).toBe("core");
    expect(sharePlanLabel("all_reports")).toBe("all_reports");
  });
});
