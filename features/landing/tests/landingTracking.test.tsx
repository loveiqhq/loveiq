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
  /** These elements are now `ratio` inside the observed area (0: outside it). */
  show(els: Element[], ratio = 1) {
    const live = els.filter((el) => this.els.includes(el));
    if (live.length) {
      this.cb(
        live.map(
          (target) => ({ isIntersecting: ratio > 0, intersectionRatio: ratio, target }) as never
        ),
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
  vi.restoreAllMocks();
});

/** jsdom lays nothing out: every section starts below the fold unless a test says not. */
const placeSections = (scrolledPast: string[] = []) =>
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement
  ) {
    const past = scrolledPast.includes(this.dataset.landingSection ?? "");
    return { top: past ? -400 : 900, bottom: past ? -10 : 1300 } as DOMRect;
  });

describe("question 1's landing card", () => {
  it("counts every tap on the scale with the point picked, for PostHog", async () => {
    const { default: WQuestionCard } = await import("@features/landing/ui/white/WQuestionCard");
    render(<WQuestionCard location="hero" />);
    fireEvent.click(screen.getByRole("button", { name: /^6 of 7/ }));
    fireEvent.click(screen.getByRole("button", { name: /^2 of 7/ }));
    expect(events("landing_card_answer")).toEqual([
      ["landing_card_answer", { location: "hero", changed: false, value: 6 }],
      ["landing_card_answer", { location: "hero", changed: true, value: 2 }],
    ]);
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
    placeSections();
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
    placeSections();
    const sections = await renderSections();
    const io = FakeObserver.all.find((o) => o.opts?.rootMargin === "0px 0px -50% 0px")!;
    expect(io.els).toHaveLength(12);
    act(() => io.show(sections.slice(0, 3), 0));
    expect(events("section_seen")).toEqual([]);
    act(() => io.show(sections.slice(0, 2)));
    act(() => io.show(sections.slice(0, 3)));
    expect(events("section_seen")).toEqual([
      ["section_seen", { section: "trust_strip" }],
      ["section_seen", { section: "discover" }],
      ["section_seen", { section: "vocab" }],
    ]);
  });

  it("counts a short last section once all of it is on screen, as on a tall window", async () => {
    // The footer is 402px under a 68px spacer: past a 940px-tall window it never reaches
    // the top half before the page ends.
    placeSections();
    const sections = await renderSections();
    const footer = sections.at(-1)!;
    const whole = FakeObserver.all.find((o) => o.opts?.threshold === 0.99)!;
    const half = FakeObserver.all.find((o) => o.opts?.rootMargin === "0px 0px -50% 0px")!;
    act(() => whole.show([footer], 0.6));
    expect(events("section_seen")).toEqual([]);
    // Wholly on screen, never in the top half: counted by the second rule alone.
    act(() => whole.show([footer], 1));
    expect(events("section_seen")).toEqual([["section_seen", { section: "footer" }]]);
    // And not again once it is counted.
    expect(half.els).not.toContain(footer);
    act(() => whole.show([footer], 1));
    expect(events("section_seen")).toHaveLength(1);
  });

  it("counts the sections scrolled past before it ran, and no others", async () => {
    // A slow phone shows the server's page first, and the reader scrolls it.
    placeSections(["trust_strip", "discover"]);
    await renderSections();
    expect(events("section_seen")).toEqual([
      ["section_seen", { section: "trust_strip" }],
      ["section_seen", { section: "discover" }],
    ]);
    const half = FakeObserver.all.find((o) => o.opts?.rootMargin === "0px 0px -50% 0px")!;
    expect(half.els).toHaveLength(10);
  });

  describe("and how long each section was in view", () => {
    let clock = 0;
    const at = (ms: number) => (clock = ms);
    beforeEach(() => {
      clock = 0;
      vi.spyOn(performance, "now").mockImplementation(() => clock);
    });
    afterEach(() => {
      // Back to jsdom's own "visible".
      delete (document as { visibilityState?: unknown }).visibilityState;
    });
    const tab = (state: "visible" | "hidden") =>
      act(() => {
        Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
        document.dispatchEvent(new Event("visibilitychange"));
      });
    const fire = (event: Event) => act(() => window.dispatchEvent(event));
    /** What each section_time sent, and that every one went as a beacon. */
    const sent = () =>
      events("section_time").map(([, params, options]) => {
        expect(options).toEqual({ transport: "sendBeacon" });
        return params;
      });
    const observers = () => ({
      half: FakeObserver.all.find((o) => o.opts?.threshold === 0.5)!,
      middle: FakeObserver.all.find((o) => o.opts?.rootMargin === "-49.5% 0px -49.5% 0px")!,
    });

    it("times the hero too, without counting it as reached", async () => {
      const { default: LandingSectionsSeen } =
        await import("@features/landing/ui/LandingSectionsSeen");
      const { container } = render(
        <>
          <section data-landing-time="hero" />
          <LandingSectionsSeen />
        </>
      );
      const hero = container.querySelector("section")!;
      const { half } = observers();
      expect(half.els).toContain(hero);
      // The reach observers never see it: every view starts on the hero.
      for (const o of FakeObserver.all.filter((x) => x !== half && x !== observers().middle))
        expect(o.els).not.toContain(hero);
      at(0);
      act(() => half.show([hero], 1));
      at(14000);
      fire(new Event("pagehide"));
      expect(sent()).toEqual([{ section: "hero", visible_ms: 14000 }]);
      expect(events("section_seen")).toEqual([]);
    });

    it("keeps watching every section, after section_seen has stopped", async () => {
      placeSections(["trust_strip"]);
      await renderSections();
      const { half, middle } = observers();
      expect(half.els).toHaveLength(12);
      expect(middle.els).toHaveLength(12);
    });

    it("times a section while half of it is on screen, only while the tab shows, and sends only what is new", async () => {
      placeSections();
      const [trust] = await renderSections();
      const { half } = observers();
      at(1000);
      act(() => half.show([trust!], 0.6));
      at(4000);
      tab("hidden");
      expect(sent()).toEqual([{ section: "trust_strip", visible_ms: 3000 }]);
      // Hidden from 4s to 9s: none of that counts. Back in front, the clock runs again.
      at(9000);
      tab("visible");
      at(9500);
      act(() => half.show([trust!], 0.4));
      at(20000);
      fire(new Event("pagehide"));
      expect(sent()).toEqual([
        { section: "trust_strip", visible_ms: 3000 },
        { section: "trust_strip", visible_ms: 500 },
      ]);
    });

    it("times a section taller than two screens while it crosses the middle, once when both rules hold", async () => {
      placeSections();
      const sections = await renderSections();
      const archetypes = sections[6]!;
      const { half, middle } = observers();
      at(0);
      act(() => middle.show([archetypes], 0.2));
      at(2000);
      act(() => half.show([archetypes], 0.6));
      at(5000);
      act(() => half.show([archetypes], 0.3));
      at(7000);
      act(() => middle.show([archetypes], 0));
      at(8000);
      fire(new Event("pagehide"));
      expect(sent()).toEqual([{ section: "archetypes", visible_ms: 7000 }]);
    });

    it("counts nothing twice when the tab hides after pagehide, and restarts on a return from the back-forward cache", async () => {
      placeSections();
      const [trust] = await renderSections();
      const { half } = observers();
      at(0);
      act(() => half.show([trust!], 1));
      at(2000);
      fire(new Event("pagehide"));
      at(2500);
      tab("hidden");
      expect(sent()).toEqual([{ section: "trust_strip", visible_ms: 2000 }]);
      tab("visible");
      at(3000);
      fire(Object.assign(new Event("pageshow"), { persisted: true }));
      at(4000);
      tab("hidden");
      expect(sent()).toEqual([
        { section: "trust_strip", visible_ms: 2000 },
        { section: "trust_strip", visible_ms: 1000 },
      ]);
    });

    it("sends what is left on unmount, as a link into the survey does, and nothing after", async () => {
      placeSections();
      const sections = await renderSections();
      const { half } = observers();
      at(0);
      act(() => half.show([sections[10]!, sections[11]!], 1));
      at(1500);
      cleanup();
      expect(sent()).toEqual([
        { section: "closing_cta", visible_ms: 1500 },
        { section: "footer", visible_ms: 1500 },
      ]);
      at(5000);
      fire(new Event("pagehide"));
      expect(sent()).toHaveLength(2);
    });
  });

  it("is mounted by the live page", async () => {
    placeSections();
    vi.doMock("next/dynamic", () => ({ default: () => () => null }));
    const { default: LandingPageWhite } =
      await import("@features/landing/ui/white/LandingPageWhite");
    render(<LandingPageWhite variant="white_card" />);
    const half = FakeObserver.all.find((o) => o.opts?.rootMargin === "0px 0px -50% 0px");
    // The code-split sections (FAQ, closing CTA, footer) render nothing here.
    expect(half?.els.map((el) => (el as HTMLElement).dataset.landingSection)).toEqual([
      "trust_strip",
      "discover",
      "vocab",
      "find_out",
      "wow_stats",
      "result_teaser",
      "archetypes",
      "testimonials",
      "foundation",
    ]);
    vi.doUnmock("next/dynamic");
  });
});
