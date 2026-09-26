// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import V3Chapter, { V3ModeProvider, V4ModeProvider } from "@features/report/ui/v3/V3Chapter";
import type { ReportV3Chapter } from "@features/report/ui/v3/reportV3Nav";
import { REPORT_V4_CHAPTER_TEASERS } from "@/data/report4-chapter-teasers";

/**
 * Every chapter the live V4 report still draws through V3's accordion, set like
 * Typical Beliefs. Review 24.09:
 * - "The Core Insecurities and other chapters etc. are the wrong size → they should
 *   match the Typical Beliefs chapter" (and "the icons are not matching");
 * - "Lets take out the Icon + Chapter number and the line";
 * - "The 'Does this resonate' should only appear at the end when you opened the
 *   chapters";
 * - "Lets have a horizontal divider line between chapters when they are closed"
 *   (Mark's pin beside 1:873, "All collapsed chapters should look like this").
 */

const V3_CSS = readFileSync(join(process.cwd(), "features/report/ui/v3/reportV3.css"), "utf8");
const INSECURITIES: ReportV3Chapter = {
  id: "core_insecurities",
  number: "2.2",
  title: "Core Insecurities",
};

afterEach(cleanup);

const renderV4 = (chapter: ReportV3Chapter = INSECURITIES) =>
  render(
    <V3ModeProvider>
      <V4ModeProvider>
        <V3Chapter
          chapter={chapter}
          sectionId={chapter.id}
          archetype="Spark Seeker"
          feedbackWidget={<span className="fb">Does this resonate?</span>}
        >
          <p className="body">chapter body</p>
        </V3Chapter>
      </V4ModeProvider>
    </V3ModeProvider>
  );

describe("V3Chapter under ?v4=1", () => {
  it("drops the eyebrow: no book icon, no chapter number, no rule", () => {
    const { container } = renderV4();
    expect(container.querySelector(".rv3-chapter__eyebrow")).toBeNull();
    expect(container.querySelector(".rv3-chapter__icon")).toBeNull();
    expect(container.querySelector(".rv3-chapter__rule")).toBeNull();
    expect(container.textContent).not.toMatch(/Chapter \d/);
  });

  it("carries Typical Beliefs' head: the 24px title, its suffix and the 34px disc", () => {
    const { container } = renderV4();
    const section = container.querySelector("section")!;
    // `.rv4-chapter` is what gives it V4Chapter's type and discs; `.rv3-chapter` is
    // what keeps the V2 body inside it styled.
    expect(section.className).toContain("rv3-chapter");
    expect(section.className).toContain("rv4-chapter");
    expect(section.id).toBe("core_insecurities");
    const title = container.querySelector(".rv4-chapter__button .rv4-chapter__title.has-suffix")!;
    expect(title.textContent).toBe("Core Insecurities of the Spark Seeker");
    expect(container.querySelector(".rv4-chapter__archetype")!.textContent).toBe("Spark Seeker");
    expect(container.querySelector(".rv4-chapter__button .rv4-chapter__chev svg")).not.toBeNull();
    expect(container.querySelector(".rv3-chapter__title, .rv3-chapter__chev")).toBeNull();
  });

  it("draws Reading Recommendations and Other Archetypes without the suffix, as the frames do", () => {
    for (const chapter of [
      { id: "recommendations", number: "5.3", title: "Reading Recommendations" },
      { id: "constellation", number: "5.4", title: "Other Archetypes" },
    ]) {
      const { container, unmount } = renderV4(chapter);
      const title = container.querySelector(".rv4-chapter__title")!;
      expect(title.textContent).toBe(chapter.title);
      expect(title.className).not.toContain("has-suffix");
      unmount();
    }
  });

  it("starts closed, with its body — feedback included — out of reach until opened", () => {
    const { container } = renderV4();
    const section = container.querySelector("section")!;
    const button = container.querySelector<HTMLButtonElement>(".rv4-chapter__button")!;
    const body = container.querySelector(".rv3-chapter__body")!;

    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(section.className).not.toContain("is-open");
    // Still mounted, so Go deeper cards keep their state and the paywall observers
    // their targets, but inert: nothing hidden in it can take focus.
    expect(body.hasAttribute("inert")).toBe(true);
    expect(body.querySelector(".body")).not.toBeNull();

    fireEvent.click(button);

    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(section.className).toContain("is-open");
    expect(body.hasAttribute("inert")).toBe(false);
  });

  it("sets the feedback in the same rating row, and 44px tail, as Typical Beliefs", () => {
    const { container } = renderV4();
    const rating = container.querySelector(".rv3-chapter__body-inner > .rv4-rating")!;
    expect(rating.querySelector(".rv4-rating__live .fb")).not.toBeNull();
    expect(rating.querySelector(".rv4-rating__tail")).not.toBeNull();
    // It is the body's LAST row, so it only ever shows at the end of an open chapter.
    expect(rating.parentElement!.lastElementChild).toBe(rating);
    expect(container.querySelector(".rv3-chapter__feedback")).toBeNull();
  });
});

