// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The real analytics client, so this checks what PostHog actually receives.
const ph = vi.hoisted(() => ({ capture: vi.fn(), register: vi.fn() }));
vi.mock("posthog-js", () => ({ default: ph }));

import { faqs } from "@/data/faqs";
import LandingPagePainPoint from "@features/landing/ui/painpoint/LandingPagePainPoint";
import WFAQ from "@features/landing/ui/white/WFAQ";

/**
 * The new page's FAQ (board "FAQ"): today's questions from data/faqs.ts, numbered, the
 * first answer open as the board draws it, one answer open at a time. The board lists the
 * FAQ as it read before 14 Nov (the coach sessions, machine learning); data/faqs.ts is the
 * true one, and the homepage's FAQPage JSON-LD is built from it on both arms.
 */
class FakeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

const events = (name: string) => ph.capture.mock.calls.filter(([n]) => n === name);
const questions = () =>
  screen
    .getAllByRole("button")
    .filter((b) => b.getAttribute("aria-controls")?.startsWith("w-faq-panel-"));
const panelOf = (button: HTMLElement) =>
  document.getElementById(button.getAttribute("aria-controls")!) as HTMLElement;
const renderPage = () => render(<LandingPagePainPoint variant="pain_point" />);

beforeEach(() => {
  ph.capture.mockClear();
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  vi.stubGlobal("ResizeObserver", FakeObserver);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("pain-point page — FAQ", () => {
  it("lists today's questions, numbered, under the board's heading", () => {
    renderPage();
    const section = screen
      .getByRole("heading", { level: 2, name: "The questions people actually ask." })
      .closest("section") as HTMLElement;
    expect(section.id).toBe("faq");
    expect(section).toHaveAttribute("data-landing-section", "faq");
    const qs = questions();
    expect(qs).toHaveLength(faqs.length);
    qs.forEach((b, i) => {
      expect(b.textContent).toBe(`${String(i + 1).padStart(2, "0")}${faqs[i]!.question}`);
    });
    expect(section.textContent).not.toMatch(/professional or coach/i);
    expect(section.textContent).not.toMatch(/machine.learning/i);
  });

  it("opens the first answer, as the board does, and keeps the rest closed", () => {
    renderPage();
    const [first, ...rest] = questions();
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(panelOf(first!)).toBeVisible();
    for (const b of rest) {
      expect(b).toHaveAttribute("aria-expanded", "false");
      expect(panelOf(b)).not.toBeVisible();
    }
  });

  it("carries every answer in the page, word for word, open or not", () => {
    renderPage();
    const qs = questions();
    expect(qs).toHaveLength(faqs.length);
    qs.forEach((b, i) => expect(panelOf(b).textContent).toBe(faqs[i]!.answer));
  });

  it("keeps one answer open; a second click on it closes it", () => {
    renderPage();
    const qs = questions();
    fireEvent.click(qs[1]!);
    expect(qs[1]).toHaveAttribute("aria-expanded", "true");
    expect(qs[0]).toHaveAttribute("aria-expanded", "false");
    expect(panelOf(qs[1]!)).toBeVisible();
    fireEvent.click(qs[1]!);
    expect(qs.filter((b) => b.getAttribute("aria-expanded") === "true")).toHaveLength(0);
  });

  it("sends faq_expanded when a reader opens an answer, keyed as on the video page", () => {
    render(<WFAQ />);
    fireEvent.click(questions()[2]!);
    const onVideo = events("faq_expanded")[0]![1] as { question_text_hash: string };
    cleanup();
    ph.capture.mockClear();

    renderPage();
    // The first answer opens by itself: no reader did that.
    expect(events("faq_expanded")).toHaveLength(0);
    fireEvent.click(questions()[2]!);
    expect(events("faq_expanded")).toHaveLength(1);
    expect(events("faq_expanded")[0]![1]).toMatchObject({
      question_index: 2,
      question_text_hash: onVideo.question_text_hash,
    });
    // Closing it is not an opening.
    fireEvent.click(questions()[2]!);
    expect(events("faq_expanded")).toHaveLength(1);
  });
});
