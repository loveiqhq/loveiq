// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import WHero from "@features/landing/ui/white/WHero";
import WTrustStrip from "@features/landing/ui/white/WTrustStrip";
import WDiscover from "@features/landing/ui/white/WDiscover";
import WVocab from "@features/landing/ui/white/WVocab";
import WFindOut from "@features/landing/ui/white/WFindOut";
import WWowStats from "@features/landing/ui/white/WWowStats";
import WResultTeaser from "@features/landing/ui/white/WResultTeaser";
import WArchetypeCards from "@features/landing/ui/white/WArchetypeCards";
import WTestimonials from "@features/landing/ui/white/WTestimonials";
import WFoundation from "@features/landing/ui/white/WFoundation";
import WFAQ from "@features/landing/ui/white/WFAQ";
import WCTA from "@features/landing/ui/white/WCTA";
import WStickyBar from "@features/landing/ui/white/WStickyBar";

// The hero, the carousels and the scroll reveals observe; jsdom has neither API.
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
vi.stubGlobal("IntersectionObserver", NoopObserver);
vi.stubGlobal("ResizeObserver", NoopObserver);

afterEach(cleanup);

/** The page as both arms of the landing test render it; only the hero's slot differs. */
const renderPage = (media: "card" | "video") =>
  render(
    <>
      <WHero media={media} />
      <WTrustStrip />
      <WDiscover />
      <WVocab />
      <WFindOut />
      <WWowStats />
      <WResultTeaser />
      <WArchetypeCards />
      <WTestimonials />
      <WFoundation />
      <WFAQ />
      <WCTA />
      <WStickyBar />
    </>
  );

/**
 * The copy Marcus and Mark settled on 12.10 (Figma Report-3.0 `1604:8233`, "the source of
 * truth for the copy"), on both arms. The buttons' names are what the e2e specs, the
 * persona walker (`/- hero$/`) and screen readers find them by, so they are pinned whole.
 */
describe.each(["card", "video"] as const)("the 12.10 landing copy, %s arm", (media) => {
  it("names each call to action as drawn, and none of them says free", () => {
    renderPage(media);
    for (const name of [
      "Start my test now - hero",
      "Start test now - the language section",
      "Start the test - what you might find out",
      "Start test now - result section",
      "Continue test - closing CTA",
      "Start test - sticky bar",
    ]) {
      // `hidden`: the sticky bar is aria-hidden until the page has scrolled.
      expect(screen.getByRole("link", { name, hidden: true })).toHaveAttribute("href", "/survey");
    }
    expect(screen.queryAllByRole("link", { name: /free/i, hidden: true })).toHaveLength(0);
  });

  it("drops the labels, lines and card the review deleted", () => {
    const { container } = renderPage(media);
    for (const label of [
      "Your result",
      "Field reports",
      "THE FOUNDATION",
      "HOW YOUR RESULT IS DERIVED",
      "FAQ",
      "FREE",
      "FREE IN YOUR RESULT",
      "YOUR INSIGHT MAP · AROUSAL",
      "Say this instead",
    ]) {
      expect(screen.queryByText(label), label).toBeNull();
    }
    const text = container.textContent ?? "";
    for (const line of [
      "Anonymous · ~9 minutes · No account",
      "not a horoscope",
      "Power Orientation and Arousal Style",
      "a peek at what lands",
      "One tap and your report starts building",
      "If a question is still unanswered",
    ]) {
      expect(text, line).not.toContain(line);
    }
  });

  it("carries the new lines", () => {
    const { container } = renderPage(media);
    const h1 = screen.getByRole("heading", { level: 1 }).textContent;
    expect(h1).toContain("Personality");
    expect(h1).not.toContain("Personalities");
    expect(screen.getByRole("heading", { name: "Insights are waiting for you" })).toBeDefined();
    expect(screen.getAllByText("Included")).toHaveLength(4);
    expect(screen.getByText("Science-backed")).toBeDefined();
    const text = container.textContent ?? "";
    for (const line of [
      "You can't ask for what you can't name. The report gives you the vocabulary.",
      "It doesn't always switch on. It warms up, and you can learn how.",
      "The conditions under which your desire flourishes and quietly dies.",
      "Knowing your sexuality better is the difference between guessing and asking.",
      "The moment you finish, your personality and your full 50+ page report can be unlocked.",
      "Take the test to reveal your result",
      "14 sexual personalities.",
      "Built by researchers and on practical wisdom.",
      "Matched to your nearest sexual personality",
      "Discover your closest match, with the distance to neighbouring types kept visible.",
      "Who is this for?",
      "better understand yourself?",
      "Your report is waiting.",
    ]) {
      expect(text, line).toContain(line);
    }
  });
});
