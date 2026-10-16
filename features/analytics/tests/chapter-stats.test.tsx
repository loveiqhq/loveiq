// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({ persistReportChapterStats: vi.fn(), trackCtaSeen: vi.fn() }));
vi.mock("@features/analytics/client", () => client);

import {
  HIDDEN_SAVE_GAP_MS,
  recordPaywallClick,
  recordPaywallSeen,
  useChapterStats,
} from "@features/analytics/chapterStats";
import { useCtaSeen } from "@features/analytics/useCtaSeen";
import { __resetBodyScrollLockForTests, lockBodyScroll } from "@shared/ui/body-scroll-lock";

/** The chapters in nav order; `summary` is a section of its own with no nav row. */
const CHAPTERS = ["intro", "core", "beliefs"];
let current = "intro";
const store = { get: () => current };
let visibility: DocumentVisibilityState = "visible";

function Page({
  archetype = "Spark Seeker",
  paused = false,
  enabled = true,
}: {
  archetype?: string;
  paused?: boolean;
  enabled?: boolean;
}) {
  useChapterStats({ enabled, chapters: CHAPTERS, active: store, archetype, paused });
  return (
    <main>
      {/* Above the first chapter: in none. */}
      <button type="button" data-chapter-action="open">
        Outside every chapter
      </button>
      <section id="intro" data-report-section="true">
        <button type="button" data-chapter-action="open" aria-expanded="false">
          <span>Open the intro</span>
        </button>
      </section>
      <section id="core" data-report-section="true">
        <button type="button" data-chapter-action="open" aria-expanded="true">
          Close the core
        </button>
      </section>
      <section id="summary" data-report-section="true">
        <button type="button" data-chapter-action="show_all">
          Show all
        </button>
      </section>
      <section id="beliefs" data-report-section="true">
        <button type="button" data-chapter-action="learn_more">
          Read all
        </button>
        <button type="button" data-chapter-action="try_this" aria-expanded="true">
          Close the practice
        </button>
        <button type="button" data-chapter-action="share">
          Not a chapter action
        </button>
      </section>
    </main>
  );
}

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });
const setVisibility = (state: DocumentVisibilityState) => {
  visibility = state;
  document.dispatchEvent(new Event("visibilitychange"));
};
const leave = () => window.dispatchEvent(new Event("pagehide"));
/**
 * Every save, its layout checked and set aside: chapter stats are counted on V4 alone,
 * the slimmed report since 16.10, so every save says so.
 */
const saves = () =>
  client.persistReportChapterStats.mock.calls.map(([m]) => {
    const { report_layout: layout, ...rest } = m as { report_layout?: string };
    expect(layout).toBe("v4_slim");
    return rest;
  });

