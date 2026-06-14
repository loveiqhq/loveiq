import { describe, expect, it, vi, beforeEach } from "vitest";
import { isEmailSuppressed, addToSuppression } from "@shared/emails/suppression";

vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: vi.fn(),
}));

vi.mock("@shared/observability/logger", () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";

const mockFetch = vi.mocked(fetchWithTimeout);

const ENV = {
  SUPABASE_URL: "https://db.example.com",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
};

beforeEach(() => {
  vi.resetAllMocks();
  process.env.SUPABASE_URL = ENV.SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY;
});

describe("isEmailSuppressed", () => {
  it("returns true when a row exists in the suppression table", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ email: "bad@example.com" }],
    } as Response);

    expect(await isEmailSuppressed("bad@example.com")).toBe(true);
  });

  it("returns false when no row is found", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as Response);

    expect(await isEmailSuppressed("good@example.com")).toBe(false);
  });

  it("returns false (fail-open) when fetch throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));

    expect(await isEmailSuppressed("any@example.com")).toBe(false);
  });

  it("returns false (fail-open) when response is not ok", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false } as Response);

    expect(await isEmailSuppressed("any@example.com")).toBe(false);
  });

  it("returns false immediately when env vars are missing", async () => {
    delete process.env.SUPABASE_URL;

    expect(await isEmailSuppressed("x@example.com")).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("addToSuppression", () => {
  it("POSTs to the suppression table with correct body", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true } as Response);

    await addToSuppression("bounce@example.com", "hard_bounce");

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("/rest/v1/email_suppression");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toMatchObject({
      email: "bounce@example.com",
      reason: "hard_bounce",
    });
  });

  it("includes source_campaign/source_channel when opts are provided", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true } as Response);

    await addToSuppression("u@example.com", "unsubscribed", {
      campaign: "30h_no_unlock",
      channel: "one-click",
    });

    const [, init] = mockFetch.mock.calls[0];
    expect(JSON.parse(init?.body as string)).toMatchObject({
      email: "u@example.com",
      reason: "unsubscribed",
      source_campaign: "30h_no_unlock",
      source_channel: "one-click",
    });
  });

  it("omits source columns when no opts (bounce/complaint never clobber attribution)", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true } as Response);

    await addToSuppression("bounce@example.com", "hard_bounce");

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body).not.toHaveProperty("source_campaign");
    expect(body).not.toHaveProperty("source_channel");
  });

  it("omits an empty-string campaign (e.g. a footer link with no src)", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true } as Response);

    await addToSuppression("u@example.com", "unsubscribed", { campaign: "", channel: "footer" });

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body).not.toHaveProperty("source_campaign");
    expect(body.source_channel).toBe("footer");
  });

  it("does nothing when env vars are missing", async () => {
    delete process.env.SUPABASE_URL;
    await addToSuppression("x@example.com", "complaint");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("logs error but does not throw on fetch failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("db down"));
    await expect(addToSuppression("x@example.com", "unsubscribed")).resolves.toBeUndefined();
  });
});
