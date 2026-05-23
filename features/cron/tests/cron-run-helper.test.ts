import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockFetch = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetch(...args),
}));

import { recordCronRun } from "@shared/observability/slack-alert-dedup";

const ORIGINAL_URL = process.env.SUPABASE_URL;
const ORIGINAL_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe("recordCronRun", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    process.env.SUPABASE_URL = "https://supabase.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  });

  afterEach(() => {
    if (ORIGINAL_URL === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = ORIGINAL_URL;
    if (ORIGINAL_KEY === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINAL_KEY;
  });

  it("noop's silently when env vars are unset (dev/local)", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    await expect(recordCronRun("test-cron", Date.now() - 1000, "success")).resolves.toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("posts to /rest/v1/cron_run with the correct payload on success", async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const start = Date.now() - 2500;
    await recordCronRun("nurture-sequence", start, "success");
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://supabase.test/rest/v1/cron_run");
    const body = JSON.parse((opts as { body: string }).body);
    expect(body.cron_name).toBe("nurture-sequence");
    expect(body.status).toBe("success");
    expect(body.duration_ms).toBeGreaterThanOrEqual(2000);
    expect(body.error_message).toBeUndefined();
  });

  it("includes error_message (truncated to 1000 chars) when status is error", async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const longErr = "x".repeat(5000);
    await recordCronRun("nurture-sequence", Date.now(), "error", longErr);
    const body = JSON.parse((mockFetch.mock.calls[0]![1] as { body: string }).body);
    expect(body.status).toBe("error");
    expect(body.error_message).toBeDefined();
    expect((body.error_message as string).length).toBe(1000);
  });

  it("swallows non-2xx responses without throwing", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    await expect(recordCronRun("nurture-sequence", Date.now(), "success")).resolves.toBeUndefined();
  });

  it("swallows network errors without throwing", async () => {
    mockFetch.mockRejectedValue(new Error("network down"));
    await expect(recordCronRun("nurture-sequence", Date.now(), "success")).resolves.toBeUndefined();
  });
});
