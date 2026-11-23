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
 * boards' after Fatih's calls of 14.11 and 15.11: 15 minutes, the price on the archetype
 * (never implied free), the 14-day guarantee, "taken a first step", patterns people recognise,
 * today's FAQ, every button to /survey. v2 (23.11, Mark's comments): no phone intro over the
 * cards, "calmer" for "kinder", and no sources line under the numbers.
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

  it("names question 1's scale by its statement, as the video page's card does", () => {
    renderPage();
    // A screen reader tabbing into the scale hears what is being rated (final review, 15 Nov).
    expect(
      screen.getByRole("radiogroup", { name: "Right now, I feel satisfied with my sex life." })
    ).toBeInTheDocument();
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
    const scale = screen.getByRole("radiogroup", {
      name: "Right now, I feel satisfied with my sex life.",
    });
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
      "10,000+ people have taken a first step",
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
      "2Unlock your archetype€1.99, with your core motivation.",
      "3Go deeper17 chapters with practices. 14-day money-back guarantee.",
    ]);
    // On today's EUR 1.99 page the Core Archetype is what EUR 1.99 opens: no step may put it
    // before the price (Fatih, 14 Nov; gateRevealArm.ts).
    expect(section.textContent).not.toMatch(/free result|7-day|Meet your archetype/);
  });
});

describe("pain-point page — the six pain points", () => {
  const section = () =>
    screen
      .getByRole("heading", { level: 2, name: "Is your sex life stuck in one of these patterns?" })
      .closest("section") as HTMLElement;

  it("names six patterns in people's own words, each with what the report gives", () => {
    renderPage();
    expect(section().getAttribute("data-landing-section")).toBe("pain_points");
    const text = section().textContent?.replace(/\s+/g, " ") ?? "";
    for (const line of [
      "“I want sex more than my partner does, and asking has started to feel like begging.”",
      "You'll understand your desire gap, and how to talk about it without keeping score.",
      "“I love them. I just don't want sex the way I used to.”",
      "You'll understand whether your desire is responsive, and what it needs before it shows up.",
      "“The second it feels like pressure, I shut down.”",
      "You'll understand your brakes: the specific things that switch your desire off.",
      "“It's safe and kind, and somehow not exciting anymore.”",
      "You'll understand your accelerators: the kind of novelty that works for you, not for everyone.",
      "“I know something's missing. I just can't say what.”",
      "You'll get the vocabulary for what you want, in plain words you can use.",
      "“We keep having the same argument about how often.”",
      "You'll see the pattern behind the argument, so you can stop repeating it.",
    ]) {
      expect(text).toContain(line);
    }
    // Nobody tells LoveIQ anything before the test (Fatih, 15 Nov).
    expect(text).not.toContain("people tell us");
    // Mark (12 Nov): "Isn't that clear from the cards? Do we need this?" Cut in v2 (Fatih, 23 Nov).
    expect(text).not.toContain("These are six patterns");
  });

  it("starts the survey from its button, counted from the pain points", () => {
    renderPage();
    const cta = within(section()).getByRole("link", { name: "Start free test - pain points" });
    expect(cta.getAttribute("href")).toBe("/survey");
    fireEvent.click(cta);
    expect(events("cta_click").at(-1)?.[1]).toMatchObject({ location: "pain_points" });
  });
});

describe("pain-point page — what changes", () => {
  it("strikes through four old habits and names what replaces each", () => {
    renderPage();
    const section = screen
      .getByRole("heading", { level: 2, name: "What changes with LoveIQ." })
      .closest("section") as HTMLElement;
    expect(section.getAttribute("data-landing-section")).toBe("promise");
    expect(section.textContent).toContain(
      "You can't ask for what you can't describe. Once your pattern has words, the conversation you've been avoiding gets a lot shorter, and a lot calmer."
    );
    const struck = [...section.querySelectorAll("s")].map((s) => s.textContent);
    expect(struck).toEqual([
      "Hoping your partner will guess",
      "Wondering what's going on with you",
      "The same argument about frequency",
      "Sex on autopilot",
    ]);
    for (const after of [
      "Ask for what you want in one clear sentence.",
      "Know the conditions your desire needs, and create them on purpose.",
      "Talk about the gap between you without blame on either side.",
      "Know which new things are worth trying for you, and which aren't.",
    ]) {
      expect(section.textContent).toContain(after);
    }
  });
});

describe("pain-point page — sentences you can actually say", () => {
  const section = () =>
    screen
      .getByRole("heading", { level: 2, name: "Sentences you can actually say." })
      .closest("section") as HTMLElement;

  it("names six terms from the report and shows a page of a real report", () => {
    renderPage();
    expect(section().getAttribute("data-landing-section")).toBe("words");
    for (const chip of [
      "responsive desire",
      "accelerators and brakes",
      "desire discrepancy",
      "initiation style",
      "novelty seeking",
      "aftercare",
    ]) {
      expect(within(section()).getByText(chip)).toBeTruthy();
    }
    const img = within(section()).getByRole("img", {
      name: "A page from the LoveIQ report: your constellation of top three archetypes, the core archetype card and the summary",
    });
    expect(img.getAttribute("src")).toContain("report-preview");
    expect(section().textContent).toContain(
      "A look inside a real LoveIQ report. Yours is written for your own pattern."
    );
  });

  it("starts the survey from its button, counted from the words", () => {
    renderPage();
    const cta = within(section()).getByRole("link", { name: "Start free test - words" });
    expect(cta.getAttribute("href")).toBe("/survey");
    fireEvent.click(cta);
    expect(events("cta_click").at(-1)?.[1]).toMatchObject({ location: "words" });
  });
});

describe("pain-point page — the numbers", () => {
  it("shows four numbers with what they count", () => {
    renderPage();
    const section = screen
      .getByRole("heading", {
        level: 2,
        name: "Sex problems are common. Talking about them isn't.",
      })
      .closest("section") as HTMLElement;
    expect(section.getAttribute("data-landing-section")).toBe("stats");
    const cards = [...section.querySelectorAll("[data-stat]")].map((card) =>
      card.textContent?.replace(/\s+/g, " ").trim()
    );
    expect(cards).toEqual([
      "47%of adults have a sexual concern they've never raised with a partner.",
      "56%of people who take our test need emotional closeness before desire shows up.",
      "42%shut down when sex starts to feel like pressure.",
      "77%want more variety in their sex life than they have now.",
    ]);
    // Mark (12 Nov): "Do we really want to show this?" Marcus: "will take out". Out in v2.
    expect(section.textContent).not.toContain("Sources:");
  });
});
