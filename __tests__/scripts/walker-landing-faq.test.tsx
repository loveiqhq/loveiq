// @vitest-environment jsdom
/**
 * The walk opens one answer in the landing FAQ (plants.faq) and counts a faq_expanded for
 * it (scripts/walkers/walk.ts). Round 4's new page opens its first answer by itself, as its
 * board draws it, so a click on the first question there would close an answer. The walk
 * clicks the first CLOSED question instead: on either arm, that click opens one.
 */
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ph = vi.hoisted(() => ({ capture: vi.fn(), register: vi.fn() }));
vi.mock("posthog-js", () => ({ default: ph }));

import LandingPagePainPoint from "@features/landing/ui/painpoint/LandingPagePainPoint";
import WFAQ from "@features/landing/ui/white/WFAQ";
import { LANDING_FAQ_QUESTION } from "../../scripts/walkers/walk";

class FakeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

beforeEach(() => {
  ph.capture.mockClear();
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  vi.stubGlobal("ResizeObserver", FakeObserver);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the walk's click in the landing FAQ", () => {
  it.each<[string, () => ReactElement]>([
    ["the video page", () => <WFAQ />],
    ["the new page", () => <LandingPagePainPoint variant="pain_point" />],
  ])("opens an answer on %s", (_, page) => {
    const { container } = render(page());
    const question = container.querySelector<HTMLButtonElement>(LANDING_FAQ_QUESTION);
    expect(question).not.toBeNull();
    fireEvent.click(question!);
    expect(question).toHaveAttribute("aria-expanded", "true");
    expect(ph.capture.mock.calls.filter(([n]) => n === "faq_expanded")).toHaveLength(1);
  });
});
