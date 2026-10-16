// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import V4Accelerators from "@features/report/ui/v3/V4Accelerators";
import V4Fold from "@features/report/ui/v3/V4Fold";
import V4Partnership from "@features/report/ui/v3/V4Partnership";
import V4Passage from "@features/report/ui/v3/V4Passage";
import V4Section from "@features/report/ui/v3/V4Section";
import V4TypicalBeliefs from "@features/report/ui/v3/V4TypicalBeliefs";
import V4UnlockSample from "@features/report/ui/v3/V4UnlockSample";
import { FIRST_PAYWALL_SELECTOR } from "@features/report/logic/leaveIntent";
import { KNOWN_ARCHETYPES } from "@features/report/server/archetypeSlug";
import {
  ACCELERATORS_GENERIC_INTRO_BLOCKS,
  ACCELERATORS_INTRO,
  REPORT_V4_ACCELERATORS,
  buildAccelerators,
} from "@/data/report3-accelerators";
import type { Report3Block } from "@/data/report3-learn-more";
import {
  PARTNERSHIP_GENERIC_INTRO_BLOCKS,
  PARTNERSHIP_INTRO,
  REPORT_V4_PARTNERSHIP,
  buildPartnership,
} from "@/data/report3-partnership";
import { buildTypicalBeliefs } from "@/data/report3-typical-beliefs";

/**
 * The slimmed chapters (16.10) — Typical Beliefs, Accelerators & Brakes and Challenges in
 * Partnerships as Figma's "Report - Slimmed" draws them (1686:10027, 1665:6717, 1665:6941)
 * and Mark's prototype (KhQYPL14…) runs them: a short opening, then sections whose rows
 * fold them away, long copy under "Show all", and where a locked reader's free copy ends,
 * a few lines fading out into "Unlock Full Chapter" instead of a blurred wall and a card.
 * Mark's PostHog review (13.10): "Long blurred elements make people drop … Collapse all
 * blurred elements after a few lines."
 *
 * Stand-in copy where a component is tested on its own, so no paid copy sits in this test.
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const para = (text: string): Report3Block => ({ kind: "para", runs: [{ text }] });
const textOf = (block: Report3Block) =>
  block.kind === "heading"
    ? block.text
    : block.kind === "para"
      ? block.runs.map((r) => r.text).join("")
      : block.items.map((runs) => runs.map((r) => r.text).join("")).join(" ");
const firstClass = (el: Element) => el.className.split(" ")[0];
/** jsdom lays nothing out: give every element this scroll height. */
const contentHeight = (px: number) =>
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(px);

describe("V4Fold — the sneak peek (1709:1486, 1709:1493, 1686:10619)", () => {
  it("folds copy that runs past its peek, under a fade and 'Show all'", () => {
    contentHeight(400);
    const { container } = render(
      <V4Fold lines={6} label="Sun and Shadow Beliefs">
        <p>Stand-in copy.</p>
      </V4Fold>
    );
    const fold = container.querySelector<HTMLElement>(".rv4-fold")!;
    expect(fold).toHaveClass("is-folded");
    // Six lines of the 25.6px prose line (no stylesheet here, so the fallback).
    expect(fold.style.getPropertyValue("--rv4-fold-peek")).toBe("153.6px");
    expect(fold.querySelector(".rv4-fold__fade")!.getAttribute("aria-hidden")).toBe("true");
    const pill = screen.getByRole("button", { name: "Show all of Sun and Shadow Beliefs" });
    expect(pill.textContent).toBe("Show all");
    expect(pill.getAttribute("aria-expanded")).toBe("false");
    expect(pill.getAttribute("aria-controls")).toBe(fold.querySelector(".rv4-fold__copy")!.id);
    // chapterStats counts it with the other expand pills.
    expect(pill.getAttribute("data-chapter-action")).toBe("show_all");
  });

  it("opens for good on the pill, and hands focus to the copy the pill leaves with", () => {
    contentHeight(400);
    const { container } = render(
      <V4Fold label="The Stand-in">
        <p>Stand-in copy.</p>
      </V4Fold>
    );
    fireEvent.click(screen.getByRole("button", { name: "Show all of The Stand-in" }));
    const fold = container.querySelector(".rv4-fold")!;
    expect(fold).not.toHaveClass("is-folded");
    expect(fold.querySelector(".rv4-fold__fade, .rv4-fold__pill")).toBeNull();
    expect(document.activeElement).toBe(fold.querySelector(".rv4-fold__copy"));
  });

  it("never folds copy that runs no more than a line past its peek", () => {
    contentHeight(7 * 25.6);
    const { container } = render(
      <V4Fold lines={6} label="The Stand-in">
        <p>Stand-in copy.</p>
      </V4Fold>
    );
    expect(container.querySelector(".rv4-fold")).not.toHaveClass("is-folded");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says when it holds the chapter's wall, which the first-paywall watch then finds", () => {
    const { container } = render(
      <V4Fold label="Common Challenges" holdsWall>
        <p>Stand-in copy.</p>
      </V4Fold>
    );
    expect(container.querySelector(".rv4-fold")).toHaveClass("has-wall");
    expect(container.querySelector(FIRST_PAYWALL_SELECTOR)).toHaveClass("rv4-fold");
  });
});