beforeEach(() => {
  vi.useFakeTimers();
  current = "intro";
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
  client.persistReportChapterStats.mockClear();
  client.trackCtaSeen.mockClear();
});
afterEach(() => {
  cleanup();
  __resetBodyScrollLockForTests();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("reading time", () => {
  it("runs one clock, the current chapter's, so chapters sharing a screen are not all counted", () => {
    render(<Page />);
    advance(3000);
    current = "core";
    advance(2000);
    leave();
    expect(saves()).toEqual([
      { archetype: "Spark Seeker", chapters: { intro: { ms: 3000 }, core: { ms: 2000 } } },
    ]);
  });

  it("stops while the tab is hidden, a pop-up is open, or an overlay holds the page", () => {
    const { rerender } = render(<Page />);
    visibility = "hidden";
    advance(5000);
    visibility = "visible";
    rerender(<Page paused />);
    advance(5000);
    rerender(<Page />);
    lockBodyScroll();
    advance(5000);
    leave();
    // Nothing counted, and an empty save is no save.
    expect(saves()).toEqual([]);
  });
});

describe("saving", () => {
  it("sends only what changed since the last save", () => {
    render(<Page />);
    advance(2000);
    leave();
    leave();
    advance(1000);
    current = "beliefs";
    advance(1000);
    leave();
    expect(saves()).toEqual([
      { archetype: "Spark Seeker", chapters: { intro: { ms: 2000 } } },
      { archetype: "Spark Seeker", chapters: { intro: { ms: 1000 }, beliefs: { ms: 1000 } } },
    ]);
  });

  it("saves when the tab hides (not again within the gap), before the archetype changes, and on the way out", () => {
    const { rerender, unmount } = render(<Page />);
    advance(1000);
    setVisibility("hidden");
    expect(saves()).toHaveLength(1);
    setVisibility("visible");
    advance(1000);
    // A tab flicked away again at once keeps what it has for the next save.
    setVisibility("hidden");
    expect(saves()).toHaveLength(1);
    setVisibility("visible");
    advance(HIDDEN_SAVE_GAP_MS);
    setVisibility("hidden");
    expect(saves()[1]).toEqual({
      archetype: "Spark Seeker",
      chapters: { intro: { ms: 1000 + HIDDEN_SAVE_GAP_MS } },
    });
    setVisibility("visible");
    advance(1000);
    rerender(<Page archetype="Explorer of Edges" />);
    expect(saves()[2]).toEqual({ archetype: "Spark Seeker", chapters: { intro: { ms: 1000 } } });
    advance(2000);
    unmount();
    expect(saves()[3]).toEqual({
      archetype: "Explorer of Edges",
      chapters: { intro: { ms: 2000 } },
    });
    expect(saves()).toHaveLength(4);
  });

  it("records and saves nothing when off (another report, or a shared view)", () => {
    const { unmount } = render(<Page enabled={false} />);
    advance(5000);
    fireEvent.click(screen.getByText("Open the intro"));
    unmount();
    expect(saves()).toEqual([]);
  });
});

describe("what was opened", () => {
  it("counts an opening for the chapter it is in, never a close or an unknown control", () => {
    render(<Page />);
    fireEvent.click(screen.getByText("Open the intro"));
    fireEvent.click(screen.getByText("Close the core"));
    fireEvent.click(screen.getByText("Read all"));
    fireEvent.click(screen.getByText("Close the practice"));
    fireEvent.click(screen.getByText("Not a chapter action"));
    fireEvent.click(screen.getByText("Outside every chapter"));
    // The Summary has no nav row: it is read, and counted, under the chapter above it.
    fireEvent.click(screen.getByText("Show all"));
    leave();
    expect(saves()).toEqual([
      {
        archetype: "Spark Seeker",
        chapters: { intro: { open: 1 }, beliefs: { learn_more: 1 }, core: { show_all: 1 } },
      },
    ]);
  });

  it("reads a toggle before its own click turns it over", () => {
    function Toggle() {
      useChapterStats({
        enabled: true,
        chapters: ["intro"],
        active: store,
        archetype: null,
        paused: false,
      });
      return (
        <section id="intro" data-report-section="true">
          <button
            type="button"
            data-chapter-action="open"
            aria-expanded="false"
            onClick={(e) => {
              const b = e.currentTarget;
              b.setAttribute(
                "aria-expanded",
                b.getAttribute("aria-expanded") === "true" ? "false" : "true"
              );
            }}
          >
            Chapter
          </button>
        </section>
      );
    }
    render(<Toggle />);
    const toggle = screen.getByText("Chapter");
    fireEvent.click(toggle); // opens
    fireEvent.click(toggle); // closes
    fireEvent.click(toggle); // opens again
    leave();
    expect(saves()).toEqual([{ chapters: { intro: { open: 2 } } }]);
  });
});

describe("paywalls", () => {
  it("counts a chapter's paywall seen once, and a click under the chapter named", () => {
    render(<Page />);
    const core = document.getElementById("core")!;
    recordPaywallSeen(core.querySelector("button")!);
    recordPaywallSeen(core);
    recordPaywallSeen(document.querySelector("#summary button")!);
    recordPaywallSeen(document.querySelector("#beliefs button")!);
    recordPaywallClick("core");
    recordPaywallClick("no_such_chapter");
    leave();
    expect(saves()).toEqual([
      {
        archetype: "Spark Seeker",
        chapters: { core: { pw_seen: 1, pw_click: 1 }, beliefs: { pw_seen: 1 } },
      },
    ]);
  });

  /** An IntersectionObserver the test drives. */
  class FakeObserver {
    static all: FakeObserver[] = [];
    el: Element | null = null;
    constructor(public cb: IntersectionObserverCallback) {
      FakeObserver.all.push(this);
    }
    observe(el: Element) {
      this.el = el;
    }
    disconnect() {}
    show() {
      this.cb(
        [{ isIntersecting: true, intersectionRatio: 1, target: this.el } as never],
        this as never
      );
    }
  }

  function LockedCard() {
    const ref = useRef<HTMLButtonElement>(null);
    useCtaSeen(ref, "locked_chapter");
    return <button ref={ref}>Unlock Report</button>;
  }

  it("still sees a locked card that appears after the page's cta_seen, for its own chapter", () => {
    FakeObserver.all = [];
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    function Report({ second }: { second: boolean }) {
      useChapterStats({
        enabled: true,
        chapters: ["intro", "core"],
        active: store,
        archetype: null,
        paused: false,
      });
      return (
        <>
          <section id="intro" data-report-section="true">
            <LockedCard />
          </section>
          <section id="core" data-report-section="true">
            {second ? <LockedCard /> : null}
          </section>
        </>
      );
    }
    const { rerender } = render(<Report second={false} />);
    FakeObserver.all[0]!.show();
    // Opening a chapter mounts its card after the first one was seen.
    rerender(<Report second />);
    FakeObserver.all.at(-1)!.show();
    leave();
    expect(saves()).toEqual([{ chapters: { intro: { pw_seen: 1 }, core: { pw_seen: 1 } } }]);
    // PostHog keeps one cta_seen per page.
    expect(client.trackCtaSeen.mock.calls).toEqual([[{ cta: "locked_chapter" }]]);
  });
});
