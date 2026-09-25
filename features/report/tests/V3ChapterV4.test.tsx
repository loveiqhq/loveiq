// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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
