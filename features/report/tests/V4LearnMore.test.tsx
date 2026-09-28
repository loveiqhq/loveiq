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
    // Mark's rehaul, 28.09 (1944397393; 230:284): "Reading Time:" in title case, the
    // value in capitals — the time label is marked, and the value is its own span.
    expect(container.querySelector(".rv4-learn__eyebrow-label")).toHaveClass("is-time");
    expect(container.querySelector(".rv4-learn__eyebrow-value")?.textContent).toBe("~15 min.");
    // 153:2273 — "Learn more & go deeper", "Learn more" in Bold; the book chip is gone.
    const label = container.querySelector(".rv4-learn__label")!;
    expect(label.textContent).toBe("Learn more & go deeper");
    expect(label.querySelector("strong.rv4-learn__lead")?.textContent).toBe("Learn more");
    expect(container.querySelector(".rv4-learn__chip")).toBeNull();
    // 907:7664 — "Read All"; the accessible name keeps what it opens.
    const pill = screen.getByRole("button", { name: "Read all of the article" });
    expect(pill.textContent).toBe("Read all");
    expect(screen.getByRole("button", { name: /Learn more/ }).getAttribute("aria-expanded")).toBe(
      "false"
    );
    expect(container.querySelector(".rv4-learn")!.getAttribute("data-name")).toBe(
      "Learn more & go deeper"
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
    expect(screen.getByRole("button", { name: "Read all of the article" })).toBeTruthy();
  });

  it("opens from either the header button or the read link", () => {
    const { container } = render(<V4LearnMore article={ARTICLE} />);
    fireEvent.click(screen.getByRole("button", { name: "Read all of the article" }));
    expect(container.querySelector(".rv4-learn")?.className).toContain("is-open");
  });
});

