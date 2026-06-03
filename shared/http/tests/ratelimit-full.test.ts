import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock logger before importing ratelimit
vi.mock("@shared/observability/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock @upstash/redis
const mockIncr = vi.fn();
const mockExpire = vi.fn();
const mockEval = vi.fn();
const mockSet = vi.fn();
const mockTtl = vi.fn();

vi.mock("@upstash/redis", () => {
  return {
    Redis: class MockRedis {
      incr = mockIncr;
      expire = mockExpire;
      eval = mockEval;
      set = mockSet;
      ttl = mockTtl;
    },
  };
});

// Set KV env vars so Redis client is created
process.env.KV_REST_API_URL = "https://test-redis.upstash.io";
process.env.KV_REST_API_TOKEN = "test-token";

// Import after mocks are set up
const { checkRateLimit, checkCooldown } = await import("@shared/http/ratelimit");

describe("checkRateLimit (Redis)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows request when under limit", async () => {
    // [Audit L2] INCR + EXPIRE now run as one atomic Lua eval, not two calls.
    mockEval.mockResolvedValue(1);

    const result = await checkRateLimit("1.2.3.4", {
      bucket: "test",
      limit: 5,
      windowMs: 60000,
    });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    // Atomic script: (script, [key], [windowSec]). TTL is set inside the script.
    expect(mockEval).toHaveBeenCalledWith(expect.any(String), ["rl:test:1.2.3.4"], [60]);
    // No separate expire round-trip — the script can't leave a key TTL-less.
    expect(mockExpire).not.toHaveBeenCalled();
  });

  it("sets/refreshes the TTL inside the atomic eval (count > 1) [Audit L2]", async () => {
    mockEval.mockResolvedValue(3);

    const result = await checkRateLimit("1.2.3.4", {
      bucket: "test",
      limit: 5,
      windowMs: 60000,
    });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
    // TTL handling lives in the Lua script (TTL<0 ⇒ EXPIRE), so a poisoned,
    // TTL-less key self-heals; there is never a separate JS expire call.
    expect(mockExpire).not.toHaveBeenCalled();
  });

  it("blocks request when over limit", async () => {
    mockEval.mockResolvedValue(6);

    const result = await checkRateLimit("1.2.3.4", {
      bucket: "test",
      limit: 5,
      windowMs: 60000,
    });

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("fails open on Redis error", async () => {
    mockEval.mockRejectedValue(new Error("Redis connection failed"));

    const result = await checkRateLimit("1.2.3.4", {
      bucket: "test-error",
      limit: 5,
      windowMs: 60000,
    });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(5);
  });

  it("returns a valid resetAt date", async () => {
    mockEval.mockResolvedValue(1);
    const before = Date.now();

    const result = await checkRateLimit("1.2.3.4", {
      bucket: "test-reset",
      limit: 5,
      windowMs: 60000,
    });

    expect(result.resetAt.getTime()).toBeGreaterThanOrEqual(before);
  });
});

describe("checkCooldown (Redis)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows when cooldown has passed (SET NX returns OK)", async () => {
    mockSet.mockResolvedValue("OK");

    const result = await checkCooldown("test@example.com", "waitlist-email", 60000);

    expect(result.allowed).toBe(true);
    expect(result.retryAfterMs).toBe(0);
    expect(mockSet).toHaveBeenCalledWith("cd:waitlist-email:test@example.com", expect.any(Number), {
      nx: true,
      ex: 60,
    });
  });

  it("blocks when cooldown is active (SET NX returns null)", async () => {
    mockSet.mockResolvedValue(null);
    mockTtl.mockResolvedValue(45);

    const result = await checkCooldown("test@example.com", "waitlist-email", 60000);

    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBe(45000);
  });

  it("uses cooldownMs as fallback when TTL is non-positive", async () => {
    mockSet.mockResolvedValue(null);
    mockTtl.mockResolvedValue(-1);

    const result = await checkCooldown("test@example.com", "waitlist-email", 60000);

    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBe(60000);
  });

  it("fails open on Redis error", async () => {
    mockSet.mockRejectedValue(new Error("Redis connection failed"));

    const result = await checkCooldown("test@example.com", "waitlist-email", 60000);

    expect(result.allowed).toBe(true);
    expect(result.retryAfterMs).toBe(0);
  });
});
