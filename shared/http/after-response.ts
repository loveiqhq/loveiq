import { after } from "next/server";
import logger from "@shared/observability/logger";

/**
 * Tasks started by the no-request-context fallback below.
 *
 * In production `after()` owns the work and this stays empty. Outside a request —
 * unit tests, one-off scripts — `after()` throws and we fall back to running the
 * task detached. Detached work does not stop existing when the caller returns: it
 * lands on whatever runs next.
 *
 * That was the cause of a genuinely flaky suite. A survey POST schedules its Slack
 * notification this way, so the send completed DURING THE NEXT TEST and inflated its
 * mock counts — observed as "expected 3 times, but got 4", "expected 2 times, but got
 * 3", and "expected not to be called, called 1 time" across survey-notifications,
 * funnel-digest-handler and anomaly-watcher. Order- and timing-dependent, so it
 * passed in isolation and on a re-run, and a suite that reds at random is a suite
 * whose red gets ignored.
 */
const pending = new Set<Promise<void>>();

export function scheduleAfterResponse(taskName: string, fn: () => Promise<void>): void {
  const run = async () => {
    try {
      await fn();
    } catch (err) {
      logger.error({ err, taskName }, "Post-response task failed");
    }
  };

  try {
    after(run);
  } catch {
    const task = run().finally(() => {
      pending.delete(task);
    });
    pending.add(task);
  }
}

/**
 * Await every task the fallback path started. Called from the global test
 * `afterEach`, so each test's detached work settles before the next one begins.
 *
 * Loops rather than awaiting once, because a task may schedule another.
 */
export async function flushAfterResponse(): Promise<void> {
  while (pending.size > 0) {
    await Promise.all([...pending]);
  }
}
