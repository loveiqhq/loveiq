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
});
