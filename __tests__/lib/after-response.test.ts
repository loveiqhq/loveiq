import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAfter, mockLogger } = vi.hoisted(() => ({
  mockAfter: vi.fn(),
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("next/server", () => ({
  after: (...args: unknown[]) => mockAfter(...args),
}));

vi.mock("../../lib/logger", () => ({
  default: mockLogger,
}));

import { scheduleAfterResponse } from "../../lib/after-response";

describe("scheduleAfterResponse", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("registers an awaitable callback with Next.js after()", async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    let registered: (() => unknown) | undefined;

    mockAfter.mockImplementation((fn: () => unknown) => {
      registered = fn;
    });

    scheduleAfterResponse("test-task", task);

    expect(mockAfter).toHaveBeenCalledTimes(1);
    expect(registered).toBeTypeOf("function");

    const result = registered?.();
    expect(result).toBeInstanceOf(Promise);
    await result;

    expect(task).toHaveBeenCalledTimes(1);
  });

  it("falls back and logs when the runtime cannot register after() work", async () => {
    mockAfter.mockImplementation(() => {
      throw new Error("after unavailable");
    });

    const taskError = new Error("boom");
    const task = vi.fn().mockRejectedValue(taskError);

    scheduleAfterResponse("fallback-task", task);

    await Promise.resolve();
    await Promise.resolve();

    expect(task).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: taskError, taskName: "fallback-task" },
      "Post-response task failed"
    );
  });
});
