// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildTypicalBeliefs } from "@/data/report3-typical-beliefs";
import { KNOWN_ARCHETYPES } from "@features/report/server/archetypeSlug";
import { neutraliseArchetypeName } from "@features/report/server/tourFirstReport";
import V4IdentityVeil from "@features/report/ui/v3/V4IdentityVeil";
import V4TopThreeSection from "@features/report/ui/v3/V4TopThreeSection";
import V4TypicalBeliefs from "@features/report/ui/v3/V4TypicalBeliefs";

/**
 * Tour first, then the EUR 1.99 gate (sync 30.10): while the report is toured before the gate,
 * who the reader is stays for the gate (Fatih, 30.10). These are the page's stand-ins for what
 * the server leaves out: the top three and the Core Archetype card veiled, and Typical Beliefs
 * headed "Your Archetype".
 */

afterEach(cleanup);

const text = () => document.body.textContent ?? "";

describe("the report toured before the EUR 1.99 gate", () => {
  it("veils the top three: its heading, three rows with nothing to read, no rating", () => {
    render(<V4TopThreeSection percentages={{}} veiled />);
    expect(screen.getByRole("heading", { name: "3 Highest Scoring Archetypes" })).toBeTruthy();
    expect(screen.getByTestId("top-three-veil").children).toHaveLength(3);
    expect(text()).not.toMatch(/Does this resonate/i);
    expect(text()).not.toMatch(/%/);
  });

  it("veils the Core Archetype card under its heading, and says when it shows", () => {
    render(<V4IdentityVeil />);
    expect(screen.getByRole("heading", { name: /Core\s+Archetype/ })).toBeTruthy();
    expect(text()).toContain("Revealed when you unlock");
    for (const name of KNOWN_ARCHETYPES) expect(text()).not.toContain(name);
  });

  it("heads Typical Beliefs' own section “Your Archetype” when no archetype is named", () => {
    const view = neutraliseArchetypeName(
      buildTypicalBeliefs("Spark Seeker", { locked: true })!,
      "Spark Seeker"
    );
    render(<V4TypicalBeliefs view={view} archetype="" />);
    expect(screen.getAllByText("Your Archetype").length).toBeGreaterThan(0);
    expect(text()).not.toContain("Spark Seeker");
    expect(text()).toContain("Your archetype tends to place unusual value on");
  });
});
