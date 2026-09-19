import { describe, expect, it } from "vitest";

import {
  maxDuration,
  FAST_BUDGET_MS,
  EMBED_DEADLINE_MS,
  EMBED_WORST_BATCH_MS,
} from "@/app/api/cron/brain-fast/route";

/**
 * Embedding runs LAST, so on the shared budget it gets whatever the eight ingesters
 * before it did not use. That is fine until one of them has a backlog — and a
 * builder-version bump creates exactly that: on 2026-09-19 slack went to v9 and every
 * indexed day became stale at once, so its walk eats the remaining clock for hours.
 * An unembedded chunk loses up to 2.4 of its score, degrading retrieval across EVERY
 * source to keep one source fresher.
 */
describe("brain-fast clock", () => {
  it("gives embedding a window the ingesters cannot consume", () => {
    expect(EMBED_DEADLINE_MS).toBeGreaterThan(FAST_BUDGET_MS);
  });

  it("cannot start a batch it has no room to finish", () => {
    // The hazard this guards: a cron killed at its ceiling leaves NO cron_run row at
    // all, so the failure is invisible — side effects present, nothing to debug from.
    expect(EMBED_DEADLINE_MS + EMBED_WORST_BATCH_MS).toBeLessThan(maxDuration * 1000);
  });

  it("leaves the ingesters a real share of the clock", () => {
    // The other direction: reserving so much for embedding that nothing gets ingested
    // would be the same bug wearing the opposite face.
    expect(FAST_BUDGET_MS).toBeGreaterThanOrEqual(EMBED_DEADLINE_MS / 2);
  });
});
