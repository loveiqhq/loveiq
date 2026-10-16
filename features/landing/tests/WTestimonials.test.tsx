// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import WTestimonials from "@features/landing/ui/white/WTestimonials";

afterEach(cleanup);

describe("WTestimonials (white social proof)", () => {
  it("renders the curated header (no Trustpilot dependency)", () => {
    render(<WTestimonials />);
    // Its "Field reports" eyebrow went with the 12.10 copy (Figma Report-3.0 1604:8233).
    expect(screen.queryByText("Field reports")).not.toBeInTheDocument();
    expect(screen.getByText("10,000+")).toBeInTheDocument();
    expect(screen.getByText("4.9/5 Rating")).toBeInTheDocument();
    expect(
      screen.getByText(/people have taken a first step to understand themselves\./i)
    ).toBeInTheDocument();
  });

  it("renders the curated reviewers, duplicated for the seamless marquee loop", () => {
    render(<WTestimonials />);
    for (const name of [
      "Dorian, 34",
      "Philipp Leonhard, 42",
      "Richard Petrich, 34",
      "Marija Mustapić, 41",
    ]) {
      // Each card is rendered twice (the marquee track repeats the set).
      expect(screen.getAllByText(name)).toHaveLength(2);
    }
  });
});
