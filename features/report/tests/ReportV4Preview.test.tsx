// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The staging preview route — /report-v4-preview.
 *
 * Its whole job is to be the surface the team reviews the V4 report on, so the
 * thing worth asserting is that the paywall is LIVE on it. `onUnlock` was omitted
 * when the route was first built, which made the gate band on a locked "Go deeper
 * & learn more" card a dead click: the blurred window, "Show More" and the Premium
 * card all did nothing, and the only control that responded was the expand toggle.
 * Reviewers reasonably read that as "Show More just reveals more blur".
 *
 * The component was never at fault — V4LearnMore.test.tsx already proves it calls
 * `onUnlock` from all three targets — so the regression this guards is the wiring.
 */

vi.mock("@features/analytics/client", () => ({
  trackPriceShown: vi.fn(),
  trackPaywallDismissed: vi.fn(),
  hasCookieYesConsent: () => true,
}));

import ReportV4PreviewClient from "@/app/report-v4-preview/ReportV4PreviewClient";
import { buildPreviewQuotes } from "@/app/report-v4-preview/previewQuotes";
import { buildLearnMoreForReader } from "@features/report/server/contentGating";
import { report3ArchetypeCard } from "@/data/report3-archetype-card";
import { REPORT_V4_LEARN_MORE } from "@/data/report3-learn-more";
import {
  REPORT_V4_PART3_CHAPTERS,
  REPORT_V4_PART4_CHAPTERS,
  REPORT_V4_PART5_CHAPTERS,
  REPORT_V4_PART6_CHAPTERS,
} from "@/data/report3-archetype-page";
import type { ReportAccessPlan } from "@features/report/server/access";

afterEach(cleanup);

const ALL_CHAPTERS = [
  ...REPORT_V4_PART3_CHAPTERS,
  ...REPORT_V4_PART4_CHAPTERS,
  ...REPORT_V4_PART5_CHAPTERS,
  ...REPORT_V4_PART6_CHAPTERS,
];

const renderPreview = (accessPlan: ReportAccessPlan) =>
  render(
    <ReportV4PreviewClient
      archetype="Spark Seeker"
      matchStrength={43}
      copy={report3ArchetypeCard["Spark Seeker"]!}
      learnMore={buildLearnMoreForReader({
        chapters: ALL_CHAPTERS,
        articles: REPORT_V4_LEARN_MORE,
        accessPlan,
      })}
      accessPlan={accessPlan}
      accessPlanLabel={accessPlan ?? "no purchase"}
      quotes={buildPreviewQuotes()}
    />
  );

const modalState = (c: HTMLElement) =>
  c.querySelector(".report-pricing-modal")?.getAttribute("data-state");

/**
 * Expand the first learn-more card. The closed state is never gated — 153:2240
 * draws no paywall — so the blurred window, "Show More" and the Premium card only
 * exist once the reader has asked for the article.
 */
const expandFirstCard = () =>
  fireEvent.click(screen.getAllByRole("button", { name: "Read the full article" })[0]!);

describe("/report-v4-preview — the paywall is live", () => {
  it("keeps the pricing modal shut until something asks for it", () => {
    const { container } = renderPreview(null);
    expandFirstCard();
    expect(container.querySelector(".rv4-learn__gate")).not.toBeNull();
    expect(modalState(container)).toBe("closed");
  });

  it('opens the pricing modal from "Show More" on a gated card', () => {
    const { container } = renderPreview(null);
    expandFirstCard();
    fireEvent.click(screen.getAllByRole("button", { name: "Show More" })[0]!);
    expect(modalState(container)).toBe("open");
  });

  it("opens it from anywhere on the blurred band, as the band owns the click", () => {
    const { container } = renderPreview(null);
    expandFirstCard();
    fireEvent.click(container.querySelector(".rv4-learn__gate")!);
    expect(modalState(container)).toBe("open");
  });

  it("quotes real list prices, so no card reads 'Pricing unavailable'", () => {
    const { container } = renderPreview(null);
    expandFirstCard();
    fireEvent.click(container.querySelector(".rv4-learn__gate")!);
    expect(screen.queryByText("Pricing unavailable")).toBeNull();
    // The designed outage copy must not show either — it would read as a bug in a
    // design review rather than as the real-outage fallback it is.
    expect(screen.queryByText(/Live pricing couldn't be loaded/)).toBeNull();
  });

  it("has no gate at all for a reader who has paid", () => {
    const { container } = renderPreview("full_report");
    expandFirstCard();
    expect(container.querySelector(".rv4-learn__gate")).toBeNull();
    expect(screen.queryByRole("button", { name: "Show More" })).toBeNull();
    expect(modalState(container)).toBe("closed");
  });

  it("offers the back-to-top control only once the long article is open", () => {
    const { container } = renderPreview("full_report");
    expect(container.querySelector(".rv4-backtop")).toBeNull();
    expandFirstCard();
    // 153:2260 expands to 11,624px, which is what the control exists for.
    expect(container.querySelector(".rv4-backtop")).not.toBeNull();
  });
});
