// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ConstellationSection from "@features/report/ui/sections/ConstellationSection";

afterEach(cleanup);

const RANKING = ["Relational Nurturer", "Minimalist Companion", "Quiet Withdrawer"];

const renderList = (unlocked: string[], onViewArchetype = vi.fn()) => {
  render(
    <ConstellationSection
      ranking={RANKING}
      percentages={{
        "Relational Nurturer": 90,
        "Minimalist Companion": 70,
        "Quiet Withdrawer": 50,
      }}
      mottos={{}}
      viewArchetype="Relational Nurturer"
      onViewArchetype={onViewArchetype}
      unlockedArchetypes={new Set(unlocked)}
    />
  );
  return onViewArchetype;
};

/**
 * Every row used to read "View report", owned or not. On 2026-10-06 the founder bought
 * Minimalist Companion from this list on production, came back to the same rows looking
 * exactly as before, and paid again for what he took to be the same report.
 */
describe("Other Archetypes list: owned vs locked", () => {
  it("says Unlock, with a padlock, on an archetype the reader cannot open yet", () => {
    renderList(["Relational Nurturer"]);
    const locked = screen.getByRole("button", { name: "Unlock Minimalist Companion report" });
    expect(locked).toHaveTextContent(/^Unlock$/);
    expect(locked.querySelector("svg")).not.toBeNull();
    expect(locked).toHaveClass("report-constellation__view--locked");
  });

  it("flips to View report once that archetype is bought", () => {
    renderList(["Relational Nurturer", "Minimalist Companion"]);
    const owned = screen.getByRole("button", { name: "View Minimalist Companion report" });
    expect(owned).toHaveTextContent("View report");
    expect(owned).not.toHaveClass("report-constellation__view--locked");
    expect(
      screen.getByRole("button", { name: "Unlock Quiet Withdrawer report" })
    ).toBeInTheDocument();
  });

  it("reads View report on the reader's own row, and on every row with all 14", () => {
    renderList(RANKING);
    expect(
      screen.getByRole("button", { name: "View your Relational Nurturer report" })
    ).toHaveTextContent("View report");
    expect(screen.queryAllByRole("button", { name: /^Unlock / })).toHaveLength(0);
  });

  it("hands the tapped archetype to the page either way", () => {
    const onView = renderList(["Relational Nurturer"]);
    fireEvent.click(screen.getByRole("button", { name: "Unlock Quiet Withdrawer report" }));
    expect(onView).toHaveBeenCalledWith("Quiet Withdrawer");
  });
});
