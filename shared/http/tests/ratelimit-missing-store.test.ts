import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * With no Redis the limiter falls back to memory and says so once per process. On real
 * production that is an incident (an error, which reaches the ops channel). On the staging
 * project it is the expected state, and it posted a mislabelled "api_5xx" on every cold
 * start twice: from staging.loveiq.org, a preview, on 2026-09-29, and from that project's
 * build of main, a production deployment, eight times on 2026-10-04.
 */
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
vi.mock("@shared/observability/logger", () => ({ default: logger }));

async function limitOnce(env: Record<string, string | undefined>) {
  vi.resetModules();
  // CI runs these tests in GitHub Actions itself, so its own flag must not leak in.
  for (const [k, v] of Object.entries({ GITHUB_ACTIONS: undefined, ...env })) {
    vi.stubEnv(k, v as string);
  }
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
  const prod = { NEXT_PUBLIC_SITE_URL: "https://www.loveiq.org" };
  const staging = { NEXT_PUBLIC_SITE_URL: "https://staging.loveiq.org" };

  it("is an error on production", async () => {
    await limitOnce({ ...noStore, ...prod, NODE_ENV: "production", VERCEL_ENV: "production" });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("is an error on a production build outside Vercel too", async () => {
    await limitOnce({ ...noStore, ...prod, NODE_ENV: "production", VERCEL_ENV: undefined });
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it("is only a warning on a preview deployment such as staging", async () => {
    await limitOnce({ ...noStore, ...staging, NODE_ENV: "production", VERCEL_ENV: "preview" });
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("is only a warning in development, even with production's address", async () => {
    await limitOnce({ ...noStore, ...prod, NODE_ENV: "development", VERCEL_ENV: undefined });
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("is only a warning on the staging project's build of main, a production deployment", async () => {
    await limitOnce({ ...noStore, ...staging, NODE_ENV: "production", VERCEL_ENV: "production" });
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  // The brain jobs run the routes in GitHub Actions with production's address and no Redis.
  it("is only a warning in GitHub Actions, even with production's address", async () => {
    await limitOnce({ ...noStore, ...prod, NODE_ENV: "production", GITHUB_ACTIONS: "true" });
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});
