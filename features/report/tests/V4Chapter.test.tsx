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

  it("sets the title, then 'of the <archetype>' on a line of its own, no dash, no eyebrow", () => {
    const { container } = render(<V4Chapter title="Typical Beliefs" archetype="Spark Seeker" />);
    const title = container.querySelector(".rv4-chapter__title")!;
    expect(title.textContent).toBe("Typical Beliefs of the Spark Seeker");
    expect(container.querySelector(".rv4-chapter__name")!.textContent).toBe("Typical Beliefs");
    expect(container.querySelector(".rv4-chapter__of")!.textContent).toBe("of the Spark Seeker");
    expect(container.querySelector(".rv4-chapter__archetype")!.textContent).toBe("Spark Seeker");
    expect(title.textContent).not.toContain("-");
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
 * The head as Mark redrew it on 25.09 (1:862, 1942042395: "I changed how the 'of the
 * Spark Seeker' sits after a line break and I took the Dash out"): the title on its
 * line, "of the <Archetype>" on the next — always, whatever the width — at Lora
 * 14/22.4 with the name in the archetype ink. Each line is its own block, so each
 * sits its own height under the last, as Figma stacks them (28.8 + 22.4 = 51.2 in the
 * frame's 52 box). Fatih, 25.09: the same head for the four open chapters.
 */
describe("V4Chapter — the head as 1:862 sets it", () => {
  it("puts the suffix on its own line, with no <br> and no word boxes", () => {
    const { container } = render(
      <V4Chapter title="Accelerators & Brakes" archetype="Spark Seeker" />
    );
    expect(container.querySelector(".rv4-chapter__title br")).toBeNull();
    expect(container.querySelector(".rv4-chapter__word")).toBeNull();
    expect(container.querySelector(".rv4-chapter__name")!.textContent).toBe(
      "Accelerators & Brakes"
    );
  });

  it("sets each line as its own block: 24/28.8, then 14/22.4", () => {
    const css = readFileSync(join(__dirname, "..", "ui", "v3", "reportV3.css"), "utf8");
    const block = (selector: string) => {
      const at = css.lastIndexOf(selector);
      expect(at, `${selector} missing`).toBeGreaterThan(-1);
      return css.slice(at, css.indexOf("}", at));
    };
    const name = block(".rv3 .rv4-chapter__title.has-suffix .rv4-chapter__name {");
    expect(name).toContain("display: block;");
    expect(name).toContain("line-height: 28.8px;");
    const of = block(".rv3 .rv4-chapter__title.has-suffix .rv4-chapter__of {");
    expect(of).toContain("display: block;");
    expect(of).toContain("font-size: 14px;");
    expect(of).toContain("line-height: 22.4px;");
    expect(of).toContain("color: var(--rv3-ink);");
    expect(css).not.toContain(".rv4-chapter__word");
  });

  it("drops the per-chapter break list: every suffix stacks", async () => {
    const page = await import("@/data/report3-archetype-page");
    expect("REPORT_V4_SUFFIX_BREAK_IDS" in page).toBe(false);
  });

  // The 19.09 frames tracked a plain title -0.47; every title in the file is now -0.24,
  // plain (Reading Recommendations 1:1164, Other Archetypes 1:1175) or suffixed (1:865).
  it("tracks every title -0.24, plain or suffixed", () => {
    const css = readFileSync(join(__dirname, "..", "ui", "v3", "reportV3.css"), "utf8");
    const at = css.indexOf(".rv3 .rv4-chapter__title {");
    expect(css.slice(at, css.indexOf("}", at))).toContain("letter-spacing: -0.24px;");
    expect(css).not.toContain(".rv3 .rv4-chapter__title.has-suffix {");
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
