import { after } from "next/server";
import logger from "@/lib/logger";

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
    void run();
  }
}
