import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mockGet }),
}));

import { stampLandingArm } from "@shared/experiments/stampArm";
import { LANDING_VARIANT_COOKIE } from "@shared/experiments/landingVariant";

/** Set the landing-arm cookie to `value`, or clear it when null. */
function cookie(value: string | null) {
  mockGet.mockImplementation((name: string) =>
    name === LANDING_VARIANT_COOKIE && value !== null ? { value } : undefined
  );
}

const parse = (s: string | null) => JSON.parse(s ?? "null");

describe("stampLandingArm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookie(null);
  });

  it("stamps the arm from the cookie onto an existing tracker", async () => {
    cookie("white_prev");
    const out = await stampLandingArm('{"utm_source":"google","gclid":"abc"}');
    expect(parse(out)).toEqual({
      utm_source: "google",
      gclid: "abc",
      landing_variant: "white_prev",
    });
  });

  it("stamps onto an absent tracker too", async () => {
    // The drop-out case that matters: someone who arrived with no UTMs at all
    // still belongs to an arm, and a draft save is the only row they will leave.
    cookie("white");
    expect(parse(await stampLandingArm(null))).toEqual({ landing_variant: "white" });
  });

  it("does not let the body assert an arm the cookie does not confirm", async () => {
    /**
     * `utm_tracker` is assembled in the browser and posted verbatim. A crafted
     * body naming its own arm is a WELL-FORMED lie — `armLabel`'s own-property
     * guard stops `__proto__` reaching the digest, but it cannot tell a real
     * "white" from a claimed one. So the key is stripped and only re-added from
     * the cookie.
     */
    cookie(null);
    const out = await stampLandingArm('{"utm_source":"google","landing_variant":"white"}');
    expect(parse(out)).toEqual({ utm_source: "google" });
    expect(out).not.toContain("landing_variant");
  });

  it("the cookie overrules a conflicting claim in the body", async () => {
    cookie("white_prev");
    const out = await stampLandingArm('{"landing_variant":"white"}');
    expect(parse(out)).toEqual({ landing_variant: "white_prev" });
  });

  it("ignores a cookie value that is not a real arm", async () => {
    // Includes the prototype keys that reach armLabel from a crafted client.
    for (const bogus of ["", "purple", "__proto__", "constructor", "toString"]) {
      cookie(bogus);
      expect(parse(await stampLandingArm('{"utm_source":"x"}')), bogus).toEqual({
        utm_source: "x",
      });
    }
  });

  it("leaves a tracker that is not a JSON object exactly as it was", async () => {
    cookie("white");
    for (const junk of ["not json at all", "[1,2,3]", '"a string"', "42"]) {
      expect(await stampLandingArm(junk), junk).toBe(junk);
    }
  });

  it("returns the original rather than a truncated blob when over budget", async () => {
    /**
     * `utm_tracker` is bounded at 1000 chars by the route schema and the column is
     * `text`. A merged blob that would exceed it must not be cut in half — a
     * truncated JSON string is unparseable, which loses the UTMs as well as the
     * arm it was trying to add.
     */
    cookie("white");
    const big = JSON.stringify({ utm_term: "x".repeat(970) });
    expect(big.length).toBeGreaterThan(960);
    expect(big.length).toBeLessThanOrEqual(1000);
    const out = await stampLandingArm(big);
    expect(out).toBe(big);
    expect(() => JSON.parse(out!)).not.toThrow();
  });

  it("still strips a claimed arm when the merged blob would not fit", async () => {
    /**
     * THE BUG THIS REPLACED. The over-budget path used to fall back to `tracker`
     * — the caller's original, claim included — so the anti-spoof strip defeated
     * itself at precisely the input designed to defeat it.
     *
     * utmTracker is `z.string().max(1000)` in both routes, so a ~997-character
     * body is accepted. Adding a 10-character arm to it exceeds 1000, the
     * fallback fires, and the client's own claim is stored as fact for a user the
     * server had assigned to the other arm.
     */
    cookie("white_prev");
    /**
     * The padding has to sit in a narrow window, and getting it wrong makes this
     * test measure nothing.
     *
     * First written with 950 x's: padded 991, merged 996 — UNDER budget, so the
     * over-budget branch never ran and the test passed against the very bug it
     * describes. A mutation run caught it. The window is 955..959; 958 gives
     * padded 999 (accepted by the route's z.string().max(1000)) and merged 1004.
     *
     * The two assertions below PIN that window, so a future edit to the arm
     * names or the key set fails loudly instead of going quietly vacuous.
     */
    const PAD = 958;
    const padded = JSON.stringify({ landing_variant: "white", utm_term: "x".repeat(PAD) });
    const wouldMergeTo = JSON.stringify({
      utm_term: "x".repeat(PAD),
      landing_variant: "white_prev",
    });
    expect(padded.length, "must be accepted by the route schema").toBeLessThanOrEqual(1000);
    expect(
      wouldMergeTo.length,
      "must exceed the budget, or this test exercises the wrong branch"
    ).toBeGreaterThan(1000);

    const out = await stampLandingArm(padded);
    const parsed_ = parse(out);
    // The claim is gone even though the real arm could not be added.
    expect(parsed_.landing_variant).toBeUndefined();
    // The blob is still valid and still within budget.
    expect(out!.length).toBeLessThanOrEqual(1000);
    expect(() => JSON.parse(out!)).not.toThrow();
    // And the rest of the tracker survived.
    expect(parsed_.utm_term).toBe("x".repeat(PAD));
  });

  it("treats an empty-string tracker as absence, not as a tracker", async () => {
    /**
     * Both routes wrote `utmTracker || null` before this helper existed, so `""`
     * stored NULL. `?? null` would store `''`, and every `utm_tracker IS NOT NULL`
     * count in the analytics layer would quietly begin counting empty strings —
     * including the non-null figure this whole change was reasoned from.
     */
    cookie(null);
    expect(await stampLandingArm("")).toBeNull();
    // With a cookie it becomes a real tracker carrying just the arm.
    cookie("white");
    expect(parse(await stampLandingArm(""))).toEqual({ landing_variant: "white" });
  });

  it("leaves the blob byte-identical when there is nothing to do", async () => {
    // No cookie and no claim: not even re-serialised, so key order and spacing
    // survive and a diff of stored rows stays meaningful.
    cookie(null);
    const original = '{"utm_source":"google",  "utm_medium":"cpc"}';
    expect(await stampLandingArm(original)).toBe(original);
  });

  it("treats a missing request scope as no arm, not as an error", async () => {
    // cookies() throws outside a request — a unit test calling POST directly.
    mockGet.mockImplementation(() => {
      throw new Error("called outside a request scope");
    });
    await expect(stampLandingArm('{"utm_source":"x"}')).resolves.toBe('{"utm_source":"x"}');
  });

  it("still strips a claimed arm when there is no request scope", async () => {
    // The stripping must not depend on the cookie read succeeding, or the spoof
    // survives in exactly the environment where no cookie can contradict it.
    mockGet.mockImplementation(() => {
      throw new Error("called outside a request scope");
    });
    expect(parse(await stampLandingArm('{"landing_variant":"white"}'))).toEqual({});
  });
});
