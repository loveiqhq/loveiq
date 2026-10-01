// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup, act, within } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("next/image", () => ({
  default: ({
    alt = "",
    unoptimized: _unoptimized,
    ...props
  }: Record<string, unknown> & { alt?: string; unoptimized?: boolean }) => (
    // eslint-disable-next-line @next/next/no-img-element -- test-only mock for next/image
    <img {...props} alt={alt} />
  ),
}));

const analytics = vi.hoisted(() => ({
  trackWizardSlideAdvanced: vi.fn(),
  trackWizardMapStep: vi.fn(),
}));
vi.mock("@features/analytics/client", () => analytics);

import PreReportWizard from "@features/survey/ui/PreReportWizard";
import { WIZARD_DRAWER } from "@features/survey/ui/wizard/wizardContent";
import { REPORT_DEEP_DIVES } from "@/data/report-deep-dives";
import { REPORT_V4_NAV_PARTS } from "@features/report/ui/v3/reportV3Nav";

/**
 * The 30.09 wizard — Figma 1071:2092, "Pre Report Wizard — Mobile (production, 393)".
 * Six slides, the second of them the report map, whose overview opens onto four
 * deep-dive tiles (Figma drew those as a seventh "Slide NEW"; they stay inside slide 2
 * so wizard_slide_advanced keeps counting 0-5 for the digests).
 */
const HEADINGS = [
  "A note before you explore your report.",
  "6 Parts, 20 Chapters",
  "Unlocking your report is fully risk free.",
  "Take only what resonates.",
  "Rate each report section.",
  "Invite your friends to grow.",
];

const heading = () => screen.getByRole("heading", { level: 2 }).textContent?.replace(/\s+/g, " ");
const continueButton = () =>
  screen.getByRole("button", { name: /continue to (next slide|your report)/i });
/** The deep-dive arrows stay focusable at an end (aria-disabled), so a keyboard keeps its place. */
const isOff = (button: HTMLElement) => button.getAttribute("aria-disabled") === "true";
const backButton = () => screen.queryByRole("button", { name: /go to previous slide/i });
const nextDeepDive = () => screen.getByRole("button", { name: /next deep dive/i });
const previousDeepDive = () => screen.getByRole("button", { name: /previous deep dive/i });
const activeTile = () => document.querySelector("[data-deep-dive][aria-current='step']");
const markedRow = () => document.querySelector("[data-wizard-row][data-marked='active']");

/** Let a slide's 250ms leave animation finish. */
const flush = (ms = 260) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

function press(button: HTMLElement) {
  fireEvent.click(button);
  flush();
}

