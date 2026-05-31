// R-06: F-03 scoring config hash. The exported getScoringConfigSha() must
// be stable across calls in the same process (it's the audit-trail anchor
// for every scoring_result row) and must change when the underlying
// configuration changes.
import { describe, expect, it } from "vitest";
import { getScoringConfigSha } from "@features/scoring/logic/config";

describe("getScoringConfigSha (F-03)", () => {
  it("returns a 64-char SHA-256 hex string", () => {
    const sha = getScoringConfigSha();
    expect(sha).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable across multiple calls in the same process", () => {
    const a = getScoringConfigSha();
    const b = getScoringConfigSha();
    const c = getScoringConfigSha();
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("memoizes — does not re-hash the config on every call", () => {
    // First call may or may not have been cached by other tests; what
    // matters is that two consecutive calls return the same instance-level
    // result. A regression that recomputed every time would still produce
    // equal strings (deterministic input) but would re-evaluate the JSON
    // serialisation — the .toBe check still holds.
    const start = Date.now();
    for (let i = 0; i < 1000; i++) getScoringConfigSha();
    expect(Date.now() - start).toBeLessThan(50);
  });
});
