// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PracticeTendenciesSection from "@/components/report/sections/PracticeTendenciesSection";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PracticeTendenciesSection", () => {
  it("renders the figma-style practice panel with the new structured intro and groups", () => {
    const { container } = render(
      <PracticeTendenciesSection
        archetype="Spark Seeker"
        archetypeHtml={null}
        generalHtml=""
        isPremium={false}
        sectionTitle="Typical Sexual Fantasy & Practice Tendencies"
      />
    );

    expect(
      screen.getByText(/Typical Sexual Fantasy & Practice Tendencies of the/i)
    ).toBeInTheDocument();
    expect(screen.getByText("Spark Seeker")).toBeInTheDocument();
    expect(
      screen.getByText(/probability-based estimates derived from aggregated research/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Core Relational & Embodied" })).toBeInTheDocument();
    expect(screen.getByText("Romantic lovemaking")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Technology & Distance" })).toBeInTheDocument();
    expect(container.querySelector(".report-practice-table")).toBeInTheDocument();
    expect(container.querySelector(".report-practice-panel__glow")).not.toBeInTheDocument();
    expect(screen.getAllByText("60%").length).toBeGreaterThan(0);
  });

  it("opens and closes explanation popovers from the row info affordance", async () => {
    const user = userEvent.setup();

    render(
      <PracticeTendenciesSection
        archetype="Spark Seeker"
        archetypeHtml={null}
        generalHtml=""
        isPremium={false}
        sectionTitle="Typical Sexual Fantasy & Practice Tendencies"
      />
    );

    const infoButton = screen.getAllByRole("button", {
      name: /What Romantic lovemaking tends to organize/i,
    })[0];

    await user.click(infoButton);
    await waitFor(() => {
      expect(screen.getByText(/chemistry, freedom, and playful connection/i)).toBeInTheDocument();
    });
    const row = infoButton.closest(".report-practice-table__row");
    const stack = infoButton.closest(".report-practice-table__practice-stack");

    expect(row?.querySelector(".report-practice-table__inline-popover")).toBeInTheDocument();
    expect(stack?.querySelector(".report-practice-table__popover")).not.toBeInTheDocument();

    await user.click(document.body);

    await waitFor(() => {
      expect(
        screen.queryByText(/chemistry, freedom, and playful connection/i)
      ).not.toBeInTheDocument();
    });

    await user.hover(infoButton);
    expect(screen.getByText(/chemistry, freedom, and playful connection/i)).toBeInTheDocument();

    await user.unhover(infoButton);

    await waitFor(() => {
      expect(
        screen.queryByText(/chemistry, freedom, and playful connection/i)
      ).not.toBeInTheDocument();
    });
  }, 15000);

  it("renders desktop explanations in a floating layer instead of inside the table row", async () => {
    const user = userEvent.setup();

    const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(min-width: 1025px)",
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    vi.stubGlobal("matchMedia", matchMediaMock);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: matchMediaMock,
      writable: true,
    });
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1440,
      writable: true,
    });

    const { container } = render(
      <PracticeTendenciesSection
        archetype="Spark Seeker"
        archetypeHtml={null}
        generalHtml=""
        isPremium={false}
        sectionTitle="Typical Sexual Fantasy & Practice Tendencies"
      />
    );

    const infoButton = screen.getAllByRole("button", {
      name: /What Romantic lovemaking tends to organize/i,
    })[0];
    const row = infoButton.closest(".report-practice-table__row");

    await user.click(infoButton);

    await waitFor(() => {
      expect(
        document.body.querySelector(".report-practice-table__popover--floating")
      ).toBeInTheDocument();
    });

    expect(row?.querySelector(".report-practice-table__popover")).not.toBeInTheDocument();
    expect(
      container.querySelector(".report-practice-table__popover--inline")
    ).not.toBeInTheDocument();

    await user.click(document.body);

    await waitFor(() => {
      expect(
        document.body.querySelector(".report-practice-table__popover--floating")
      ).not.toBeInTheDocument();
    });
  }, 15000);

  it("renders the premium overlay preview when the section is locked", () => {
    const { container } = render(
      <PracticeTendenciesSection
        archetype="Spark Seeker"
        archetypeHtml={null}
        generalHtml=""
        isPremium={true}
        sectionTitle="Typical Sexual Fantasy & Practice Tendencies"
      />
    );

    expect(container.querySelector(".report-themed-block__blurred")).toBeInTheDocument();
    expect(container.querySelector(".report-themed-block__preview--practice")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /unlock full report/i })).toBeInTheDocument();
  }, 15000);
});
