import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * With no Redis the limiter falls back to memory and says so once per process. On real
 * production that is an incident (an error, which reaches the ops channel). On a preview
 * deployment such as staging it is the expected state, and on 2026-09-29 it was posting a
 * mislabelled "api_5xx" to #brain on every cold start during the persona walks.
 */
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
vi.mock("@shared/observability/logger", () => ({ default: logger }));

async function limitOnce(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
  const { checkRateLimit } = await import("@shared/http/ratelimit");
  await checkRateLimit("203.0.113.9", { bucket: "missing-store-test", limit: 5, windowMs: 60_000 });
}

describe("the limiter with no Redis", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    logger.warn.mockClear();
    logger.error.mockClear();
  });

  const noStore = { KV_REST_API_URL: "", KV_REST_API_TOKEN: "" };

  it("is an error on production", async () => {
    await limitOnce({ ...noStore, NODE_ENV: "production", VERCEL_ENV: "production" });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("is an error on a production build outside Vercel too", async () => {
    await limitOnce({ ...noStore, NODE_ENV: "production", VERCEL_ENV: undefined });
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it("is only a warning on a preview deployment such as staging", async () => {
    await limitOnce({ ...noStore, NODE_ENV: "production", VERCEL_ENV: "preview" });
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});
