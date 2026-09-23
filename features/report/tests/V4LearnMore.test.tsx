// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import V4LearnMore from "@features/report/ui/v3/V4LearnMore";
import V4ChapterPart from "@features/report/ui/v3/V4ChapterPart";
import {
  LOCKED_ARTICLE_WINDOW_PX,
  splitArticleForReader,
} from "@features/report/server/contentGating";
import { REPORT_V4_LEARN_MORE } from "@/data/report3-learn-more";
import type { Report3Block, V4LearnMoreByChapter } from "@/data/report3-learn-more";
import {
  CHAPTER_COPY_PLACEHOLDER,
  REPORT_V4_PART3_CHAPTERS,
  REPORT_V4_PART4_CHAPTERS,
  REPORT_V4_PART5_CHAPTERS,
  REPORT_V4_PART6_CHAPTERS,
} from "@/data/report3-archetype-page";

/**
 * "Go deeper & learn more" — Figma 153:2240 / 153:2260 / 153:2280.
 *
 * Follows V4ReportPage.test.tsx: assert the rendered DOM, plus the CSS contracts
 * the DOM cannot show, read off disk.
 */

/**
 * The component takes the VIEW the server derives, never the authored article —
 * so these tests build it the same way production does. `false` gives the whole
 * thing; the locked cases pass `gated` explicitly to exercise each shape.
 */
const ARTICLE = splitArticleForReader(REPORT_V4_LEARN_MORE.typical_beliefs!, false);
const V3_CSS = readFileSync(join(__dirname, "..", "ui", "v3", "reportV3.css"), "utf8");

const textOf = (block: Report3Block): string =>
  block.kind === "heading"
    ? block.text
    : block.kind === "para"
      ? block.runs.map((r) => r.text).join("")
      : block.items.map((runs) => runs.map((r) => r.text).join("")).join(" ");

/** The whole gated remainder, as a locked reader must never receive it. */
const GATED_PROBE = textOf(ARTICLE.gated![ARTICLE.gated!.length - 1]!).slice(0, 60);

afterEach(cleanup);

describe("V4LearnMore — closed (153:2240)", () => {
  it("draws the eyebrow, the Lora label and the read link", () => {
    const { container } = render(<V4LearnMore article={ARTICLE} />);
    // 230:282 sets the label in Light and the value in Bold, so it is two runs.
    expect(container.querySelector(".rv4-learn__eyebrow")?.textContent).toBe(
      "Reading time: ~15 min."
    );
    expect(container.querySelector(".rv4-learn__eyebrow-label")?.textContent).toBe("Reading time:");
    expect(screen.getByText("Go deeper & learn more")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Read the full article" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Go deeper/ }).getAttribute("aria-expanded")).toBe(
      "false"
    );
  });

  it("shows only the opening blocks, not the article", () => {
    const { container } = render(<V4LearnMore article={ARTICLE} />);
    const paragraphs = container.querySelectorAll(".rv4-learn__teaser .rv4-prose__p");
    expect(paragraphs).toHaveLength(2);
    // Block three onward is not in the DOM at all, clamp or no clamp.
    expect(container.textContent).not.toContain(textOf(ARTICLE.free[2]!).slice(0, 60));
  });

  it("is NEVER gated — a locked reader sees the same card", () => {
    const { container } = render(<V4LearnMore article={ARTICLE} locked />);
    expect(container.querySelector(".rv4-premium")).toBeNull();
    expect(container.querySelector(".rv4-learn__gate")).toBeNull();
    expect(screen.getByRole("button", { name: "Read the full article" })).toBeTruthy();
  });

  it("opens from either the header button or the read link", () => {
    const { container } = render(<V4LearnMore article={ARTICLE} />);
    fireEvent.click(screen.getByRole("button", { name: "Read the full article" }));
    expect(container.querySelector(".rv4-learn")?.className).toContain("is-open");
  });
});

describe("V4LearnMore — expanded, unlocked (153:2260)", () => {
  it("renders every block, free and paid, with no gate", () => {
    const { container } = render(<V4LearnMore article={ARTICLE} defaultOpen />);
    const blocks = container.querySelectorAll(".rv4-prose__p, .rv4-prose__h, .rv4-prose__list");
    expect(blocks).toHaveLength(ARTICLE.free.length + ARTICLE.gated!.length);
    expect(container.querySelector(".rv4-learn__gate")).toBeNull();
    expect(screen.queryByText("Show More")).toBeNull();
    expect(screen.queryByText("Unlock full report")).toBeNull();
  });

  it("carries the article's structure — five serif headings and one list", () => {
    const { container } = render(<V4LearnMore article={ARTICLE} defaultOpen />);
    expect(container.querySelectorAll(".rv4-prose__h")).toHaveLength(5);
    expect(container.querySelectorAll(".rv4-prose__list")).toHaveLength(1);
    expect(container.querySelectorAll(".rv4-prose__list li")).toHaveLength(8);
  });

  it("marks up bold and italic runs semantically", () => {
    const { container } = render(<V4LearnMore article={ARTICLE} defaultOpen />);
    expect(container.querySelectorAll("strong").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("em").length).toBeGreaterThan(0);
  });
});

