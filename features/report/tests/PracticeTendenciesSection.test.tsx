// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PracticeTendenciesSection from "@features/report/ui/sections/PracticeTendenciesSection";
import { reportPracticeTendencies } from "@/data/report-practice-tendencies";
import type { ReportPracticeTendencyContentForUser } from "@features/report/ui/hooks/useReportData";

// Helpers that mirror the server-side filter in app/api/report/route.ts so
// section-level tests exercise the same shapes the real client receives.
function buildFullContent(archetype: string): ReportPracticeTendencyContentForUser {
  const raw = reportPracticeTendencies[archetype];
  if (!raw) throw new Error(`No practice content for archetype ${archetype}`);
  return {
    introBlocks: raw.introBlocks,
    groups: raw.groups.map((g) => ({
      title: g.title,
      rows: g.rows,
      totalRowCount: g.rows.length,
    })),
  };
}

function buildLockedContent(archetype: string): ReportPracticeTendencyContentForUser {
  const raw = reportPracticeTendencies[archetype];
  if (!raw) throw new Error(`No practice content for archetype ${archetype}`);
  return {
    introBlocks: raw.introBlocks,
    groups: raw.groups.map((g) => ({
      title: g.title,
      // Locked wire shape: all rows ship with names; metrics null past index 0.
      // See `lib/report/contentGating.ts#buildPracticeTendenciesForUser`.
      rows: g.rows.map((row, i) =>
        i === 0 ? { ...row } : { ...row, fantasyPull: null, actualPleasure: null }
      ),
      totalRowCount: g.rows.length,
    })),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PracticeTendenciesSection", () => {
  it("renders the first category table and no legacy prose intro", () => {
    const { container } = render(
      <PracticeTendenciesSection
        archetype="Spark Seeker"
        content={buildFullContent("Spark Seeker")}
        isPremium={false}
        sectionTitle="Typical Sexual Fantasy & Practice Tendencies"
      />
    );

    // The Report 2.0 Figma Article (8427:2466) has no prose block here — the
    // "Learn: what fantasies are for" accordion in FantasySection replaces it.
    expect(container.querySelector(".report-practice-panel__intro")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Core Relational & Embodied" })).toBeInTheDocument();
    expect(screen.getByText("Romantic lovemaking")).toBeInTheDocument();
    // Collapsed by default (Figma 8480:16003) — only the first category renders;
    // the rest sit behind the expand pill. Reachability is covered by the
    // "collapses to the first category" test below.
    expect(
      screen.queryByRole("heading", { name: "Technology & Distance" })
    ).not.toBeInTheDocument();
    expect(container.querySelector(".report-practice-table")).toBeInTheDocument();
    expect(container.querySelector(".report-practice-panel__glow")).not.toBeInTheDocument();
    expect(screen.getAllByText(/More likely|Neutral likely|Less likely/).length).toBeGreaterThan(0);
  });

  it("collapses to the first category behind a 'Show all N' pill, then expands", async () => {
    const user = userEvent.setup();
    const content = buildFullContent("Spark Seeker");
    const groupCount = content.groups.length;

    const { container } = render(
      <PracticeTendenciesSection
        archetype="Spark Seeker"
        content={content}
        isPremium={false}
        sectionTitle="Typical Sexual Fantasy & Practice Tendencies"
      />
    );

    const shown = () =>
      container.querySelectorAll(".report-practice-panel__groups .report-practice-group").length;

    // Collapsed: exactly one category, plus the next one clipped as a teaser.
    expect(shown()).toBe(1);
    expect(container.querySelector(".report-practice-panel__peek")).toBeInTheDocument();

    // The count is DERIVED, never the Figma mock's hardcoded "7".
    // Queries are container-scoped: this file has no auto-cleanup, so earlier
    // renders are still in document.body and `screen` would match across them.
    // The chevron is aria-hidden, so it is absent from the accessible name.
    const pill = within(container).getByRole("button", {
      name: new RegExp(`^Show all ${groupCount} categories$`),
    });
    expect(pill).toHaveAttribute("aria-expanded", "false");

    await user.click(pill);

    expect(shown()).toBe(groupCount);
    expect(container.querySelector(".report-practice-panel__peek")).not.toBeInTheDocument();
    expect(
      within(container).getByRole("heading", { name: "Technology & Distance" })
    ).toBeInTheDocument();

    // And it collapses back.
    await user.click(within(container).getByRole("button", { name: /Show fewer categories/ }));
    expect(shown()).toBe(1);
  });

  it("opens and closes explanation popovers from the row info affordance", async () => {
    const user = userEvent.setup();

    render(
      <PracticeTendenciesSection
        archetype="Spark Seeker"
        content={buildFullContent("Spark Seeker")}
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
  }, 60_000);

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
        content={buildFullContent("Spark Seeker")}
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
  }, 60_000);

  it("maps each score to its likelihood bucket (7–10 / 4–6 / 0–3)", async () => {
    const { container } = render(
      <PracticeTendenciesSection
        archetype="Spark Seeker"
        content={buildFullContent("Spark Seeker")}
        isPremium={false}
        sectionTitle="Typical Sexual Fantasy & Practice Tendencies"
      />
    );

    // Categories collapse to the first one by default, so expand before asserting
    // — the bucket invariant must hold for EVERY row, not just group 1's.
    await userEvent
      .setup()
      .click(within(container).getByRole("button", { name: /Show all \d+ categories/ }));

    const rows = Array.from(container.querySelectorAll(".report-practice-table__row"));
    const highRow =
      rows.find((row) => row.textContent?.includes("Double-penetration fantasy")) ?? null;
    const lowRow = rows.find((row) => row.textContent?.includes("Penetrating partner")) ?? null;

    const fantasyCell = (row: Element | null) =>
      row?.querySelector(".report-practice-table__metric--fantasy") ?? null;
    const numberOf = (cell: Element | null) =>
      cell?.querySelector(".report-practice-table__metric-value")?.textContent;
    const labelOf = (cell: Element | null) =>
      cell?.querySelector(".report-practice-table__metric-likelihood")?.textContent;

    const highCell = fantasyCell(highRow);
    const lowCell = fantasyCell(lowRow);

    // fantasyPull 10 → "More likely" (7–10); fantasyPull 2 → "Less likely" (0–3).
    expect(numberOf(highCell)).toBe("10");
    expect(labelOf(highCell)).toBe("More likely");
    expect(numberOf(lowCell)).toBe("2");
    expect(labelOf(lowCell)).toBe("Less likely");

    // Invariant: EVERY rendered cell's label matches its number's bucket
    // (7-10 More, 4-6 Neutral, 0-3 Less) — also proves the middle bucket is hit.
    const bucket = (n: number) =>
      n >= 7 ? "More likely" : n >= 4 ? "Neutral likely" : "Less likely";
    let checked = 0;
    let neutralSeen = 0;
    for (const cell of container.querySelectorAll(".report-practice-table__metric")) {
      const num = cell.querySelector(".report-practice-table__metric-value")?.textContent ?? "";
      if (!/^\d+$/.test(num)) continue; // skip locked "--"
      const n = Number(num);
      expect(cell.querySelector(".report-practice-table__metric-likelihood")?.textContent).toBe(
        bucket(n)
      );
      checked += 1;
      if (n >= 4 && n <= 6) neutralSeen += 1;
    }
    expect(checked).toBeGreaterThan(0);
    expect(neutralSeen).toBeGreaterThan(0);
  });

  it("renders the premium overlay preview when the section is locked", () => {
    const { container } = render(
      <PracticeTendenciesSection
        archetype="Spark Seeker"
        content={buildLockedContent("Spark Seeker")}
        isPremium={true}
        sectionTitle="Typical Sexual Fantasy & Practice Tendencies"
      />
    );

    // No legacy prose intro in the Report 2.0 layout (see the first test).
    expect(container.querySelector(".report-practice-panel__intro")).not.toBeInTheDocument();
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
    const unlockButtons = screen.getAllByRole("button", { name: /unlock your report/i });
    expect(unlockButtons.length).toBeGreaterThanOrEqual(1);

    // Locked rows must render "--" with NO numeric score and NO likelihood label
    // in the DOM (premium scores never reach the client behind the blur/overlay).
    const lockedValues = container.querySelectorAll(
      ".report-practice-table__row--locked .report-practice-table__metric-value"
    );
    expect(lockedValues.length).toBeGreaterThan(0);
    lockedValues.forEach((cell) => expect(cell.textContent).toBe("--"));
    expect(
      container.querySelector(
        ".report-practice-table__row--locked .report-practice-table__metric-likelihood"
      )
    ).not.toBeInTheDocument();
  }, 60_000);

  // The "compact locked modifier" test that lived here is gone with the code it
  // guarded: only the FIRST category renders when locked (one paywall card per
  // section), and that group is always "Core Relational & Embodied", which was
  // never one of the three compact titles — so the branch became unreachable.
  it("renders exactly one locked category, and drops its card when the host owns it", () => {
    const locked = buildLockedContent("Spark Seeker");
    const { container, rerender } = render(
      <PracticeTendenciesSection
        archetype="Spark Seeker"
        content={locked}
        isPremium={true}
        sectionTitle="Typical Sexual Fantasy & Practice Tendencies"
      />
    );

    expect(container.querySelectorAll(".report-practice-group--locked")).toHaveLength(1);
    expect(container.querySelector(".report-practice-table__locked-cover")).toBeInTheDocument();

    // hideOverlay: the Fantasy card already shows this section's paywall.
    rerender(
      <PracticeTendenciesSection
        archetype="Spark Seeker"
        content={locked}
        hideOverlay
        isPremium={true}
        sectionTitle="Typical Sexual Fantasy & Practice Tendencies"
      />
    );

    expect(container.querySelectorAll(".report-practice-group--locked")).toHaveLength(1);
    expect(container.querySelector(".report-practice-table__locked-cover")).not.toBeInTheDocument();
    // Names still tease; the premium numbers stay server-stripped either way.
    expect(container.querySelector(".report-practice-table__row--locked")).toBeInTheDocument();
  });
});
