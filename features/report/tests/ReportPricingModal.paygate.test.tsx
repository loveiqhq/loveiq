// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReportPricingModal from "@features/report/ui/ReportPricingModal";
import { trackPriceShown } from "@features/analytics/client";
import type { ReportPriceQuotes } from "@features/pricing/logic/reportPricing";

vi.mock("@features/analytics/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@features/analytics/client")>()),
  trackPaywallDismissed: vi.fn(),
  trackPriceShown: vi.fn(),
}));

/** A quote as /api/report hands it over: the two offered plans on one Pricing 3.0 list. */
function quote(plan: "full_report" | "all_reports", arm: "A3" | "B3") {
  const [msrp, charged] =
    plan === "all_reports"
      ? arm === "A3"
        ? [4999, 3999]
        : [2999, 1999]
      : arm === "A3"
        ? [2999, 2999]
        : [1499, 1499];
  return {
    id: plan === "full_report" ? 2 : 3,
    plan,
    currency: "EUR",
    experimentGroup: arm,
    basePriceBucket: arm,
    basePriceCents: msrp,
    msrpCents: msrp,
    startingPriceCents: charged,
    currentPriceCents: charged,
    chargedPriceCents: charged,
    initialPriceCents: charged,
    discountMultiplier: 1,
    discountStep: 0,
    pricingClusterId: `${arm}-${plan}-${arm}-tier_2-desktop-direct-zero-standard-d0`,
  } as unknown as NonNullable<ReportPriceQuotes["full_report"]>;
}

const quotes = (arm: "A3" | "B3"): ReportPriceQuotes => ({
  all_reports: quote("all_reports", arm),
  full_report: quote("full_report", arm),
});

const card = (plan: string) =>
  document.querySelector<HTMLElement>(`.rpg-card--${plan}`) as HTMLElement;

describe("ReportPricingModal — the Pricing 3.0 paygate (Figma 842:584 / 963:6)", () => {
  const onUnlock = vi.fn();
  const base = {
    archetype: "Spark Seeker",
    onClose: () => {},
    onUnlock,
    open: true,
    primaryArchetype: "Spark Seeker",
  };

  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal("scrollTo", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it.each([
    { arm: "A3" as const, all: "€39.99", strike: "€49.99 - 20% off", single: "€29.99" },
    { arm: "B3" as const, all: "€19.99", strike: "€29.99 - 33% off", single: "€14.99" },
  ])(
    "prices both plans off the $arm quote, striking only All 14",
    ({ arm, all, strike, single }) => {
      render(<ReportPricingModal {...base} quotes={quotes(arm)} />);
      expect(
        screen.getByRole("heading", { name: "Discover Your Full Sexual Self" })
      ).toBeInTheDocument();
      expect(within(card("all_reports")).getByText(all)).toHaveClass("rpg-card__amount");
      expect(card("all_reports").querySelector(".rpg-card__was")?.textContent).toBe(strike);
      expect(within(card("full_report")).getByText(single)).toHaveClass("rpg-card__amount");
      expect(card("full_report").querySelector(".rpg-card__was")).toBeNull();
      expect(within(card("all_reports")).getByText("Most Popular")).toBeInTheDocument();
      // Both cards promise the 14 days every other surface promises.
      expect(screen.getAllByText("14-day money-back guarantee.")).toHaveLength(2);
    }
  );

  it("hands checkout the plan and, for the single report, the reader's own archetype", async () => {
    const user = userEvent.setup();
    render(<ReportPricingModal {...base} quotes={quotes("A3")} />);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(onUnlock).toHaveBeenLastCalledWith("all_reports", null);
    await user.click(screen.getByRole("button", { name: "Only Unlock My Highest Scoring Report" }));
    expect(onUnlock).toHaveBeenLastCalledWith("full_report", "Spark Seeker");
  });

  it("opened from another archetype's tile, the single report is that archetype's", async () => {
    const user = userEvent.setup();
    render(<ReportPricingModal {...base} quotes={quotes("A3")} targetArchetype="Tender Devotee" />);
    const single = card("full_report");
    expect(single.querySelector(".rpg-card__stacked")?.textContent).toBe(
      "Only the Tender Devotee Report"
    );
    expect(single.querySelector(".rpg-card__wide")?.textContent).toBe(
      "Only the Tender Devotee Report"
    );
    await user.click(within(single).getByRole("button", { name: "Only Unlock This Report" }));
    expect(onUnlock).toHaveBeenLastCalledWith("full_report", "Tender Devotee");
  });

  it("shows an owned plan as the reader's, not as something to buy again", () => {
    render(
      <ReportPricingModal
        {...base}
        quotes={quotes("A3")}
        accessPlan="full_report"
        archetypeTiers={{ "Spark Seeker": "full_report" }}
      />
    );
    const owned = within(card("full_report")).getByRole("button", { name: "Your current plan" });
    expect(owned).toBeDisabled();
    expect(within(card("all_reports")).getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("names what the single report leaves out, for screen readers too", () => {
    render(<ReportPricingModal {...base} quotes={quotes("A3")} />);
    const excluded = card("full_report").querySelectorAll(".rpg-card__feature.is-excluded");
    expect([...excluded].map((li) => li.textContent)).toEqual([
      "Access to all 14 Archetype reports (not included)",
      "~14h of reading material (not included)",
    ]);
    expect(card("all_reports").querySelectorAll(".rpg-card__feature.is-excluded")).toHaveLength(0);
  });

  it("shows the six payment marks the frame does, and no PayPal", () => {
    render(<ReportPricingModal {...base} quotes={quotes("A3")} />);
    const row = screen.getByLabelText("Accepted payment methods");
    expect(
      within(row)
        .getAllByRole("img")
        .map((el) => el.getAttribute("aria-label"))
    ).toEqual(["Apple Pay", "Visa", "Google Pay", "Klarna", "American Express", "Mastercard"]);
  });

  it("reports each plan's shown price once, with its 3.0 arm", () => {
    const view = render(<ReportPricingModal {...base} quotes={quotes("B3")} />);
    view.rerender(<ReportPricingModal {...base} quotes={quotes("B3")} />);
    expect(trackPriceShown).toHaveBeenCalledTimes(2);
    expect(trackPriceShown).toHaveBeenCalledWith(
      expect.objectContaining({ plan: "all_reports", price: 19.99, experiment_group: "B3" })
    );
    expect(trackPriceShown).toHaveBeenCalledWith(
      expect.objectContaining({ plan: "full_report", price: 14.99, experiment_group: "B3" })
    );
  });

  it("pitches sharing when opened from the share button", () => {
    render(<ReportPricingModal {...base} quotes={quotes("A3")} variant="share" />);
    expect(
      screen.getByRole("heading", { name: "Upgrade to Share Your Results" })
    ).toBeInTheDocument();
  });
});
