import { describe, expect, it } from "vitest";
import { collectFindings } from "@/scripts/check-mcp-claims";

/**
 * The claims checker has to catch the failure that actually happened, and it has to stay
 * quiet about everything else. A checker that flags prose is a checker people switch off,
 * and a switched-off checker is exactly the state the Resend claim survived in for 129 days.
 */
const deps = (over: Partial<Parameters<typeof collectFindings>[1]> = {}) => ({
  tableCount: async () => 0,
  knownNames: async () => new Set<string>(["resend_webhook_event", "payment", "amount"]),
  listedGetFunctions: async () => 46,
  today: new Date("2026-09-15T00:00:00Z"),
  ...over,
});

describe("check-mcp-claims", () => {
  it("catches the exact sentence that shipped: a table called empty that is not", async () => {
    const found = await collectFindings(
      [
        {
          where: "service:resend",
          text: "Per-message delivery events are SUPPOSED to land in `resend_webhook_event`, but that table has never held a row because the webhook was never registered.",
        },
      ],
      deps({ tableCount: async () => 39 })
    );
    const err = found.find((f) => f.severity === "error");
    expect(err, "the emptiness claim must be contradicted").toBeDefined();
    expect(err!.detail).toContain("39 rows");
  });

  it("stays silent when the same sentence is TRUE", async () => {
    // The claim is only wrong when the table has rows. A checker that fires either way is
    // asserting that the sentence exists, not that it is true.
    const found = await collectFindings(
      [{ where: "service:resend", text: "`resend_webhook_event` has never held a row." }],
      deps({ tableCount: async () => 0 })
    );
    expect(found.filter((f) => f.severity === "error")).toEqual([]);
  });

  it("catches a get_* count that has drifted, and passes the right one", async () => {
    const wrong = await collectFindings(
      [{ where: "instructions", text: "`list_product_tables` lists 44 read-only functions" }],
      deps()
    );
    expect(wrong.find((f) => f.severity === "error")?.detail).toContain("lists 46");

    const right = await collectFindings(
      [{ where: "instructions", text: "`list_product_tables` lists 46 read-only functions" }],
      deps()
    );
    expect(right.filter((f) => f.severity === "error")).toEqual([]);
  });

  it("warns about an identifier the schema no longer has", async () => {
    // `calendly_webhook_event` was dropped on 2026-09-14 and every mention had to be found
    // by hand. A description naming a dropped table sends a caller somewhere unanswerable.
    const found = await collectFindings(
      [
        {
          where: "tool:query_product_data",
          text: "call invitations live in `calendly_webhook_event`",
        },
      ],
      deps()
    );
    expect(found.find((f) => f.claim.includes("calendly_webhook_event"))?.severity).toBe("warn");
  });

  it("does not flag a real column or a tool name", async () => {
    const found = await collectFindings(
      [
        {
          where: "tool:x",
          text: "filter `payment` on `amount`, then call `search_company_context`",
        },
      ],
      deps()
    );
    expect(found).toEqual([]);
  });

  it("reports INCONCLUSIVE rather than clean when the count cannot be read", async () => {
    // "could not check" is not "checked and fine". This is the distinction the battery was
    // missing when it fell back to a hardcoded revenue figure.
    const found = await collectFindings(
      [{ where: "service:resend", text: "`resend_webhook_event` is EMPTY" }],
      deps({ tableCount: async () => null })
    );
    expect(found[0]?.severity).toBe("inconclusive");
  });

  it("warns on a measurement older than the staleness window, not a fresh one", async () => {
    const stale = await collectFindings(
      [{ where: "tool:x", text: "Measured 2026-01-01: the window is wide." }],
      deps()
    );
    expect(stale.find((f) => f.severity === "warn")?.detail).toContain("days ago");

    const fresh = await collectFindings(
      [{ where: "tool:x", text: "Measured 2026-09-10: the window is wide." }],
      deps()
    );
    expect(fresh.filter((f) => f.severity === "warn")).toEqual([]);
  });
});
