import { describe, expect, it, vi, beforeEach } from "vitest";
import { isEmailSuppressed, addToSuppression } from "@shared/emails/suppression";

vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: vi.fn(),
}));

vi.mock("@shared/observability/logger", () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { mockContactsUpdate } = vi.hoisted(() => ({ mockContactsUpdate: vi.fn() }));
vi.mock("resend", () => ({
  Resend: class {
    contacts = { update: mockContactsUpdate };
  },
}));

import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";

const mockFetch = vi.mocked(fetchWithTimeout);

const ENV = {
  SUPABASE_URL: "https://db.example.com",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
};

beforeEach(() => {
  vi.resetAllMocks();
  process.env.SUPABASE_URL = ENV.SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_AUDIENCE_ID;
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

  it("ifAbsent inserts without touching an existing row", async () => {
    // One statement (ON CONFLICT DO NOTHING), so a refused send recorded as a
    // bounce can never relabel a complaint, even when both land at once.
    mockFetch.mockResolvedValueOnce({ ok: true } as Response);
    await addToSuppression("c@example.com", "hard_bounce", { ifAbsent: true });
    const [, init] = mockFetch.mock.calls[0];
    expect((init?.headers as Record<string, string>).Prefer).toBe("resolution=ignore-duplicates");
    expect(JSON.parse(init?.body as string)).toEqual({
      email: "c@example.com",
      reason: "hard_bounce",
    });
  });

  it("without ifAbsent, a later write still merges into the existing row", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true } as Response);
    await addToSuppression("c@example.com", "hard_bounce");
    const [, init] = mockFetch.mock.calls[0];
    expect((init?.headers as Record<string, string>).Prefer).toBe("resolution=merge-duplicates");
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

describe("addToSuppression → Resend (R-05)", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_AUDIENCE_ID = "aud_test";
    mockFetch.mockResolvedValue({ ok: true } as Response);
  });

  it("marks the contact unsubscribed, which covers every list", async () => {
    mockContactsUpdate.mockResolvedValue({ data: { id: "c1" }, error: null });
    await addToSuppression("u@example.com", "unsubscribed");
    expect(mockContactsUpdate).toHaveBeenCalledWith({ email: "u@example.com", unsubscribed: true });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("stays quiet when the address was never a contact", async () => {
    mockContactsUpdate.mockResolvedValue({
      data: null,
      error: { name: "not_found", message: "Contact not found", statusCode: 404 },
    });
    await addToSuppression("u@example.com", "hard_bounce");
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("logs any other error, which the SDK returns instead of throwing", async () => {
    mockContactsUpdate.mockResolvedValue({
      data: null,
      error: { name: "application_error", message: "boom", statusCode: 500 },
    });
    await addToSuppression("u@example.com", "complaint");
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ name: "application_error" }) }),
      "Failed to unsubscribe email in Resend"
    );
  });

  it("still unsubscribes when no marketing list is configured: a contact outlives the config", async () => {
    delete process.env.RESEND_AUDIENCE_ID;
    mockContactsUpdate.mockResolvedValue({ data: { id: "c1" }, error: null });
    await addToSuppression("u@example.com", "unsubscribed");
    expect(mockContactsUpdate).toHaveBeenCalledWith({ email: "u@example.com", unsubscribed: true });
  });

  it("does nothing in Resend without an API key", async () => {
    delete process.env.RESEND_API_KEY;
    await addToSuppression("u@example.com", "unsubscribed");
    expect(mockContactsUpdate).not.toHaveBeenCalled();
  });
});
