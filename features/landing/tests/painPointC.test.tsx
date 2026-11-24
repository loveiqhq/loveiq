// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The real analytics client, so this checks what PostHog actually receives.
const ph = vi.hoisted(() => ({ capture: vi.fn(), register: vi.fn() }));
vi.mock("posthog-js", () => ({ default: ph }));

import { surveyQuestions } from "@/data/survey-data";
import LandingPagePainPoint from "@features/landing/ui/painpoint/LandingPagePainPoint";
import { QUESTION_1, QUESTION_C } from "@features/landing/ui/painpoint/painPointContent";
import { LANDING_PREFILL_QID, SURVEY_STATE_KEY } from "@features/survey/ui/hooks/surveyStorage";

/**
 * Version C of the pain-point page (`pain_point_c`, LoveIQ Sync 24 Nov 2026): B's question,
 * "Right now, I feel satisfied with my sex life." (Q01002), loses more people than any other,
 * so Mark and Marcus picked Q10003, "I'm comfortable expressing what turns me on.", and
 * Marcus moved it under the film. B (`pain_point`) stays as it was, for `?variant=`.
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

const C_QUESTION = "I'm comfortable expressing what turns me on.";
const B_QUESTION = "Right now, I feel satisfied with my sex life.";
const events = (name: string) => ph.capture.mock.calls.filter(([n]) => n === name);
const link = (name: string) => screen.getByRole("link", { name }) as HTMLAnchorElement;
const follows = (a: Node, b: Node) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

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

describe("the hero questions' words are the survey's own", () => {
  it("asks C's Q10003 and B's Q01002 in the words data/survey-data.ts gives them", () => {
    const words = (qId: string) => surveyQuestions.find((q) => q.qId === qId)?.question;
    expect(QUESTION_C).toEqual({ qId: "10003", text: words("10003") });
    expect(QUESTION_1).toEqual({ qId: "01002", text: words("01002") });
    // B's question is the one the video page's closing card asks, under the same id.
    expect(QUESTION_1.qId).toBe(LANDING_PREFILL_QID);
  });

  it("rates both on the survey's 1-to-7 scale, whose ends the hero prints", () => {
    for (const qId of [QUESTION_C.qId, QUESTION_1.qId]) {
      const q = surveyQuestions.find((x) => x.qId === qId)!;
      expect(q.answerType).toBe("scale");
      expect(q.scaleLabels).toEqual({ low: "Not true at all", high: "Completely true" });
    }
  });
});

describe("version C's hero (pain_point_c)", () => {
  const renderC = () => render(<LandingPagePainPoint variant="pain_point_c" />);

  it("asks Q10003, and not B's question", () => {
    renderC();
    expect(screen.getByRole("radiogroup", { name: C_QUESTION })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: B_QUESTION })).toBeNull();
    expect(screen.getByTestId("pp-hero").textContent).not.toContain(B_QUESTION);
  });

  it("puts the question under the film, and the live and privacy lines after it", () => {
    renderC();
    const hero = screen.getByTestId("pp-hero");
    const media = within(hero).getByTestId("pp-hero-media");
    const film = within(media).getByTestId("hero-video");
    const scale = within(media).getByRole("radiogroup", { name: C_QUESTION });
    // In reading order, and so on a phone: the headline, the film, the question, the lines.
    const h1 = within(hero).getByRole("heading", { level: 1 });
    expect(follows(h1, film)).toBe(true);
    expect(follows(film, scale)).toBe(true);
    const privacy = within(hero).getByRole("link", { name: /Trust Center/ });
    expect(media.contains(privacy)).toBe(false);
    expect(follows(scale, privacy)).toBe(true);
    // The film is above it, so B's hairline over the question goes.
    expect(hero.querySelector("#start")!.className).not.toContain("border-t");
  });

  it("keeps the question's answer as Q10003's, prefilled, and continues to the survey", () => {
    renderC();
    const dots = within(screen.getByRole("radiogroup", { name: C_QUESTION })).getAllByRole("radio");
    fireEvent.click(dots[5]!);
    expect(dots[5]!.getAttribute("aria-checked")).toBe("true");
    const draft = JSON.parse(localStorage.getItem(SURVEY_STATE_KEY) ?? "{}");
    expect(draft.answers).toEqual({ "10003": 6 });
    expect(draft.prefilled).toEqual(["10003"]);
    // PostHog hears which question the point answers.
    expect(events("landing_card_answer").at(-1)?.[1]).toMatchObject({
      location: "hero",
      changed: false,
      value: 6,
      question: "10003",
    });
    const cta = link("Continue free test - hero");
    expect(cta.getAttribute("href")).toBe("/survey");
    fireEvent.click(cta);
    expect(events("cta_click").at(-1)?.[1]).toMatchObject({
      location: "hero",
      element: "question_card",
    });
  });

  it("does not take an answer to B's question for C's", () => {
    // A browser B's cookie re-rolled onto C, with B's question answered on its last visit.
    localStorage.setItem(
      SURVEY_STATE_KEY,
      JSON.stringify({ answers: { [QUESTION_1.qId]: 5 }, prefilled: [QUESTION_1.qId] })
    );
    renderC();
    const dots = within(screen.getByRole("radiogroup", { name: C_QUESTION })).getAllByRole("radio");
    expect(dots.every((d) => d.getAttribute("aria-checked") === "false")).toBe(true);
    expect(link("Start free test - hero")).toBeTruthy();
  });

  it("tells PostHog it showed version C", () => {
    renderC();
    expect(events("experiment_exposure").at(-1)?.[1]).toMatchObject({ variant: "pain_point_c" });
  });
});

describe("B's hero (pain_point), paused but still open for ?variant=", () => {
  it("still asks Q01002 beside the film, under its hairline", () => {
    render(<LandingPagePainPoint variant="pain_point" />);
    const hero = screen.getByTestId("pp-hero");
    expect(within(hero).getByRole("radiogroup", { name: B_QUESTION })).toBeInTheDocument();
    expect(within(hero).queryByTestId("pp-hero-media")).toBeNull();
    expect(hero.getAttribute("data-hero-version")).toBeNull();
    expect(hero.querySelector("#start")!.className).toContain("border-t border-[#e9e6ee] pt-6");
    // Its question comes before the film, as the board draws it.
    const scale = within(hero).getByRole("radiogroup", { name: B_QUESTION });
    expect(follows(scale, within(hero).getByTestId("hero-video"))).toBe(true);
  });
});
