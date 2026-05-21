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
const mockSet = vi.fn();
const mockTtl = vi.fn();

vi.mock("@upstash/redis", () => {
  return {
    Redis: class MockRedis {
      incr = mockIncr;
      expire = mockExpire;
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
    mockIncr.mockResolvedValue(1);
    mockExpire.mockResolvedValue(1);

    const result = await checkRateLimit("1.2.3.4", {
      bucket: "test",
      limit: 5,
      windowMs: 60000,
    });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    expect(mockIncr).toHaveBeenCalledWith("rl:test:1.2.3.4");
    // First request sets expiry
    expect(mockExpire).toHaveBeenCalledWith("rl:test:1.2.3.4", 60);
  });

  it("sets expiry only on first request in window", async () => {
    mockIncr.mockResolvedValue(3);

    const result = await checkRateLimit("1.2.3.4", {
      bucket: "test",
      limit: 5,
      windowMs: 60000,
    });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
    // count > 1, so expire should NOT be called
    expect(mockExpire).not.toHaveBeenCalled();
  });

  it("blocks request when over limit", async () => {
    mockIncr.mockResolvedValue(6);

    const result = await checkRateLimit("1.2.3.4", {
      bucket: "test",
      limit: 5,
      windowMs: 60000,
    });

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("fails open on Redis error", async () => {
    mockIncr.mockRejectedValue(new Error("Redis connection failed"));

    const result = await checkRateLimit("1.2.3.4", {
      bucket: "test-error",
      limit: 5,
      windowMs: 60000,
    });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(5);
  });

  it("returns a valid resetAt date", async () => {
    mockIncr.mockResolvedValue(1);
    mockExpire.mockResolvedValue(1);
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
