// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AttachmentPatternsSection, {
  splitAttachmentResult,
  type AttachmentCopy,
  type AttachmentPlane,
} from "@features/report/ui/sections/AttachmentPatternsSection";

const baseCopy: AttachmentCopy = {
  "gate.hook": "See where you sit on the attachment map",
  eyebrow: "Your Attachment Style",
  "edu.eyebrow": "Learn: the five attachment patterns",
  "edu.teaser": "Five ways a nervous system learns to hold closeness.",
  "edu.body.p1": "Attachment style is how your system handles closeness.",
  "learn.eyebrow": "What you will learn",
  "learn.body": "In this chapter you will learn what attachment is.",
  result: "Secure",
  "row1.label": "Most of the time",
  "row1.value": "Deep closeness without losing yourself",
  "row2.value": "Anxious notes surface",
  "row3.value": "Desire stays closed until repair happens",
  "insight.label": "The Key",
  "insight.value": "Repair isn't the obstacle. It's the doorway.",
  "body.p1": "Two dots, one person.",
  locked: false,
};

const plane: AttachmentPlane = {
  home: { x: 0.288, y: 0.714 },
  strain: { x: 0.346, y: 0.342 },
  homeLabel: "ORDINARY DAYS",
  strainLabel: "UNDER DISCONNECTION",
  accentCorner: "SECURE",
};

const noop = () => {};

describe("AttachmentPatternsSection", () => {
  afterEach(cleanup);

  it("renders the unlocked per-archetype card with family-specific row labels + the map", () => {
    render(
      <AttachmentPatternsSection
        archetype="Spiritual Lover"
        copy={baseCopy}
        plane={plane}
        family="secure-anxious"
        onUnlock={noop}
        sectionTitle="Attachment Style"
      />
    );

    // Per-archetype gated content is present when unlocked.
    expect(screen.getByText("Secure")).toBeInTheDocument();
    expect(screen.getByText("Repair isn't the obstacle. It's the doorway.")).toBeInTheDocument();

    // row1 label universal; row2/row3 labels come from the family map, NOT copy.
    expect(screen.getByText("Most of the time")).toBeInTheDocument();
    expect(screen.getByText("Under lingering disconnection")).toBeInTheDocument();
    expect(screen.getByText("After rupture")).toBeInTheDocument();

    // The map renders both dots + labels for an archetype with real coords.
    expect(screen.getByText("ORDINARY DAYS")).toBeInTheDocument();
    expect(screen.getByText("UNDER DISCONNECTION")).toBeInTheDocument();

    // No overlay when unlocked.
    expect(document.querySelector(".report-premium-overlay")).not.toBeInTheDocument();
  });

  it("uses the avoidant family labels for an avoidant archetype", () => {
    render(
      <AttachmentPatternsSection
        archetype="Quiet Withdrawer"
        copy={{ ...baseCopy, result: "Avoidant" }}
        plane={null}
        family="avoidant"
        onUnlock={noop}
        sectionTitle="Attachment Style"
      />
    );

    expect(screen.getByText("When closeness stays constant")).toBeInTheDocument();
    expect(screen.getByText("After space is restored")).toBeInTheDocument();
  });

  it("withholds per-archetype content and shows the overlay when locked", () => {
    const lockedCopy: AttachmentCopy = {
      "gate.hook": baseCopy["gate.hook"],
      eyebrow: baseCopy.eyebrow,
      "edu.eyebrow": baseCopy["edu.eyebrow"],
      "edu.teaser": baseCopy["edu.teaser"],
      "edu.body.p1": baseCopy["edu.body.p1"],
      "learn.eyebrow": baseCopy["learn.eyebrow"],
      "learn.body": baseCopy["learn.body"],
      // Per-archetype slots withheld server-side.
      result: null,
      "row1.value": null,
      "row2.value": null,
      "row3.value": null,
      "insight.value": null,
      "body.p1": null,
      locked: true,
    };

    render(
      <AttachmentPatternsSection
        archetype="Spiritual Lover"
        copy={lockedCopy}
        plane={null}
        family="secure-anxious"
        onUnlock={noop}
        sectionTitle="Attachment Style"
      />
    );

    // The real result word is never in the DOM when locked.
    expect(screen.queryByText("Secure")).not.toBeInTheDocument();
    // The overlay anchors over the blurred stand-in.
    expect(document.querySelector(".report-premium-overlay")).toBeInTheDocument();
    expect(document.querySelector(".report-attachment-card--blur")).toBeInTheDocument();

    // Universal educational content is STILL shown when locked.
    expect(screen.getByText("What you will learn")).toBeInTheDocument();
    expect(
      screen.getByText("Common Attachment Style Patterns Across Archetypes")
    ).toBeInTheDocument();
  });
});

describe("splitAttachmentResult", () => {
  it("splits the parenthesised qualifier onto its own line", () => {
    expect(splitAttachmentResult("Secure (anxious under imbalance)")).toEqual([
      "Secure",
      "anxious under imbalance",
    ]);
  });

  it("handles the comma form tender-devotee uses instead of parentheses", () => {
    expect(splitAttachmentResult("Secure, anxious when criticised")).toEqual([
      "Secure",
      "anxious when criticised",
    ]);
  });

  it("returns no qualifier for a bare pattern word (spiritual-lover)", () => {
    expect(splitAttachmentResult("Secure")).toEqual(["Secure", null]);
  });

  it("keeps a non-secure primary word (quiet-withdrawer inverts the pair)", () => {
    expect(splitAttachmentResult("Avoidant (secure when pressure stays low)")).toEqual([
      "Avoidant",
      "secure when pressure stays low",
    ]);
  });

  it("never leaves brackets or a trailing comma in either half", () => {
    for (const raw of [
      "Secure (avoidant under pressure)",
      "Secure, anxious when criticised",
      "Avoidant (secure when pressure stays low)",
      "Secure",
    ]) {
      const [word, qualifier] = splitAttachmentResult(raw);
      expect(word).not.toMatch(/[()]/);
      expect(word).not.toMatch(/,$/);
      expect(word.length).toBeGreaterThan(0);
      if (qualifier !== null) expect(qualifier).not.toMatch(/[()]/);
    }
  });

  it("tolerates surrounding whitespace", () => {
    expect(splitAttachmentResult("  Secure (anxious under strain)  ")).toEqual([
      "Secure",
      "anxious under strain",
    ]);
  });
});
