// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ClosingSection from "../ui/sections/ClosingSection";
import DocStyleBlock from "../ui/sections/DocStyleBlock";
import InsecuritiesSection from "../ui/sections/InsecuritiesSection";
import KnowHowSection from "../ui/sections/KnowHowSection";
import LearnPill from "../ui/sections/LearnPill";
import {
  AROUSAL_STYLES,
  AROUSAL_STYLE_BY_ARCHETYPE,
  CURIOSITY_STYLES,
  CURIOSITY_STYLE_BY_ARCHETYPE,
  INITIATION_STYLES,
  INITIATION_STYLE_BY_ARCHETYPE,
  resolveStyles,
} from "@/data/report2-doc-styles";
import { INSECURITY_THEMES } from "@/data/report2-insecurity-themes";
import { KEY_CONCEPTS_EYEBROW, report2KeyConcepts } from "@/data/report2-key-concepts";
import { KNOWHOW_LAYERS, KNOWHOW_VERDICT } from "@/data/report2-knowhow";
import { report2ArchetypeSummary } from "@/data/report2-archetype-summary";

/**
 * The 2026-08-26 document pass.
 *
 * The tests that matter most here are the NAME-MATCHING ones. Which pre-defined
 * style a reader is shown is a string looked up in a catalogue of strings, and
 * `resolveStyles` deliberately drops a name it cannot find rather than throwing —
 * so a single typo in `AROUSAL_STYLE_BY_ARCHETYPE` would render an empty block
 * on a live report and nothing anywhere would say so.
 */

afterEach(cleanup);

describe("style catalogues and the archetype mappings", () => {
  it("resolves every mapped style name against its catalogue", () => {
    const cases = [
      ["curiosity", CURIOSITY_STYLES, CURIOSITY_STYLE_BY_ARCHETYPE],
      ["arousal", AROUSAL_STYLES, AROUSAL_STYLE_BY_ARCHETYPE],
      ["initiation", INITIATION_STYLES, INITIATION_STYLE_BY_ARCHETYPE],
    ] as const;

    for (const [label, catalogue, byArchetype] of cases) {
      for (const [slug, matches] of Object.entries(byArchetype)) {
        const resolved = resolveStyles(catalogue, matches);
        expect(
          resolved.length,
          `${label}: ${slug} names ${matches.length} style(s), ${resolved.length} exist in the catalogue`
        ).toBe(matches.length);
      }
    }
  });

  it("drops a name that is not in the catalogue rather than throwing", () => {
    expect(resolveStyles(CURIOSITY_STYLES, [{ name: "No such style", role: "primary" }])).toEqual(
      []
    );
    expect(resolveStyles(CURIOSITY_STYLES, undefined)).toEqual([]);
  });

  it("gives the Spark Seeker the styles the document names it under", () => {
    // Chapter 16 lists Spark Seeker under "Very high / exploration-driven
    // curiosity" and chapter 22 under "Active / Direct initiation". Both are read
    // off the document, so a change here means the document changed.
    expect(CURIOSITY_STYLE_BY_ARCHETYPE["spark-seeker"]?.[0]?.name).toBe(
      "Very high / exploration-driven curiosity"
    );
    expect(INITIATION_STYLE_BY_ARCHETYPE["spark-seeker"]?.[0]?.name).toBe(
      "Active / Direct initiation"
    );
  });

  it("marks the arousal mapping as inferred, since chapter 21 names no archetypes", () => {
    const matches = AROUSAL_STYLE_BY_ARCHETYPE["spark-seeker"] ?? [];
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((m) => m.inferred === true)).toBe(true);
    expect(matches.filter((m) => m.role === "primary")).toHaveLength(1);
  });

  it("keeps the document's own punctuation in a description", () => {
    // The document writes "selectively,not primarily" with no space. It is copied,
    // not corrected — this asserts nobody tidied it into a paraphrase later.
    const instrumental = CURIOSITY_STYLES.find(
      (s) => s.name === "Instrumental or strategic curiosity"
    );
    expect(instrumental?.description).toContain("selectively,not primarily");
  });
});

