// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import V4TopThreeSection from "@features/report/ui/v3/V4TopThreeSection";

/**
 * Mark's desktop review (Notion, 28.09): "Lets follow the V2 desktop of Other Archetypes
 * for this and cap after the first 3. But take out 'View Report'." The desktop layout is
 * CSS (v4DesktopReview2809.test.ts); this pins what it lays out: three rows, the lead
 * first, each row's parts in V2's order, and nothing to click.
 */
afterEach(cleanup);

describe("V4's top three, as V2's desktop rows draw them", () => {
  it("caps at three rows, the lead first", () => {
    const { container } = render(<V4TopThreeSection />);
    const rows = container.querySelectorAll(".rv3-top3__row");
    expect(rows).toHaveLength(3);
    expect(rows[0]!.classList.contains("is-lead")).toBe(true);
  });

  it("gives every row V2's parts in V2's order", () => {
    const { container } = render(<V4TopThreeSection />);
    for (const row of container.querySelectorAll(".rv3-top3__row")) {
      expect(Array.from(row.children, (c) => c.className.replace("rv3-top3__", ""))).toEqual([
        "rank",
        "icon",
        "name",
        "blurb",
        "bar",
        "pct",
      ]);
    }
  });

  it("has no View report", () => {
    const { container } = render(<V4TopThreeSection />);
    expect(container.querySelector(".rv3-top3 button, .rv3-top3 a")).toBeNull();
    expect(container.textContent).not.toMatch(/view report/i);
  });
});
