// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import V3EndSummary from "@features/report/ui/v3/V3EndSummary";

/**
 * V3's closing Summary (Figma 10392:25297) takes its prose from the report payload. It used
 * to import `@/data/report-archetypes` itself, which put every archetype's paid V1 prose in
 * the report chunk's public source map (16.10; premium-content-bundle.test.ts now guards
 * every ui/ module). Stand-in prose, so no copy sits in this test.
 */

afterEach(cleanup);

describe("V3EndSummary", () => {
  it("sets the payload's prose under its label and the archetype", () => {
    const { container } = render(
      <V3EndSummary archetype="Spark Seeker" html="<p>Stand-in prose.</p>" />
    );
    expect(screen.getByText("Summary")).toBeInTheDocument();
    expect(container.querySelector(".rv3-endsummary__lede")!.textContent).toBe(
      "You score highest on: “Spark Seeker”"
    );
    expect(container.querySelector(".rv3-endsummary__body")!.textContent).toBe("Stand-in prose.");
  });

  it("draws nothing without prose", () => {
    const { container } = render(<V3EndSummary archetype="Spark Seeker" html={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("reads no data module, and the page hands it the payload's core archetype prose", () => {
    const source = readFileSync(
      join(process.cwd(), "features/report/ui/v3/V3EndSummary.tsx"),
      "utf8"
    );
    expect(source).not.toMatch(/from\s+["']@\/data\//);
    const page = readFileSync(join(process.cwd(), "features/report/ui/ReportPage.tsx"), "utf8");
    expect(page).toContain("html={archetypeContent.core_archetype?.[viewArchetype] ?? null}");
  });
});
