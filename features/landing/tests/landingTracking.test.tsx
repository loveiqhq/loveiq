// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The real analytics client, so this checks what PostHog actually receives.
const ph = vi.hoisted(() => ({ capture: vi.fn(), register: vi.fn() }));
vi.mock("posthog-js", () => ({ default: ph }));

/** An IntersectionObserver the test drives, one instance per `new`. */
class FakeObserver {
  static all: FakeObserver[] = [];
  els: Element[] = [];
  constructor(
    public cb: IntersectionObserverCallback,
    public opts?: IntersectionObserverInit
  ) {
    FakeObserver.all.push(this);
  }
  observe(el: Element) {
    this.els.push(el);
  }
  unobserve(el: Element) {
    this.els = this.els.filter((e) => e !== el);
  }
  disconnect() {
    this.els = [];
  }
  takeRecords() {
    return [];
  }
  /** These elements now reach into the observed area (or leave it). */
  show(els: Element[], isIntersecting = true) {
    const live = els.filter((el) => this.els.includes(el));
    if (live.length) {
      this.cb(
        live.map((target) => ({ isIntersecting, target }) as never),
        this as never
      );
    }
  }
}

const events = (name: string) => ph.capture.mock.calls.filter(([n]) => n === name);

beforeEach(() => {
  ph.capture.mockClear();
  FakeObserver.all = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  vi.stubGlobal("ResizeObserver", FakeObserver);
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("question 1's landing card", () => {
  it("counts every tap on the scale by where and whether it changed a pick, never the answer", async () => {
    const { default: WQuestionCard } = await import("@features/landing/ui/white/WQuestionCard");
    render(<WQuestionCard location="hero" />);
    fireEvent.click(screen.getByRole("button", { name: /^6 of 7/ }));
    fireEvent.click(screen.getByRole("button", { name: /^2 of 7/ }));
    expect(events("landing_card_answer")).toEqual([
      ["landing_card_answer", { location: "hero", changed: false }],
      ["landing_card_answer", { location: "hero", changed: true }],
    ]);
    // Question 1 rates the reader's sex life: the picked value goes to no analytics tool.
    expect(JSON.stringify(ph.capture.mock.calls)).not.toMatch(/"value"|:\s*[26]\b/);
  });

  it("tells its Continue apart from the button beside it", async () => {
    const { default: WQuestionCard } = await import("@features/landing/ui/white/WQuestionCard");
    render(<WQuestionCard location="footer" size="final" />);
    fireEvent.click(screen.getByRole("button", { name: /^4 of 7/ }));
    fireEvent.click(screen.getByRole("link", { name: "Continue to the survey" }));
    expect(events("cta_click")).toEqual([
      ["cta_click", { cta: "start_survey", location: "footer", element: "question_card" }],
    ]);
  });

  it("leaves the hero button's own click as it was", async () => {
    const { default: WHero } = await import("@features/landing/ui/white/WHero");
    render(<WHero media="card" />);
    fireEvent.click(screen.getByRole("link", { name: "Start my test now - hero" }));
    expect(events("cta_click")).toEqual([["cta_click", { cta: "start_survey", location: "hero" }]]);
  });
});

describe("the landing's sticky bar", () => {
  it("counts the first time it slides in, once", async () => {
    const { default: WStickyBar } = await import("@features/landing/ui/white/WStickyBar");
    render(<WStickyBar />);
    expect(events("cta_seen")).toEqual([]);
    const scrollTo = (y: number) =>
      act(() => {
        Object.defineProperty(window, "scrollY", { value: y, configurable: true });
        window.dispatchEvent(new Event("scroll"));
      });
    scrollTo(400);
    expect(events("cta_seen")).toEqual([]);
    scrollTo(900);
    scrollTo(100);
    scrollTo(1200);
    expect(events("cta_seen")).toEqual([["cta_seen", { cta: "sticky_bar" }]]);
  });
});

describe("how far down the landing a visitor got", () => {
  /** The live page's sections in its order (LandingPageWhite), the hero aside. */
  const renderSections = async () => {
    const mods = await Promise.all([
      import("@features/landing/ui/white/WTrustStrip"),
      import("@features/landing/ui/white/WDiscover"),
      import("@features/landing/ui/white/WVocab"),
      import("@features/landing/ui/white/WFindOut"),
      import("@features/landing/ui/white/WWowStats"),
      import("@features/landing/ui/white/WResultTeaser"),
      import("@features/landing/ui/white/WArchetypeCards"),
      import("@features/landing/ui/white/WTestimonials"),
      import("@features/landing/ui/white/WFoundation"),
      import("@features/landing/ui/white/WFAQ"),
      import("@features/landing/ui/white/WCTA"),
      import("@features/landing/ui/white/WFooterSection"),
    ]);
    const { default: LandingSectionsSeen } =
      await import("@features/landing/ui/LandingSectionsSeen");
    const { container } = render(
      <>
        {mods.map(({ default: Section }, i) => (
          <Section key={i} />
        ))}
        <LandingSectionsSeen />
      </>
    );
    return [...container.querySelectorAll<HTMLElement>("[data-landing-section]")];
  };

  it("names every section of the page, in its order", async () => {
    const sections = await renderSections();
    expect(sections.map((s) => s.dataset.landingSection)).toEqual([
      "trust_strip",
      "discover",
      "vocab",
      "find_out",
      "wow_stats",
      "result_teaser",
      "archetypes",
      "testimonials",
      "foundation",
      "faq",
      "closing_cta",
      "footer",
    ]);
  });

  it("counts each section once, when it reaches the top half of the screen", async () => {
    const sections = await renderSections();
    const io = FakeObserver.all.find((o) => o.opts?.rootMargin === "0px 0px -50% 0px")!;
    expect(io.els).toHaveLength(12);
    act(() => io.show(sections.slice(0, 3), false));
    expect(events("section_seen")).toEqual([]);
    act(() => io.show(sections.slice(0, 2)));
    act(() => io.show(sections.slice(0, 3)));
    expect(events("section_seen")).toEqual([
      ["section_seen", { section: "trust_strip" }],
      ["section_seen", { section: "discover" }],
      ["section_seen", { section: "vocab" }],
    ]);
  });
});
