// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PracticeTendenciesSection from "@/components/report/sections/PracticeTendenciesSection";
import { reportSections } from "@/data/report-general";

const practiceGeneralHtml =
  reportSections.find((section) => section.sectionNumber === 27)?.generalContent ?? "";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PracticeTendenciesSection", () => {
  it("renders the shared practice intro from the report section", () => {
    const { container } = render(
      <PracticeTendenciesSection
        archetype="Spark Seeker"
        archetypeHtml={null}
        generalHtml={practiceGeneralHtml}
        isPremium={false}
        sectionTitle="Typical Sexual Fantasy & Practice Tendencies"
      />
    );

    const intro = container.querySelector(".report-practice-panel__intro");

    expect(intro?.textContent).toContain("These scores do not define you as an individual");
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
        generalHtml={practiceGeneralHtml}
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
        generalHtml={practiceGeneralHtml}
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

  it("scales the metric fill gradient intensity with the score", () => {
    const { container } = render(
      <PracticeTendenciesSection
        archetype="Spark Seeker"
        archetypeHtml={null}
        generalHtml={practiceGeneralHtml}
        isPremium={false}
        sectionTitle="Typical Sexual Fantasy & Practice Tendencies"
      />
    );

    const rows = Array.from(container.querySelectorAll(".report-practice-table__row"));
    const highRow =
      rows.find((row) => row.textContent?.includes("Double-penetration fantasy")) ?? null;
    const lowRow = rows.find((row) => row.textContent?.includes("Penetrating partner")) ?? null;

    const highFill = highRow?.querySelector(
      ".report-practice-table__metric--fantasy .report-practice-table__metric-bar span"
    ) as HTMLElement | null;
    const lowFill = lowRow?.querySelector(
      ".report-practice-table__metric--fantasy .report-practice-table__metric-bar span"
    ) as HTMLElement | null;

    expect(
      container.querySelectorAll(".report-practice-table__metric-bar span").length
    ).toBeGreaterThan(0);
    expect(highFill?.style.getPropertyValue("--practice-fill-w")).toBe("100%");
    expect(lowFill?.style.getPropertyValue("--practice-fill-w")).toBe("20%");
    expect(highFill?.style.getPropertyValue("--practice-fill-opacity-end")).toBe("0.940");
    expect(lowFill?.style.getPropertyValue("--practice-fill-opacity-end")).toBe("0.556");
    expect(highFill?.style.getPropertyValue("--practice-fill-shadow-opacity")).toBe("0.320");
    expect(lowFill?.style.getPropertyValue("--practice-fill-shadow-opacity")).toBe("0.128");
  });

  it("renders the premium overlay preview when the section is locked", () => {
    const { container } = render(
      <PracticeTendenciesSection
        archetype="Spark Seeker"
        archetypeHtml={null}
        generalHtml={practiceGeneralHtml}
        isPremium={true}
        sectionTitle="Typical Sexual Fantasy & Practice Tendencies"
      />
    );

    expect(container.querySelector(".report-practice-panel__intro")).toBeInTheDocument();
    // One locked group per practice group
    const lockedGroups = container.querySelectorAll(".report-practice-group--locked");
    expect(lockedGroups.length).toBeGreaterThanOrEqual(1);
    // Locked section container present
    expect(container.querySelector(".report-practice-table__locked-section")).toBeInTheDocument();
    // Locked rows rendered (metric cells blurred via CSS class)
    expect(
      container.querySelectorAll(".report-practice-table__row--locked").length
    ).toBeGreaterThan(0);
    // Grid cover over metrics columns present
    expect(container.querySelector(".report-practice-table__locked-cover")).toBeInTheDocument();
    // One unlock button per practice group
    const unlockButtons = screen.getAllByRole("button", { name: /unlock report/i });
    expect(unlockButtons.length).toBeGreaterThanOrEqual(1);
  }, 15000);

  it("uses the compact locked modifier only for the shorter locked groups", () => {
    const { container } = render(
      <PracticeTendenciesSection
        archetype="Spark Seeker"
        archetypeHtml={null}
        generalHtml={practiceGeneralHtml}
        isPremium={true}
        sectionTitle="Typical Sexual Fantasy & Practice Tendencies"
      />
    );

    const lockedGroups = Array.from(
      container.querySelectorAll<HTMLElement>(".report-practice-group--locked")
    );
    const compactGroups = lockedGroups.filter((group) =>
      group.querySelector(".report-practice-table__locked-cover__metrics--compact")
    );

    expect(compactGroups).toHaveLength(3);
    expect(
      compactGroups.some((group) => group.textContent?.includes("Penetration & Body Opening"))
    ).toBe(true);
    expect(
      compactGroups.some((group) => group.textContent?.includes("Technology & Distance"))
    ).toBe(true);
    expect(
      compactGroups.some((group) => group.textContent?.includes("Ritual, Tantra & Conscious Sex"))
    ).toBe(true);
    expect(compactGroups.some((group) => group.textContent?.includes("Sensation & Touch"))).toBe(
      false
    );
  });
});
