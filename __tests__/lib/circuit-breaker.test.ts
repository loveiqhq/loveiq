import { describe, it, expect, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { getBreaker, CircuitOpenError } from "@shared/http/circuit-breaker";

// Each test uses a unique breaker name to get a fresh instance from the module singleton.

describe("CircuitBreaker", () => {
  it("fires function and returns result in closed state", async () => {
    const breaker = getBreaker("cb-closed-ok");
    const result = await breaker.fire(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it("rethrows error and stays closed when below failure threshold", async () => {
    const breaker = getBreaker("cb-below-thresh", { failureThreshold: 3, resetTimeout: 60000 });
    await expect(breaker.fire(() => Promise.reject(new Error("single fail")))).rejects.toThrow(
      "single fail"
    );
    // Still closed — one failure is below the threshold of 3
    const result = await breaker.fire(() => Promise.resolve("still works"));
    expect(result).toBe("still works");
  });

  it("opens circuit after failureThreshold consecutive failures", async () => {
    const breaker = getBreaker("cb-opens", { failureThreshold: 2, resetTimeout: 60000 });
    for (let i = 0; i < 2; i++) {
      await breaker.fire(() => Promise.reject(new Error("fail"))).catch(() => {});
    }
    await expect(breaker.fire(() => Promise.resolve("should not run"))).rejects.toBeInstanceOf(
      CircuitOpenError
    );
  });

  it("throws CircuitOpenError with service name in message when open", async () => {
    const breaker = getBreaker("cb-open-msg", { failureThreshold: 1, resetTimeout: 60000 });
    await breaker.fire(() => Promise.reject(new Error("trip"))).catch(() => {});
    const err = await breaker.fire(() => Promise.resolve()).catch((e) => e);
    expect(err).toBeInstanceOf(CircuitOpenError);
    expect(err.message).toContain("cb-open-msg");
  });

  it("transitions to half-open after resetTimeout and allows probe request", async () => {
    const breaker = getBreaker("cb-half-open", { failureThreshold: 1, resetTimeout: 0 });
    await breaker.fire(() => Promise.reject(new Error("trip"))).catch(() => {});
    // resetTimeout: 0 means the circuit immediately allows a probe on the next call
    const result = await breaker.fire(() => Promise.resolve("probe ok"));
    expect(result).toBe("probe ok");
  });

  it("closes circuit after successful half-open probe", async () => {
    const breaker = getBreaker("cb-recovers", { failureThreshold: 1, resetTimeout: 0 });
    await breaker.fire(() => Promise.reject(new Error("trip"))).catch(() => {});
    // Probe succeeds → circuit closes
    await breaker.fire(() => Promise.resolve("probe"));
    // Subsequent calls work normally
    const result = await breaker.fire(() => Promise.resolve("normal"));
    expect(result).toBe("normal");
  });

  it("rethrows error during half-open probe failure", async () => {
    const breaker = getBreaker("cb-reopen", { failureThreshold: 1, resetTimeout: 0 });
    await breaker.fire(() => Promise.reject(new Error("initial trip"))).catch(() => {});
    // Half-open probe fails — error propagates
    await expect(breaker.fire(() => Promise.reject(new Error("probe fail")))).rejects.toThrow(
      "probe fail"
    );
  });

  it("CircuitOpenError has correct name property", () => {
    const err = new CircuitOpenError("my-service");
    expect(err.name).toBe("CircuitOpenError");
    expect(err.message).toContain("my-service");
  });
});
