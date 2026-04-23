import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockVerifyCsrf = vi.fn<() => Promise<boolean>>();
vi.mock("../../lib/csrf", () => ({
  verifyCsrfToken: (...args: unknown[]) => mockVerifyCsrf(...(args as [])),
}));

const mockCheckRateLimit = vi.fn();
const mockGetClientIp = vi.fn();
vi.mock("../../lib/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: (...args: unknown[]) => mockGetClientIp(...args),
}));

const mockScheduleAfterResponse = vi.fn((_name: string, fn: () => Promise<void>) => {
  // Run immediately so email path is exercised in tests.
  void fn();
});
vi.mock("../../lib/after-response", () => ({
  scheduleAfterResponse: (...args: unknown[]) =>
    mockScheduleAfterResponse(args[0] as string, args[1] as () => Promise<void>),
}));

const mockResendSend = vi.fn().mockResolvedValue({ error: null });
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mockResendSend };
  },
}));

const mockResolveOwner = vi.fn();
const mockCreateShare = vi.fn();
const mockRevoke = vi.fn();
const mockListActive = vi.fn();
const mockGenerateToken = vi.fn();
vi.mock("../../lib/report/shareAccess", async () => {
  const actual = await vi.importActual<typeof import("../../lib/report/shareAccess")>(
    "../../lib/report/shareAccess"
  );
  return {
    ...actual,
    resolveOwnerFromAccessToken: (...args: unknown[]) => mockResolveOwner(...args),
    createReportShareViaRpc: (...args: unknown[]) => mockCreateShare(...args),
    revokeReportShare: (...args: unknown[]) => mockRevoke(...args),
    listActiveSharesForReport: (...args: unknown[]) => mockListActive(...args),
    generateShareToken: () => mockGenerateToken(),
  };
});

const mockGetPlan = vi.fn();
vi.mock("../../lib/report/planAccess", async () => {
  const actual = await vi.importActual<typeof import("../../lib/report/planAccess")>(
    "../../lib/report/planAccess"
  );
  return {
    ...actual,
    getReportPlanByPersonalReportId: (...args: unknown[]) => mockGetPlan(...args),
  };
});

process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
process.env.RESEND_API_KEY = "re_test_key";
process.env.NEXT_PUBLIC_SITE_URL = "https://loveiq.org";

import { POST, GET } from "../../app/api/report/share/route";
import { DELETE } from "../../app/api/report/share/[id]/route";

const VALID_OWNER_TOKEN = "rpt_abcdefghijklmnopqrst";
const VALID_SHARE_TOKEN = "rpts_abcdefghijklmnopqrst";

function postRequest(body: Record<string, unknown>) {
  return new Request("http://localhost:3000/api/report/share", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-csrf-token": "t" },
    body: JSON.stringify(body),
  });
}

function getRequest(ownerToken: string) {
  return new Request(
    `http://localhost:3000/api/report/share?ownerToken=${encodeURIComponent(ownerToken)}`
  );
}

