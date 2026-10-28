import { describe, expect, it } from "vitest";
import { REPORT_PURCHASE_PLANS } from "@features/checkout/server/reportPurchase";
import { titleCase } from "@features/report/logic/titleCase";
import { GATE_COPY } from "@features/report/ui/gate/gateContent";
import {
  EXIT_COPY,
  EXIT_LEAVE_PARAM,
  EXIT_NOTE_MAX,
  exitReasons,
  isExitStage,
  orderExitReasons,
  trustpilotLabel,
} from "@features/report/ui/gate/exit/exitContent";
import { seededRandom } from "@features/survey/ui/questionOrder";

/** Every string EXIT_COPY holds, its functions called with the live numbers. */
function allCopy(): string[] {
  const out: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === "string") out.push(value);
    else if (typeof value === "function") {
      const fn = value as (...args: unknown[]) => unknown;
      walk(fn(14, 1000, 199));
      walk(fn(1000, "paid", 199));
      walk(fn(1000, "gift", 199));
    } else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(EXIT_COPY);
  return out;
}

describe("the exit pages' reasons (Fatih, 28.10: fitted to what each reader has seen)", () => {
  it("asks the gate's reader about paying before seeing, with the real price", () => {
    expect(exitReasons("pre", 199).map((r) => r.code)).toEqual([
      "unexpected_payment",
      "see_first",
      "unclear_value",
      "fit_doubt",
      "too_expensive",
      "privacy",
      "later",
      "other",
    ]);
    expect(exitReasons("pre", 199).find((r) => r.code === "unclear_value")?.label).toBe(
      "I wasn’t sure what I’d get for €1.99"
    );
    expect(exitReasons("pre", 299).find((r) => r.code === "unclear_value")?.label).toBe(
      "I wasn’t sure what I’d get for €2.99"
    );
  });

  it("asks the full report's reader about what they have unlocked, not a free report", () => {
    const full = exitReasons("full", 199);
    expect(full.map((r) => r.code)).toEqual([
      "time_commitment",
      "low_value",
      "enough_already",
      "result_off",
      "unclear_content",
      "too_expensive",
      "privacy",
      "other",
    ]);
    for (const { label } of [...full, ...exitReasons("pre", 199)]) {
      expect(label).not.toMatch(/\bfree\b/i);
    }
  });

  it("keeps “Something else” last and shuffles the rest", () => {
    const reasons = exitReasons("pre", 199);
    const orders = new Set<string>();
    for (let seed = 0; seed < 20; seed += 1) {
      const order = orderExitReasons(reasons, seededRandom(`reader-${seed}:pre`));
      expect(order).toHaveLength(8);
      expect(order.at(-1)?.code).toBe("other");
      expect(new Set(order.map((r) => r.code))).toEqual(new Set(reasons.map((r) => r.code)));
      orders.add(order.map((r) => r.code).join(","));
    }
    expect(orders.size).toBeGreaterThan(10);
  });

  it("gives one reader the same order every time the page opens", () => {
    const reasons = exitReasons("full", 199);
    const a = orderExitReasons(reasons, seededRandom("55:full")).map((r) => r.code);
    const b = orderExitReasons(reasons, seededRandom("55:full")).map((r) => r.code);
    expect(a).toEqual(b);
  });

  it("leaves the list it was given alone", () => {
    const reasons = exitReasons("pre", 199);
    const before = reasons.map((r) => r.code);
    orderExitReasons(reasons, () => 0);
    expect(reasons.map((r) => r.code)).toEqual(before);
  });
});

describe("the exit pages' words", () => {
  it("names the parameter that opens them, and knows its two values", () => {
    expect(EXIT_LEAVE_PARAM).toBe("leave");
    expect(isExitStage("pre")).toBe(true);
    expect(isExitStage("full")).toBe(true);
    expect(isExitStage("gate")).toBe(false);
    expect(isExitStage(null)).toBe(false);
  });

  // The canvas counted the credit down ("expires in 7 days"); no such deadline exists.
  it("puts no deadline on the credit, anywhere", () => {
    for (const line of allCopy()) {
      expect(line).not.toMatch(/expire|expires|days left|within 7 days|hurry/i);
    }
  });

  it("sells the gate's own card on the gate's exit page", () => {
    expect(EXIT_COPY.offer.badge).toBe(GATE_COPY.card.badge);
    expect(EXIT_COPY.offer.pre.title).toBe(GATE_COPY.card.title);
    expect(EXIT_COPY.offer.pre.features).toBe(GATE_COPY.card.features);
    expect(EXIT_COPY.offer.paymentsLabel).toBe(GATE_COPY.paymentsLabel);
  });

  it("describes the full report in its plan's own line, and counts the credit by who paid it", () => {
    const planLine = REPORT_PURCHASE_PLANS.find((p) => p.plan === "full_report")?.features[1]
      ?.label;
    const paid = EXIT_COPY.offer.full.features(1000, "paid", 199);
    const gift = EXIT_COPY.offer.full.features(1000, "gift", 199);
    expect(paid[0]?.text).toBe(planLine);
    expect(paid.at(-1)).toEqual({ strong: "€10 credit applied", text: " from your €1.99" });
    expect(gift.at(-1)).toEqual({ strong: "€10 credit applied", text: "" });
    expect(EXIT_COPY.credit.paid(199)).toBe("You earned it with your €1.99 unlock.");
    expect(EXIT_COPY.credit.gift).toBe("It’s yours toward your Full Report.");
    expect(EXIT_COPY.credit.title(1000)).toBe("Don’t lose your €10 credit");
  });

  it("captions the bar with the guarantee, and the credit on the full report's page", () => {
    expect(EXIT_COPY.sticky.guarantee(14)).toBe("14-day money-back guarantee");
    expect(EXIT_COPY.sticky.pre).toBe("one-time payment");
    expect(EXIT_COPY.sticky.full(1000)).toBe("€10 credit applied");
    expect(EXIT_COPY.sticky.cta(199)).toBe("Unlock risk-free · €1.99");
  });

  // 02.10 (Mark): headings that are not sentences are in Title Case.
  it("sets the headings that are not sentences in the report's heading case", () => {
    for (const heading of [
      EXIT_COPY.guarantee.title(14),
      EXIT_COPY.why.title,
      EXIT_COPY.offer.full.title,
      EXIT_COPY.offer.pre.title,
    ]) {
      expect(heading).toBe(titleCase(heading));
    }
    expect(EXIT_COPY.guarantee.title(14)).toBe("14-Day Money-Back Guarantee");
  });

  it("caps a sentence at 500 characters", () => {
    expect(EXIT_NOTE_MAX).toBe(500);
  });
});

describe("trustpilotLabel", () => {
  it("uses Trustpilot's own words for a score, never more than the score says", () => {
    expect(trustpilotLabel(4.4)).toBe("Excellent");
    expect(trustpilotLabel(4.3)).toBe("Excellent");
    expect(trustpilotLabel(4.2)).toBe("Great");
    expect(trustpilotLabel(3.8)).toBe("Great");
    expect(trustpilotLabel(3.0)).toBe("Average");
    expect(trustpilotLabel(2.0)).toBe("Poor");
    expect(trustpilotLabel(1.2)).toBe("Bad");
  });
});