describe("V4LearnMore — expanded, gated (153:2280)", () => {
  it("draws the window, the fade, Show More and the card", () => {
    const { container } = render(<V4LearnMore article={ARTICLE} locked defaultOpen />);
    expect(container.querySelector(".rv4-learn__gated")).toBeTruthy();
    expect(container.querySelector(".rv4-learn__fade")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show More" })).toBeTruthy();
    expect(screen.getByText("Premium content")).toBeTruthy();
    expect(screen.getByText("14-day money-back guarantee")).toBeTruthy();
    expect(screen.getByText("No questions asked.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Unlock full report" })).toBeTruthy();
  });

  it("hides the blurred window from assistive tech", () => {
    const { container } = render(<V4LearnMore article={ARTICLE} locked defaultOpen />);
    const window_ = container.querySelector(".rv4-learn__gated")!;
    expect(window_.getAttribute("aria-hidden")).toBe("true");
    expect(window_.hasAttribute("inert")).toBe(true);
  });

  /**
   * THE PRODUCTION SHAPE. Once the server has stripped `gated`, the component
   * must render the same window, fade, link and card — otherwise the locked
   * layout diverges the moment the paywall becomes real.
   */
  it("renders an identical structure when the server stripped the copy", () => {
    const stripped = { ...ARTICLE, gated: null };
    const { container: withCopy } = render(<V4LearnMore article={ARTICLE} locked defaultOpen />);
    const shape = (root: Element) =>
      [".rv4-learn__gate", ".rv4-learn__gated", ".rv4-learn__fade", ".rv4-premium"].map(
        (sel) => root.querySelectorAll(sel).length
      );
    const withCopyShape = shape(withCopy);
    cleanup();

    const { container: withNone } = render(<V4LearnMore article={stripped} locked defaultOpen />);
    expect(shape(withNone)).toEqual(withCopyShape);
    expect(withNone.querySelector(".rv4-learn__gated")!.textContent).toBe("");
    expect(screen.getByRole("button", { name: "Unlock full report" })).toBeTruthy();
    expect(withNone.textContent).not.toContain(GATED_PROBE);
  });

  it("opens the paywall from the card, from Show More and from the band", () => {
    const onUnlock = vi.fn();
    const { container } = render(
      <V4LearnMore article={ARTICLE} locked defaultOpen onUnlock={onUnlock} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Unlock full report" }));
    expect(onUnlock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Show More" }));
    expect(onUnlock).toHaveBeenCalledTimes(2);
    fireEvent.click(container.querySelector(".rv4-learn__gate")!);
    expect(onUnlock).toHaveBeenCalledTimes(3);
  });

  it("does not open the paywall when a drag ends inside it", () => {
    const onUnlock = vi.fn();
    vi.spyOn(window, "getSelection").mockReturnValue({
      toString: () => "some selected copy",
    } as unknown as Selection);
    const { container } = render(
      <V4LearnMore article={ARTICLE} locked defaultOpen onUnlock={onUnlock} />
    );
    fireEvent.click(container.querySelector(".rv4-learn__gate")!);
    expect(onUnlock).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

describe("V4ChapterPart composition", () => {
  const learnMore: V4LearnMoreByChapter = {
    typical_beliefs: { article: ARTICLE, locked: true },
  };

  it("puts the article on the one chapter that has it, and no other", () => {
    const { container } = render(<V4ChapterPart archetype="Spark Seeker" learnMore={learnMore} />);
    expect(container.querySelectorAll(".rv4-chapter")).toHaveLength(
      REPORT_V4_PART3_CHAPTERS.length
    );
    expect(container.querySelectorAll(".rv4-learn")).toHaveLength(1);
  });

  it("renders nothing extra when the host passes no articles", () => {
    const { container } = render(<V4ChapterPart archetype="Spark Seeker" />);
    expect(container.querySelector(".rv4-learn")).toBeNull();
  });

  /**
   * A collapsed row gives a reader no hint that a 15-minute article sits under
   * it, so a chapter that has one opens with it already showing.
   */
  it("opens the chapter that carries an article, and leaves the rest closed", () => {
    const { container } = render(<V4ChapterPart archetype="Spark Seeker" learnMore={learnMore} />);
    const open = container.querySelectorAll(".rv4-chapter.is-open");
    expect(open).toHaveLength(1);
    expect(open[0]!.textContent).toContain("Go deeper & learn more");
  });

  it("drops the [Chapter Copy] placeholder the article replaces", () => {
    const { container } = render(<V4ChapterPart archetype="Spark Seeker" learnMore={learnMore} />);
    const chapter = container.querySelector(".rv4-chapter.is-open")!;
    expect(chapter.textContent).not.toContain(CHAPTER_COPY_PLACEHOLDER);
    // The other expanded-variant chapters keep theirs — nothing else changed.
    expect(container.querySelector(".rv4-learn")).toBeTruthy();
  });

  it("carries all three articles across Parts III, IV and VI", () => {
    // The three live in different parts, so this is the check that adding an
    // article is genuinely one data entry and needs no wiring.
    const all: V4LearnMoreByChapter = Object.fromEntries(
      Object.entries(REPORT_V4_LEARN_MORE).map(([id, a]) => [
        id,
        { article: splitArticleForReader(a, true), locked: true },
      ])
    );
    const parts = [
      REPORT_V4_PART3_CHAPTERS,
      REPORT_V4_PART4_CHAPTERS,
      REPORT_V4_PART5_CHAPTERS,
      REPORT_V4_PART6_CHAPTERS,
    ];
    const found = parts.map((chapters, i) => {
      const { container } = render(
        <V4ChapterPart
          archetype="Spark Seeker"
          chapters={chapters}
          partIndex={i + 2}
          learnMore={all}
        />
      );
      const n = container.querySelectorAll(".rv4-learn").length;
      cleanup();
      return n;
    });
    // Typical Beliefs (III), Accelerator & Brakes (IV), nothing in V, Fantasy vs. Reality (VI).
    expect(found).toEqual([1, 1, 0, 1]);
    expect(Object.keys(REPORT_V4_LEARN_MORE)).toHaveLength(3);
  });

  it("gives each chapter its own reading time", () => {
    const times = Object.values(REPORT_V4_LEARN_MORE).map((a) => a.eyebrow);
    expect(new Set(times).size).toBe(3);
    expect(times).toContain("Reading time: ~12 min.");
  });

  it("still keeps the paid remainder out of the page until it is paid for", () => {
    const { container } = render(<V4ChapterPart archetype="Spark Seeker" learnMore={learnMore} />);
    expect(container.textContent).not.toContain(GATED_PROBE);
  });
});

describe("reportV3.css — learn-more contracts", () => {
  const rule = (selector: string) => {
    const at = V3_CSS.indexOf(selector);
    expect(at, `${selector} missing from reportV3.css`).toBeGreaterThan(-1);
    return V3_CSS.slice(at, V3_CSS.indexOf("}", at));
  };

  it("clamps the blurred window to a FIXED height, both ways", () => {
    // The min and max must match, or a stripped payload collapses the window and
    // the locked layout stops matching the unlocked one. 656 = the 76px
    // progressive band (411:5694) + the 580px window (170:231), and it must equal
    // the server's LOCKED_ARTICLE_WINDOW_PX.
    const css = rule(".rv3 .rv4-learn__gated {");
    expect(css).toContain(`max-height: ${LOCKED_ARTICLE_WINDOW_PX}px`);
    expect(css).toContain(`min-height: ${LOCKED_ARTICLE_WINDOW_PX}px`);
    expect(css).toContain("overflow: clip");
  });

  it("ramps the blur in over the first 76px, then holds Figma's radius 5", () => {
    // 411:5694 is a PROGRESSIVE layer blur (0 -> 5 over 76px); 170:231 holds 5.
    // Three backdrop layers whose sigmas add in quadrature to CSS 2.5px.
    const layers = [1, 2, 3].map((n) => rule(`.rv3 .rv4-learn__blur > span:nth-child(${n}) {`));
    const sigmas = layers.map((css) => parseFloat(css.match(/--rv4-blur:\s*([\d.]+)px/)![1]!));
    expect(Math.sqrt(sigmas.reduce((sum, s) => sum + s * s, 0))).toBeCloseTo(2.5, 1);
    expect(layers[2]).toContain("--rv4-to: 76px");
    // Without backdrop-filter the copy falls back to the old uniform blur.
    expect(V3_CSS).toMatch(/@supports not \(\(backdrop-filter[\s\S]*?filter: blur\(2\.5px\)/);
  });

  it("draws the fade exactly as 230:236 does", () => {
    const css = rule(".rv3 .rv4-learn__fade {");
    expect(css).toContain("rgba(252, 251, 254, 0) 0%");
    expect(css).toContain("42%");
    expect(css).toContain("#fcfbfe 100%");
    expect(css).toContain("height: 63px");
  });

  it("sizes the premium card as 153:2301 does", () => {
    const css = rule(".rv3 .rv4-premium {");
    expect(css).toContain("width: 330px");
    expect(css).toContain("height: 191px");
    expect(css).toContain("border: 0.719px solid #fe6839");
    expect(rule(".rv3 .rv4-premium__cta {")).toContain("background: #fe6839");
  });

  it("clamps the closed teaser to the frame's 240px box", () => {
    expect(rule(".rv3 .rv4-learn__teaser {")).toContain("max-height: 240px");
  });

  it("keeps the append-only promise — nothing new above line 1884", () => {
    const untouched = V3_CSS.split("\n").slice(0, 1884).join("\n");
    expect(untouched).not.toContain("rv4-learn");
    expect(untouched).not.toContain("rv4-premium");
    expect(untouched).not.toContain("rv4-prose");
  });
});