function deleteRequest(id: string, body: Record<string, unknown>) {
  return new Request(`http://localhost:3000/api/report/share/${id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", "x-csrf-token": "t" },
    body: JSON.stringify(body),
  });
}

function allowCsrf() {
  mockVerifyCsrf.mockResolvedValue(true);
}
function allowRateLimit() {
  mockCheckRateLimit.mockResolvedValue({
    allowed: true,
    remaining: 9,
    resetAt: new Date(Date.now() + 60_000),
  });
}
function defaultOwner() {
  mockResolveOwner.mockResolvedValue({
    personalReportId: 99,
    submissionId: 42,
    ownerUserId: 7,
    ownerEmail: "owner@example.com",
    ownerFirstName: "Eman",
  });
}

describe("POST /api/report/share", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetClientIp.mockReturnValue("1.2.3.4");
    mockScheduleAfterResponse.mockImplementation((_n, fn) => {
      void fn();
    });
    mockGenerateToken.mockReturnValue(VALID_SHARE_TOKEN);
  });

  it("returns 403 on CSRF failure", async () => {
    mockVerifyCsrf.mockResolvedValue(false);
    const res = await POST(
      postRequest({ ownerToken: VALID_OWNER_TOKEN, recipientEmail: "r@x.io" })
    );
    expect(res.status).toBe(403);
  });

  it("returns 429 when rate-limit blocks", async () => {
    allowCsrf();
    mockCheckRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 30_000),
    });
    const res = await POST(
      postRequest({ ownerToken: VALID_OWNER_TOKEN, recipientEmail: "r@x.io" })
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeDefined();
  });

  it("returns 400 on invalid email", async () => {
    allowCsrf();
    allowRateLimit();
    const res = await POST(
      postRequest({ ownerToken: VALID_OWNER_TOKEN, recipientEmail: "not-an-email" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid owner-token format", async () => {
    allowCsrf();
    allowRateLimit();
    const res = await POST(postRequest({ ownerToken: "bogus", recipientEmail: "r@x.io" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when owner token does not match a report", async () => {
    allowCsrf();
    allowRateLimit();
    mockResolveOwner.mockResolvedValue(null);
    const res = await POST(
      postRequest({ ownerToken: VALID_OWNER_TOKEN, recipientEmail: "r@x.io" })
    );
    expect(res.status).toBe(404);
  });

  it("rejects sharing to owner's own email (400)", async () => {
    allowCsrf();
    allowRateLimit();
    defaultOwner();
    const res = await POST(
      postRequest({ ownerToken: VALID_OWNER_TOKEN, recipientEmail: "OWNER@example.com" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when plan is not shareable (essentials)", async () => {
    allowCsrf();
    allowRateLimit();
    defaultOwner();
    mockGetPlan.mockResolvedValue("essentials");
    const res = await POST(
      postRequest({ ownerToken: VALID_OWNER_TOKEN, recipientEmail: "r@x.io" })
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 when plan is null (unpaid)", async () => {
    allowCsrf();
    allowRateLimit();
    defaultOwner();
    mockGetPlan.mockResolvedValue(null);
    const res = await POST(
      postRequest({ ownerToken: VALID_OWNER_TOKEN, recipientEmail: "r@x.io" })
    );
    expect(res.status).toBe(403);
  });

  it("returns 409 on seat_limit_reached", async () => {
    allowCsrf();
    allowRateLimit();
    defaultOwner();
    mockGetPlan.mockResolvedValue("full_report");
    mockCreateShare.mockResolvedValue({ error: "seat_limit_reached", active: 2, limit: 2 });
    const res = await POST(
      postRequest({ ownerToken: VALID_OWNER_TOKEN, recipientEmail: "r@x.io" })
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/seat limit/i);
  });

  it("returns 409 on duplicate_recipient", async () => {
    allowCsrf();
    allowRateLimit();
    defaultOwner();
    mockGetPlan.mockResolvedValue("full_report");
    mockCreateShare.mockResolvedValue({ error: "duplicate_recipient" });
    const res = await POST(
      postRequest({ ownerToken: VALID_OWNER_TOKEN, recipientEmail: "r@x.io" })
    );
    expect(res.status).toBe(409);
  });

  it("happy path — 200 with share info and schedules email", async () => {
    allowCsrf();
    allowRateLimit();
    defaultOwner();
    mockGetPlan.mockResolvedValue("full_report");
    mockCreateShare.mockResolvedValue({
      ok: true,
      row: {
        id: 123,
        personal_report_id: 99,
        recipient_email: "r@x.io",
        share_token: VALID_SHARE_TOKEN,
        shared_by_user_id: 7,
        plan_at_share: "full_report",
        last_viewed_at: null,
        view_count: 0,
        revoked_at: null,
        created_at: "2026-04-23T00:00:00Z",
      },
    });

    const res = await POST(
      postRequest({ ownerToken: VALID_OWNER_TOKEN, recipientEmail: "r@x.io" })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.share).toEqual({
      id: 123,
      recipientEmail: "r@x.io",
      createdAt: "2026-04-23T00:00:00Z",
    });
    expect(json.seatLimit).toBe(2);

    // Email scheduled with correct share URL
    expect(mockScheduleAfterResponse).toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 0));
    expect(mockResendSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "r@x.io",
        subject: "A LoveIQ report has been shared with you",
      })
    );
  });

  it("forwards personalMessage to RPC and email", async () => {
    allowCsrf();
    allowRateLimit();
    defaultOwner();
    mockGetPlan.mockResolvedValue("full_report");
    mockCreateShare.mockResolvedValue({
      ok: true,
      row: {
        id: 555,
        personal_report_id: 99,
        recipient_email: "r@x.io",
        share_token: VALID_SHARE_TOKEN,
        shared_by_user_id: 7,
        plan_at_share: "full_report",
        last_viewed_at: null,
        view_count: 0,
        revoked_at: null,
        created_at: "2026-04-23T00:00:00Z",
      },
    });
    const personalMessage = "Hey, I wanted you to read this.";
    const res = await POST(
      postRequest({
        ownerToken: VALID_OWNER_TOKEN,
        recipientEmail: "r@x.io",
        personalMessage,
      })
    );
    expect(res.status).toBe(200);
    expect(mockCreateShare).toHaveBeenCalledWith(expect.objectContaining({ personalMessage }));
    await new Promise((r) => setTimeout(r, 0));
    const sentArg = mockResendSend.mock.calls[0]?.[0] as
      | { html?: string; text?: string }
      | undefined;
    expect(sentArg?.html).toContain(personalMessage);
    expect(sentArg?.text).toContain(personalMessage);
  });

  it("rejects personalMessage longer than 2000 chars (400)", async () => {
    allowCsrf();
    allowRateLimit();
    const res = await POST(
      postRequest({
        ownerToken: VALID_OWNER_TOKEN,
        recipientEmail: "r@x.io",
        personalMessage: "a".repeat(2001),
      })
    );
    expect(res.status).toBe(400);
  });

  it("lowercases recipient email before RPC call", async () => {
    allowCsrf();
    allowRateLimit();
    defaultOwner();
    mockGetPlan.mockResolvedValue("full_report");
    mockCreateShare.mockResolvedValue({
      ok: true,
      row: {
        id: 1,
        personal_report_id: 99,
        recipient_email: "mixed@example.io",
        share_token: VALID_SHARE_TOKEN,
        shared_by_user_id: 7,
        plan_at_share: "full_report",
        last_viewed_at: null,
        view_count: 0,
        revoked_at: null,
        created_at: "2026-04-23T00:00:00Z",
      },
    });
    await POST(postRequest({ ownerToken: VALID_OWNER_TOKEN, recipientEmail: "Mixed@Example.IO" }));
    expect(mockCreateShare).toHaveBeenCalledWith(
      expect.objectContaining({ recipientEmail: "mixed@example.io" })
    );
  });
});

describe("GET /api/report/share", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetClientIp.mockReturnValue("1.2.3.4");
  });

  it("returns 400 on invalid owner token", async () => {
    allowRateLimit();
    const res = await GET(getRequest("bogus"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when owner token unknown", async () => {
    allowRateLimit();
    mockResolveOwner.mockResolvedValue(null);
    const res = await GET(getRequest(VALID_OWNER_TOKEN));
    expect(res.status).toBe(404);
  });

  it("returns seats and shares list on success", async () => {
    allowRateLimit();
    defaultOwner();
    mockGetPlan.mockResolvedValue("full_report");
    mockListActive.mockResolvedValue([
      { id: 1, recipient_email: "a@x.io", created_at: "t1", last_viewed_at: null },
      { id: 2, recipient_email: "b@x.io", created_at: "t2", last_viewed_at: "t3" },
    ]);
    const res = await GET(getRequest(VALID_OWNER_TOKEN));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      plan: "full_report",
      seatLimit: 2,
      seatsUsed: 2,
      shares: [
        { id: 1, recipientEmail: "a@x.io", createdAt: "t1", lastViewedAt: null },
        { id: 2, recipientEmail: "b@x.io", createdAt: "t2", lastViewedAt: "t3" },
      ],
    });
  });

  it("returns seatLimit 0 for essentials plan", async () => {
    allowRateLimit();
    defaultOwner();
    mockGetPlan.mockResolvedValue("essentials");
    mockListActive.mockResolvedValue([]);
    const res = await GET(getRequest(VALID_OWNER_TOKEN));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.seatLimit).toBe(0);
    expect(json.plan).toBe("essentials");
  });
});

describe("DELETE /api/report/share/[id]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetClientIp.mockReturnValue("1.2.3.4");
  });

  it("returns 403 on CSRF failure", async () => {
    mockVerifyCsrf.mockResolvedValue(false);
    const res = await DELETE(deleteRequest("5", { ownerToken: VALID_OWNER_TOKEN }), {
      params: Promise.resolve({ id: "5" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 on non-numeric id", async () => {
    allowCsrf();
    allowRateLimit();
    const res = await DELETE(deleteRequest("abc", { ownerToken: VALID_OWNER_TOKEN }), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when share not found for that owner", async () => {
    allowCsrf();
    allowRateLimit();
    defaultOwner();
    mockRevoke.mockResolvedValue(false);
    const res = await DELETE(deleteRequest("5", { ownerToken: VALID_OWNER_TOKEN }), {
      params: Promise.resolve({ id: "5" }),
    });
    expect(res.status).toBe(404);
  });

  it("happy path — 200 on revoke", async () => {
    allowCsrf();
    allowRateLimit();
    defaultOwner();
    mockRevoke.mockResolvedValue(true);
    const res = await DELETE(deleteRequest("5", { ownerToken: VALID_OWNER_TOKEN }), {
      params: Promise.resolve({ id: "5" }),
    });
    expect(res.status).toBe(200);
    expect(mockRevoke).toHaveBeenCalledWith({ shareId: 5, personalReportId: 99 });
  });
});
