import { beforeEach, describe, expect, it, vi } from "vitest";

const mockVerifyAdminSession = vi.fn();
vi.mock("@features/admin/server/auth", () => ({
  verifyAdminSession: (...args: unknown[]) => mockVerifyAdminSession(...(args as [])),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));

vi.mock("@features/admin/server/audit", () => ({
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "@/app/api/admin/explorer/route";

function makeRes(body: unknown, count?: number) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    headers: {
      get: (k: string) =>
        k.toLowerCase() === "content-range" && count != null ? `0-${count - 1}/${count}` : null,
    },
  };
}

// 3 candidate submissions: #1 paid (real €29, US Woman 25–34, Spark Seeker),
// #2 free (UK Man 35–44, Sensual Connector), #3 staff/test (loveiq.org, short).
const submissions = [
  {
    id: 1,
    user_id: 11,
    duration_ms: 300_000,
    created_date_time: "2026-06-01T00:00:00Z",
    utm_tracker: null,
  },
  {
    id: 2,
    user_id: 12,
    duration_ms: 300_000,
    created_date_time: "2026-06-02T00:00:00Z",
    utm_tracker: '{"utm_source":"google"}',
  },
  {
    id: 3,
    user_id: 13,
    duration_ms: 30_000,
    created_date_time: "2026-06-03T00:00:00Z",
    utm_tracker: null,
  },
];
const scoring = [
  {
    survey_submission_id: 1,
    primary_archetype: "Spark Seeker",
    v5_primary_archetype: "Spark Seeker",
  },
  {
    survey_submission_id: 2,
    primary_archetype: "Sensual Connector",
    v5_primary_archetype: "Sensual Connector",
  },
];
const users = [
  { id: 11, email: "a@example.com", user_profile_id: 101 },
  { id: 12, email: "b@example.com", user_profile_id: 102 },
  { id: 13, email: "c@loveiq.org", user_profile_id: 103 },
];
const reports = [
  { id: 1001, survey_submission_id: 1 },
  { id: 1002, survey_submission_id: 2 },
];
const ageAnswers = [
  { survey_submission_id: 1, answer_option_id: 5001, answer_text: null },
  { survey_submission_id: 2, answer_option_id: 5002, answer_text: null },
];
const ageOptions = [
  { id: 5001, option_text: "25–34" },
  { id: 5002, option_text: "35–44" },
];
const profiles = [
  {
    id: 101,
    gender: "Woman",
    location_primary: "United States",
    sexual_orientation: "Heterosexual",
    relationship_status: "Single",
  },
  {
    id: 102,
    gender: "Man",
    location_primary: "United Kingdom",
    sexual_orientation: "Bisexual",
    relationship_status: "Monogamous",
  },
];
const payments = [{ personal_report_id: 1001, amount: 29 }];
const quotes = [{ personal_report_id: 1001, plan: "full_report" }];

function installSupabaseMock() {
  mockSupabaseFetch.mockImplementation((path: string) => {
    if (path.includes("/rest/v1/survey_question")) return makeRes([{ id: 900 }]);
    if (path.includes("/rest/v1/survey_submission_answer")) return makeRes(ageAnswers);
    if (path.includes("/rest/v1/survey_submission")) return makeRes(submissions, 3);
    if (path.includes("/rest/v1/scoring_result")) return makeRes(scoring);
    if (path.includes("/rest/v1/app_user")) return makeRes(users);
    if (path.includes("/rest/v1/personal_report")) return makeRes(reports);
    if (path.includes("/rest/v1/user_profile")) return makeRes(profiles);
    if (path.includes("/rest/v1/payment")) return makeRes(payments);
    if (path.includes("/rest/v1/report_price_quote")) return makeRes(quotes);
    if (path.includes("/rest/v1/answer_option")) return makeRes(ageOptions);
    return makeRes([]);
  });
}

function req(query = "") {
  return new Request(`http://localhost/api/admin/explorer${query}`);
}

describe("GET /api/admin/explorer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    installSupabaseMock();
  });

  it("401 without an admin session", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    expect((await GET(req())).status).toBe(401);
  });

  it("429 when rate limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false });
    expect((await GET(req())).status).toBe(429);
  });

  it("excludes test rows by default and computes real-revenue stats", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stats.total).toBe(2); // staff/test row 3 excluded
    expect(body.stats.paid).toBe(1);
    expect(body.stats.revenue).toBe(29);
    expect(body.rows).toHaveLength(2);
    // Age derived from the Q15003 answer (not the null birthday).
    const row1 = body.rows.find((r: { submissionId: number }) => r.submissionId === 1);
    expect(row1.ageGroup).toBe("25–34");
    expect(row1.country).toBe("United States");
    expect(row1.paid).toBe(true);
  });

  it("includeTest=1 brings the staff/test row back", async () => {
    const body = await (await GET(req("?includeTest=1"))).json();
    expect(body.stats.total).toBe(3);
  });

  it("default breakdown is by country with paid + revenue per group", async () => {
    const body = await (await GET(req())).json();
    const us = body.breakdown.find((r: { label: string }) => r.label === "United States");
    expect(us).toMatchObject({ count: 1, paid: 1, revenue: 29 });
  });

  it("filters: paid + country=United States (the lead's example)", async () => {
    const body = await (
      await GET(req("?paidStatus=paid&country=United%20States&groupBy=archetype"))
    ).json();
    expect(body.stats.total).toBe(1);
    expect(body.breakdown.find((r: { label: string }) => r.label === "Spark Seeker")?.count).toBe(
      1
    );
  });

  it("builds a cross-tab when groupBy2 is set", async () => {
    const body = await (await GET(req("?groupBy=gender&groupBy2=age"))).json();
    expect(body.crossTab).not.toBeNull();
    expect(body.crossTab.grandTotal).toBe(2);
    expect(body.crossTab.cells["Woman"]["25–34"]).toBe(1);
  });

  it("exposes facets with counts for the filter UI", async () => {
    const body = await (await GET(req())).json();
    expect(body.facets.country).toEqual(
      expect.arrayContaining([{ label: "United States", count: 1 }])
    );
  });

  it("format=csv returns a CSV attachment of the filtered rows", async () => {
    const res = await GET(req("?format=csv"));
    expect(res.headers.get("content-type")).toContain("text/csv");
    const text = await res.text();
    const lines = text.trim().split("\n");
    expect(lines[0]).toContain("submission_id");
    expect(lines).toHaveLength(3); // header + 2 non-test rows
  });

  it("CSV neutralizes carriage-return / formula-injection in a field", async () => {
    const evilUsers = [
      { id: 11, email: "a@example.com\r=HYPERLINK(1)", user_profile_id: 101 },
      users[1],
      users[2],
    ];
    mockSupabaseFetch.mockImplementation((path: string) => {
      if (path.includes("/rest/v1/survey_question")) return makeRes([{ id: 900 }]);
      if (path.includes("/rest/v1/survey_submission_answer")) return makeRes(ageAnswers);
      if (path.includes("/rest/v1/survey_submission")) return makeRes(submissions, 3);
      if (path.includes("/rest/v1/scoring_result")) return makeRes(scoring);
      if (path.includes("/rest/v1/app_user")) return makeRes(evilUsers);
      if (path.includes("/rest/v1/personal_report")) return makeRes(reports);
      if (path.includes("/rest/v1/user_profile")) return makeRes(profiles);
      if (path.includes("/rest/v1/payment")) return makeRes(payments);
      if (path.includes("/rest/v1/report_price_quote")) return makeRes(quotes);
      if (path.includes("/rest/v1/answer_option")) return makeRes(ageOptions);
      return makeRes([]);
    });
    const text = await (await GET(req("?format=csv"))).text();
    // The \r-laden field is quoted, so a compliant parser keeps it as one value
    // and no line can start with a formula leader.
    expect(text).toContain('"a@example.com');
    for (const line of text.split("\n")) {
      expect(line.startsWith("=")).toBe(false);
    }
  });
});