describe("V4Section — a chapter's heading row (1686:10509, 1709:1500, 1711:1847)", () => {
  it("opens open, and its row folds the section away and back", () => {
    render(
      <V4Section title="The Stand-in">
        <p>Stand-in copy.</p>
      </V4Section>
    );
    const head = screen.getByRole("button", { name: "The Stand-in" });
    expect(head.closest("h3")).not.toBeNull();
    const body = document.getElementById(head.getAttribute("aria-controls")!)!;
    expect(head.getAttribute("aria-expanded")).toBe("true");
    expect(body.hidden).toBe(false);
    fireEvent.click(head);
    expect(head.getAttribute("aria-expanded")).toBe("false");
    expect(body.hidden).toBe(true);
    fireEvent.click(head);
    expect(body.hidden).toBe(false);
  });

  it("draws a locked section as its heading and the lock, no body, the row opening the paywall", () => {
    const onUnlock = vi.fn();
    const { container } = render(
      <V4Section title="Common Challenges" locked onUnlock={onUnlock} />
    );
    expect(container.querySelector(".rv4-sect")).toHaveClass("is-locked");
    expect(container.querySelector(".rv4-sect__inner")).toBeNull();
    expect(container.querySelector(".rv4-chapter__lock")).not.toBeNull();
    const head = screen.getByRole("button", { name: /^Common Challenges/ });
    expect(head.hasAttribute("aria-expanded")).toBe(false);
    fireEvent.click(head);
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });
});

describe("V4UnlockSample — the wall (1665:6780)", () => {
  it("fades the sample out under 'Unlock Full Chapter', the band owning one click", () => {
    const onUnlock = vi.fn();
    const { container } = render(
      <V4UnlockSample sample={para("Stand-in sample.")} onUnlock={onUnlock} />
    );
    const sample = container.querySelector(".rv4-unlock__sample")!;
    expect(sample.getAttribute("aria-hidden")).toBe("true");
    expect(sample.hasAttribute("inert")).toBe(true);
    expect(sample.querySelector(".rv4-unlock__fade")).not.toBeNull();
    const pill = screen.getByRole("button", { name: "Unlock Full Chapter" });
    for (const target of [sample, pill]) {
      onUnlock.mockClear();
      fireEvent.click(target);
      expect(onUnlock).toHaveBeenCalledTimes(1);
    }
    expect(container.querySelector(FIRST_PAYWALL_SELECTOR)).toHaveClass("rv4-unlock");
  });
});

describe("V4Passage — sharp lead, fold, wall", () => {
  const heading: Report3Block = { kind: "heading", text: "A stand-in challenge" };
  const free = [heading, para("First."), para("Second."), para("Third.")];

  it("keeps its lead paragraphs sharp, a heading going with the paragraph it heads", () => {
    const { container } = render(
      <V4Passage gated={{ free, ramp: null, rest: [] }} lead={1} label="Common Challenges" />
    );
    expect([...container.children].map(firstClass)).toEqual([
      "rv4-prose__h",
      "rv4-prose__p",
      "rv4-fold",
    ]);
    expect(container.querySelectorAll(".rv4-fold .rv4-prose__p")).toHaveLength(2);
    expect(container.querySelector(".rv4-unlock")).toBeNull();
  });

  it("closes the fold with the wall, so one call to action shows at a time", () => {
    const { container } = render(
      <V4Passage
        gated={{ free, ramp: para("The sample."), rest: [] }}
        lead={1}
        label="Common Challenges"
      />
    );
    const fold = container.querySelector(".rv4-fold")!;
    expect(fold).toHaveClass("has-wall");
    expect(fold.querySelector(".rv4-fold__copy")!.lastElementChild).toHaveClass("rv4-unlock");
  });

  it("sets the wall straight after the lead when nothing free is left to fold", () => {
    const { container } = render(
      <V4Passage
        gated={{ free: [para("First.")], ramp: para("The sample."), rest: [] }}
        lead={1}
        label="Common Challenges"
      />
    );
    expect([...container.children].map(firstClass)).toEqual(["rv4-prose__p", "rv4-unlock"]);
    expect(container.querySelector(".rv4-fold")).toBeNull();
  });
});

