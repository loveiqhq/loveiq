// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import AcceleratorsSection, {
  type AccelCopy,
} from "@features/report/ui/sections/AcceleratorsSection";
import BeliefsSection, { type BeliefsCopy } from "@features/report/ui/sections/BeliefsSection";
import { V3ModeProvider, V4ModeProvider } from "@features/report/ui/v3/V3Chapter";

/**
 * Review 27.09 — "show the report 2.0 version in the other chapters that we don't open
 * by default". For the thirteen archetypes whose Typical Beliefs and Accelerators &
 * Brakes are not written for V4 yet, those two chapters open onto Report 2.0's
 * section. Under V4 both still drew Report 3.0's layouts (the turning beliefs, the
 * gauge and stacked cards), because `useIsV3()` is true under V4 too. They draw 2.0's
 * own now; `?v3=1` keeps its layouts.
 */

afterEach(cleanup);

const BELIEFS: BeliefsCopy = {
  "learn.eyebrow": "What you will learn",
  "learn.body": "In this chapter you will learn where your beliefs came from.",
  keep: ["Sex is a way we care for each other", "Closeness makes me want to give"],
  loosen: [
    { belief: "My needs should come second", shift: "My pleasure matters too" },
    { belief: "If I say no, I'll hurt them", shift: "A no can hold love" },
  ],
  locked: false,
};

const ACCEL: AccelCopy = {
  "edu.eyebrow": "The dual-control model",
  "edu.teaser": "Arousal runs on two independent pedals.",
  "learn.eyebrow": "What you will learn",
  "learn.body": "In this chapter you will learn which conditions open you.",
  takeaway: "Remove the brake first.",
  locked: false,
};

const inV3 = (node: ReactNode) => render(<V3ModeProvider>{node}</V3ModeProvider>);
const inV4 = (node: ReactNode) =>
  render(
    <V3ModeProvider>
      <V4ModeProvider>{node}</V4ModeProvider>
    </V3ModeProvider>
  );

const beliefs = (
  <BeliefsSection
    archetype="Relational Nurturer"
    copy={BELIEFS}
    isUnlocked
    onUnlock={() => {}}
    sectionTitle="Typical Beliefs"
  />
);
const accel = (
  <AcceleratorsSection
    archetype="Relational Nurturer"
    copy={ACCEL}
    onUnlock={() => {}}
    sectionTitle="Accelerators & Brakes"
  />
);

describe("V4's Report 2.0 fallbacks draw 2.0, not 3.0 (review 27.09)", () => {
  it("draws 2.0's keep/loosen columns for Typical Beliefs under V4", () => {
    const { container } = inV4(beliefs);
    expect(container.querySelector(".report-beliefs__cols")).not.toBeNull();
    expect(container.querySelector(".rv3-beliefs")).toBeNull();
  });

  it("draws 2.0's two columns for Accelerators & Brakes under V4", () => {
    const { container } = inV4(accel);
    expect(container.querySelector(".report-accel__columns")).not.toBeNull();
    expect(container.querySelector(".rv3-accel-card")).toBeNull();
  });

  it("leaves ?v3=1 on its own layouts", () => {
    const b = inV3(beliefs);
    expect(b.container.querySelector(".rv3-beliefs")).not.toBeNull();
    b.unmount();
    const a = inV3(accel);
    expect(a.container.querySelector(".rv3-accel-card")).not.toBeNull();
  });
});
