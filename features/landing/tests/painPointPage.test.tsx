// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The real analytics client, so this checks what PostHog actually receives.
const ph = vi.hoisted(() => ({ capture: vi.fn(), register: vi.fn() }));
vi.mock("posthog-js", () => ({ default: ph }));

import LandingPagePainPoint from "@features/landing/ui/painpoint/LandingPagePainPoint";
import { LANDING_PREFILL_QID, SURVEY_STATE_KEY } from "@features/survey/ui/hooks/surveyStorage";

/**
 * Round 4's arm B, Marcus's pain-point page (Claude Design "LoveIQ landing page ·
 * pain-point version", final boards "Desktop · Hero 3" and "Mobile · Hero 3"). Copy is the
 * boards' after Fatih's calls of 14.11: 15 minutes, "Get your result", 14-day guarantee,
 * today's FAQ, sources under the numbers, every button to /survey.
 */
class FakeObserver {
  constructor(public cb: IntersectionObserverCallback) {}
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

const events = (name: string) => ph.capture.mock.calls.filter(([n]) => n === name);
const renderPage = () => render(<LandingPagePainPoint variant="pain_point" />);
const link = (name: string) => screen.getByRole("link", { name }) as HTMLAnchorElement;

beforeEach(() => {
  ph.capture.mockClear();
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  vi.stubGlobal("ResizeObserver", FakeObserver);
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("pain-point page — nav and hero", () => {
  it("has one H1, the designed headline", () => {
    renderPage();
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]!.textContent).toBe("Become a better and more intelligent lover.");
  });

  it("times the survey as the survey does: 15 minutes", () => {
    renderPage();
    const hero = screen.getByTestId("pp-hero");
    expect(hero.textContent).toContain("In just ~15 minutes");
    expect(hero.textContent).not.toMatch(/\b9 minutes/);
  });

  it("sends the hero button to the survey, named for the nightly walkers", () => {
    renderPage();
    const cta = link("Start free test - hero");
    expect(cta.getAttribute("href")).toBe("/survey");
    expect(cta.textContent).toContain("Start free test");
    fireEvent.click(cta);
    expect(events("cta_click").at(-1)?.[1]).toMatchObject({
      cta: "start_survey",
      location: "hero",
    });
    expect(events("cta_click").at(-1)?.[1]).not.toHaveProperty("element");
  });

  it("asks question 1 on a 7-point scale and carries the answer into the survey", () => {
    renderPage();
    const scale = screen.getByRole("radiogroup", { name: "How true is this for you?" });
    const dots = within(scale).getAllByRole("radio");
    expect(dots.map((d) => d.getAttribute("aria-label"))).toEqual([
      "1, not true at all",
      "2",
      "3",
      "4, neutral",
      "5",
      "6",
      "7, completely true",
    ]);
    fireEvent.click(dots[4]!);
    expect(dots[4]!.getAttribute("aria-checked")).toBe("true");
    expect(dots[0]!.getAttribute("aria-checked")).toBe("false");
    const draft = JSON.parse(localStorage.getItem(SURVEY_STATE_KEY) ?? "{}");
    expect(draft.answers[LANDING_PREFILL_QID]).toBe(5);

    const cta = link("Continue free test - hero");
    expect(cta.getAttribute("href")).toBe("/survey");
    fireEvent.click(cta);
    expect(events("cta_click").at(-1)?.[1]).toMatchObject({
      location: "hero",
      element: "question_card",
    });
  });

  it("shows an answer already given, and offers to continue", () => {
    localStorage.setItem(
      SURVEY_STATE_KEY,
      JSON.stringify({ answers: { [LANDING_PREFILL_QID]: 5 }, prefilled: [LANDING_PREFILL_QID] })
    );
    renderPage();
    const dots = within(screen.getByRole("radiogroup")).getAllByRole("radio");
    expect(dots[4]!.getAttribute("aria-checked")).toBe("true");
    expect(link("Continue free test - hero")).toBeTruthy();
  });

  it("links the privacy line to the Trust Center", () => {
    renderPage();
    // The nav has a "Trust Center" link too: this is the hero's.
    const hero = within(screen.getByTestId("pp-hero"));
    expect(hero.getByRole("link", { name: "Trust Center" }).getAttribute("href")).toBe(
      "/trust-zone"
    );
  });

  it("sends the nav's button to the survey", () => {
    renderPage();
    expect(link("Start test now - navigation").getAttribute("href")).toBe("/survey");
  });

  it("shows the film as the film card, beside the question", () => {
    renderPage();
    const hero = screen.getByTestId("pp-hero");
    expect(within(hero).getByText("Why we created LoveIQ")).toBeTruthy();
    expect(within(hero).getByTestId("hero-video").style.aspectRatio).toBe("16 / 9");
  });

  it("says how many are taking the test, as the video page does", () => {
    renderPage();
    expect(screen.getByTestId("pp-hero").textContent).toMatch(
      /\d+ people are taking the test right now/
    );
  });
});

describe("pain-point page — reveals never hide content", () => {
  it("shows its scroll reveals without JavaScript and under reduced motion", () => {
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[^}]*\.pp-root \.animate-on-scroll[^{]*\{\s*opacity: 1;/
    );
    expect(css).toMatch(
      /@media \(scripting: none\) \{\s*\.pp-root \.animate-on-scroll \{\s*opacity: 1;\s*transform: none;/
    );
  });
});

describe("pain-point page — trust band and the three steps", () => {
  it("shows the three reasons to trust LoveIQ in the band under the hero", () => {
    renderPage();
    const band = screen.getByRole("region", { name: "Why people trust LoveIQ" });
    expect(band.getAttribute("data-landing-section")).toBe("trust_band");
    const items = within(band)
      .getAllByRole("listitem")
      .map((li) => li.textContent?.replace(/\s+/g, " ").trim());
    expect(items).toEqual([
      "10,000+ people have started the test",
      "Grounded in 100+ papers and books",
      "Anonymous, encrypted, never sold",
    ]);
  });

  it("walks through the three steps, with the true time, price, chapters and guarantee", () => {
    renderPage();
    const heading = screen.getByRole("heading", {
      level: 2,
      name: "~15 minutes. 14 archetypes. Your next steps.",
    });
    const section = heading.closest("section") as HTMLElement;
    expect(section.getAttribute("data-landing-section")).toBe("how_it_works");
    const steps = within(section)
      .getAllByRole("listitem")
      .map((li) => li.textContent?.replace(/\s+/g, " ").trim());
    expect(steps).toEqual([
      "1Answer 62 questionsAnonymous, no account needed.",
      "2Meet your archetypePlus your core motivation.",
      "3Get your resultGo deeper from €1.99: 17 chapters with practices. 14-day money-back guarantee.",
    ]);
    expect(section.textContent).not.toMatch(/free result|7-day/);
  });
});
