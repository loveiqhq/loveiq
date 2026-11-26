import { describe, expect, it } from "vitest";
import { assignGateRevealArm } from "@shared/experiments/gateRevealArm";
import {
  assignGatePriceArm,
  GATE_PRICE_EXPERIMENT,
  isGateArmStamp,
  isGatePriceArm,
} from "@shared/experiments/gatePriceArm";

const session = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;

// Marcus, 24 Nov 2026: "Replace & Retire the 'Core Archetype shown' … with the new 'Choose your
// price'". The half that met that page chooses its price, so a reader its sheets told the
// archetype was free lands where EUR 0 is one of the prices.
describe("assignGatePriceArm", () => {
  it("is Mark's 50/50's own split: the reveal's half chooses, today's page's half stays", () => {
    for (let i = 0; i < 2_000; i += 1) {
      const id = session(i);
      expect(assignGatePriceArm(id)).toBe(
        assignGateRevealArm(id) === "reveal" ? "choose" : "fixed"
      );
    }
  });

  it("keeps a run with no session id on today's EUR 1.99 page", () => {
    for (const empty of [null, undefined, "", "   "]) {
      expect(assignGatePriceArm(empty)).toBe("fixed");
    }
  });

  it("names its exposure apart from the reveal's", () => {
    expect(GATE_PRICE_EXPERIMENT).toBe("gate_price_2026_11");
  });
});

describe("its stamp under gate_reveal_arm", () => {
  it("knows its own halves, and either test's as a stamp", () => {
    expect(isGatePriceArm("fixed")).toBe(true);
    expect(isGatePriceArm("choose")).toBe(true);
    expect(isGatePriceArm("control")).toBe(false);
    expect(isGatePriceArm("reveal")).toBe(false);
    for (const v of ["fixed", "choose", "control", "reveal"]) expect(isGateArmStamp(v)).toBe(true);
    for (const v of ["", "Choose", null, undefined, 1]) expect(isGateArmStamp(v)).toBe(false);
  });
});
