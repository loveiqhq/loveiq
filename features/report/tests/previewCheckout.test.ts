import { describe, expect, it } from "vitest";
import { previewPaidHref } from "@features/report/ui/previewCheckout";

describe("previewPaidHref: what a preview's buy button opens", () => {
  it("opens the report after the EUR 1.99 from the gate or its exit page", () => {
    expect(
      previewPaidHref(
        "initial",
        "https://staging.loveiq.org/report?preview=1&v4=1&gate=1&leave=pre"
      )
    ).toBe("/report?preview=1&v4=1&plan=initial");
  });

  it("opens the bought plan from the full report's exit page, gift reader or not", () => {
    expect(
      previewPaidHref(
        "full_report",
        "https://staging.loveiq.org/report?preview=1&v4=1&plan=initial&gift=1&leave=full"
      )
    ).toBe("/report?preview=1&v4=1&plan=full_report");
  });

  it("keeps the archetype and the hash, and drops the return markers", () => {
    expect(
      previewPaidHref(
        "all_reports",
        "http://localhost:3107/report?preview=1&archetype=spark-seeker&anchor=x&unlocked=1#ch"
      )
    ).toBe("/report?preview=1&archetype=spark-seeker&plan=all_reports#ch");
  });
});