describe("V3Chapter under ?v3=1", () => {
  it("is exactly V3's numbered chapter, open, with its eyebrow and feedback row", () => {
    const { container } = render(
      <V3ModeProvider>
        <V3Chapter
          chapter={INSECURITIES}
          sectionId="core_insecurities"
          archetype="Spark Seeker"
          feedbackWidget={<span className="fb">Does this resonate?</span>}
        >
          <p>chapter body</p>
        </V3Chapter>
      </V3ModeProvider>
    );
    expect(container.querySelector(".rv3-chapter__number")!.textContent).toBe("Chapter 2.2");
    expect(container.querySelector(".rv3-chapter__title")!.textContent).toBe("Core Insecurities");
    expect(container.querySelector(".rv3-chapter__button")!.getAttribute("aria-expanded")).toBe(
      "true"
    );
    expect(container.querySelector(".rv3-chapter__feedback .fb")).not.toBeNull();
    expect(container.querySelector(".rv4-chapter, .rv4-chapter__title")).toBeNull();
  });
});

describe("the V4 chapter rhythm (reportV3.css)", () => {
  const after1884 = (needle: string) => {
    const at = V3_CSS.indexOf(needle);
    expect(at, `missing: ${needle}`).toBeGreaterThan(-1);
    // The file is append-only above line 1884.
    expect(V3_CSS.slice(0, at).split("\n").length).toBeGreaterThan(1884);
    return V3_CSS.slice(at, V3_CSS.indexOf("}", at));
  };

  it("drops the 22px that only made room for the eyebrow", () => {
    expect(after1884(".rv3.rv4 .rv3-chapter.rv4-chapter {")).toMatch(/padding-top:\s*0/);
  });

  it("closes every collapsed chapter on 634:230's fading hairline, then the 44px gap", () => {
    const line = after1884(".rv3.rv4 .rv4-chapter:not(.is-open):not(.is-static)::after {");
    expect(line).toMatch(
      /background:\s*linear-gradient\(90deg,\s*rgba\(22, 16, 33, 0\.1\),\s*rgba\(22, 16, 33, 0\)\)/
    );
    expect(line).toMatch(/height:\s*1px/);
    expect(line).toMatch(/margin-top:\s*20px/);
    expect(after1884(".rv3.rv4 .rv4-chapter:not(.is-open):not(.is-static) {")).toMatch(
      /margin-bottom:\s*44px/
    );
  });

  it("sets the teaser as 1:870 does: Plus Jakarta 14/22.4 in the copy ink, 20 above and below", () => {
    const teaser = after1884(".rv3 .rv4-chapter__teaser {");
    expect(teaser).toMatch(/font-family:\s*var\(--font-sans\)/);
    expect(teaser).toMatch(/font-size:\s*14px/);
    expect(teaser).toMatch(/line-height:\s*22\.4px/);
    expect(teaser).toMatch(/color:\s*var\(--rv3-copy\)/);
    expect(after1884(".rv3.rv4 .rv4-chapter__tease .rv4-chapter__teaser {")).toMatch(
      /padding:\s*20px 0/
    );
    // The teaser's own 20 ends where the hairline sits — no second 20.
    expect(after1884(".rv3.rv4 .rv4-chapter.has-teaser:not(.is-open)::after {")).toMatch(
      /margin-top:\s*0/
    );
  });

  it("folds the teaser away on the body's own 320ms as the chapter opens", () => {
    expect(after1884(".rv3.rv4 .rv4-chapter__tease {")).toMatch(
      /transition:\s*grid-template-rows 320ms ease/
    );
    expect(after1884(".rv3.rv4 .rv4-chapter.is-open > .rv4-chapter__tease {")).toMatch(
      /grid-template-rows:\s*0fr/
    );
  });

  it("gives the open chapter's rating row the 16px Typical Beliefs gives it", () => {
    expect(after1884(".rv3.rv4 .rv3-chapter__body-inner > .rv4-rating {")).toMatch(
      /padding-top:\s*16px/
    );
  });
});

describe("V3Chapter under V4 — every suffix on its own line", () => {
  it("never breaks with a <br>: the suffix is a block of its own for every chapter", () => {
    for (const id of ["curiosity_level", "initiation_style", "love_language"]) {
      const { container, unmount } = renderV4({ id, number: "4.4", title: id });
      expect(container.querySelector(".rv4-chapter__title br")).toBeNull();
      expect(container.querySelector(".rv4-chapter__of")!.textContent).toBe("of the Spark Seeker");
      unmount();
    }
  });
});

/**
 * The closed chapter's teaser — Mark, 25.09 (1942042395): "Teaser Texts for all closed
 * Chapters are in Figma now"; Sanjin's doc "Teaser_Text_Chapters". 1:862 sets it under
 * the head in a 20/20 block, then the fading hairline.
 */