describe("DocStyleBlock", () => {
  const style = { name: "Body-first arousal", description: "Desire ignites quickly." };

  it("renders nothing when no style resolved", () => {
    const { container } = render(
      <DocStyleBlock eyebrow="Arousal styles" styles={[]} modifier="arousal" />
    );
    expect(container.firstChild).toBeNull();
  });

  it("names the style and prints its description", () => {
    render(
      <DocStyleBlock
        eyebrow="Arousal styles across the archetypes"
        styles={[{ ...style, role: "primary" }]}
        modifier="arousal"
        outro="Most people carry more than one."
      />
    );
    expect(screen.getByText("Arousal styles across the archetypes")).toBeInTheDocument();
    expect(screen.getByText("Body-first arousal")).toBeInTheDocument();
    expect(screen.getByText("Desire ignites quickly.")).toBeInTheDocument();
    expect(screen.getByText("Most people carry more than one.")).toBeInTheDocument();
  });

  it("labels a secondary style so a stack does not read as three verdicts", () => {
    render(
      <DocStyleBlock
        eyebrow="Arousal styles"
        styles={[
          { ...style, role: "primary" },
          { name: "Low-pressure arousal", description: "Autonomy preserved.", role: "secondary" },
        ]}
        modifier="arousal"
      />
    );
    expect(screen.getByText("· also present")).toBeInTheDocument();
  });
});