describe("V4LearnMore — expanded, unlocked (153:2260)", () => {
  it("renders every block, free and paid, with no gate", () => {
    const { container } = render(<V4LearnMore article={ARTICLE} defaultOpen />);
    const blocks = container.querySelectorAll(".rv4-prose__p, .rv4-prose__h, .rv4-prose__list");
    expect(blocks).toHaveLength(ARTICLE.free.length + ARTICLE.gated!.length);
    expect(container.querySelector(".rv4-learn__gate")).toBeNull();
    expect(screen.queryByText("Show all")).toBeNull();
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
    expect(screen.getByRole("button", { name: "Show all of the article" })).toBeTruthy();
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
    fireEvent.click(screen.getByRole("button", { name: "Show all of the article" }));
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
    expect(open[0]!.textContent).toContain("Learn more & go deeper");
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

  it("ramps the blur in over the first 76px, then holds the veil", () => {
    // 411:5694 is a PROGRESSIVE layer blur (0 -> 5 over 76px); 170:231 holds 5. Three
    // backdrop layers whose sigmas add in quadrature to the veil — CSS 2.5px until
    // review 26.09, 5px since (v4Veil2609.test.ts).
    const layers = [1, 2, 3].map((n) => rule(`.rv3 .rv4-learn__blur > span:nth-child(${n}) {`));
    const factors = layers.map((css) =>
      parseFloat(css.match(/--rv4-blur:\s*calc\(var\(--rv4-veil, 5px\) \* ([\d.]+)\)/)![1]!)
    );
    expect(Math.sqrt(factors.reduce((sum, k) => sum + k * k, 0))).toBeCloseTo(1, 2);
    expect(layers[2]).toContain("--rv4-to: 76px");
    // Without backdrop-filter the copy falls back to the uniform blur.
    expect(V3_CSS).toMatch(
      /@supports not \(\(backdrop-filter[\s\S]*?filter: blur\(var\(--rv4-veil, 5px\)\)/
    );
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

  // The rehaul (907:7664 and every article's instance): a 196px teaser, and "Read All"
  // in a 126x32 pill at 292 of the 343 card, whatever the teaser's box.
  it("clamps the closed teaser to 196px and sets the 126x32 'Read All' pill at 292", () => {
    expect(rule(".rv3 .rv4-learn__teaser {")).toContain("max-height: 196px");
    const pill = rule(".rv3 .rv4-learn__open {");
    expect(pill).toContain("width: 126px");
    expect(pill).toContain("height: 32px");
    expect(pill).toContain("border: 1.5px solid #561dbd");
    expect(pill).toContain("text-transform: capitalize");
    // 292 of the card is 210.5 into the body, which starts at 81.5.
    expect(pill).toContain("top: 210.5px");
    expect(rule(".rv3 .rv4-learn:not(.is-open) .rv4-learn__body {")).toContain(
      "min-height: 242.5px"
    );
    expect(rule(".rv3 .rv4-learn:not(.is-open) {")).toContain("padding-bottom: 18px");
  });

  it("draws the rehaul's lighter card, the eyebrow 18.5 from its edge", () => {
    const css = rule(".rv3 .rv4-learn {");
    expect(css).toContain("rgba(157, 138, 215, 0.07) 0%");
    expect(css).toContain("rgba(157, 138, 215, 0) 100%");
    expect(css).toContain("padding: 17.5px 22.5px 20.5px");
  });

  it("sets the rehaul's eyebrow and title type, the title centred on the disc", () => {
    const eyebrow = rule(".rv3 .rv4-learn__eyebrow {");
    expect(eyebrow).toContain("font-size: 12px");
    expect(eyebrow).toContain("height: 12px");
    expect(eyebrow).toContain("text-transform: none");
    expect(rule(".rv3 .rv4-learn__eyebrow-label.is-time {")).toContain(
      "text-transform: capitalize"
    );
    const value = rule(".rv3 .rv4-learn__eyebrow-value {");
    expect(value).toContain("font-weight: 700");
    expect(value).toContain("text-transform: uppercase");
    expect(rule(".rv3 .rv4-learn__label {")).toContain("font-weight: 400");
    expect(rule(".rv3 .rv4-learn__lead {")).toContain("font-weight: 700");
    expect(rule(".rv3 .rv4-learn__button {")).toContain("align-items: center");
    expect(V3_CSS).not.toContain(".rv3 .rv4-learn__chip");
  });

  it("keeps the append-only promise — nothing new above line 1884", () => {
    const untouched = V3_CSS.split("\n").slice(0, 1884).join("\n");
    expect(untouched).not.toContain("rv4-learn");
    expect(untouched).not.toContain("rv4-premium");
    expect(untouched).not.toContain("rv4-prose");
  });
});

/**
 * Accelerator & Brakes' closed card, 235:234 — the same 343px card as the others
 * since the rehaul, but its teaser is the frame's own copy (240:239 breaks after
 * "A low sex drive." and "becomes possible.", where the article runs on) in a 202px
 * box, against the others' 196. The pill sits at 292 either way.
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
    expect(teaser.style.getPropertyValue("--rv4-teaser-h")).toBe("202px");
    expect(card.hasAttribute("style")).toBe(false);
  });

  it("leaves Typical Beliefs' closed card exactly as it was", () => {
    const { container } = render(<V4LearnMore article={ARTICLE} />);
    expect(container.querySelector(".rv4-learn")!.hasAttribute("style")).toBe(false);
    expect(container.querySelectorAll(".rv4-learn__teaser .rv4-prose__p").length).toBeGreaterThan(
      0
    );
  });

  it("no longer moves the pill or the card's foot per article", () => {
    expect(V3_CSS).not.toContain("--rv4-pill-bottom");
    expect(V3_CSS).not.toContain("--rv4-closed-pb");
    expect(V3_CSS).toContain("max-height: var(--rv4-teaser-h, 196px)");
  });
});

// Mark's rehaul, 28.09 (1944397393): the gated article's "UNLOCK THE FULL ARTICLE"
// pill (663:1359) became 931:8110, "Show All" — 86x31, white, the same 1.5px gradient
// outline and 10px bold label in the gradient, title case, its foot half a pixel under
// the window's (153:2280: 4360 against 4359.5).
describe("V4LearnMore — the gated article's CTA (931:8110)", () => {
  it("names it as the frame does, and keeps what it opens in its name", () => {
    render(<V4LearnMore article={ARTICLE} locked defaultOpen />);
    const pill = screen.getByRole("button", { name: "Show all of the article" });
    expect(pill.textContent).toBe("Show all");
    expect(screen.queryByRole("button", { name: "Show More" })).toBeNull();
  });

  it("draws the pill", () => {
    const at = V3_CSS.lastIndexOf(".rv3 .rv4-learn__showmore {");
    const css = V3_CSS.slice(at, V3_CSS.indexOf("}", at));
    expect(css).toMatch(/width:\s*86px/);
    expect(css).toMatch(/height:\s*31px/);
    expect(css).toMatch(/border:\s*1\.5px solid transparent/);
    expect(css).toMatch(/text-transform:\s*capitalize/);
    expect(css).toMatch(/bottom:\s*-0\.5px/);
    expect(css).toMatch(/#fb683e/i);
  });

  it("keeps 24 from the pill to the card's edge, as 153:2280 does", () => {
    expect(V3_CSS).toContain(
      ".rv3 .rv4-learn.is-open:has(.rv4-learn__gate) {\n  padding-bottom: calc(var(--rv4-learn-foot, 24.5px) - 1px);"
    );
  });
});

/**
 * Fantasy vs. Reality's article on its own frames: 368:5450 closed, 244:258 open,
 * 482:6479 gated. Since the rehaul (28.09) the gate is a 112px band in a 625px window
 * with the card 161.5px in, a fade at its foot, the "Show All" pill 4.3px under the
 * window and the card's edge 45.5 under it; the window still runs on from the free
 * copy mid-paragraph.
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
    expect(card).not.toHaveClass("no-fade");
    expect(card.style.getPropertyValue("--rv4-learn-band")).toBe("112px");
    expect(card.style.getPropertyValue("--rv4-learn-window")).toBe("625px");
    expect(card.style.getPropertyValue("--rv4-learn-premium-top")).toBe("161.5px");
    expect(card.style.getPropertyValue("--rv4-learn-pill-bottom")).toBe("-35.3px");
    expect(card.style.getPropertyValue("--rv4-learn-foot")).toBe("45.5px");
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
    // 482:6479 sets the card 6px and the pill 9.5px right of the gate's middle. As an
    // offset from the middle, so a wide column keeps them there: pinned to the 358
    // measure, they sat 109px left of the other articles' at 1280 (final review).
    expect(V3_CSS).toContain(
      ".rv3 .rv4-learn.has-own-gate .rv4-learn__gate > .rv4-premium {\n  left: calc(50% + 6px);"
    );
    expect(V3_CSS).toContain(
      ".rv3 .rv4-learn.has-own-gate .rv4-learn__showmore {\n  left: calc(50% + 9.5px);"
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
