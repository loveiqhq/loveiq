// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockViewed = vi.fn();
const mockLeave = vi.fn();
const mockReason = vi.fn();
const mockNote = vi.fn();
vi.mock("@features/analytics/client", () => ({
  trackPaygateExitViewed: (...args: unknown[]) => mockViewed(...args),
  trackPaygateExitLeave: (...args: unknown[]) => mockLeave(...args),
  trackPaygateExitReason: (...args: unknown[]) => mockReason(...args),
  trackPaygateExitNote: (...args: unknown[]) => mockNote(...args),
}));

const trustpilot = { enabled: false, score: null as string | null, count: null as string | null };
vi.mock("@shared/ui/trustpilot/config", () => ({
  isTrustpilotEnabled: () => trustpilot.enabled,
  getTrustpilotConfig: () => ({
    score: trustpilot.score,
    reviewCount: trustpilot.count,
    profileUrl: null,
  }),
  TRUSTPILOT_FALLBACK_URL: "https://www.trustpilot.com/review/loveiq.org",
}));

import PaygateExitPage, {
  type PaygateExitPageProps,
} from "@features/report/ui/gate/exit/PaygateExitPage";
import { GATE_COPY } from "@features/report/ui/gate/gateContent";
import { PAYMENT_MARKS } from "@features/report/ui/paymentMarks";

const onUnlock = vi.fn();
const onBack = vi.fn();
const onLeave = vi.fn();

const PRE: PaygateExitPageProps = {
  stage: "pre",
  offer: { priceCents: 199 },
  creditCents: 1000,
  guaranteeDays: 14,
  seed: "55",
  checkout: { busy: false, error: null, errorPlace: null },
  onUnlock,
  onBack,
  onLeave,
  random: () => 0,
};

const FULL: PaygateExitPageProps = {
  stage: "full",
  offer: { priceCents: 1999, strikeCents: 2999 },
  creditCents: 1000,
  guaranteeDays: 14,
  initialPriceCents: 199,
  unlockSource: "paid",
  seed: "55",
  checkout: { busy: false, error: null, errorPlace: null },
  onUnlock,
  onBack,
  onLeave,
  random: () => 0,
};

/** The visible text, whitespace (and the hero's no-break space) collapsed. */
const text = () => (document.body.textContent ?? "").replace(/[\s\u00a0]+/g, " ");
const offerCard = () => document.querySelector<HTMLElement>(".pge-offer__box")!;

beforeEach(() => {
  vi.clearAllMocks();
  trustpilot.enabled = false;
  trustpilot.score = null;
  trustpilot.count = null;
});

afterEach(() => {
  cleanup();
});

