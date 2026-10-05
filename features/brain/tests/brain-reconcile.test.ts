import { describe, expect, it } from "vitest";
import { reconcile, summarise, type Reading } from "@features/brain/server/reconcile";

const r = (over: Partial<Reading> = {}): Reading => ({
  what: "paid, last 30 days",
  left: { source: "the digest", value: 9 },
  right: { source: "the payment ledger", value: 9 },
  tolerance: 0,
  ...over,
});

describe("reconcile", () => {
  it("says nothing when two paths agree", () => {
    // Silence is the normal output. A reconciler that reports its successes becomes a
    // daily message nobody opens.
    expect(reconcile([r()])).toEqual([]);
    expect(summarise([], 1)).toBeNull();
  });

  it("catches the defect that actually shipped: 9 paid against 4 real", () => {
    const found = reconcile([r({ right: { source: "the payment ledger", value: 4 } })]);
    expect(found).toHaveLength(1);
    expect(found[0]!.gap).toBe(5);
    expect(found[0]!.detail).toContain("the digest says 9");
    expect(found[0]!.detail).toContain("the payment ledger says 4");
  });

  it("allows a gap that is legitimate, and says why when it exceeds it", () => {
    // A cohort followed forward and an event-day count differ by whoever crossed the
    // boundary. Flagging that every morning trains the reader to ignore the message.
    const within = reconcile([
      r({
        what: "checkout",
        right: { source: "in-window", value: 32 },
        left: { source: "cohort", value: 33 },
        tolerance: 1,
      }),
    ]);
    expect(within).toEqual([]);

    const beyond = reconcile([
      r({
        what: "checkout",
        left: { source: "cohort", value: 40 },
        right: { source: "in-window", value: 32 },
        tolerance: 1,
        because: "a cohort is followed forward with no end date",
      }),
    ]);
    expect(beyond[0]!.detail).toContain("tolerance of 1");
    expect(beyond[0]!.detail).toContain("followed forward");
  });

  it("is symmetric — it does not matter which side is larger", () => {
    const up = reconcile([
      r({ left: { source: "a", value: 4 }, right: { source: "b", value: 9 } }),
    ]);
    const down = reconcile([
      r({ left: { source: "a", value: 9 }, right: { source: "b", value: 4 } }),
    ]);
    expect(up[0]!.gap).toBe(down[0]!.gap);
  });

  it("puts every disagreement in ONE message", () => {
    // Four alerts about one bad number is how a channel gets muted.
    const found = reconcile([
      r({ what: "paid", right: { source: "ledger", value: 4 } }),
      r({
        what: "visits",
        left: { source: "funnel", value: 12308 },
        right: { source: "sparklines", value: 12000 },
      }),
    ]);
    const msg = summarise(found, 4)!;
    expect(msg).toContain("2 of 4 cross-checks disagree");
    expect(msg.split("\n• ")).toHaveLength(3);
  });
});
