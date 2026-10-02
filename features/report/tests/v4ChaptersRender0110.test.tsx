// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import V4Accelerators from "@features/report/ui/v3/V4Accelerators";
import V4Fantasy from "@features/report/ui/v3/V4Fantasy";
import V4Partnership from "@features/report/ui/v3/V4Partnership";
import V4TypicalBeliefs from "@features/report/ui/v3/V4TypicalBeliefs";
import { buildAccelerators } from "@/data/report3-accelerators";
import { buildFantasy } from "@/data/report3-fantasy";
import { buildPartnership } from "@/data/report3-partnership";
import { REPORT_V4_TYPICAL_BELIEFS, buildTypicalBeliefs } from "@/data/report3-typical-beliefs";

/**
 * Every archetype's four V4 chapters draw, open and locked: Spark Seeker's from Figma and the
 * others transcribed from Sanjin's docs (01.10) go through the same components.
 */
afterEach(cleanup);

describe.each(Object.keys(REPORT_V4_TYPICAL_BELIEFS))("%s's V4 chapters", (name) => {
  for (const locked of [false, true]) {
    const state = locked ? "locked" : "open";

    it(`Typical Beliefs draws ${state}, under its own belief map`, () => {
      const { container } = render(
        <V4TypicalBeliefs view={buildTypicalBeliefs(name, { locked })!} />
      );
      expect(container.textContent).toContain(`The ${name} belief map`);
    });

    it(`Accelerators & Brakes draws ${state}: both cards, from five rows each`, () => {
      const view = buildAccelerators(name, { locked })!;
      // A card draws a few rows and a peek until "Show all", so the five are the view's.
      expect(view.brakes).toHaveLength(5);
      expect(view.accelerators).toHaveLength(5);
      const { container } = render(<V4Accelerators view={view} />);
      const cards = container.querySelectorAll(".rv4-trig");
      expect(cards).toHaveLength(2);
    });

    it(`Challenges in Partnerships draws ${state}: the loop and the result after it`, () => {
      const view = buildPartnership(name, { locked })!;
      const { container } = render(<V4Partnership view={view} />);
      expect(container.querySelector(".rv4-loop")).not.toBeNull();
      // The result and any tail, in the closing block the blur covers when locked.
      const closing = container.querySelector(".rv4-cip__closing")!;
      expect(closing.querySelectorAll(".rv4-prose__p").length).toBe(1 + (view.tail?.length ?? 0));
    });

    it(`Fantasy vs. Reality draws ${state}, its table among it`, () => {
      const { container } = render(<V4Fantasy view={buildFantasy(name, { locked })!} />);
      expect(container.querySelector(".rv4-fvt")).not.toBeNull();
    });
  }
});