describe("the EUR 1.99 gate's exit page (Marcus's Main board)", () => {
  it("makes the case: the risk-free headline, the guarantee, why it is worth it", () => {
    render(<PaygateExitPage {...PRE} />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent?.replace(/\u00a0/g, " ")).toBe("Unlocking is fully risk-free");
    // "is" stays with the emphasis, so the line breaks after "Unlocking", as on the canvas.
    expect(h1.textContent).toContain("is\u00a0fully");
    expect(screen.getByRole("heading", { name: "14-Day Money-Back Guarantee" })).toBeTruthy();
    expect(text()).toContain(
      "If you unlock and don’t find it valuable, write to us within 14 days and we refund you in full. No questions asked."
    );
    expect(screen.getByRole("heading", { name: "Why It’s Worth Unlocking" })).toBeTruthy();
    for (const line of ["Stop guessing.", "Find the words.", "Keep desire alive."]) {
      expect(text()).toContain(line);
    }
  });

  it("offers the gate's own card again, at the gate's price", () => {
    render(<PaygateExitPage {...PRE} />);
    const card = within(offerCard());
    expect(card.getByText(GATE_COPY.card.badge)).toBeTruthy();
    expect(card.getByRole("heading", { name: GATE_COPY.card.title })).toBeTruthy();
    expect(card.getByText("€1.99")).toBeTruthy();
    expect(card.getByRole("button", { name: GATE_COPY.card.cta })).toBeTruthy();
    for (const line of GATE_COPY.card.features(1000)) {
      expect(offerCard().textContent).toContain(`${line.strong ?? ""}${line.text}`);
    }
    expect(text()).not.toContain("Premium Report");
  });

  it("shows the live payment methods as their official logos, in the live order", () => {
    render(<PaygateExitPage {...PRE} />);
    const list = screen.getByRole("list", { name: "Accepted payment methods" });
    expect(
      within(list)
        .getAllByRole("img")
        .map((logo) => logo.getAttribute("aria-label"))
    ).toEqual(PAYMENT_MARKS.map((m) => m.label));
    expect(list.querySelector(".pay-logos__mark--klarna")).not.toBeNull();
  });

  it("asks why, and offers “Maybe later”, which leads nowhere else", () => {
    render(<PaygateExitPage {...PRE} />);
    expect(screen.getByRole("heading", { name: "Not today? Tell us why." })).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(8);
    expect(screen.getByRole("button", { name: "Maybe later" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Maybe later" })).toBeNull();
  });

  it("says the result is saved, with the minutes the reader put in (Marcus's box, 29.10)", () => {
    render(<PaygateExitPage {...PRE} surveyMinutes={14} />);
    const box = document.querySelector<HTMLElement>(".pge-credit")!;
    const boxText = box.textContent?.replace(/\s+/g, " ");
    expect(boxText).toContain("Your result is ready and saved");
    expect(boxText).toContain(
      "You invested 14 minutes into your answers. Don’t leave without seeing what they say."
    );
    expect(box.querySelector(".pge-credit__amount")?.textContent).toBe("14");
    expect(box.querySelector(".pge-credit__label")?.textContent).toBe("MIN");
    // Under the guarantee, where the canvas puts it.
    expect(document.querySelector(".pge-safe-wrap")?.nextElementSibling).toHaveClass(
      "pge-credit-wrap"
    );
    // Leaving loses nothing, so the page never says it does.
    expect(text()).not.toMatch(/lose your result/i);
  });

  it("says it without a number when the survey's clock says nothing true", () => {
    render(<PaygateExitPage {...PRE} surveyMinutes={null} />);
    const box = document.querySelector<HTMLElement>(".pge-credit")!;
    expect(box.textContent).toContain(
      "Your answers are in. Don’t leave without seeing what they say."
    );
    expect(box.querySelector(".pge-credit__amount")).toBeNull();
    expect(box.textContent).not.toMatch(/\d/);
  });

  it("captions its bar with the guarantee and a one-time payment", () => {
    render(<PaygateExitPage {...PRE} />);
    expect(screen.getByRole("button", { name: "Unlock risk-free · €1.99" })).toBeTruthy();
    expect(document.querySelector(".pge-sticky__line")?.textContent?.replace(/\s+/g, " ")).toBe(
      "14-day money-back guarantee · one-time payment"
    );
  });

  it("stands in for the gate's page as the main landmark", () => {
    render(<PaygateExitPage {...PRE} />);
    expect(screen.getByRole("main")).toHaveClass("pge-page");
  });
});

describe("the full report's exit page (Marcus's FullUnlock board)", () => {
  it("keeps the reader's credit in view, earned with the EUR 1.99, with no deadline", () => {
    render(<PaygateExitPage {...FULL} />);
    expect(text()).toContain("Don’t lose your €10 credit");
    expect(text()).toContain("You earned it with your €1.99 unlock.");
    expect(text()).not.toMatch(/expire/i);
  });

  it("words a gift reader's credit as theirs, not earned (E07)", () => {
    render(<PaygateExitPage {...FULL} unlockSource="gift" />);
    expect(text()).toContain("It’s yours toward your Full Report.");
    expect(text()).not.toContain("You earned it");
    const last = [...offerCard().querySelectorAll(".pge-offer__item")].at(-1);
    expect(last?.textContent).toBe("€10 credit applied");
  });

  it("offers the full report at the reader's own price, the credit taken off", () => {
    render(<PaygateExitPage {...FULL} />);
    const card = within(offerCard());
    expect(card.getByRole("heading", { name: "Your Full Report" })).toBeTruthy();
    expect(card.getByText("€19.99")).toBeTruthy();
    expect(card.getByText("€29.99").tagName).toBe("S");
    expect(card.getByRole("button", { name: "Unlock full report" })).toBeTruthy();
    const items = [...offerCard().querySelectorAll(".pge-offer__item")].map((li) => li.textContent);
    expect(items).toEqual([
      "17 chapters and personalised growth",
      "Turn-ons, turn-offs and communication",
      "Practices to try this week",
      "€10 credit applied from your €1.99",
    ]);
  });

  it("captions its bar with the guarantee and the credit, and goes back to the chapters", () => {
    render(<PaygateExitPage {...FULL} />);
    expect(screen.getByRole("button", { name: "Unlock risk-free · €19.99" })).toBeTruthy();
    expect(document.querySelector(".pge-sticky__line")?.textContent?.replace(/\s+/g, " ")).toBe(
      "14-day money-back guarantee · €10 credit applied"
    );
    expect(document.querySelector(".pge-sticky__credit")?.textContent).toBe("€10 credit applied");
    expect(screen.getByRole("button", { name: "Back to my open chapters" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Maybe later" })).toBeNull();
    expect(document.querySelector(".pge-leave__saved")).toBeNull();
  });

  // It sits in its dialog over the report, whose <main> is still there.
  it("is not a second main landmark", () => {
    render(<PaygateExitPage {...FULL} />);
    expect(screen.queryByRole("main")).toBeNull();
  });
});

describe("Trustpilot follows the site's switch (as on live)", () => {
  it("shows nothing while the switch is off", () => {
    trustpilot.score = "4.4";
    trustpilot.count = "10";
    render(<PaygateExitPage {...PRE} />);
    expect(screen.queryByRole("link", { name: /trustpilot/i })).toBeNull();
  });

  it("shows nothing without both numbers, never a made-up one", () => {
    trustpilot.enabled = true;
    trustpilot.score = "4.4";
    render(<PaygateExitPage {...PRE} />);
    expect(screen.queryByRole("link", { name: /trustpilot/i })).toBeNull();
  });

  it("shows the configured score and count, in Trustpilot's word for it", () => {
    trustpilot.enabled = true;
    trustpilot.score = "4.4";
    trustpilot.count = "10";
    render(<PaygateExitPage {...PRE} />);
    const card = screen.getByRole("link", {
      name: "Rated Excellent, 4.4 out of 5 on Trustpilot, from 10 reviews",
    });
    expect(card).toHaveAttribute("href", "https://www.trustpilot.com/review/loveiq.org");
    expect(card).toHaveAttribute("target", "_blank");
    expect(card.textContent?.replace(/\s+/g, " ")).toContain("Excellent · 4.4 out of 5");
  });
});

describe("what the exit pages record and do", () => {
  it("counts a view once a page", () => {
    const { rerender } = render(<PaygateExitPage {...PRE} />);
    rerender(<PaygateExitPage {...PRE} />);
    expect(mockViewed).toHaveBeenCalledTimes(1);
    expect(mockViewed).toHaveBeenCalledWith({ stage: "pre" });
  });

  it("goes back by the header's arrow, and says so", () => {
    render(<PaygateExitPage {...PRE} />);
    fireEvent.click(screen.getByRole("button", { name: "Back to your result" }));
    expect(mockLeave).toHaveBeenCalledWith({ stage: "pre", via: "back" });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  // Sync 29.10: the landing page loses a reader who has finished the survey, so "Maybe later"
  // keeps them here and tells them how they come back.
  it("records “Maybe later” once, stays, and says the result is saved in its place", () => {
    render(<PaygateExitPage {...PRE} />);
    // A live region from the start (the reasons' thank-you is another), filled on the press.
    const status = document.querySelector<HTMLElement>(".pge-leave__saved")!;
    expect(status).toHaveAttribute("role", "status");
    expect(status.textContent).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Maybe later" }));
    expect(mockLeave).toHaveBeenCalledTimes(1);
    expect(mockLeave).toHaveBeenCalledWith({ stage: "pre", via: "maybe_later" });
    expect(onLeave).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Maybe later" })).toBeNull();
    expect(status.textContent).toBe("Saved. The link to your result is in your email.");
    expect(document.activeElement).toBe(status);
    // The offer stays usable.
    expect(screen.getByRole("button", { name: "Unlock risk-free · €1.99" })).toBeEnabled();
  });

  it("records “Back to my open chapters”", () => {
    render(<PaygateExitPage {...FULL} />);
    fireEvent.click(screen.getByRole("button", { name: "Back to my open chapters" }));
    expect(mockLeave).toHaveBeenCalledWith({ stage: "full", via: "chapters" });
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("hands each Unlock press to its checkout, with where it was pressed", () => {
    render(<PaygateExitPage {...PRE} />);
    fireEvent.click(within(offerCard()).getByRole("button", { name: GATE_COPY.card.cta }));
    fireEvent.click(screen.getByRole("button", { name: "Unlock risk-free · €1.99" }));
    expect(onUnlock.mock.calls).toEqual([["card"], ["sticky"]]);
  });

  it("holds both buttons while checkout opens, and shows a failure where it happened", () => {
    const { rerender } = render(
      <PaygateExitPage {...PRE} checkout={{ busy: true, error: null, errorPlace: null }} />
    );
    const card = within(offerCard()).getByRole("button", { name: GATE_COPY.card.cta });
    const sticky = screen.getByRole("button", { name: "Unlock risk-free · €1.99" });
    expect(card).toBeDisabled();
    expect(sticky).toBeDisabled();
    expect(card).toHaveAttribute("aria-busy", "true");
    rerender(
      <PaygateExitPage
        {...PRE}
        checkout={{ busy: false, error: "Try again.", errorPlace: "sticky" }}
      />
    );
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Try again.");
    expect(alert.closest(".pge-sticky")).not.toBeNull();
  });
});

describe("focus", () => {
  it("lands on the page itself as it opens, at its top", () => {
    render(<PaygateExitPage {...PRE} />);
    expect(document.activeElement).toHaveClass("pge-page");
    expect(document.activeElement).toHaveAttribute("tabindex", "-1");
  });

  it("goes back to what held it when the page closes", () => {
    const opener = document.createElement("a");
    opener.href = "#";
    opener.textContent = "Not ready to unlock yet";
    document.body.appendChild(opener);
    opener.focus();
    const { unmount } = render(<PaygateExitPage {...PRE} />);
    expect(document.activeElement).not.toBe(opener);
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
