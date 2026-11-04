// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, afterEach, vi } from "vitest";

import ChoiceCard from "@features/survey/ui/questions/ChoiceCard";

afterEach(cleanup);

describe("ChoiceCard", () => {
  it("renders the label and optional description", () => {
    render(
      <ChoiceCard
        label="Unsure / still figuring it out"
        description="your current relationship with sexuality feels mixed, unclear, or still in discovery, and no single option fully captures it"
        selected={false}
        onClick={vi.fn()}
      />
    );

    expect(screen.getByRole("radio")).toHaveTextContent("Unsure / still figuring it out");
    expect(
      screen.getByText(/your current relationship with sexuality feels mixed/i)
    ).toBeInTheDocument();
  });

  it("omits the description when none is provided", () => {
    render(<ChoiceCard label="Option only" selected={false} onClick={vi.fn()} />);
    expect(screen.getByRole("radio")).toHaveTextContent("Option only");
    expect(screen.queryByText(/your current relationship/i)).not.toBeInTheDocument();
  });

  it("uses checkbox semantics for multi-select cards", () => {
    render(<ChoiceCard label="Multiple" selected={true} onClick={vi.fn()} multi />);
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
  });

  it("selects in the rating scale's purple, never the call-to-action orange", () => {
    // Hana, 04.11: the cards take the 1–7 scale's #6b5b95. Orange stays for the Next
    // button and the progress bar.
    for (const multi of [false, true]) {
      for (const selected of [false, true]) {
        const { container, unmount } = render(
          <ChoiceCard label="Option" selected={selected} onClick={vi.fn()} multi={multi} />
        );
        expect(container.innerHTML).not.toMatch(/fe6839|254,\s*104,\s*57/i);
        if (selected) expect(container.innerHTML).toContain("bg-[#6b5b95]");
        unmount();
      }
    }
  });
});
