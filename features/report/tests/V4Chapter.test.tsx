// @vitest-environment jsdom
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
