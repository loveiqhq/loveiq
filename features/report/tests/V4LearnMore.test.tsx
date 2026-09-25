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

  // Review 24.09: "When at the end of the learn more, there is the 'Show more' option,
  // and the 'Back to top' button … they are covering each other."
  it("stops Back to top above a locked article's gate, clear of Show More", () => {
    const { container } = render(<V4LearnMore article={ARTICLE} locked />);
    fireEvent.click(container.querySelector(".rv4-learn__open")!);
    const gate = container.querySelector(".rv4-learn__gate")!;
    const backtop = container.querySelectorAll(".rv4-backtop");
    expect(backtop).toHaveLength(1);
    // Its sticky range is the readable copy: it docks where the free text ends,
    // above the blurred window, and never reaches the button inside the gate.
    expect(gate.previousElementSibling).toBe(backtop[0]);
    expect(gate.contains(backtop[0]!)).toBe(false);
  });

  it("keeps Back to top at the end of an unlocked article", () => {
    const { container } = render(<V4LearnMore article={ARTICLE} />);
    fireEvent.click(container.querySelector(".rv4-learn__open")!);
    const section = container.querySelector(".rv4-learn")!;
    expect(container.querySelectorAll(".rv4-backtop")).toHaveLength(1);
    expect(section.lastElementChild!.className).toBe("rv4-backtop");
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
    expect(screen.queryByText("Unlock the full article")).toBeNull();
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
    expect(screen.getByRole("button", { name: "Unlock the full article" })).toBeTruthy();
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
    fireEvent.click(screen.getByRole("button", { name: "Unlock the full article" }));
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

/**
 * Accelerator & Brakes' closed card, 235:234 — the same 359px card as the others,
 * but its teaser is the frame's own copy (240:239 breaks after "A low sex drive."
 * and "becomes possible.", where the article runs on) in an 11-line box, with the
 * pill 16px higher (41.5px above the box's foot) and 13.5px under it.
 */
describe("V4LearnMore — Accelerator & Brakes closed (235:234)", () => {
  const AB_ID = "typical_arousal_accelerators_turn_ons_of_the_core_archetype";
  const AB_LOCKED = splitArticleForReader(REPORT_V4_LEARN_MORE[AB_ID]!, true);
  const AB_OPEN = splitArticleForReader(REPORT_V4_LEARN_MORE[AB_ID]!, false);

  it("shows the frame's own teaser, broken where 240:239 breaks it", () => {
    const { container } = render(<V4LearnMore article={AB_LOCKED} locked />);
    const paras = container.querySelectorAll(".rv4-learn__teaser .rv4-prose__p");
    expect(paras).toHaveLength(1);
    expect(paras[0]!.querySelectorAll("br")).toHaveLength(2);
    expect(paras[0]!.textContent).toContain("You can fantasise throughout the day");
    expect(paras[0]!.textContent!.trim().endsWith("lose that arousal the")).toBe(true);
  });

  it("gives a locked and an unlocked reader the same teaser", () => {
    expect(AB_LOCKED.teaser).toEqual(AB_OPEN.teaser);
    expect(AB_LOCKED.teaser).toBeDefined();
  });

  it("carries 235:234's geometry as custom properties", () => {
    const { container } = render(<V4LearnMore article={AB_OPEN} />);
    const card = container.querySelector<HTMLElement>(".rv4-learn")!;
    const teaser = container.querySelector<HTMLElement>(".rv4-learn__teaser")!;
    expect(teaser.style.getPropertyValue("--rv4-teaser-h")).toBe("247px");
    expect(card.style.getPropertyValue("--rv4-pill-bottom")).toBe("41.5px");
    expect(card.style.getPropertyValue("--rv4-closed-pb")).toBe("13.5px");
  });

  it("leaves Typical Beliefs' closed card exactly as it was", () => {
    const { container } = render(<V4LearnMore article={ARTICLE} />);
    expect(container.querySelector(".rv4-learn")!.hasAttribute("style")).toBe(false);
    expect(container.querySelectorAll(".rv4-learn__teaser .rv4-prose__p").length).toBeGreaterThan(
      0
    );
  });

  it("reads the new custom properties with the old values as fallbacks", () => {
    expect(V3_CSS).toContain("bottom: var(--rv4-pill-bottom, 18.5px)");
    expect(V3_CSS).toContain("padding-bottom: var(--rv4-closed-pb, 20.5px)");
  });
});

// Mark, 2026-09-24 (1940252445 on 348:213): "We swapped the CTA. New CTA here." The
// gated article's "Show More" link (230:238, gone from the file) became 663:1359, the
// "UNLOCK THE FULL ARTICLE" pill: 163x32, white, a 1.5px gradient outline, 10px bold
// caps in the same gradient.
describe("V4LearnMore — the gated article's CTA (663:1359)", () => {
  it("names it as the frame does", () => {
    render(<V4LearnMore article={ARTICLE} locked defaultOpen />);
    expect(screen.getByRole("button", { name: "Unlock the full article" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Show More" })).toBeNull();
  });

  it("draws the pill", () => {
    const at = V3_CSS.lastIndexOf(".rv3 .rv4-learn__showmore {");
    const css = V3_CSS.slice(at, V3_CSS.indexOf("}", at));
    expect(css).toMatch(/width:\s*163px/);
    expect(css).toMatch(/height:\s*32px/);
    expect(css).toMatch(/border:\s*1\.5px solid transparent/);
    expect(css).toMatch(/text-transform:\s*uppercase/);
    expect(css).toMatch(/#fb683e/i);
  });
});

/**
 * Fantasy vs. Reality's article on its own frames: 368:5450 closed, 244:258 open,
 * 482:6479 gated — a 90px band, a 606px window with the card 229.5px in and the pill
 * on its foot, no fade, and a window that runs on from the free copy mid-paragraph.
 */
describe("V4LearnMore — Fantasy vs. Reality's own gate (482:6479)", () => {
  const FVR = REPORT_V4_LEARN_MORE.typical_sexual_fantasy_amp_practice_tendencies!;
  const LOCKED_FVR = splitArticleForReader(FVR, true);
  const OPEN_FVR = splitArticleForReader(FVR, false);

  it("names its own frame in each state", () => {
    const { container, unmount } = render(<V4LearnMore article={OPEN_FVR} />);
    const card = container.querySelector<HTMLElement>(".rv4-learn")!;
    expect(card.getAttribute("data-node-id")).toBe("368:5450");
    fireEvent.click(card.querySelector(".rv4-learn__button")!);
    expect(card.getAttribute("data-node-id")).toBe("244:258");
    unmount();
    const locked = render(<V4LearnMore article={LOCKED_FVR} locked defaultOpen />).container;
    expect(locked.querySelector(".rv4-learn")!.getAttribute("data-node-id")).toBe("482:6479");
  });

  it("carries the gate's geometry on the card", () => {
    const { container } = render(<V4LearnMore article={LOCKED_FVR} locked defaultOpen />);
    const card = container.querySelector<HTMLElement>(".rv4-learn")!;
    expect(card).toHaveClass("has-own-gate");
    expect(card).toHaveClass("no-fade");
    expect(card.style.getPropertyValue("--rv4-learn-band")).toBe("90px");
    expect(card.style.getPropertyValue("--rv4-learn-window")).toBe("606px");
    expect(card.style.getPropertyValue("--rv4-learn-premium-top")).toBe("229.5px");
    expect(card.style.getPropertyValue("--rv4-learn-pill-bottom")).toBe("0px");
  });

  it("runs the window on from the free copy, the paragraph unbroken to the eye", () => {
    const { container } = render(<V4LearnMore article={LOCKED_FVR} locked defaultOpen />);
    const card = container.querySelector<HTMLElement>(".rv4-learn")!;
    expect(card).toHaveClass("is-continued");
    const free = card.querySelector(".rv4-learn__free")!;
    expect(free.lastElementChild!.textContent).toMatch(/skip everything before it\.$/);
    expect(card.querySelector(".rv4-learn__gated")!.textContent).toMatch(
      /^You do not have to negotiate\./
    );
  });

  it("leaves Typical Beliefs on the shared gate, with no marks of its own", () => {
    const { container } = render(<V4LearnMore article={ARTICLE} locked defaultOpen />);
    const card = container.querySelector<HTMLElement>(".rv4-learn")!;
    for (const cls of ["has-own-gate", "no-fade", "is-continued"]) {
      expect(card).not.toHaveClass(cls);
    }
    expect(card.querySelector(".rv4-learn__free")).toBeNull();
    expect(card.getAttribute("data-node-id")).toBe("153:2280");
  });

  it("reads the gate's values in CSS, and the mid-paragraph run-on", () => {
    expect(V3_CSS).toContain(
      ".rv3 .rv4-learn.has-own-gate .rv4-learn__gated {\n  max-height: var(--rv4-learn-window);\n  min-height: var(--rv4-learn-window);"
    );
    expect(V3_CSS).toContain(
      ".rv3 .rv4-learn.has-own-gate .rv4-learn__gate > .rv4-premium {\n  top: var(--rv4-learn-premium-top);"
    );
    expect(V3_CSS).toContain(
      ".rv3 .rv4-learn.has-own-gate .rv4-learn__showmore {\n  bottom: var(--rv4-learn-pill-bottom);"
    );
    expect(V3_CSS).toContain(
      ".rv3 .rv4-learn.has-own-gate.no-fade .rv4-learn__fade {\n  display: none;"
    );
    expect(V3_CSS).toContain(".rv3 .rv4-learn.is-continued .rv4-learn__gate {\n  padding-top: 0;");
    // 482:6479 sets the card and the pill 6px right of the gate's middle. As an
    // offset from the middle, so a wide column keeps them there: pinned to the 358
    // measure, they sat 109px left of the other articles' at 1280 (final review).
    expect(V3_CSS).toContain(
      ".rv3 .rv4-learn.has-own-gate .rv4-learn__gate > .rv4-premium,\n.rv3 .rv4-learn.has-own-gate .rv4-learn__showmore {\n  left: calc(50% + 6px);"
    );
    expect(V3_CSS).not.toContain("min(358px, 100% + 12px)");
  });
});

/**
 * Every article frame (153:2277, 235:254, 244:258) sets a heading's baseline 45.2
 * under the paragraph before it and 36.4 over the one after; the shared prose rules
 * came out 46.4 and 35.2, so each heading sat 1.2px low.
 */
describe("reportV3.css — article heading rhythm", () => {
  it("hands on from a list with the text's 8px list spacing (235:254, 244:258)", () => {
    expect(V3_CSS).toContain(".rv3 .rv4-learn .rv4-prose__list {\n  margin-bottom: 8px;");
  });

  it("sets the frames' gaps around an article heading", () => {
    expect(V3_CSS).toContain(".rv3 .rv4-learn .rv4-prose__h {\n  margin-bottom: 15.2px;");
    expect(V3_CSS).toContain(
      ".rv3 .rv4-learn .rv4-prose__p:has(+ .rv4-prose__h),\n.rv3 .rv4-learn .rv4-prose__list:has(+ .rv4-prose__h) {\n  margin-bottom: 24.79px;"
    );
  });
});
