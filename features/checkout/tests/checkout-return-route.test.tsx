import { describe, expect, it } from "vitest";
import Page from "@/app/checkout/return/page";

/** What /checkout/return hands its page from the query Stripe returns with. */
async function props(query: Record<string, string>) {
  const element = await Page({ searchParams: Promise.resolve(query) });
  return element.props as { planId: string; archetype: string | null; token: string | null };
}

describe("/checkout/return", () => {
  it("keeps plan=initial, the EUR 1.99 Core Archetype, rather than reading it as the full report", async () => {
    expect(
      await props({ plan: "initial", session_id: "cs_1", token: "rpt_ABCDEFGHIJKLMNOPQRST" })
    ).toMatchObject({ planId: "initial", archetype: null, token: "rpt_ABCDEFGHIJKLMNOPQRST" });
  });

  it("still falls back to the full report for a plan it doesn't know", async () => {
    expect(await props({ plan: "made_up", session_id: "cs_1" })).toMatchObject({
      planId: "full_report",
    });
  });
});
