// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReportPricingModal from "@features/report/ui/ReportPricingModal";
import { trackPaywallDismissed, trackPriceShown } from "@features/analytics/client";
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
        : [999, 699]
      : arm === "A3"
        ? [2999, 2999]
        : [499, 499];
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
    { arm: "B3" as const, all: "€6.99", strike: "€9.99 - 30% off", single: "€4.99" },
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

  // All 14 credits what the reader already paid on the report (getUpgradeCreditCents).
  it.each([
    { paid: 499, credit: 499, charged: 200, all: "€2.00", was: "€6.99 - €4.99 already paid" },
    // Two singles (€9.98) cost more than All 14: free, and the line says all that was paid.
    { paid: 998, credit: 699, charged: 0, all: "€0.00", was: "€6.99 - €9.98 already paid" },
  ])(
    "credits the singles already bought on All 14 ($all)",
    ({ paid, credit, charged, all, was }) => {
      const withCredit = quotes("B3");
      withCredit.all_reports = {
        ...withCredit.all_reports!,
        chargedPriceCents: charged,
        upgradeCreditCents: credit,
        upgradePaidCents: paid,
      };
      render(<ReportPricingModal {...base} quotes={withCredit} />);
      expect(within(card("all_reports")).getByText(all)).toHaveClass("rpg-card__amount");
      expect(card("all_reports").querySelector(".rpg-card__was")?.textContent).toBe(was);
      // The single report keeps its own price.
      expect(within(card("full_report")).getByText("€4.99")).toHaveClass("rpg-card__amount");
      // price_shown says All 14 was credited, so per-arm price analysis can leave it out.
      expect(trackPriceShown).toHaveBeenCalledWith(
        expect.objectContaining({
          plan: "all_reports",
          price: charged / 100,
          upgrade_credit: credit / 100,
        })
      );
      expect(trackPriceShown).toHaveBeenCalledWith(
        expect.not.objectContaining({ plan: "full_report", upgrade_credit: expect.anything() })
      );
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
      expect.objectContaining({ plan: "all_reports", price: 6.99, experiment_group: "B3" })
    );
    expect(trackPriceShown).toHaveBeenCalledWith(
      expect.objectContaining({ plan: "full_report", price: 4.99, experiment_group: "B3" })
    );
  });

  it("offers a recipient their own free test, never a price (Marcus, 2026-10-05)", async () => {
    // /api/report sends a shared viewer no quotes.
    render(<ReportPricingModal {...base} quotes={null} variant="recipient" />);
    expect(screen.getByRole("dialog")).toHaveAccessibleDescription(
      "Only the person who shared this report can unlock it. Take the free test to get a report of your own."
    );
    expect(screen.getByRole("link", { name: "Take the Free Test" })).toHaveAttribute(
      "href",
      "/survey"
    );
    // No plans, no "couldn't load prices" alarm, no payment marks, no "why unlock".
    expect(screen.queryByRole("group", { name: "Pricing options" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/€/)).toBeNull();
    expect(screen.queryByRole("heading", { name: /Why Unlock/ })).toBeNull();
  });

  // A recipient was never offered a price, so closing is no paywall dismissal; a reader's is.
  it.each([
    ["default", 1],
    ["recipient", 0],
  ] as const)("counts closing the %s screen as %i dismissal(s)", (variant, times) => {
    const { rerender } = render(<ReportPricingModal {...base} quotes={null} variant={variant} />);
    // As ReportPage closes it: open and variant change in the same render.
    rerender(<ReportPricingModal {...base} open={false} quotes={null} variant="default" />);
    expect(trackPaywallDismissed).toHaveBeenCalledTimes(times);
  });
});
