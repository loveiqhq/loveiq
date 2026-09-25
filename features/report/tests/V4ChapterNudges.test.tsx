// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import V4ChapterNudges from "@features/report/ui/v3/V4ChapterNudges";
import { V4_OPEN_CHAPTER_EVENT } from "@features/report/ui/v3/v4OpenChapter";
import { REPORT_V4_NUDGES } from "@/data/report3-archetype-page";

/**
 * Part II's "What you will discover" — Figma 1:763: the H2 1:766 over the chapter
 * nudges panel 663:1089, which replaced the Snapshot. Four rows, each a way into a
 * chapter: where it sits, its name, a serif question, and — open — a line of
 * support and "Read full chapter".
 */

const V3_CSS = readFileSync(join(process.cwd(), "features/report/ui/v3/reportV3.css"), "utf8");
const SOURCE = readFileSync(
  join(process.cwd(), "features/report/ui/v3/V4ChapterNudges.tsx"),
  "utf8"
);
const rule = (selector: string) => {
  const at = V3_CSS.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`no rule for ${selector}`);
  return V3_CSS.slice(at, V3_CSS.indexOf("}", at));
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("V4ChapterNudges — 663:1089", () => {
  it("heads the panel 'What you will discover', as 1:766 now reads", () => {
    render(<V4ChapterNudges />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("What you will discover");
  });

  it("lists four chapters, their part and number taken from V4's own order", () => {
    const { container } = render(<V4ChapterNudges />);
    const rows = [...container.querySelectorAll(".rv4-nudges__row")];
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.querySelector(".rv4-nudges__chip")!.textContent)).toEqual([
      "Part III · 3.1",
      "Part IV · 4.1",
      "Part V · 5.1",
      "Part VI · 6.1",
    ]);
    expect(rows.map((r) => r.querySelector(".rv4-nudges__title")!.textContent)).toEqual([
      "Typical Beliefs",
      "Accelerators & Brakes",
      // V4's plural (Fatih, 24.09), though the nudge frame still draws the singular.
      "Challenges in Partnerships",
      "Fantasy vs. Reality",
    ]);
    expect(rows.map((r) => r.querySelector(".rv4-nudges__question")!.textContent)).toEqual([
      "Which of your rules about sex did you never actually agree to?",
      "What switches your desire off fastest?",
      "What do your partners hear that you never said?",
      "Why does the thing you fantasise about lose its heat in real life?",
    ]);
    for (const row of rows) {
      expect(within(row as HTMLElement).getByText("Learn in")).toBeInTheDocument();
    }
  });

  it("carries the support lines Figma writes for each (663:1126 and the hidden 662:233)", () => {
    expect(REPORT_V4_NUDGES.map((n) => [n.id, n.support])).toEqual([
      [
        "typical_beliefs",
        "A short list of the beliefs most people are carrying, and a way to check which ones are yours.",
      ],
      [
        "typical_arousal_accelerators_turn_ons_of_the_core_archetype",
        "The conditions that shut you down, and which of them you can change before the weekend.",
      ],
      [
        "challenges_in_partnership",
        "How your usual way of asking lands on the other side, and one sentence that makes it clearer.",
      ],
      [
        "typical_sexual_fantasy_amp_practice_tendencies",
        "How to tell which fantasies are built for your head and which are worth trying out loud.",
      ],
    ]);
  });

  it("arrives with the first row open, as 663:1089 draws it, and toggles rows independently", () => {
    const { container } = render(<V4ChapterNudges />);
    const toggles = [...container.querySelectorAll<HTMLButtonElement>(".rv4-nudges__toggle")];
    expect(toggles.map((t) => t.getAttribute("aria-expanded"))).toEqual([
      "true",
      "false",
      "false",
      "false",
    ]);
    const more = (i: number) => container.querySelectorAll<HTMLElement>(".rv4-nudges__more")[i]!;
    expect(more(0).hidden).toBe(false);
    expect(more(1).hidden).toBe(true);
    fireEvent.click(toggles[2]!);
    fireEvent.click(toggles[0]!);
    expect(toggles.map((t) => t.getAttribute("aria-expanded"))).toEqual([
      "false",
      "false",
      "true",
      "false",
    ]);
    expect(more(2).hidden).toBe(false);
    expect(container.querySelectorAll(".rv4-nudges__row.is-open")).toHaveLength(1);
  });

  it("opens the chapter a nudge names, then jumps to it", () => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    const target = document.createElement("section");
    target.id = "typical_beliefs";
    const toggle = document.createElement("button");
    toggle.setAttribute("aria-expanded", "false");
    target.appendChild(toggle);
    document.body.appendChild(target);
    const scrollIntoView = vi.fn();
    target.scrollIntoView = scrollIntoView;
    const opened: string[] = [];
    const listen = (e: Event) => opened.push((e as CustomEvent<string>).detail);
    window.addEventListener(V4_OPEN_CHAPTER_EVENT, listen);

    const { container } = render(<V4ChapterNudges />);
    const read = container.querySelector<HTMLButtonElement>(".rv4-nudges__read")!;
    // A button, not a #hash link: Lenis takes over same-page anchors on desktop.
    expect(read.tagName).toBe("BUTTON");
    expect(read.textContent).toBe("Read full chapter");
    fireEvent.click(read);

    expect(opened).toEqual(["typical_beliefs"]);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "instant" });
    expect(document.activeElement).toBe(toggle);
    window.removeEventListener(V4_OPEN_CHAPTER_EVENT, listen);
    target.remove();
  });
});

describe("V4ChapterNudges — CSS contract", () => {
  it("runs the panel full-bleed, radius 27, with the frame's violet hairline", () => {
    const panel = rule(".rv3 .rv4-nudges__panel");
    expect(panel).toContain("margin-inline: calc(var(--rv3-gutter) * -1)");
    expect(panel).toContain("border-radius: 27px");
    expect(rule(".rv3 .rv4-nudges__panel::after")).toContain(
      "border: 1px solid rgba(168, 85, 247, 0.4)"
    );
  });

  it("sets the chip, the question and the link as drawn", () => {
    const chip = rule(".rv3 .rv4-nudges__chip");
    expect(chip).toContain("letter-spacing: 2.6px");
    expect(chip).toContain("rgba(157, 138, 215, 0.24)");
    const q = rule(".rv3 .rv4-nudges__question");
    expect(q).toContain("font-size: 18.5px");
    expect(q).toContain("line-height: 26.5px");
    expect(rule(".rv3 .rv4-nudges__read")).toContain("var(--rv4-manrope");
  });

  it("sets the open copy 21px under the question — the column's 9 plus its own 12", () => {
    expect(rule(".rv3 .rv4-nudges__more")).toContain("padding-top: 21px");
  });

  it("is appended below the frozen top and uses no catch-all suffix", () => {
    const at = V3_CSS.indexOf(".rv3 .rv4-nudges");
    expect(at).toBeGreaterThan(0);
    expect(V3_CSS.slice(0, at).split("\n").length).toBeGreaterThan(1884);
    for (const name of SOURCE.match(/rv4-nudges__[a-z-]+/g) ?? []) {
      expect(name, name).not.toMatch(
        /__(body|card|eyebrow|result|heading|details|details-[a-z-]+|learn-[a-z-]+)$/
      );
    }
  });
});
