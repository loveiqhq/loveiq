// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import V4ChapterNudges from "@features/report/ui/v3/V4ChapterNudges";
import { V4_OPEN_CHAPTER_EVENT } from "@features/report/ui/v3/v4OpenChapter";
import { REPORT_V4_CHAPTERS } from "@features/report/ui/v3/reportV3Nav";
import { REPORT_V4_NUDGES } from "@/data/report3-archetype-page";

/**
 * Part II's "What you will discover" — Figma 1:763: the H2 1:766 over the chapter
 * nudges panel. Four rows, each a way into a chapter: its part, its name, a serif
 * question, and — open — a line of support and "Read full chapter".
 *
 * Review round 25.09: Mark's final panel (1:847 — 696:2647, 1941287574 "Final
 * version", the text CTA 1941261886) with Sanjin's copy (712:243, 1941655578). The
 * part now stands alone in a small glow ("PART III", no "Learn in", no "3.1"), the
 * panel sits in the column with a soft shadow, and a closing line says how many more
 * chapters the report holds.
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

  it("lists four chapters and their part, from V4's own order — no 'Learn in', no number", () => {
    const { container } = render(<V4ChapterNudges />);
    const rows = [...container.querySelectorAll(".rv4-nudges__row")];
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.querySelector(".rv4-nudges__part")!.textContent)).toEqual([
      "Part III",
      "Part IV",
      "Part V",
      "Part VI",
    ]);
    expect(rows.map((r) => r.querySelector(".rv4-nudges__title")!.textContent)).toEqual([
      "Typical Beliefs",
      "Accelerators & Brakes",
      // V4's plural (Fatih, 24.09), though the nudge frame still draws the singular.
      "Challenges in Partnerships",
      "Fantasy vs. Reality",
    ]);
    expect(container.textContent).not.toContain("Learn in");
    expect(container.textContent).not.toMatch(/\d\.\d/);
  });

  it("asks Sanjin's questions (712:260 / 282 / 298 / 314)", () => {
    const { container } = render(<V4ChapterNudges />);
    expect(
      [...container.querySelectorAll(".rv4-nudges__question")].map((q) => q.textContent)
    ).toEqual([
      "Which rules about sex did you never actually agree to?",
      "What turns your desire on, and what shuts you down?",
      "What do your partners hear that you never said?",
      "What does your fantasy really say about what you want?",
    ]);
  });

  it("carries Sanjin's support lines (712:262 / 321 / 332 / 343), stray spaces out", () => {
    expect(REPORT_V4_NUDGES.map((n) => [n.id, n.support])).toEqual([
      [
        "typical_beliefs",
        "Discover the beliefs that are quietly shaping what sex means to you, and how they can influence your desire, behaviour, and relationships.",
      ],
      [
        "typical_arousal_accelerators_turn_ons_of_the_core_archetype",
        "Understand what fuels your desire, what gets in the way, and how to better work with both.",
      ],
      [
        "challenges_in_partnership",
        "Understand where your needs and habits can be misread by a partner, and how to reduce the friction without losing what matters to you.",
      ],
      [
        "typical_sexual_fantasy_amp_practice_tendencies",
        "Learn what makes a fantasy appealing, which parts should stay imaginary, and what may be worth exploring in real life.",
      ],
    ]);
  });

  it("closes on how many more chapters the report holds, counted from its own order", () => {
    const { container } = render(<V4ChapterNudges />);
    const tally = container.querySelector(".rv4-nudges__tally")!;
    const more = REPORT_V4_CHAPTERS.length - REPORT_V4_NUDGES.length;
    // Figma's "+ 16" counts the preview's rows; the live report has 18 chapters, so 14.
    expect(more).toBe(14);
    expect(tally.textContent!.replace(/\s+/g, " ").trim()).toBe(
      `+ ${more} Other Chapters on Desire & Intimacy`
    );
    expect(tally.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
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
  it("sets the panel in the column, radius 27, with the frame's hairline and soft shadow", () => {
    const panel = rule(".rv3 .rv4-nudges__panel");
    // 1:847: 361 in the 361 column — no longer full bleed.
    expect(panel).not.toContain("margin-inline");
    expect(panel).toContain("width: 100%");
    expect(panel).toContain("border-radius: 27px");
    expect(panel).toContain("box-shadow: 0 20.19px 50.47px 5px rgba(103, 60, 120, 0.08)");
    expect(rule(".rv3 .rv4-nudges__panel::after")).toContain(
      "border: 1px solid rgba(168, 85, 247, 0.4)"
    );
    expect(rule(".rv3 .rv4-nudges__row")).toContain("padding: 18px 22px");
  });

  it("sets the part in its own glow, the question and the text link as drawn", () => {
    const part = rule(".rv3 .rv4-nudges__part");
    expect(part).toContain("height: 24px");
    expect(part).toContain("width: 100px");
    expect(part).toContain("letter-spacing: 2.6px");
    expect(part).toContain("line-height: 19.2px");
    expect(part).toContain("rgba(157, 138, 215, 0.24)");
    const q = rule(".rv3 .rv4-nudges__question");
    expect(q).toContain("font-size: 18.5px");
    expect(q).toContain("line-height: 26.5px");
    const read = rule(".rv3 .rv4-nudges__read");
    expect(read).toContain("font-family: var(--font-sans)");
    expect(read).toContain("font-size: 12px");
    expect(read).toContain("font-weight: 500");
    expect(read).toContain("line-height: 19.2px");
    expect(rule(".rv3 .rv4-nudges__support")).toContain("max-width: 221px");
  });

  it("sets the closing line small and spaced, its count in the brand gradient", () => {
    const tally = rule(".rv3 .rv4-nudges__tally");
    expect(tally).toContain("font-size: 10px");
    expect(tally).toContain("letter-spacing: 0.8px");
    expect(tally).toContain("line-height: 16px");
    expect(tally).toContain("text-align: center");
    const n = rule(".rv3 .rv4-nudges__tally-n");
    expect(n).toContain("font-size: 14px");
    expect(n).toContain("background-clip: text");
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
