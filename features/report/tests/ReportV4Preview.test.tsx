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
import { buildAccelerators } from "@/data/report3-accelerators";
import { buildPartnership } from "@/data/report3-partnership";
import { buildFantasy } from "@/data/report3-fantasy";

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
    fireEvent.click(screen.getAllByRole("button", { name: "Unlock the full article" })[0]!);
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
    expect(screen.queryByRole("button", { name: "Unlock the full article" })).toBeNull();
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

/**
 * Accelerator & Brakes opens Part IV here too, with its full chapter body (Figma
 * 310:221 / 314:211) above the article — the same components the live report uses.
 */
describe("/report-v4-preview — Accelerator & Brakes", () => {
  const renderWithAccel = (accessPlan: ReportAccessPlan) =>
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
        accelerators={buildAccelerators("Spark Seeker", { locked: !accessPlan })}
      />
    );

  it("draws the chapter body and its practice card above the article, in a bare chapter", () => {
    const { container } = renderWithAccel(null);
    const chapter = container.querySelector(".rv4-ab")!.closest(".rv4-chapter")!;
    expect(chapter.classList.contains("is-bare")).toBe(true);
    expect(chapter.querySelector(".rv4-try")!.getAttribute("data-node-id")).toBe("377:221");
    expect(chapter.querySelector(".rv4-learn")).not.toBeNull();
  });

  it("opens the pricing modal from the locked rows", () => {
    const { container } = renderWithAccel(null);
    fireEvent.click(container.querySelector(".rv4-trig--brake .rv4-tb-lock")!);
    expect(modalState(container)).toBe("open");
  });

  it("draws no lock for a reader who has paid", () => {
    const { container } = renderWithAccel("full_report");
    expect(container.querySelector(".rv4-ab")).not.toBeNull();
    expect(container.querySelector(".rv4-trig .rv4-tb-lock")).toBeNull();
  });
});

/**
 * Challenges in Partnerships opens Part V here too (Figma 38:1672 / 305:350), with
 * the same body the live report uses, and every row carries its section id so the
 * chapter nudges have somewhere to land.
 */
describe("/report-v4-preview — Challenges in Partnerships", () => {
  const renderWithCip = (accessPlan: ReportAccessPlan) =>
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
        partnership={buildPartnership("Spark Seeker", { locked: !accessPlan })}
      />
    );

  it("draws the chapter body, loop and practice in an open, bare chapter", () => {
    const { container } = renderWithCip(null);
    const chapter = container.querySelector("#challenges_in_partnership")!;
    expect(chapter).not.toBeNull();
    expect(chapter).toHaveClass("is-open");
    expect(chapter).toHaveClass("is-bare");
    expect(chapter.querySelector(".rv4-cip")).not.toBeNull();
    expect(chapter.querySelector(".rv4-loop")).not.toBeNull();
    expect(chapter.querySelector(".rv4-try")!.getAttribute("data-node-id")).toBe("399:219");
    expect(chapter.textContent).not.toContain("[Chapter Copy]");
  });

  it("opens the pricing modal from the gated prose", () => {
    const { container } = renderWithCip(null);
    fireEvent.click(container.querySelector(".rv4-cip__gate")!);
    expect(modalState(container)).toBe("open");
  });

  it("draws no gate for a reader who has paid", () => {
    const { container } = renderWithCip("full_report");
    expect(container.querySelector(".rv4-cip")).not.toBeNull();
    expect(container.querySelector(".rv4-cip__gate")).toBeNull();
  });

  it("gives every chapter row its section id, so a nudge can land on it", () => {
    const { container } = renderWithCip(null);
    for (const id of [
      "typical_beliefs",
      "attachment_style",
      "typical_sexual_fantasy_amp_practice_tendencies",
    ]) {
      expect(container.querySelector(`#${id}`), id).not.toBeNull();
    }
  });
});

/**
 * Fantasy vs. Reality opens Part VI here too (Figma 304:281 / 305:217), with the same
 * body, table and practice the live report uses, above its article.
 */
describe("/report-v4-preview — Fantasy vs. Reality", () => {
  const renderWithFvr = (accessPlan: ReportAccessPlan) =>
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
        fantasy={buildFantasy("Spark Seeker", { locked: accessPlan !== "full_report" })}
      />
    );

  it("draws the body, table and practice above the article, in an open, bare chapter", () => {
    const { container } = renderWithFvr(null);
    const chapter = container.querySelector("#typical_sexual_fantasy_amp_practice_tendencies")!;
    expect(chapter).toHaveClass("is-open");
    expect(chapter).toHaveClass("is-bare");
    expect(chapter.querySelector(".rv4-fvr .rv4-fvt")).not.toBeNull();
    expect(chapter.querySelector(".rv4-fvr + .rv4-try")!.getAttribute("data-node-id")).toBe(
      "441:6422"
    );
    expect(chapter.querySelector(".rv4-try + .rv4-learn")).not.toBeNull();
    expect(chapter.textContent).not.toContain("[Chapter Copy]");
  });

  it("opens the pricing modal from the table's lock", () => {
    const { container } = renderWithFvr(null);
    fireEvent.click(container.querySelector(".rv4-fvt__lock .rv4-lockbadge")!);
    expect(modalState(container)).toBe("open");
  });

  it("draws no gate for a reader who has paid", () => {
    const { container } = renderWithFvr("full_report");
    expect(container.querySelector(".rv4-fvr")).not.toBeNull();
    expect(container.querySelector(".rv4-fvr__gate")).toBeNull();
    expect(container.querySelector(".rv4-fvt__lock")).toBeNull();
  });
});
