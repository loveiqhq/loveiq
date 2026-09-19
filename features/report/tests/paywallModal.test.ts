import { describe, expect, it } from "vitest";
import { shouldAutoOpenOfferModal } from "@features/report/logic/paywallModal";

const base = {
  isOfferLink: true as boolean,
  accessPlan: null as "essentials" | "full_report" | "all_reports" | null,
  viewMode: "owner" as "owner" | "shared",
};

describe("shouldAutoOpenOfferModal", () => {
  it("opens for an unpaid owner on an offer link", () => {
    expect(shouldAutoOpenOfferModal({ ...base })).toBe(true);
  });

  it("never opens for a paying customer (Marcus's bug) — any plan tier", () => {
    expect(shouldAutoOpenOfferModal({ ...base, accessPlan: "essentials" })).toBe(false);
    expect(shouldAutoOpenOfferModal({ ...base, accessPlan: "full_report" })).toBe(false);
    expect(shouldAutoOpenOfferModal({ ...base, accessPlan: "all_reports" })).toBe(false);
  });

  it("does not open when there is no offer deep-link", () => {
    expect(shouldAutoOpenOfferModal({ ...base, isOfferLink: false })).toBe(false);
  });

  it("does not open in a shared (recipient) view", () => {
    expect(shouldAutoOpenOfferModal({ ...base, viewMode: "shared" })).toBe(false);
  });

  it("paid status wins even when every other condition would open it", () => {
    expect(
      shouldAutoOpenOfferModal({
        isOfferLink: true,
        accessPlan: "full_report",
        viewMode: "owner",
      })
    ).toBe(false);
  });
});
