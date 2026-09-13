import { describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// No request context in a unit test, so `after()` throws and scheduleAfterResponse
// takes its detached fallback path — which is the path under test.
import { flushAfterResponse, scheduleAfterResponse } from "@shared/http/after-response";

describe("detached post-response work must not leak into whatever runs next", () => {
  /**
   * THE FLAKY SUITE THIS EXISTS FOR.
   *
   * `after()` throws outside a request, so the fallback runs the task with `void
   * run()` — fire and forget. The caller returns immediately and the task finishes
   * later, i.e. during some LATER test. Observed 2026-08-31 as five tests failing one
   * full run and passing both in isolation and on re-run: "expected 3 times, but got
   * 4" in survey-notifications, "expected 2 times, but got 3" in
   * funnel-digest-handler, "expected not to be called, called 1 time" in
   * anomaly-watcher.
   */
  it("has not necessarily finished when the scheduler returns", async () => {
    let done = false;
    scheduleAfterResponse("slow", async () => {
      await new Promise((r) => setTimeout(r, 20));
      done = true;
    });
    // This is the leak: the work is still outstanding right now.
    expect(done).toBe(false);
    await flushAfterResponse();
    expect(done).toBe(true);
  });

  it("waits for every outstanding task, not just one", async () => {
    const finished: string[] = [];
    for (const name of ["a", "b", "c"]) {
      scheduleAfterResponse(name, async () => {
        await new Promise((r) => setTimeout(r, 10));
        finished.push(name);
      });
    }
    await flushAfterResponse();
    expect(finished.sort()).toEqual(["a", "b", "c"]);
  });

  it("waits for work a task schedules while draining", async () => {
    // A task that schedules another must not slip past the drain, or the second one
    // lands in the next test exactly as before.
    const order: string[] = [];
    scheduleAfterResponse("outer", async () => {
      await new Promise((r) => setTimeout(r, 5));
      order.push("outer");
      scheduleAfterResponse("inner", async () => {
        await new Promise((r) => setTimeout(r, 5));
        order.push("inner");
      });
    });
    await flushAfterResponse();
    expect(order).toEqual(["outer", "inner"]);
  });

  it("a throwing task still settles, so one failure cannot wedge the drain", async () => {
    scheduleAfterResponse("boom", async () => {
      throw new Error("nope");
    });
    await expect(flushAfterResponse()).resolves.toBeUndefined();
  });
});
