// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SexualStageSection, {
  type StageCopy,
} from "@features/report/ui/sections/SexualStageSection";
import { STAGES } from "@/data/report2-stages";

beforeEach(() => {
  // The explorer beneath the card observes itself into view.
  class StubIntersectionObserver {
    constructor(public cb: IntersectionObserverCallback) {}
    observe(el: Element) {
      this.cb(
        [{ isIntersecting: true, intersectionRatio: 1, target: el } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver
      );
    }
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  vi.stubGlobal("IntersectionObserver", StubIntersectionObserver);
});

afterEach(cleanup);

/**
 * Whose stage the section names.
 *
 * The survey asks the reader outright — Q16005, "Which of these best describes
 * where your sexuality feels right now?", six options — and that answer arrives
 * as `userStageLabel`. The card used to ignore it in favour of the copy matrix's
 * per-archetype phrase ("Deepening / Balancing", identical for every Relational
 * Nurturer) and the wheel then tried to match that phrase against the six stages:
 * four archetypes matched, the other ten silently marked "Awakening / Exploring".
 * So a reader who answered "Pausing — I need a break from sex right now" was shown
 * a stage phrase they never chose, above a wheel marking a third stage.
 */
const archetypeCopy: StageCopy = {
  eyebrow: "Your Likely Stage",
  result: "Deepening / Balancing",
  "row1.label": "How it Feels",
  "row1.value": "Warm and giving, steadiest when care flows both ways",
  "row2.label": "What You're Focused On",
  "row2.value": "Reciprocity, receiving without guilt, voicing needs, shared care",
  "row3.label": "Common Thought",
  "row3.value": '"I want us to take care of each other."',
  "practical.label": "Main Need Right Now",
  "practical.body":
    "To receive as much as you give, and a partner who tends to you too. Balance, permission to want, rest from carrying it alone.",
};

const card = (container: HTMLElement) => ({
  eyebrow: container.querySelector(".report-stage2-card__eyebrow")?.textContent ?? null,
  title: container.querySelector(".report-stage2-card__title")?.textContent ?? null,
  rows: [...container.querySelectorAll(".report-stage2-card__row")].map((r) => [
    r.querySelector("dt")?.textContent,
    r.querySelector("dd")?.textContent,
  ]),
  needLead: container.querySelector(".report-stage2-card__need-lead")?.textContent ?? null,
  needAccent: container.querySelector(".report-stage2-card__need-accent")?.textContent ?? null,
  anchor: container.querySelector(".stage-explorer__chip--anchor")?.textContent ?? null,
});

describe("Sexual Stage — the reader's answered season", () => {
  it("names the season they picked, in the card AND the wheel", () => {
    const { container } = render(
      <SexualStageSection userStageLabel="Recharging / Pausing" copy={archetypeCopy} />
    );
    const c = card(container);
    const pausing = STAGES.find((s) => s.id === "recharging")!;

    expect(c.title).toBe("Recharging / Pausing");
    expect(c.anchor).toContain("Recharging / Pausing");
    // Figma's shape is kept: eyebrow, three labelled rows, the need tile.
    expect(c.eyebrow).toBe("Your Likely Stage");
    expect(c.rows).toEqual([
      ["How it Feels", pausing.feels],
      ["What You're Focused On", pausing.focus],
      ["Common Thought", `“${pausing.thought}”`],
    ]);
    expect(c.needLead).toBe(pausing.need);
    // The archetype's stage prose is not shown under a season it doesn't describe.
    expect(container.textContent).not.toContain("Deepening / Balancing");
    expect(container.textContent).not.toContain("Warm and giving");
  });

  it("uses the matrix's two-part need tile when the season IS the archetype's stage", () => {
    // Figma's own sample (8462:804) is this case: lead sentence + italic tail.
    const { container } = render(
      <SexualStageSection
        userStageLabel="Evolving / Transcending"
        copy={{
          ...archetypeCopy,
          result: "Evolving / Transcending",
          "practical.body":
            "Depth without pressure, and a partner who meets you there. Integration, grounding, devotion.",
        }}
      />
    );
    const c = card(container);
    expect(c.title).toBe("Evolving / Transcending");
    expect(c.needLead).toBe("Depth without pressure, and a partner who meets you there.");
    expect(c.needAccent?.trim()).toBe("Integration, grounding, devotion.");
  });

  it("falls back to the archetype phrase when there is no answer on file", () => {
    const { container } = render(<SexualStageSection userStageLabel={null} copy={archetypeCopy} />);
    const c = card(container);
    expect(c.title).toBe("Deepening / Balancing");
    expect(c.rows[0]).toEqual(["How it Feels", archetypeCopy["row1.value"]]);
    expect(c.needAccent?.trim()).toBe("Balance, permission to want, rest from carrying it alone.");
    // And the wheel then follows the card rather than marking a stage of its own.
    expect(c.anchor).toContain("Deepening / Balancing");
  });

  it("still renders for every one of the six answers", () => {
    const wrong: string[] = [];
    for (const stage of STAGES) {
      const { container } = render(
        <SexualStageSection userStageLabel={stage.label} copy={archetypeCopy} />
      );
      const c = card(container);
      if (c.title !== stage.label || !c.anchor?.includes(stage.label)) {
        wrong.push(`${stage.label}: card="${c.title}" wheel="${c.anchor}"`);
      }
      cleanup();
    }
    expect(wrong).toEqual([]);
  });
});