describe("V3Chapter under V4 — the teaser while closed (1:862)", () => {
  it("shows the chapter's teaser under its head, outside the V2 body and the button", () => {
    const { container } = renderV4();
    expect(container.querySelector("section")).toHaveClass("has-teaser");
    const teaser = container.querySelector(".rv4-chapter__tease .rv4-chapter__teaser")!;
    expect(teaser.textContent).toBe(REPORT_V4_CHAPTER_TEASERS.core_insecurities);
    // Not inside any `[class$="__body"]`: the frozen catch-all would set it 17/28.
    expect(teaser.closest(".rv3-chapter__body, [class$='__body']")).toBeNull();
    // Not inside the button, so it is not part of the heading's accessible name.
    expect(teaser.closest("button")).toBeNull();
  });

  it("lets the teaser go as the chapter opens, out of reach for assistive tech", () => {
    const { container } = renderV4();
    const tease = container.querySelector(".rv4-chapter__tease")!;
    expect(tease.getAttribute("aria-hidden")).not.toBe("true");
    fireEvent.click(container.querySelector(".rv4-chapter__button")!);
    expect(tease.getAttribute("aria-hidden")).toBe("true");
    expect(tease.hasAttribute("inert")).toBe(true);
  });

  it("draws no teaser where none is written (an open chapter's V2 fallback)", () => {
    const { container } = renderV4({
      id: "typical_beliefs",
      number: "2.1",
      title: "Typical Beliefs",
    });
    expect(container.querySelector(".rv4-chapter__teaser")).toBeNull();
    expect(container.querySelector("section")).not.toHaveClass("has-teaser");
  });

  it("shows Reward System's teaser now Sanjin has written it (1:1026, review 26.09)", () => {
    const { container } = renderV4({
      id: "biochemical_reward_system_dynamics",
      number: "3.3",
      title: "Reward System",
    });
    expect(container.querySelector(".rv4-chapter__teaser")!.textContent).toBe(
      REPORT_V4_CHAPTER_TEASERS.biochemical_reward_system_dynamics
    );
    expect(REPORT_V4_CHAPTER_TEASERS.biochemical_reward_system_dynamics).toMatch(
      /^Sexual desire is shaped not only by what feels good/
    );
  });
});

/**
 * Three V2 elements wait for `.report-section.is-visible` alone (report.css
 * 21135-21163) — Partnership's rows and Curiosity's fit dots and structure items —
 * and a V3 chapter never carries that class, so under V4 they sat at opacity 0 even
 * for a reader who had paid (measured on the preview: op=0, translateY 5px). They now
 * build in as their chapter opens, on their own transitions.
 */
describe("V2 rows inside a V4 chapter build in as it opens", () => {
  const rule = (selector: string) => {
    const at = V3_CSS.indexOf(`${selector} {`);
    if (at < 0) throw new Error(`no rule for ${selector}`);
    return V3_CSS.slice(at, V3_CSS.indexOf("}", at));
  };

  it("reveals Partnership's rows and Curiosity's structure items", () => {
    const reveal = rule(
      ".rv3.rv4 .rv3-chapter.is-open .report-partnership__row,\n.rv3.rv4 .rv3-chapter.is-open .report-curiosity__struct-item"
    );
    expect(reveal).toContain("opacity: 1");
    expect(reveal).toContain("transform: translateY(0)");
  });

  it("pops Curiosity's fit dots to full size", () => {
    const reveal = rule(".rv3.rv4 .rv3-chapter.is-open .report-curiosity__fit-dot");
    expect(reveal).toContain("opacity: 1");
    expect(reveal).toContain("transform: scale(1)");
  });

  it("is appended below the frozen top of reportV3.css", () => {
    const at = V3_CSS.indexOf(".rv3.rv4 .rv3-chapter.is-open .report-partnership__row");
    expect(at).toBeGreaterThan(0);
    expect(V3_CSS.slice(0, at).split("\n").length).toBeGreaterThan(1884);
  });
});

describe("V3Chapter — opened from a nudge", () => {
  it("opens under V4 when its section is asked for", async () => {
    const { act } = await import("@testing-library/react");
    const { openV4Chapter } = await import("@features/report/ui/v3/v4OpenChapter");
    const { container } = renderV4();
    const button = container.querySelector(".rv4-chapter__button")!;
    expect(button.getAttribute("aria-expanded")).toBe("false");
    act(() => openV4Chapter("core_insecurities"));
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });

  it("ignores it in ?v3=1, whose chapters start open and have no nudges", async () => {
    const { act } = await import("@testing-library/react");
    const { openV4Chapter } = await import("@features/report/ui/v3/v4OpenChapter");
    const { container } = render(
      <V3ModeProvider>
        <V3Chapter chapter={INSECURITIES} sectionId="core_insecurities">
          <p>body</p>
        </V3Chapter>
      </V3ModeProvider>
    );
    const button = container.querySelector(".rv3-chapter__button")!;
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    act(() => openV4Chapter("core_insecurities"));
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });
});
