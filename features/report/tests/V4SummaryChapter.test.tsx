// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import V4SummaryChapter from "@features/report/ui/v3/V4SummaryChapter";
import type { Report3Summary } from "@/data/report3-archetype-page";

/**
 * Mark, 29.09 (1945263585): "Lets have the Summary text fade + CTA please" — his own
 * idea on 28.09 (1944189426: "a good place to use the fade"), with Marcus's grey label.
 * 882:7539 shows 24 lines of the copy, the last 96px of them under a white fade, and
 * the 86x31 "Show All" pill at 592, then the rating. The copy is free: the fold is a
 * way to read it, not a gate.
 */

const V3_CSS = readFileSync(join(process.cwd(), "features/report/ui/v3/reportV3.css"), "utf8");

const SUMMARY: Report3Summary = {
  paragraphs: [
    [{ text: "First paragraph." }],
    [{ text: "Second paragraph." }],
    [{ text: "Third." }],
  ],
  closer: "The closing line.",
};

afterEach(cleanup);

describe("V4SummaryChapter — the fold (882:7539)", () => {
  it("opens folded: a 'Show all' pill over the fade, every paragraph still on the page", () => {
    const { container } = render(<V4SummaryChapter archetype="Spark Seeker" summary={SUMMARY} />);
    expect(container.querySelector(".rv4-summary")).toHaveClass("is-collapsed");
    const pill = screen.getByRole("button", { name: "Show all of the summary" });
    expect(pill).toHaveClass("rv4-summary__pill");
    expect(pill.textContent).toBe("Show all");
    expect(container.querySelector(".rv4-summary__fade")!.getAttribute("aria-hidden")).toBe("true");
    // Nothing is withheld: the fold only clips what the eye sees, and the closing line
    // is on the page too (the CSS keeps it below the fold on a phone).
    expect(container.querySelectorAll(".rv4-summary__copy p")).toHaveLength(3);
    expect(screen.getByText("Third.")).toBeInTheDocument();
    expect(container.querySelector(".rv4-summary__closer")!.textContent).toBe("The closing line.");
  });

  it("opens for good on the pill, and hands focus to the copy", () => {
    const { container } = render(<V4SummaryChapter archetype="Spark Seeker" summary={SUMMARY} />);
    fireEvent.click(screen.getByRole("button", { name: "Show all of the summary" }));
    expect(container.querySelector(".rv4-summary")).not.toHaveClass("is-collapsed");
    expect(screen.queryByRole("button", { name: "Show all of the summary" })).toBeNull();
    expect(container.querySelector(".rv4-summary__fade")).toBeNull();
    expect(container.querySelector(".rv4-summary__closer")!.textContent).toBe("The closing line.");
    // The pill unmounts under the keyboard's focus; the copy takes it instead.
    expect(document.activeElement).toBe(container.querySelector(".rv4-summary__copy"));
  });

  it("keeps the rating under the fold", () => {
    const { container } = render(
      <V4SummaryChapter
        archetype="Spark Seeker"
        summary={SUMMARY}
        feedback={<span className="fb">Does this resonate?</span>}
      />
    );
    expect(container.querySelector(".rv4-summary .fb")).not.toBeNull();
  });
});

describe("reportV3.css — the Summary's fold", () => {
  const rule = (selector: string) => {
    const at = V3_CSS.indexOf(`${selector} {`);
    expect(at, selector).toBeGreaterThan(-1);
    expect(V3_CSS.slice(0, at).split("\n").length, selector).toBeGreaterThan(1884);
    return V3_CSS.slice(at, V3_CSS.indexOf("}", at));
  };

  it("shows 24 lines of the copy, in 882:7543's 635 under the heading's 18", () => {
    const copy = rule(".rv3 .rv4-summary.is-collapsed .rv4-summary__copy");
    expect(copy).toContain("max-height: 614.4px");
    expect(copy).toContain("overflow: hidden");
    expect(rule(".rv3 .rv4-summary.is-collapsed .rv4-summary__fold")).toContain("height: 635px");
  });

  it("fades the last 96px as the table and the A&B cards do", () => {
    const fade = rule(".rv3 .rv4-summary__fade");
    expect(fade).toContain("rgba(255, 255, 255, 0) 0%");
    expect(fade).toContain("rgba(255, 255, 255, 0.7) 40%");
    expect(fade).toContain("#fff 85%");
    expect(fade).toContain("height: 96px");
    expect(fade).toContain("top: 518.4px");
    expect(fade).toContain("pointer-events: none");
  });

  it("keeps the fold inside a narrow phone's column", () => {
    // The copy's max-width: 100% resolves against the fold now; the fold's own keeps
    // both at the column's 288 on a 320 phone.
    expect(rule(".rv3 .rv4-summary__fold")).toContain("max-width: 100%");
  });

  it("hides the closing line only while folded", () => {
    expect(rule(".rv3 .rv4-summary.is-collapsed .rv4-summary__closer")).toContain("display: none");
  });

  // The frame is a phone's. From 700 up the copy runs a 620-917 column, where the fold
  // would hide a line or four (the 760 measure sets it 691 tall), so it opens unfolded,
  // as it did.
  it("folds on a phone only", () => {
    const at = V3_CSS.indexOf("@media (min-width: 700px) {\n  .rv3.rv4 .rv4-summary.is-collapsed");
    expect(at, "no desktop override for the fold").toBeGreaterThan(-1);
    const media = V3_CSS.slice(at, V3_CSS.indexOf("\n}\n", at));
    expect(media).toContain("max-height: none");
    expect(media).toContain(".rv3.rv4 .rv4-summary__fade");
    expect(media).toContain(".rv3.rv4 .rv4-summary__fold .rv4-summary__pill");
    expect(media).toContain("display: none");
    expect(media).toContain(".rv3.rv4 .rv4-summary.is-collapsed .rv4-summary__closer");
  });

  it("sets the pill at 592, centred, drawn by the other expand pills' rules", () => {
    // Placed from inside the fold, as the A&B and table peeks place theirs, so it
    // outranks the shared rule's position: relative wherever the two sit.
    const pill = rule(".rv3 .rv4-summary__fold .rv4-summary__pill");
    expect(pill).toContain("position: absolute");
    expect(pill).toContain("top: 592px");
    expect(pill).toContain("left: 50%");
    expect(pill).toContain("transform: translateX(-50%)");
    expect(V3_CSS).toContain(
      ".rv3 .rv4-fvt__pill,\n.rv3 .rv4-trig__pill,\n.rv3 .rv4-summary__pill {"
    );
    expect(V3_CSS).toContain(
      ".rv3 .rv4-fvt__pill-label,\n.rv3 .rv4-trig__pill-label,\n.rv3 .rv4-summary__pill-label {"
    );
  });
});
