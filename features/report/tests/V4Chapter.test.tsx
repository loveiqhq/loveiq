// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import V4Chapter from "@features/report/ui/v3/V4Chapter";

/**
 * The V4 chapter row — Figma 1:175 / 1:862, and Typical Beliefs' 304:257, which
 * the live report now draws through it instead of V3's numbered chapter.
 */

afterEach(cleanup);

describe("V4Chapter", () => {
  it("carries the section anchor the nav, scroll-spy and pop-up look up", () => {
    const { container } = render(
      <V4Chapter
        title="Typical Beliefs"
        archetype="Spark Seeker"
        sectionId="typical_beliefs"
        defaultOpen
      >
        <p>body</p>
      </V4Chapter>
    );
    const section = container.querySelector("section")!;
    expect(section.id).toBe("typical_beliefs");
    expect(section.getAttribute("data-report-section")).toBe("true");
  });

  it("sets the title with its '- of the <archetype>' suffix, and no eyebrow", () => {
    const { container } = render(<V4Chapter title="Typical Beliefs" archetype="Spark Seeker" />);
    expect(container.querySelector(".rv4-chapter__title")!.textContent).toBe(
      "Typical Beliefs - of the Spark Seeker"
    );
    expect(container.querySelector(".rv4-chapter__archetype")!.textContent).toBe("Spark Seeker");
    expect(container.textContent).not.toMatch(/Chapter \d/);
  });

  it("renders the feedback row last in the open body, in the .rv4-rating wrapper", () => {
    const { container } = render(
      <V4Chapter title="T" defaultOpen feedback={<span data-testid="fb">rate</span>}>
        <p>body</p>
      </V4Chapter>
    );
    const body = container.querySelector(".rv4-chapter__body")!;
    expect(body.lastElementChild!.className).toBe("rv4-rating");
    expect(body.querySelector(".rv4-rating__live [data-testid='fb']")).not.toBeNull();
  });

  it("keeps a bare chapter's children mounted while collapsed, only hidden", () => {
    const { container } = render(
      <V4Chapter title="T" defaultOpen bare>
        <p data-testid="kept">body</p>
      </V4Chapter>
    );
    fireEvent.click(screen.getByRole("button"));
    const body = container.querySelector(".rv4-chapter__body")!;
    expect(body.hasAttribute("hidden")).toBe(true);
    expect(body.classList.contains("is-bare")).toBe(true);
    expect(screen.getByTestId("kept")).toBeInTheDocument();
  });

  it("still unmounts an ordinary chapter's copy and shows its teaser when closed", () => {
    render(
      <V4Chapter title="T" teaser="[Teaser Text]" defaultOpen>
        <p data-testid="gone">body</p>
      </V4Chapter>
    );
    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryByTestId("gone")).toBeNull();
    expect(screen.getByText("[Teaser Text]")).toBeInTheDocument();
  });

  it("flags open and closed for the disc styles and the button's state", () => {
    const { container } = render(<V4Chapter title="T" defaultOpen />);
    const section = container.querySelector("section")!;
    const button = screen.getByRole("button");
    expect(section.classList.contains("is-open")).toBe(true);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(button);
    expect(section.classList.contains("is-open")).toBe(false);
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("draws the Figma chevron: the 15px path at stroke 3", () => {
    const { container } = render(<V4Chapter title="T" />);
    const path = container.querySelector(".rv4-chapter__chev path")!;
    expect(path.getAttribute("d")).toBe("M3.28125 5.625L7.5 9.84375L11.7188 5.625");
    expect(path.getAttribute("stroke-width")).toBe("3");
  });
});

/**
 * A suffixed title as the frame sets it (310:224 / 1:865 / 304:259).
 *
 * The space before "- of the" belongs to the 24px run ("Accelerator & Brakes "), so
 * the suffix starts a 24px space after the title, not a 14px one (3px further right).
 *
 * And a wrapped title spaces its lines as Figma does: each line sits its OWN height
 * below the one above, so a line of suffix alone ("Spark Seeker") has its baseline
 * 16.8 under the title's. CSS stacks whole line boxes instead, which left the 24px
 * run's leading above that line: "Spark Seeker" 2.34 low and the head 68.6 against
 * the frame's 55. Each suffix word is a 16.8 box with its top pulled in by exactly
 * that leading, and the title keeps no strut of its own.
 */
describe("V4Chapter — the suffixed title's runs (310:224)", () => {
  const renderAb = () =>
    render(<V4Chapter title="Accelerator & Brakes" archetype="Spark Seeker" />).container;

  it("keeps the space before the suffix in the 24px run", () => {
    const c = renderAb();
    expect(c.querySelector(".rv4-chapter__name")!.textContent).toBe("Accelerator & Brakes ");
    expect(c.querySelector(".rv4-chapter__of")!.textContent).toBe("- of the ");
    expect(c.querySelector(".rv4-chapter__title")!.textContent).toBe(
      "Accelerator & Brakes - of the Spark Seeker"
    );
  });

  it("boxes each suffix word on its own, so the suffix still wraps between words", () => {
    const words = [...renderAb().querySelectorAll(".rv4-chapter__word")].map((w) => w.textContent);
    expect(words).toEqual(["-", "of", "the", "Spark", "Seeker"]);
  });

  it("sets each line at its own height", () => {
    const css = readFileSync(join(__dirname, "..", "ui", "v3", "reportV3.css"), "utf8");
    const block = (selector: string) => {
      const at = css.indexOf(selector);
      expect(at, `${selector} missing`).toBeGreaterThan(-1);
      return css.slice(at, css.indexOf("}", at));
    };
    const title = block(".rv3 .rv4-chapter__button .rv4-chapter__title.has-suffix {");
    expect(title).toContain("line-height: 0;");
    // 23.184 + 16.8 + 3.276 = 43.26, which the frame rounds up to its 44 box.
    expect(title).toContain("padding-bottom: 0.74px;");
    expect(block(".rv3 .rv4-chapter__title.has-suffix .rv4-chapter__name {")).toContain(
      "line-height: 28.8px;"
    );
    expect(block(".rv3 .rv4-chapter__title.has-suffix .rv4-chapter__of,")).toContain(
      "line-height: 0;"
    );
    const word = block(".rv3 .rv4-chapter__word {");
    expect(word).toContain("display: inline-block;");
    expect(word).toContain("line-height: 16.8px;");
    expect(word).toContain("margin-top: -2.34px;");
  });
});

/**
 * Three heads put their suffix on a line of its own however short the name is —
 * Challenges in Partnerships (38:1675) and Curiosity & Relationship Form (38:1686)
 * with a U+2028 line separator, Initiation Style (1:1028) with a line feed. Left to
 * wrap, "Initiation Style - of the Spark Seeker" fits one 319px line.
 */
describe("V4 chapter heads — the suffix on its own line where the frame breaks it", () => {
  it("names exactly the three chapters Figma breaks", async () => {
    const { REPORT_V4_SUFFIX_BREAK_IDS } = await import("@/data/report3-archetype-page");
    expect([...REPORT_V4_SUFFIX_BREAK_IDS].sort()).toEqual([
      "challenges_in_partnership",
      "curiosity_level",
      "initiation_style",
    ]);
  });

  it("breaks before the suffix for those chapters, and only those", () => {
    const { container } = render(
      <>
        <V4Chapter
          title="Challenges in Partnerships"
          archetype="Spark Seeker"
          sectionId="challenges_in_partnership"
        />
        <V4Chapter title="Typical Beliefs" archetype="Spark Seeker" sectionId="typical_beliefs" />
      </>
    );
    const [cip, tb] = [...container.querySelectorAll(".rv4-chapter__title")];
    const br = cip!.querySelector("br")!;
    expect(br).not.toBeNull();
    expect(br.previousElementSibling).toHaveClass("rv4-chapter__name");
    expect(br.nextElementSibling).toHaveClass("rv4-chapter__of");
    expect(tb!.querySelector("br")).toBeNull();
  });
});

/** "Read full chapter" in Part II's nudges opens the chapter it names (v4OpenChapter). */
describe("V4Chapter — opened from a nudge", () => {
  it("opens when its section is asked for, and ignores other sections", async () => {
    const { act } = await import("@testing-library/react");
    const { openV4Chapter } = await import("@features/report/ui/v3/v4OpenChapter");
    const { container } = render(
      <V4Chapter title="Typical Beliefs" archetype="Spark Seeker" sectionId="typical_beliefs" bare>
        <p>body</p>
      </V4Chapter>
    );
    const button = container.querySelector(".rv4-chapter__button")!;
    expect(button.getAttribute("aria-expanded")).toBe("false");
    act(() => openV4Chapter("love_language"));
    expect(button.getAttribute("aria-expanded")).toBe("false");
    act(() => openV4Chapter("typical_beliefs"));
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });
});