beforeEach(() => {
  vi.useFakeTimers();
  analytics.trackWizardSlideAdvanced.mockClear();
  analytics.trackWizardMapStep.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("PreReportWizard — slides", () => {
  it("opens on the note, with the three research tiles, 1 / 6 and no Back button", () => {
    render(<PreReportWizard onComplete={vi.fn()} />);
    expect(heading()).toBe(HEADINGS[0]);
    for (const title of ["100+ research papers", "Clinical models", "Foundational books"]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    expect(screen.getByText("1 / 6")).toBeInTheDocument();
    // Slide 1 draws CONTINUE alone, at the left (Figma 1049:1161): no Back at all.
    expect(backButton()).toBeNull();
  });

  it("walks the six slides in Figma's order, the counter and the bar following", () => {
    render(<PreReportWizard onComplete={vi.fn()} />);
    const filled = () =>
      document.querySelectorAll("[data-wizard-segment][data-filled='true']").length;

    expect(filled()).toBe(1);
    press(continueButton());
    expect(heading()).toBe(HEADINGS[1]);
    expect(screen.getByText("2 / 6")).toBeInTheDocument();
    expect(filled()).toBe(2);

    // The map's overview continues into its deep dives, still slide 2 of 6.
    press(continueButton());
    expect(activeTile()?.getAttribute("data-deep-dive")).toBe(REPORT_DEEP_DIVES[0]!.id);
    expect(screen.getByText("2 / 6")).toBeInTheDocument();

    for (let i = 2; i < HEADINGS.length; i++) {
      press(continueButton());
      expect(heading()).toBe(HEADINGS[i]);
      expect(screen.getByText(`${i + 1} / 6`)).toBeInTheDocument();
      expect(filled()).toBe(i + 1);
    }
  });

  it("drops the old slides the design no longer has", () => {
    render(<PreReportWizard onComplete={vi.fn()} />);
    for (let i = 0; i < 6; i++) press(continueButton());
    expect(screen.queryByText("Share your report with someone you care about.")).toBeNull();
    expect(screen.queryByText("Your personalised report is waiting for you.")).toBeNull();
  });

  it("CONTINUE on the last slide calls onComplete after the exit fade", () => {
    const onComplete = vi.fn();
    render(<PreReportWizard onComplete={onComplete} />);
    for (let i = 0; i < 6; i++) press(continueButton());
    expect(heading()).toBe(HEADINGS[5]);
    fireEvent.click(continueButton());
    flush(260);
    expect(onComplete).not.toHaveBeenCalled();
    flush(650);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("SKIP INTRO calls onComplete after the exit fade", () => {
    const onComplete = vi.fn();
    render(<PreReportWizard onComplete={onComplete} />);
    fireEvent.click(screen.getByRole("button", { name: /skip intro/i }));
    flush(650);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  // Final review, 30.09: the column is the scroller (the page is one screen tall), and
  // the page's smooth scroll (Lenis, on a desktop) cancels the wheel over any nested
  // scroller that does not opt out, so on a 1366x650 window CONTINUE, Back and the bar
  // sat 152px below the fold and a mouse could not reach them.
  it("lets its column scroll under the page's smooth scroll", () => {
    render(<PreReportWizard onComplete={vi.fn()} />);
    const column = screen.getByRole("button", { name: /skip intro/i }).parentElement!;
    expect(column.className).toContain("overflow-y-auto");
    expect(column).toHaveAttribute("data-lenis-prevent");
  });

  it("hands focus to CONTINUE when Back reaches slide 1, which draws no Back", () => {
    render(<PreReportWizard onComplete={vi.fn()} />);
    press(continueButton());
    const back = backButton()!;
    back.focus();
    press(back);
    expect(heading()).toBe(HEADINGS[0]);
    expect(backButton()).toBeNull();
    expect(document.activeElement).toBe(continueButton());
  });

  // WCAG 2.5.3: a control's name holds the words it shows, so a voice command saying
  // "Continue" finds it on the last slide too.
  it("names the last CONTINUE with the word it shows", () => {
    render(<PreReportWizard onComplete={vi.fn()} />);
    for (let i = 0; i < 6; i++) press(continueButton());
    expect(heading()).toBe(HEADINGS[5]);
    const last = screen.getByRole("button", { name: "Continue to your report" });
    expect(last.textContent).toContain("Continue");
  });
});

describe("PreReportWizard — the report map (slide 2)", () => {
  const openMap = () => {
    render(<PreReportWizard onComplete={vi.fn()} />);
    press(continueButton());
  };

  it("opens on the overview: the pitch copy, ▲ off and ▼ on, nothing marked yet", () => {
    openMap();
    expect(screen.getByText("your free chapters")).toBeInTheDocument();
    expect(isOff(previousDeepDive())).toBe(true);
    expect(isOff(nextDeepDive())).toBe(false);
    expect(activeTile()).toBeNull();
    expect(markedRow()).toBeNull();
  });

  it("▼ and ▲ step through the four deep dives, marking each chapter in the drawer", () => {
    openMap();
    const ids = REPORT_DEEP_DIVES.map((d) => d.id);

    fireEvent.click(nextDeepDive());
    expect(activeTile()?.getAttribute("data-deep-dive")).toBe(ids[0]);
    expect(markedRow()?.getAttribute("data-wizard-row")).toBe(ids[0]);
    // The first tile has nothing above it (Figma 1049:1979).
    expect(isOff(previousDeepDive())).toBe(true);

    for (let i = 1; i < ids.length; i++) {
      fireEvent.click(nextDeepDive());
      expect(activeTile()?.getAttribute("data-deep-dive")).toBe(ids[i]);
      expect(markedRow()?.getAttribute("data-wizard-row")).toBe(ids[i]);
    }
    // The last has nothing below it (Figma 1049:2322).
    expect(isOff(nextDeepDive())).toBe(true);
    expect(isOff(previousDeepDive())).toBe(false);

    fireEvent.click(previousDeepDive());
    expect(activeTile()?.getAttribute("data-deep-dive")).toBe(ids[2]);
  });

  it("keeps an arrow focusable at its end, where a press does nothing", () => {
    openMap();
    fireEvent.click(nextDeepDive());
    const up = previousDeepDive();
    expect(up).not.toBeDisabled();
    up.focus();
    fireEvent.click(up);
    expect(activeTile()?.getAttribute("data-deep-dive")).toBe(REPORT_DEEP_DIVES[0]!.id);
    expect(document.activeElement).toBe(up);
    for (let i = 1; i < REPORT_DEEP_DIVES.length; i++) fireEvent.click(nextDeepDive());
    const down = nextDeepDive();
    expect(down).not.toBeDisabled();
    fireEvent.click(down);
    expect(activeTile()?.getAttribute("data-deep-dive")).toBe(REPORT_DEEP_DIVES.at(-1)!.id);
  });

  // The overview's ▼ and the tiles' are two buttons, one hidden while the other shows,
  // so pressing the overview's would have left focus on a button about to disappear.
  it("carries focus from the overview's ▼ to the tiles' as they come in", () => {
    openMap();
    const overviewDown = nextDeepDive();
    overviewDown.focus();
    fireEvent.click(overviewDown);
    expect(activeTile()?.getAttribute("data-deep-dive")).toBe(REPORT_DEEP_DIVES[0]!.id);
    const tilesDown = nextDeepDive();
    expect(tilesDown).not.toBe(overviewDown);
    expect(document.activeElement).toBe(tilesDown);
  });

  it("each tile carries its chapter's question and the line under it", () => {
    openMap();
    fireEvent.click(nextDeepDive());
    for (const dive of REPORT_DEEP_DIVES) {
      const tile = document.querySelector(`[data-deep-dive="${dive.id}"]`) as HTMLElement;
      expect(within(tile).getByText(dive.title)).toBeInTheDocument();
      expect(within(tile).getByText(dive.question)).toBeInTheDocument();
      expect(within(tile).getByText(dive.support)).toBeInTheDocument();
    }
  });

  it("Back from the deep dives returns to the overview, and from there to slide 1", () => {
    openMap();
    fireEvent.click(nextDeepDive());
    fireEvent.click(nextDeepDive());
    press(backButton()!);
    expect(heading()).toBe(HEADINGS[1]);
    expect(activeTile()).toBeNull();
    press(backButton()!);
    expect(heading()).toBe(HEADINGS[0]);
  });

  it("coming back from slide 3 lands on the deep dive last shown", () => {
    openMap();
    fireEvent.click(nextDeepDive());
    fireEvent.click(nextDeepDive());
    press(continueButton());
    expect(heading()).toBe(HEADINGS[2]);
    press(backButton()!);
    expect(activeTile()?.getAttribute("data-deep-dive")).toBe(REPORT_DEEP_DIVES[1]!.id);
  });

  it("the drawer mirrors the report's V4 nav, row for row", () => {
    expect(
      WIZARD_DRAWER.map((p) => ({
        part: p.part,
        label: p.label,
        rows: p.rows.map((r) => ({ id: r.id, label: r.label })),
      }))
    ).toEqual(
      REPORT_V4_NAV_PARTS.map((p) => ({
        part: p.part,
        label: p.label,
        rows: p.items.map((i) => ({ id: i.id, label: i.label })),
      }))
    );
  });

  it("the drawer badges the free chapters FREE and opens the four deep dives' locks", () => {
    const badges = Object.fromEntries(
      WIZARD_DRAWER.flatMap((p) => p.rows.map((r) => [r.id, r.badge]))
    );
    expect(
      Object.entries(badges)
        .filter(([, b]) => b === "free")
        .map(([id]) => id)
    ).toEqual(["introduction", "what_shaped_this_report", "core_archetype"]);
    expect(
      Object.entries(badges)
        .filter(([, b]) => b === "open")
        .map(([id]) => id)
    ).toEqual(REPORT_DEEP_DIVES.map((d) => d.id));
  });
});

describe("PreReportWizard — keys, swipes and analytics", () => {
  it("ArrowRight and Enter continue, ArrowLeft goes back, ArrowDown and ArrowUp step the map", () => {
    render(<PreReportWizard onComplete={vi.fn()} />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    flush();
    expect(heading()).toBe(HEADINGS[1]);
    fireEvent.keyDown(window, { key: "ArrowDown" });
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(activeTile()?.getAttribute("data-deep-dive")).toBe(REPORT_DEEP_DIVES[1]!.id);
    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(activeTile()?.getAttribute("data-deep-dive")).toBe(REPORT_DEEP_DIVES[0]!.id);
    fireEvent.keyDown(window, { key: "Enter" });
    flush();
    expect(heading()).toBe(HEADINGS[2]);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    flush();
    expect(activeTile()?.getAttribute("data-deep-dive")).toBe(REPORT_DEEP_DIVES[0]!.id);
  });

  it("Enter on a focused button moves once, not twice", () => {
    render(<PreReportWizard onComplete={vi.fn()} />);
    const button = continueButton();
    button.focus();
    fireEvent.keyDown(button, { key: "Enter" });
    fireEvent.click(button);
    flush();
    expect(heading()).toBe(HEADINGS[1]);
  });

  it("a swipe left continues and a swipe right goes back", () => {
    render(<PreReportWizard onComplete={vi.fn()} />);
    const stage = screen.getByRole("main");
    fireEvent.touchStart(stage, { touches: [{ clientX: 300, clientY: 400 }] });
    fireEvent.touchEnd(stage, { changedTouches: [{ clientX: 180, clientY: 410 }] });
    flush();
    expect(heading()).toBe(HEADINGS[1]);
    fireEvent.touchStart(stage, { touches: [{ clientX: 100, clientY: 400 }] });
    fireEvent.touchEnd(stage, { changedTouches: [{ clientX: 240, clientY: 395 }] });
    flush();
    expect(heading()).toBe(HEADINGS[0]);
  });

  it("slide moves report 0-5 as wizard_slide_advanced; map steps report as wizard_map_step", () => {
    render(<PreReportWizard onComplete={vi.fn()} />);
    press(continueButton()); // 0 -> 1
    press(continueButton()); // overview -> deep dive 1
    fireEvent.click(nextDeepDive()); // 1 -> 2
    press(continueButton()); // 1 -> 2 (slide)

    expect(analytics.trackWizardSlideAdvanced.mock.calls.map(([p]) => p)).toEqual([
      { from_slide: 0, to_slide: 1, direction: "next" },
      { from_slide: 1, to_slide: 2, direction: "next" },
    ]);
    expect(analytics.trackWizardMapStep.mock.calls.map(([p]) => p)).toEqual([
      { from_step: 0, to_step: 1, control: "continue" },
      { from_step: 1, to_step: 2, control: "next" },
    ]);
  });
});

// The desktop layout (01.10) lives in wizard/wizard-desktop.css, inside one 1024px media
// query (wizardDesktop.test.ts). It styles these hooks; the phone's own classes stay as
// they were, so a phone renders the 393 design exactly.
describe("PreReportWizard — the hooks its desktop layout styles", () => {
  const hook = (name: string) => document.querySelector(`.${name}`);

  it("names the frame, the column, the chrome and a text slide's parts", () => {
    render(<PreReportWizard onComplete={vi.fn()} />);
    expect(screen.getByRole("main")).toHaveClass("wz-root");
    for (const name of ["wz-frame", "wz-scroll", "wz-slot", "wz-footer", "wz-nav"]) {
      expect(hook(name), name).not.toBeNull();
    }
    expect(screen.getByRole("button", { name: /skip intro/i })).toHaveClass("wz-skip");
    expect(continueButton()).toHaveClass("wz-continue");
    const text = hook("wz-text")!;
    expect(text.firstElementChild).toHaveClass("wz-icon");
    expect(text.querySelector("h2")).toHaveClass("wz-heading");
    expect(text.querySelector(".wz-copy")).not.toBeNull();
  });

  it("marks the slides with a visual, which a desktop sets beside the text", () => {
    render(<PreReportWizard onComplete={vi.fn()} />);
    // 1: the three research tiles.
    expect(hook("wz-text")).toHaveClass("has-extra");
    expect(hook("wz-extra")?.querySelector(".wz-proof")).not.toBeNull();
    expect(document.querySelectorAll(".wz-proof-card")).toHaveLength(3);
    press(continueButton());
    // 2: the map, whose parts a desktop sets out as a grid.
    for (const name of ["wz-map", "wz-canvas", "wz-drawer", "wz-pitch", "wz-tiles"]) {
      expect(hook(name), name).not.toBeNull();
    }
    expect(document.querySelectorAll(".wz-controls")).toHaveLength(2);
    // The pitch's gaps are a var, which the desktop rule can replace: an inline one would win.
    const items = document.querySelectorAll<HTMLElement>(".wz-pitch-item");
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(item.style.paddingTop).toBe("");
      expect(item.style.getPropertyValue("--wz-pitch-gap")).toMatch(/^2[02]px$/);
    }
    press(continueButton());
    press(continueButton());
    // 3: the guarantee.
    expect(hook("wz-text")).toHaveClass("has-extra");
    expect(hook("wz-guarantee")).not.toBeNull();
    press(continueButton());
    // 4-6: text alone.
    expect(hook("wz-text")).not.toHaveClass("has-extra");
    expect(backButton()).toHaveClass("wz-back");
  });

  describe("the map's box", () => {
    const realWidth = window.innerWidth;
    const realHeight = window.innerHeight;
    /** A window of `width` x `height` whose content column is `column` wide. */
    const sized = (width: number, height: number, column: number) => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
      vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(column);
      vi.stubGlobal(
        "ResizeObserver",
        class {
          observe() {}
          disconnect() {}
        }
      );
    };
    afterEach(() => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: realWidth });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: realHeight });
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });
    const mapBox = () => {
      render(<PreReportWizard onComplete={vi.fn()} />);
      press(continueButton());
      return hook("wz-canvas")!.parentElement!;
    };

    it("hands a desktop's zooms to its grid and lets the grid set the height", () => {
      sized(1440, 900, 1120);
      const box = mapBox();
      // 900 leaves the map 653: the drawer's 597 and the tiles' 541 grow to it.
      expect(Number(box.style.getPropertyValue("--wz-drawer-zoom"))).toBeCloseTo(653 / 597);
      expect(Number(box.style.getPropertyValue("--wz-tiles-zoom"))).toBeCloseTo(653 / 541);
      expect(box.style.height).toBe("");
      expect(hook("wz-canvas")).not.toHaveAttribute("style");
    });

    it("keeps a phone's canvas 640 tall, and scales it whole on a narrower one", () => {
      sized(393, 852, 345);
      let box = mapBox();
      expect(box.style.height).toBe("640px");
      expect(box.style.getPropertyValue("--wz-drawer-zoom")).toBe("");
      cleanup();
      sized(375, 812, 327);
      box = mapBox();
      expect(parseFloat(box.style.height)).toBeCloseTo((640 * 327) / 345);
      expect(hook("wz-canvas")!.style.transform).toBe(`scale(${327 / 345})`);
    });
  });

  it("loads the desktop stylesheet", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(process.cwd(), "features/survey/ui/PreReportWizard.tsx"), "utf8");
    expect(src).toContain('import "./wizard/wizard-desktop.css";');
  });
});

