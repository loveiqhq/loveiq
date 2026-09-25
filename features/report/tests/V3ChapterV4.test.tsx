// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import V3Chapter, { V3ModeProvider, V4ModeProvider } from "@features/report/ui/v3/V3Chapter";
import type { ReportV3Chapter } from "@features/report/ui/v3/reportV3Nav";

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
    expect(title.textContent).toBe("Core Insecurities - of the Spark Seeker");
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

  it("gives the open chapter's rating row the 16px Typical Beliefs gives it", () => {
    expect(after1884(".rv3.rv4 .rv3-chapter__body-inner > .rv4-rating {")).toMatch(
      /padding-top:\s*16px/
    );
  });
});

describe("V3Chapter under V4 — the suffix on its own line where the frame breaks it", () => {
  it("breaks Curiosity & Relationship Form and Initiation Style (38:1686, 1:1028), not the rest", () => {
    const heads = (["curiosity_level", "initiation_style", "love_language"] as const).map((id) => {
      const { container, unmount } = renderV4({ id, number: "4.4", title: id });
      const hasBreak = container.querySelector(".rv4-chapter__title br") !== null;
      unmount();
      return hasBreak;
    });
    expect(heads).toEqual([true, true, false]);
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

/**
 * Locked, not-yet-designed chapters — Mark: "when opening the remaining chapters,
 * they should all be blurred with the icon and the Unlock CTA" (Figma 1940141608,
 * 1939992442). Under V4 a V3 chapter the reader has not unlocked shows blurred filler
 * with the chapter-body Premium card instead of its V2 section.
 */
describe("V3Chapter under V4 — locked, not yet designed", () => {
  const renderLocked = async (
    lockedId: string,
    unlock = (_id: string) => {},
    chapter: ReportV3Chapter = INSECURITIES
  ) => {
    const { V4ChapterLockProvider } = await import("@features/report/ui/v3/V4ChapterLock");
    return render(
      <V3ModeProvider>
        <V4ModeProvider>
          <V4ChapterLockProvider value={{ isLocked: (id: string) => id === lockedId, unlock }}>
            <V3Chapter
              chapter={chapter}
              sectionId={chapter.id}
              archetype="Spark Seeker"
              feedbackWidget={<span className="fb">Does this resonate?</span>}
            >
              <p className="body">chapter body</p>
            </V3Chapter>
          </V4ChapterLockProvider>
        </V4ModeProvider>
      </V3ModeProvider>
    );
  };

  it("draws the blurred block and the Premium card instead of the section, with no feedback", async () => {
    const { container } = await renderLocked("core_insecurities");
    const block = container.querySelector(".rv4-lockch")!;
    expect(block).not.toBeNull();
    expect(container.querySelector(".body")).toBeNull();
    expect(container.querySelector(".fb")).toBeNull();
    const text = block.querySelector(".rv4-lockch__text")!;
    expect(text.getAttribute("aria-hidden")).toBe("true");
    expect(text.hasAttribute("inert")).toBe(true);
    // Filler, not copy — and no <p>, which the V3 body catch-all would restyle.
    expect(text.querySelectorAll("p")).toHaveLength(0);
    expect(text.querySelectorAll(".rv4-lockch__line").length).toBe(3);
    expect(block.querySelector(".rv4-premium")).toHaveClass("rv4-premium--guarantee");
  });

  it("opens the paywall once, for this chapter, from anywhere on it", async () => {
    const unlock = vi.fn();
    const { container } = await renderLocked("core_insecurities", unlock);
    fireEvent.click(container.querySelector(".rv4-lockch__text")!);
    expect(unlock).toHaveBeenCalledTimes(1);
    expect(unlock).toHaveBeenLastCalledWith("core_insecurities");
    fireEvent.click(container.querySelector(".rv4-lockch .rv4-premium button")!);
    expect(unlock).toHaveBeenCalledTimes(2);
  });

  it("leaves an unlocked chapter's section alone", async () => {
    const { container } = await renderLocked("confidence_level");
    expect(container.querySelector(".rv4-lockch")).toBeNull();
    expect(container.querySelector(".body")).not.toBeNull();
  });

  it("counts every chapter but the four Figma has designed — Reward System has no row at all", async () => {
    const { REPORT_V4_DESIGNED_CHAPTER_IDS } = await import("@/data/report3-archetype-page");
    expect([...REPORT_V4_DESIGNED_CHAPTER_IDS].sort()).toEqual([
      "challenges_in_partnership",
      "typical_arousal_accelerators_turn_ons_of_the_core_archetype",
      "typical_beliefs",
      "typical_sexual_fantasy_amp_practice_tendencies",
    ]);
  });

  it("appends its CSS below the frozen top of reportV3.css", () => {
    const at = V3_CSS.indexOf(".rv4-lockch");
    expect(at).toBeGreaterThan(0);
    expect(V3_CSS.slice(0, at).split("\n").length).toBeGreaterThan(1884);
  });
});