describe("LearnPill", () => {
  it("uses the Key Concepts eyebrow the route supplies", () => {
    render(
      <LearnPill
        prefix="beliefs"
        copy={{ "learn.eyebrow": KEY_CONCEPTS_EYEBROW, "learn.body": "One." }}
      />
    );
    expect(screen.getByText("Key Concepts")).toBeInTheDocument();
  });

  it("renders the second paragraph only when the document had one", () => {
    const { container: one } = render(
      <LearnPill prefix="beliefs" copy={{ "learn.body": "One." }} />
    );
    expect(one.querySelectorAll(".report-beliefs__learn-body")).toHaveLength(1);

    const { container: two } = render(
      <LearnPill prefix="beliefs" copy={{ "learn.body": "One.", "learn.body.p2": "Two." }} />
    );
    expect(two.querySelectorAll(".report-beliefs__learn-body")).toHaveLength(2);
    expect(screen.getByText("Two.")).toBeInTheDocument();
  });

  it("renders nothing without a body, so a section without copy shows no empty pill", () => {
    const { container } = render(
      <LearnPill prefix="beliefs" copy={{ "learn.eyebrow": "Key Concepts" }} />
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("Key Concepts copy layer", () => {
  it("covers the Spark Seeker's chapters and no one else's yet", () => {
    expect(Object.keys(report2KeyConcepts)).toEqual(["spark-seeker"]);
    // Sixteen chapters had a green paragraph after their heading, plus the three
    // chapters that never carried the pill at all (Importance of Sexuality, Sexual
    // Stage, and the constellation block), added 2026-08-26.
    const blocks = report2KeyConcepts["spark-seeker"] ?? {};
    expect(Object.keys(blocks)).toHaveLength(19);
    for (const id of ["importance", "stage", "constellation"]) {
      expect(blocks[id]?.p1, `${id} has no Key Concepts`).toBeTruthy();
    }
  });

  it("puts the chapter definition in front of the green passage, not instead of it", () => {
    // Five chapters open with a one-sentence definition of the dimension. It is a
    // `lead`, so it renders as the first sentence of the same paragraph and the
    // green passage it precedes survives.
    const blocks = report2KeyConcepts["spark-seeker"] ?? {};
    for (const id of ["confidence", "reward", "energy", "power", "curiosity", "initiation"]) {
      expect(blocks[id]?.lead, `${id} has no lead`).toBeTruthy();
      expect(blocks[id]?.p1, `${id} lost its green paragraph`).toBeTruthy();
    }
    // Initiation joined them on 2026-08-27.
    expect(blocks.initiation?.lead).toBeTruthy();

    // NO lead may end on a colon. Power's used to, carrying the four questions it
    // introduced; Mark asked for both the colon and the questions to go on
    // 2026-08-27, so the rule is now simply that a lead is a whole sentence.
    for (const [id, block] of Object.entries(blocks)) {
      expect(block.lead?.trim().endsWith(":") ?? false, `${id} lead ends on a colon`).toBe(false);
      expect(block.questions, `${id} still carries questions`).toBeUndefined();
    }
  });

  it("never carries a paragraph that trails off on a colon", () => {
    // Three source paragraphs end "It answers questions like:" and introduce a
    // list that has no home in this block; the next green paragraph was taken
    // instead. This asserts none of them slipped back in.
    for (const [section, block] of Object.entries(report2KeyConcepts["spark-seeker"] ?? {})) {
      expect(block.p1.trim().endsWith(":"), `${section} p1 ends on a colon`).toBe(false);
      if (block.p2) {
        expect(block.p2.trim().endsWith(":"), `${section} p2 ends on a colon`).toBe(false);
      }
    }
  });
});

describe("Core Insecurities educational expander", () => {
  const copy = {
    "practical.label": "Working with your sensitivity: three moves",
    "learn.eyebrow": "Key Concepts",
    "learn.body": "Body.",
    takeaway: "Takeaway.",
    "practical.teaser": "Teaser.",
    "practical.line1": "1. One.",
    "body.p1": "Prose.",
    locked: false,
  };

  function renderSection(overrides: Partial<typeof copy> = {}) {
    return render(
      <InsecuritiesSection
        archetype="Spark Seeker"
        copy={{ ...copy, ...overrides }}
        cueFamily="engulfment"
        graph={null}
        onUnlock={() => {}}
        sectionTitle="Core Insecurities"
      />
    );
  }

  it("starts closed, showing the fade and the CTA over it", () => {
    const { container } = renderSection();
    const peek = container.querySelector(".report-insecurities__edu-peek");
    expect(peek).not.toBeNull();
    // The shared classes are what produce the three-line fade and the pill on top
    // of it; without them this block would not match the other expanders.
    expect(peek?.className).toContain("report-learn-peek");
    expect(peek?.querySelector(".report-learn-cta")).not.toBeNull();
    expect(container.querySelector(".report-insecurities__theme-list")).toBeNull();
  });

  it("opens onto all five insecurity themes", async () => {
    const user = userEvent.setup();
    const { container } = renderSection();

    await user.click(screen.getByRole("button", { name: /the five insecurity themes/i }));

    const items = container.querySelectorAll(".report-insecurities__theme-item");
    expect(items).toHaveLength(5);
    expect(INSECURITY_THEMES).toHaveLength(5);
    // Each theme's own insecurity is bolded inside its sentence.
    expect(container.querySelectorAll(".report-insecurities__theme-term")).toHaveLength(5);
    expect(screen.getByText("abandonment insecurity")).toBeInTheDocument();
  });

  it("sits below the practical block, not in place of it", () => {
    const { container } = renderSection();
    const card = container.querySelector(".report-insecurities__card");
    const children = Array.from(card?.children ?? []);
    const practical = children.findIndex((el) =>
      el.classList.contains("report-insecurities__details")
    );
    const edu = children.findIndex((el) => el.classList.contains("report-insecurities__edu"));
    expect(practical).toBeGreaterThanOrEqual(0);
    expect(edu).toBeGreaterThan(practical);
  });

  it("still renders for a locked reader, closed, offering the unlock", () => {
    const { container } = renderSection({ locked: true });
    expect(container.querySelector(".report-insecurities__edu")).not.toBeNull();
    expect(screen.getByText("Unlock to read the full explanation")).toBeInTheDocument();
  });
});

describe("KnowHowSection", () => {
  it("renders the chapter's own three-layer model", () => {
    const { container } = render(<KnowHowSection />);
    expect(container.querySelectorAll(".report-knowhow__layer")).toHaveLength(3);
    expect(KNOWHOW_LAYERS.map((l) => l.label)).toEqual([
      "The Body (Arousal)",
      "The Mind (Desire)",
      "The Experience (Pleasure)",
    ]);
    for (const layer of KNOWHOW_LAYERS) {
      expect(screen.getByText(layer.label)).toBeInTheDocument();
      expect(screen.getByText(layer.question)).toBeInTheDocument();
    }
    expect(screen.getByText(KNOWHOW_VERDICT)).toBeInTheDocument();
  });

  it("carries no question that trails off on a colon", () => {
    // "Pleasure answers the question:" sits one paragraph above the question
    // itself; picking the wrong index would print the lead-in as the question.
    for (const layer of KNOWHOW_LAYERS) {
      expect(layer.question.trim().endsWith(":"), layer.label).toBe(false);
      expect(layer.body.trim().endsWith(":"), layer.label).toBe(false);
    }
  });
});

describe("ClosingSection", () => {
  it("becomes Summary and prints every chapter-3 paragraph", () => {
    const paras = report2ArchetypeSummary["spark-seeker"] ?? [];
    const { container } = render(<ClosingSection summary={paras} />);

    expect(screen.getByText("Summary")).toBeInTheDocument();
    expect(container.querySelectorAll(".report-closing__body--summary")).toHaveLength(paras.length);
    expect(paras.length).toBeGreaterThan(1);
  });

  it("keeps the original closing note for an archetype with no chapter 3", () => {
    render(<ClosingSection summary={null} />);
    expect(screen.getByText("Where this leaves you")).toBeInTheDocument();
    expect(screen.queryByText("Summary")).not.toBeInTheDocument();
  });
});