// Mark, Figma 01.10 08:42 on 1071:2092: "Decreased Icons size and space between elements".
// The sync that morning asked for more above the fold (Marcus: "the top icon") and for
// slide 1's research cards to come up to the text (Sanjin: "a little bit pushed down").
describe("PreReportWizard — Mark's 01.10 round: smaller icons, tighter gaps", () => {
  const extraGap = () =>
    document.querySelector<HTMLElement>(".wz-extra")!.style.getPropertyValue("--wz-extra-gap");

  it("draws the top icon at 64 in a 140.8 glow, 38.4 out (1049:1173)", () => {
    render(<PreReportWizard onComplete={vi.fn()} />);
    const icon = document.querySelector<HTMLElement>(".wz-icon")!;
    const img = icon.querySelector("img")!;
    expect(img).toHaveAttribute("src", "/survey/wizard/note.svg");
    expect(img).toHaveAttribute("width", "64");
    expect(img).toHaveAttribute("height", "64");
    expect(img).toHaveClass("h-16", "w-16");
    const glow = icon.querySelector("[aria-hidden]")!;
    expect(glow).toHaveClass("h-[140.8px]", "w-[140.8px]", "left-[-38.4px]", "top-[-38.4px]");
  });

  it("sets the copy 20 under the heading (1049:1187)", () => {
    render(<PreReportWizard onComplete={vi.fn()} />);
    const body = document.querySelector(".wz-body");
    expect(body).toHaveClass("pt-5");
    expect(body).not.toHaveClass("pt-6");
  });

  it("brings slide 1's research cards up to 20 under the copy's box (1049:1190)", () => {
    render(<PreReportWizard onComplete={vi.fn()} />);
    // The copy's box is a fixed 198 in Figma, for seven 29.25 lines (204.75) that CSS
    // stacks in full: 20 under the box is 13.25 under the last line.
    expect(extraGap()).toBe("13.25px");
    press(continueButton());
    press(continueButton());
    press(continueButton());
    // Slide 3's guarantee keeps the paragraph's 21px foot and its 24 (1066:2214, 2215).
    expect(heading()).toBe(HEADINGS[2]);
    expect(extraGap()).toBe("45px");
  });

  it("ships Figma's 64 icons: the 80 drawings at 0.8, strokes 4 to 3.2", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    for (const name of ["note", "risk-free", "resonates", "rate", "invite"]) {
      const svg = readFileSync(join(process.cwd(), "public/survey/wizard", `${name}.svg`), "utf8");
      expect(svg, name).toContain('width="64" height="64" viewBox="0 0 64 64"');
      expect(svg, name).toContain('stroke-width="3.2"');
      expect(svg, name).not.toContain('stroke-width="4"');
    }
  });
});

describe("PreReportWizard — track={false}, for the preview page", () => {
  it("sends no analytics, so a reviewer's clicks never count as a finisher's", () => {
    render(<PreReportWizard onComplete={vi.fn()} track={false} />);
    press(continueButton());
    expect(heading()).toBe(HEADINGS[1]);
    press(nextDeepDive());
    expect(activeTile()).not.toBeNull();
    expect(analytics.trackWizardSlideAdvanced).not.toHaveBeenCalled();
    expect(analytics.trackWizardMapStep).not.toHaveBeenCalled();
  });
});