describe("the three slimmed chapters, for all fourteen archetypes", () => {
  it.each(KNOWN_ARCHETYPES)(
    "%s: A&B's replaced opening is the shared Dual Control Model",
    (name) => {
      // The universal opening takes the place of the three paragraphs every doc opens on,
      // so nothing an archetype says of itself is lost: its own part starts "For the …".
      const intro = REPORT_V4_ACCELERATORS[name]!.intro;
      const spark = REPORT_V4_ACCELERATORS["Spark Seeker"]!.intro;
      expect(intro.slice(0, ACCELERATORS_GENERIC_INTRO_BLOCKS).map(textOf)).toEqual(
        spark.slice(0, ACCELERATORS_GENERIC_INTRO_BLOCKS).map(textOf)
      );
      expect(textOf(intro[ACCELERATORS_GENERIC_INTRO_BLOCKS]!)).toMatch(/^For the /);
      const view = buildAccelerators(name)!;
      expect(view.intro).toEqual(ACCELERATORS_INTRO);
      expect(view.archetypeIntro).toEqual(intro.slice(ACCELERATORS_GENERIC_INTRO_BLOCKS));
    }
  );

  it.each(KNOWN_ARCHETYPES)(
    "%s: CiP opens on the universal opening, its own part 'For the …'",
    (name) => {
      const body = REPORT_V4_PARTNERSHIP[name]!.body;
      // Sensual Connector's doc words the opening its own way; the slimmed report gives every
      // archetype Sanjin's universal one (flagged to him).
      if (name !== "Sensual Connector") {
        expect(body.slice(0, PARTNERSHIP_GENERIC_INTRO_BLOCKS)).toEqual(PARTNERSHIP_INTRO);
      }
      expect(textOf(body[PARTNERSHIP_GENERIC_INTRO_BLOCKS]!)).toMatch(/^For the /);
      expect(body.some((b) => b.kind === "heading" && b.text === "Common Challenges")).toBe(true);
      expect(buildPartnership(name)!.intro).toEqual(PARTNERSHIP_INTRO);
    }
  );

  it.each(KNOWN_ARCHETYPES)(
    "%s: a locked reader is sent each wall's sample and nothing past it",
    (name) => {
      const veiled = (block: Report3Block | null) =>
        block !== null && block.kind === "para" && block.runs.some((run) => run.veiled);
      const tb = buildTypicalBeliefs(name, { locked: true })!;
      const ab = buildAccelerators(name, { locked: true })!;
      const cip = buildPartnership(name, { locked: true })!;
      for (const passage of [tb.challenges, ab.challenges, cip.archetypeBody]) {
        expect(passage.ramp).not.toBeNull();
        expect(veiled(passage.ramp)).toBe(false);
        expect(passage.rest).toEqual([]);
      }
      // Every archetype's wall falls before CiP's "Common Challenges", drawn locked, and the
      // body ends on the blurred result: no tail past it (1665:7089).
      expect(cip.challenges).toBeNull();
      expect(cip).not.toHaveProperty("tail");
      // A reader who has paid keeps the tail where the archetype's doc sets one.
      expect(buildPartnership(name)!.tail ?? []).toEqual(REPORT_V4_PARTNERSHIP[name]!.tail ?? []);
    }
  );

  it.each(KNOWN_ARCHETYPES)(
    "%s: draws one wall per chapter for a locked reader, none once paid",
    (name) => {
      for (const locked of [true, false]) {
        const { container, unmount } = render(
          <>
            <V4TypicalBeliefs view={buildTypicalBeliefs(name, { locked })!} archetype={name} />
            <V4Accelerators view={buildAccelerators(name, { locked })!} archetype={name} />
            <V4Partnership view={buildPartnership(name, { locked })!} archetype={name} />
          </>
        );
        for (const chapter of [".rv4-tb", ".rv4-ab", ".rv4-cip"]) {
          expect(container.querySelectorAll(`${chapter} .rv4-unlock`), chapter).toHaveLength(
            locked ? 1 : 0
          );
          expect(container.querySelector(`${chapter} .rv4-premium`), chapter).toBeNull();
        }
        const names = [...container.querySelectorAll(".rv4-sect__name")].map(
          (el) => el.textContent
        );
        expect(names).toEqual([
          "Sun and Shadow Beliefs",
          `The ${name}`,
          "Common Challenges",
          `The ${name}`,
          "Common Challenges",
          `The ${name} Challenges`,
          "Common Challenges",
        ]);
        expect(container.querySelectorAll(".rv4-sect.is-locked")).toHaveLength(locked ? 1 : 0);
        unmount();
      }
    }
  );
});
