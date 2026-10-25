import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockVerifyAdminSession = vi.fn();
vi.mock("@features/admin/server/auth", () => ({
  verifyAdminSession: (...args: unknown[]) => mockVerifyAdminSession(...(args as [])),
}));
const mockCheckRateLimit = vi.fn();
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
const mockVerifyCsrf = vi.fn();
vi.mock("@shared/http/csrf", () => ({
  verifyCsrfToken: (...args: unknown[]) => mockVerifyCsrf(...args),
}));
const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
  fetchAllRows: vi.fn(),
  countRows: vi.fn(),
  POSTGREST_MAX_ROWS: 1000,
}));
const mockLogAdminAction = vi.fn();
vi.mock("@features/admin/server/audit", () => ({
  logAdminAction: (...args: unknown[]) => mockLogAdminAction(...args),
}));
const mockHogql = vi.fn();
vi.mock("@features/ux-review/server/review", () => ({
  hogqlTable: (...args: unknown[]) => mockHogql(...args),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET as catalogGet, PUT as putNote } from "@/app/api/admin/ap/catalog/route";
import { GET as rowsGet } from "@/app/api/admin/ap/catalog/rows/route";
import { GET as explorerGet } from "@/app/api/admin/ap/explorer/route";
import { POST as unlockPost } from "@/app/api/admin/ap/explorer/unlock/route";
import { DELETE as deletePost, POST as savePost } from "@/app/api/admin/ap/saved-filters/route";
import { GET as answersGet } from "@/app/api/admin/ap/survey/answers/route";
import { clearFactsCache, fetchFacts } from "@features/admin/server/ap/facts";
import { GET as statusGet } from "@/app/api/admin/ap/status/route";
import { clearExplorerCaches, signUnlock } from "@features/admin/server/ap/explorer";
import {
  fetchSessionSources,
  fetchSurveyIntroClicks,
  fetchVisitorGroups,
} from "@features/admin/server/ap/posthog";
import { countRows, fetchAllRows } from "@features/admin/server/supabase";

const SCHEMA = {
  definitions: {
    survey_submission: {
      properties: {
        id: { type: "integer", format: "bigint", description: "<pk/>" },
        created_date_time: { format: "timestamp with time zone" },
      },
    },
    admin_audit_log: {
      properties: {
        id: { type: "integer", format: "bigint", description: "<pk/>" },
        action: { type: "string", format: "text" },
        resource_id: { type: "string", format: "text" },
        created_at: { format: "timestamp with time zone" },
      },
    },
    app_user: {
      properties: {
        id: { type: "integer", format: "bigint", description: "<pk/>" },
        email: { type: "string", format: "text" },
        created_date_time: { format: "timestamp with time zone" },
      },
    },
    // Its only date is someone's birthday.
    user_profile: {
      properties: {
        id: { type: "integer", format: "bigint", description: "<pk/>" },
        birthday: { format: "date" },
      },
    },
  },
};

const json = (body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) => ({
  ok: (init.status ?? 200) < 400,
  status: init.status ?? 200,
  headers: new Headers(init.headers ?? {}),
  json: async () => body,
});

/** Answers the schema read, and the given rows for a table read. */
function database(rows: unknown[] = []) {
  mockSupabaseFetch.mockImplementation(async (path: string, init?: { method?: string }) => {
    if (path === "/rest/v1/") return json(SCHEMA);
    if (path.startsWith("/rest/v1/admin_audit_log")) return json(null, { status: 201 });
    if (path.startsWith("/rest/v1/admin_field_note"))
      return json(null, { status: init?.method === "DELETE" ? 204 : 201 });
    return json(rows, { headers: { "content-range": `0-${rows.length - 1}/${rows.length}` } });
  });
}

const explorerUrl = (extra: Record<string, string> = {}) =>
  `http://localhost/api/admin/ap/explorer?${new URLSearchParams({
    source: "production",
    table: "app_user",
    date: "created_date_time",
    from: "2026-10-01",
    to: "2026-10-12",
    cols: "id,email",
    ...extra,
  })}`;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
  mockVerifyAdminSession.mockResolvedValue({ email: "mb@loveiq.org", role: "admin" });
  mockCheckRateLimit.mockResolvedValue({ allowed: true });
  mockVerifyCsrf.mockResolvedValue(true);
  // Nobody has asked us to restrict processing their data.
  vi.mocked(countRows).mockResolvedValue(0);
});
afterEach(() => vi.unstubAllEnvs());

describe("AP route guard", () => {
  it("answers 401 without a session, 429 over the limit", async () => {
    mockVerifyAdminSession.mockResolvedValueOnce(null);
    expect((await statusGet(new Request("http://localhost/api/admin/ap/status"))).status).toBe(401);
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false });
    expect((await statusGet(new Request("http://localhost/api/admin/ap/status"))).status).toBe(429);
  });
});

describe("GET /api/admin/ap/explorer", () => {
  it("masks by default", async () => {
    database([{ id: 1, email: "ana@example.com" }]);
    const res = await explorerGet(new Request(explorerUrl()));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: Array<{ email: string }>; masked: boolean };
    expect(body.masked).toBe(true);
    expect(body.rows[0]?.email).toMatch(/^masked-/);
  });

  it("shows the stored values only with this admin's unlock for this table", async () => {
    database([{ id: 1, email: "ana@example.com" }]);
    const mine = signUnlock("mb@loveiq.org", "production.app_user", Date.now() + 60_000);
    const theirs = signUnlock("mo@loveiq.org", "production.app_user", Date.now() + 60_000);
    const open = (await (await explorerGet(new Request(explorerUrl({ unlock: mine })))).json()) as {
      rows: Array<{ email: string }>;
      masked: boolean;
    };
    expect(open).toMatchObject({ masked: false, rows: [{ email: "ana@example.com" }] });
    const other = (await (
      await explorerGet(new Request(explorerUrl({ unlock: theirs })))
    ).json()) as { masked: boolean };
    expect(other.masked).toBe(true);
  });

  it("refuses an unknown table, a bad range and a malformed filter", async () => {
    database();
    expect((await explorerGet(new Request(explorerUrl({ table: "brain_chunk" })))).status).toBe(
      400
    );
    expect(
      (await explorerGet(new Request(explorerUrl({ from: "2026-10-12", to: "2026-10-01" })))).status
    ).toBe(400);
    expect((await explorerGet(new Request(explorerUrl({ filters: "not json" })))).status).toBe(400);
    const pii = await explorerGet(
      new Request(explorerUrl({ filters: JSON.stringify([["email", "eq", "x"]]) }))
    );
    expect(pii.status).toBe(400);
    expect(((await pii.json()) as { error: string }).error).toMatch(/unlocked/);
  });

  it("pauses while anyone has asked us to restrict processing their data, and keeps the audit log closed", async () => {
    database([{ id: 1, email: "ana@example.com" }]);
    const closed = await explorerGet(
      new Request(explorerUrl({ table: "admin_audit_log", cols: "id", date: "created_at" }))
    );
    expect(closed.status).toBe(400);
    expect(((await closed.json()) as { error: string }).error).toMatch(/delete or export/);

    clearExplorerCaches();
    vi.mocked(countRows).mockResolvedValue(1);
    const paused = await explorerGet(new Request(explorerUrl()));
    expect(paused.status).toBe(409);
    expect(((await paused.json()) as { error: string }).error).toMatch(/Art\. 18/);
    clearExplorerCaches();
  });

  it("pauses PostHog with the database, and stays shut when it cannot tell", async () => {
    clearExplorerCaches();
    vi.mocked(countRows).mockResolvedValue(1);
    const ph = await explorerGet(
      new Request(
        explorerUrl({ source: "posthog", table: "events", date: "timestamp", cols: "event" })
      )
    );
    expect(ph.status).toBe(409);

    clearExplorerCaches();
    vi.mocked(countRows).mockResolvedValue(null);
    database([{ id: 1, email: "ana@example.com" }]);
    const unsure = await explorerGet(new Request(explorerUrl()));
    expect(unsure.status).toBe(500);
    expect(await unsure.text()).not.toContain("ana@example.com");
    clearExplorerCaches();
  });

  it("keeps an editor masked even with a valid unlock in hand", async () => {
    database([{ id: 1, email: "ana@example.com" }]);
    mockVerifyAdminSession.mockResolvedValueOnce({ email: "e@loveiq.org", role: "editor" });
    const token = signUnlock("e@loveiq.org", "production.app_user", Date.now() + 60_000);
    const body = (await (
      await explorerGet(new Request(explorerUrl({ unlock: token })))
    ).json()) as { masked: boolean; rows: Array<{ email: string }> };
    expect(body.masked).toBe(true);
    expect(body.rows[0]?.email).toMatch(/^masked-/);
  });

  it("makes an unmasked file only once its audit row is written", async () => {
    const token = signUnlock("mb@loveiq.org", "production.app_user", Date.now() + 60_000);
    database([{ id: 1, email: "ana@example.com" }]);
    vi.mocked(fetchAllRows).mockResolvedValue([{ id: 1, email: "ana@example.com" }]);
    const ok = await explorerGet(new Request(explorerUrl({ format: "csv", unlock: token })));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-disposition")).toContain("-unmasked.csv");
    expect(await ok.text()).toContain("ana@example.com");
    const audit = mockSupabaseFetch.mock.calls.find(([p]) =>
      String(p).startsWith("/rest/v1/admin_audit_log")
    );
    expect(JSON.parse((audit![1] as { body: string }).body)).toMatchObject({
      action: "ap_explorer_export_unmasked",
    });
    expect(mockLogAdminAction).not.toHaveBeenCalled();

    mockSupabaseFetch.mockImplementation(async (path: string) =>
      path === "/rest/v1/"
        ? json(SCHEMA)
        : path.startsWith("/rest/v1/admin_audit_log")
          ? json(null, { status: 500 })
          : json([])
    );
    const refused = await explorerGet(new Request(explorerUrl({ format: "csv", unlock: token })));
    expect(refused.status).toBe(500);
    expect(await refused.text()).not.toContain("ana@example.com");
  });

  it("exports PostHog unmasked only with the unlock, logged first, and refuses when it cannot log", async () => {
    database();
    const token = signUnlock("mb@loveiq.org", "posthog.events", Date.now() + 60_000);
    const rows = () =>
      mockHogql.mockImplementation(async (sql: string) =>
        sql.startsWith("SELECT count()")
          ? { ok: true, cut: false, rows: [[1]] }
          : {
              ok: true,
              cut: false,
              rows: [["2026-10-12T21:00:00+02:00", "ana@example.com", "01920000-sess"]],
            }
      );
    rows();
    const url = explorerUrl({
      source: "posthog",
      table: "events",
      date: "timestamp",
      cols: "distinct_id,$session_id",
      format: "csv",
      unlock: token,
    });
    const ok = await explorerGet(new Request(url));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-disposition")).toContain("-unmasked.csv");
    const text = await ok.text();
    expect(text).toContain("ana@example.com");
    expect(text).toContain("01920000-sess");
    expect(mockLogAdminAction).not.toHaveBeenCalled();

    mockSupabaseFetch.mockImplementation(async (path: string) =>
      path.startsWith("/rest/v1/admin_audit_log") ? json(null, { status: 500 }) : json([])
    );
    const refused = await explorerGet(new Request(url));
    expect(refused.status).toBe(500);
    expect(await refused.text()).not.toContain("ana@example.com");
  });

  /** The brain's GA4 days as the Google tables read them: each day's one breakdown. */
  const CHANNEL_DAYS = [
    {
      date: "2026-10-02",
      breakdown: {
        "Paid Search": {
          sessions: 40,
          users: 38,
          new_users: 35,
          engaged_sessions: 20,
          engagement_s: 2000,
        },
        Direct: { sessions: 3, users: 3, new_users: 1, engaged_sessions: 1, engagement_s: 10 },
      },
    },
    // A day the breakdown was never read for: no rows, not zero rows of zeros.
    { date: "2026-10-03", breakdown: null },
    {
      date: "2026-10-04",
      breakdown: {
        Direct: { sessions: 0, users: 2, new_users: 0, engaged_sessions: 0, engagement_s: 12 },
      },
    },
  ];
  const CAMPAIGN_DAYS = [
    {
      date: "2026-10-02",
      breakdown: {
        "111": { name: "Brand", impressions: 90, clicks: 3, cost: 12.35, conversions: 1.5 },
        "222": { name: "Generic", impressions: 40, clicks: 1, cost: 2, conversions: 0 },
      },
    },
    { date: "2026-10-03", breakdown: null },
    {
      date: "2026-10-04",
      breakdown: {
        "111": { name: "Brand", impressions: 70, clicks: 2, cost: 8, conversions: 2 },
      },
    },
    // Outside the range asked for.
    {
      date: "2026-10-20",
      breakdown: { "111": { name: "Brand", impressions: 1, clicks: 1, cost: 1, conversions: 0 } },
    },
  ];
  const google = (extra: Record<string, string>) =>
    explorerGet(new Request(explorerUrl({ date: "date", ...extra })));

  it("opens sessions_daily as a row per day and channel, newest day first", async () => {
    database();
    vi.mocked(fetchAllRows).mockResolvedValue(CHANNEL_DAYS);
    const res = await google({
      source: "ga4",
      table: "sessions_daily",
      cols: "date,channel,sessions,users,new_users,engaged_sessions,avg_engagement_time",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: unknown[]; total: number; masked: boolean };
    expect(body).toMatchObject({ total: 3, masked: false, synced: true });
    expect(body.rows).toEqual([
      {
        date: "2026-10-04",
        channel: "Direct",
        sessions: 0,
        users: 2,
        new_users: 0,
        engaged_sessions: 0,
        // No session to share the time out over.
        avg_engagement_time: null,
      },
      {
        date: "2026-10-02",
        channel: "Direct",
        sessions: 3,
        users: 3,
        new_users: 1,
        engaged_sessions: 1,
        avg_engagement_time: 3.3,
      },
      {
        date: "2026-10-02",
        channel: "Paid Search",
        sessions: 40,
        users: 38,
        new_users: 35,
        engaged_sessions: 20,
        avg_engagement_time: 50,
      },
    ]);
    // Only the channel breakdown is read, and only for the days that hold one.
    expect(vi.mocked(fetchAllRows).mock.calls[0]![0]).toContain(
      "meta->>channels=not.is.null&select=date:meta->>day,breakdown:meta->channels"
    );
    // In a file too: an empty cell, not NaN or Infinity.
    const csv = await google({
      source: "ga4",
      table: "sessions_daily",
      cols: "date,channel,sessions,avg_engagement_time",
      format: "csv",
    });
    expect(await csv.text()).toContain("2026-10-04,Direct,0,\n");
  });

  it("says a Google table has not synced yet until it holds a day, and not after", async () => {
    database();
    vi.mocked(fetchAllRows).mockResolvedValue([]);
    const cols = "date,campaign_id,campaign_name,impressions,clicks,cost_eur,conversions";
    const before = await google({ source: "ads", table: "campaign_daily", cols });
    expect(await before.json()).toMatchObject({ rows: [], total: 0, synced: false });
    // Synced, with no row in these dates: an empty page, not "not synced".
    vi.mocked(fetchAllRows).mockResolvedValue(CAMPAIGN_DAYS.slice(3));
    const after = await google({ source: "ads", table: "campaign_daily", cols });
    expect(await after.json()).toMatchObject({ rows: [], total: 0, synced: true });
  });

  it("filters campaign_daily by campaign, within the range", async () => {
    database();
    vi.mocked(fetchAllRows).mockResolvedValue(CAMPAIGN_DAYS);
    const res = await google({
      source: "ads",
      table: "campaign_daily",
      cols: "date,campaign_id,campaign_name,impressions,clicks,cost_eur,conversions",
      filters: JSON.stringify([["campaign_name", "eq", "Brand"]]),
      sort: "cost_eur",
      dir: "asc",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: unknown[]; total: number };
    expect(body.total).toBe(2);
    expect(body.rows).toEqual([
      {
        date: "2026-10-04",
        campaign_id: "111",
        campaign_name: "Brand",
        impressions: 70,
        clicks: 2,
        cost_eur: 8,
        conversions: 2,
      },
      {
        date: "2026-10-02",
        campaign_id: "111",
        campaign_name: "Brand",
        impressions: 90,
        clicks: 3,
        cost_eur: 12.35,
        conversions: 1.5,
      },
    ]);
    expect(vi.mocked(fetchAllRows).mock.calls[0]![0]).toContain(
      "meta->>ads_campaigns=not.is.null&select=date:meta->>day,breakdown:meta->ads_campaigns"
    );
    // The old daily-totals table is gone.
    expect((await google({ source: "ads", table: "ads_daily", cols: "date" })).status).toBe(400);
  });

  it("names and logs a Google Analytics or Ads file as what it is: no one's details", async () => {
    database();
    vi.mocked(fetchAllRows).mockResolvedValue(CAMPAIGN_DAYS);
    const res = await google({
      source: "ads",
      table: "campaign_daily",
      cols: "date,campaign_name,cost_eur,conversions",
      format: "csv",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain(
      'filename="ads-campaign_daily-2026-10-01-2026-10-12.csv"'
    );
    const text = await res.text();
    expect(text).toContain("2026-10-02,Brand,12.35,1.5");
    expect(text).toContain("2026-10-02,Generic,2,0");
    expect(text).not.toContain("2026-10-20");
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ap_explorer_export",
        resource_id: "ads.campaign_daily",
        metadata: expect.objectContaining({ rows: 3 }),
      })
    );
  });

  it("exports every row of a Google table, past one page of 1,000", async () => {
    database();
    // 400 days of three channels: more rows than the page sizes allow.
    vi.mocked(fetchAllRows).mockResolvedValue(
      Array.from({ length: 400 }, (_, i) => ({
        date: new Date(Date.UTC(2025, 8, 1 + i)).toISOString().slice(0, 10),
        breakdown: Object.fromEntries(
          ["Direct", "Paid Search", "Referral"].map((c) => [
            c,
            { sessions: 1, users: 1, new_users: 0, engaged_sessions: 0, engagement_s: 1 },
          ])
        ),
      }))
    );
    const res = await google({
      source: "ga4",
      table: "sessions_daily",
      cols: "date,channel",
      from: "2025-09-01",
      to: "2026-10-12",
      format: "csv",
    });
    expect(res.status).toBe(200);
    // Header plus 1,200 rows.
    expect((await res.text()).trim().split("\n")).toHaveLength(1201);
  });

  it("exports CSV to admins only, and logs every export", async () => {
    database([{ id: 1, email: "ana@example.com" }]);
    mockVerifyAdminSession.mockResolvedValueOnce({ email: "v@loveiq.org", role: "viewer" });
    expect((await explorerGet(new Request(explorerUrl({ format: "csv" })))).status).toBe(403);

    vi.mocked(fetchAllRows).mockResolvedValueOnce([{ id: 1, email: "ana@example.com" }]);
    const res = await explorerGet(new Request(explorerUrl({ format: "csv" })));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain(
      'filename="app_user-2026-10-01-2026-10-12.csv"'
    );
    const text = await res.text();
    expect(text).not.toContain("ana@example.com");
    expect(text).toMatch(/1,masked-[0-9a-f]{12}/);
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ap_explorer_export",
        resource_id: "production.app_user",
        metadata: expect.objectContaining({ rows: 1 }),
      })
    );
  });
});

describe("POST /api/admin/ap/explorer/unlock", () => {
  const unlock = (body: unknown) =>
    unlockPost(
      new Request("http://localhost/api/admin/ap/explorer/unlock", {
        method: "POST",
        body: JSON.stringify(body),
      })
    );

  it("needs CSRF, the admin role and a reason", async () => {
    database();
    mockVerifyCsrf.mockResolvedValueOnce(false);
    expect(
      (
        await unlock({
          source: "production",
          table: "app_user",
          reason: "Support case 1234 lookup",
        })
      ).status
    ).toBe(403);
    mockVerifyAdminSession.mockResolvedValueOnce({ email: "e@loveiq.org", role: "editor" });
    expect(
      (
        await unlock({
          source: "production",
          table: "app_user",
          reason: "Support case 1234 lookup",
        })
      ).status
    ).toBe(403);
    expect(
      (await unlock({ source: "production", table: "app_user", reason: "short" })).status
    ).toBe(400);
  });

  it("writes the audit row before handing out the unlock, and gives none when it cannot", async () => {
    database();
    const res = await unlock({
      source: "production",
      table: "app_user",
      reason: "Support case 1234 lookup",
    });
    expect(res.status).toBe(200);
    const audit = mockSupabaseFetch.mock.calls.find(([p]) =>
      String(p).startsWith("/rest/v1/admin_audit_log")
    );
    expect(JSON.parse((audit![1] as { body: string }).body)).toMatchObject({
      admin_email: "mb@loveiq.org",
      action: "ap_explorer_unlock",
      resource_id: "production.app_user",
      metadata: { reason: "Support case 1234 lookup" },
    });
    expect(((await res.json()) as { token: string }).token).toContain(".");

    mockSupabaseFetch.mockImplementation(async (path: string) =>
      path === "/rest/v1/" ? json(SCHEMA) : json(null, { status: 500 })
    );
    const failed = await unlock({
      source: "production",
      table: "app_user",
      reason: "Support case 1234 lookup",
    });
    expect(failed.status).toBe(500);
    expect(await failed.json()).not.toHaveProperty("token");
  });
});

describe("POST /api/admin/ap/explorer/unlock, closed tables", () => {
  it("does not unlock, or log an unlock of, a table the explorer keeps closed", async () => {
    database();
    const res = await unlockPost(
      new Request("http://localhost/api/admin/ap/explorer/unlock", {
        method: "POST",
        body: JSON.stringify({
          source: "production",
          table: "admin_audit_log",
          reason: "Looking at who exported what",
        }),
      })
    );
    expect(res.status).toBe(400);
    expect(
      mockSupabaseFetch.mock.calls.some(([p]) => String(p).startsWith("/rest/v1/admin_audit_log"))
    ).toBe(false);
  });
});

describe("POST /api/admin/ap/saved-filters", () => {
  const save = (filters: Record<string, string>, kind = "explorer") =>
    savePost(
      new Request("http://localhost/api/admin/ap/saved-filters", {
        method: "POST",
        body: JSON.stringify({ kind, name: "My view", shared: true, filters }),
      })
    );
  const view = (extra: Record<string, string> = {}) => ({
    source: "production",
    table: "app_user",
    date: "created_date_time",
    from: "2026-10-01",
    to: "2026-10-12",
    cols: "id,email",
    ...extra,
  });
  const inserted = () =>
    mockSupabaseFetch.mock.calls.some(
      ([p, init]) =>
        String(p).startsWith("/rest/v1/admin_ap_saved_filter") &&
        (init as { method?: string } | undefined)?.method === "POST"
    );

  it("never keeps a person's details: no personal filter, address or report link", async () => {
    database([{ id: 7 }]);
    for (const filters of [
      [["email", "eq", "ana@example.com"]],
      [
        ["id", "eq", "1"],
        ["email", "notnull", ""],
      ],
    ]) {
      const res = await save(view({ filters: JSON.stringify(filters) }));
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toMatch(/^Not saved: /);
    }
    expect((await save(view({ sort: "email" }))).status).toBe(400);
    expect(inserted()).toBe(false);
  });

  it("saves a view that works masked, with long column lists, and a no-date choice", async () => {
    database([{ id: 7 }]);
    const res = await save(
      view({
        date: "",
        // Over 700 characters: more than one URL parameter used to be allowed.
        cols: Array.from({ length: 40 }, () => "created_date_time").join(","),
        filters: JSON.stringify([["id", "gt", "10"]]),
      })
    );
    expect(res.status).toBe(200);
    expect(inserted()).toBe(true);
  });

  it("keeps only the state a view reopens: known keys, real dates, triples, a clean name", async () => {
    database([{ id: 7 }]);
    for (const extra of [
      { from: "ana@example.com" },
      // Each rule on its own, with nothing an address check would catch:
      { from: "yesterday" },
      { link: "x" },
      { size: "13" },
      { filters: JSON.stringify([["id", "eq", "1", "extra"]]) },
      { filters: JSON.stringify([["id", "eq", "1", "ana@example.com"]]) },
      { filters: JSON.stringify([["id", "eq", "x".repeat(201)]]) },
      { filters: "not json" },
    ]) {
      expect((await save(view(extra))).status).toBe(400);
    }
    const named = await savePost(
      new Request("http://localhost/api/admin/ap/saved-filters", {
        method: "POST",
        body: JSON.stringify({
          kind: "explorer",
          name: "ana@example.com's rows",
          shared: true,
          filters: view(),
        }),
      })
    );
    expect(named.status).toBe(400);
    expect(
      (
        await save({
          source: "posthog",
          table: "events",
          date: "timestamp",
          cols: "event",
          sort: "event",
        })
      ).status
    ).toBe(400);
    expect(inserted()).toBe(false);
  });

  it("keeps only the filter bar's own parameters in a saved filter", async () => {
    database([{ id: 7 }]);
    expect((await save({ period: "7d", source: "google_ads" }, "filter")).status).toBe(200);
    expect(inserted()).toBe(true);
    expect((await save({ visitor: "returning" }, "filter")).status).toBe(200);
    mockSupabaseFetch.mockClear();
    for (const bad of [
      { period: "7d", name: "x" },
      { visitor: "everyone" },
      { source: "ana@example.com" },
      { period: "custom", from: "2026-10-01", to: "ana@example.com" },
    ]) {
      expect((await save(bad, "filter")).status).toBe(400);
    }
    expect(inserted()).toBe(false);
  });

  it("refuses a save, and a delete, without the CSRF token", async () => {
    database([{ id: 7 }]);
    mockVerifyCsrf.mockResolvedValue(false);
    expect((await save(view())).status).toBe(403);
    const del = await deletePost(
      new Request("http://localhost/api/admin/ap/saved-filters?id=7", { method: "DELETE" })
    );
    expect(del.status).toBe(403);
    expect(inserted()).toBe(false);
    expect(
      mockSupabaseFetch.mock.calls.some(
        ([, init]) => (init as { method?: string })?.method === "DELETE"
      )
    ).toBe(false);
  });

  it("refuses a view of an unknown or closed table", async () => {
    database([{ id: 7 }]);
    expect((await save(view({ table: "brain_chunk" }))).status).toBe(400);
    expect(
      (await save(view({ table: "admin_audit_log", cols: "id", date: "created_at" }))).status
    ).toBe(400);
    expect(inserted()).toBe(false);
  });
});

describe("GET /api/admin/ap/catalog", () => {
  it("reads a source synced today or yesterday as synced", async () => {
    const today = new Date().toISOString().slice(0, 10);
    mockSupabaseFetch.mockImplementation(async (path: string) => {
      if (path === "/rest/v1/") return json(SCHEMA);
      if (path.startsWith("/rest/v1/admin_field_note")) return json([]);
      return json([{ period_end: `${today}T12:00:00+00:00` }]);
    });
    const body = (await (
      await catalogGet(new Request("http://localhost/api/admin/ap/catalog"))
    ).json()) as { sources: Array<{ key: string; status: string; ok: boolean }> };
    for (const k of ["ga4", "ads"])
      expect(body.sources.find((x) => x.key === k)).toMatchObject({ status: "Synced", ok: true });
  });

  it("lists the Google tables: the brain's copies every 15 minutes, Ads by its campaigns, the rest live", async () => {
    mockSupabaseFetch.mockImplementation(async (path: string) => {
      if (path === "/rest/v1/") return json(SCHEMA);
      if (path.startsWith("/rest/v1/admin_field_note")) return json([]);
      if (path.includes("ads_campaigns"))
        return json([{ period_end: "2026-10-13T23:59:59+00:00" }]);
      return json([{ period_end: "2026-10-14T23:59:59+00:00" }]);
    });
    const res = await catalogGet(new Request("http://localhost/api/admin/ap/catalog"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      sources: Array<{ key: string; fresh: string; description: string }>;
      tables: Array<{ source: string; name: string; key: string[]; group: string }>;
    };
    const source = (k: string) => body.sources.find((x) => x.key === k)!;
    expect(source("ga4").fresh).toBe("Every 15 minutes, to 14 Oct");
    expect(source("ads").fresh).toBe("Every 15 minutes, to 13 Oct");
    // Days behind a 15-minute sync: it has stopped, and the card says so.
    expect(source("ga4")).toMatchObject({ status: "Behind", ok: false });
    expect(source("ads")).toMatchObject({ status: "Behind", ok: false });
    expect(source("ads").description).toMatch(/^Campaign spend, clicks and conversions/);
    // The Ads card dates itself by the campaign table, not by GA4's spend.
    expect(
      mockSupabaseFetch.mock.calls.some(([p]) =>
        String(p).includes("meta->>ads_campaigns=not.is.null")
      )
    ).toBe(true);
    const google = body.tables.filter((t) => t.source === "ga4" || t.source === "ads");
    expect(google.map(({ source: s, name }) => `${s}.${name}`)).toEqual([
      "ga4.sessions_daily",
      "ads.campaign_daily",
      // Read live from Google (google-live.ts); since the second audit (21 Oct 2026) also
      // hours, devices, cities, new and returning, custom parameters, ads, age and gender,
      // impression share, Performance Max's search categories and the change history.
      "ga4.site_daily",
      "ga4.acquisition_daily",
      "ga4.landing_pages_daily",
      "ga4.pages_daily",
      "ga4.events_daily",
      "ga4.hours_daily",
      "ga4.tech_daily",
      "ga4.landing_sources_daily",
      "ga4.page_events_daily",
      "ga4.cities_daily",
      "ga4.new_returning_daily",
      "ga4.event_params_daily",
      "ads.conversion_action_daily",
      "ads.search_term_daily",
      "ads.keyword_daily",
      "ads.ad_group_daily",
      "ads.device_daily",
      "ads.geo_daily",
      "ads.demographics_daily",
      "ads.impression_share_daily",
      "ads.ads_hours_daily",
      "ads.search_ads_daily",
      "ads.pmax_search_categories",
      "ads.change_history",
    ]);
    expect(body.tables.filter((t) => t.source === "gsc").map((t) => t.name)).toEqual([
      "search_console_daily",
    ]);
    expect(google.slice(0, 2).map(({ key, group }) => ({ key, group }))).toEqual([
      { key: ["date", "channel"], group: "Traffic" },
      { key: ["date", "campaign_id"], group: "Spend" },
    ]);
  });
});

describe("PUT /api/admin/ap/catalog", () => {
  const put = (body: unknown) =>
    putNote(
      new Request("http://localhost/api/admin/ap/catalog", {
        method: "PUT",
        body: JSON.stringify(body),
      })
    );

  it("refuses a note without the CSRF token", async () => {
    database();
    mockVerifyCsrf.mockResolvedValue(false);
    expect(
      (await put({ source: "production", table: "app_user", column: "email", description: "x" }))
        .status
    ).toBe(403);
    expect(
      mockSupabaseFetch.mock.calls.some(([p]) => String(p).startsWith("/rest/v1/admin_field_note"))
    ).toBe(false);
  });

  it("saves a note for a known field, clears it when empty, and refuses anything else", async () => {
    database();
    expect(
      (
        await put({
          source: "production",
          table: "app_user",
          column: "email",
          description: "The address.",
        })
      ).status
    ).toBe(200);
    const write = mockSupabaseFetch.mock.calls.find(([p]) =>
      String(p).startsWith("/rest/v1/admin_field_note")
    );
    expect(write![0]).toContain("on_conflict=source,relation,field");
    expect(JSON.parse((write![1] as { body: string }).body)).toMatchObject({
      relation: "app_user",
      field: "email",
      updated_by: "mb@loveiq.org",
    });

    mockSupabaseFetch.mockClear();
    expect(
      (await put({ source: "production", table: "app_user", column: "email", description: "" }))
        .status
    ).toBe(200);
    const clear = mockSupabaseFetch.mock.calls.find(([p]) =>
      String(p).startsWith("/rest/v1/admin_field_note")
    );
    expect(clear![1]).toMatchObject({ method: "DELETE" });

    expect(
      (await put({ source: "production", table: "app_user", column: "nope", description: "x" }))
        .status
    ).toBe(400);
    expect(
      (await put({ source: "production", table: "brain_chunk", column: "", description: "x" }))
        .status
    ).toBe(400);
    mockVerifyAdminSession.mockResolvedValueOnce({ email: "v@loveiq.org", role: "viewer" });
    expect(
      (await put({ source: "production", table: "app_user", column: "email", description: "x" }))
        .status
    ).toBe(403);
  });
});

describe("GET /api/admin/ap/catalog/rows", () => {
  const rows = async (source: string, table: string) => {
    const res = await rowsGet(
      new Request(`http://localhost/api/admin/ap/catalog/rows?source=${source}&table=${table}`)
    );
    expect(res.status).toBe(200);
    return (await res.json()) as { rows: number | null; newest: string | null };
  };

  it("counts a table and reads its newest row by its main date, never by a personal one", async () => {
    database([{ created_date_time: "2026-10-13T08:52:11.123456+00:00" }]);
    vi.mocked(countRows).mockResolvedValue(42);
    expect(await rows("production", "survey_submission")).toEqual({
      rows: 42,
      newest: "2026-10-13T08:52:11.123Z",
    });
    const read = mockSupabaseFetch.mock.calls.find(([p]) =>
      String(p).startsWith("/rest/v1/survey_submission")
    );
    expect(read![0]).toBe(
      "/rest/v1/survey_submission?select=created_date_time&order=created_date_time.desc.nullslast&limit=1"
    );

    mockSupabaseFetch.mockClear();
    expect(await rows("production", "user_profile")).toEqual({ rows: 42, newest: null });
    expect(
      mockSupabaseFetch.mock.calls.some(([p]) => String(p).startsWith("/rest/v1/user_profile"))
    ).toBe(false);

    // A closed table stays closed, its timing included.
    mockSupabaseFetch.mockClear();
    expect(await rows("production", "admin_audit_log")).toEqual({ rows: 42, newest: null });
    expect(
      mockSupabaseFetch.mock.calls.some(([p]) => String(p).startsWith("/rest/v1/admin_audit_log"))
    ).toBe(false);
  });

  it("reads PostHog's newest event with its count", async () => {
    mockHogql.mockResolvedValue({
      ok: true,
      cut: null,
      rows: [[7, "2026-10-14T10:52:00.500000+02:00"]],
    });
    expect(await rows("posthog", "events")).toEqual({
      rows: 7,
      newest: "2026-10-14T08:52:00.500Z",
    });
    expect(mockHogql.mock.calls[0]![0]).toContain("max(timestamp)");
  });

  it("counts a Google table's rows, a row per channel or campaign per day", async () => {
    vi.mocked(fetchAllRows).mockResolvedValue([
      {
        date: "2026-10-12",
        breakdown: { "111": { name: "Brand" }, "222": { name: "Generic" } },
      },
      { date: "2026-10-13", breakdown: { "111": { name: "Brand" } } },
    ]);
    expect(await rows("ads", "campaign_daily")).toEqual({ rows: 3, newest: "2026-10-13" });
    expect(vi.mocked(fetchAllRows).mock.calls[0]![0]).toContain("meta->>ads_campaigns=not.is.null");

    vi.mocked(fetchAllRows).mockResolvedValue([
      { date: "2026-10-14", breakdown: { Direct: { sessions: 4 } } },
    ]);
    expect(await rows("ga4", "sessions_daily")).toEqual({ rows: 1, newest: "2026-10-14" });
    expect(vi.mocked(fetchAllRows).mock.calls[1]![0]).toContain("meta->>channels=not.is.null");

    // Nothing read yet: no rows and no newest day.
    vi.mocked(fetchAllRows).mockResolvedValue([]);
    expect(await rows("ga4", "sessions_daily")).toEqual({ rows: 0, newest: null });

    // A table the source does not have, or the old daily totals.
    for (const [source, table] of [
      ["ga4", "campaign_daily"],
      ["ads", "ads_daily"],
    ]) {
      const res = await rowsGet(
        new Request(`http://localhost/api/admin/ap/catalog/rows?source=${source}&table=${table}`)
      );
      expect(res.status).toBe(400);
    }
  });
});

describe("GET /api/admin/ap/survey/answers", () => {
  it("counts N of M over the same people: the filters' finishers, without our probes", async () => {
    const finisher = (id: number, src: string | null, med: string | null = null) => ({
      id,
      day: "2026-10-02",
      at: "2026-10-02T10:00:00Z",
      src,
      med,
      ads: false,
    });
    mockSupabaseFetch.mockImplementation(async (path: string) => {
      if (path === "/rest/v1/rpc/ap_question_answers")
        return json({
          rows: [
            { answer: ["Yes"], src: "google", med: "cpc" },
            { answer: ["No"], src: "ig" },
            { answer: ["Yes"], src: "prod-verification" },
          ],
          finished: 4,
        });
      if (path === "/rest/v1/rpc/ap_facts")
        return json({
          visits: [],
          starts: [],
          subs: [
            finisher(1, "google", "cpc"),
            finisher(2, "ig"),
            finisher(3, null),
            finisher(4, "prod-verification"),
          ],
          money: [],
          checkouts: [],
          intro: [],
          invites: [],
          quotes: [],
        });
      return json(null, { status: 404 });
    });
    const get = async (source: string) => {
      clearFactsCache();
      const res = await answersGet(
        new Request(
          `http://localhost/api/admin/ap/survey/answers?q=02001&dim=none&period=custom&from=2026-10-01&to=2026-10-07&source=${source}`
        )
      );
      expect(res.status).toBe(200);
      return (await res.json()) as { respondents: number; finished: number };
    };
    expect(await get("all")).toMatchObject({ respondents: 2, finished: 3 });
    expect(await get("google_ads")).toMatchObject({ respondents: 1, finished: 1 });
  });
});

describe("the new/returning filter", () => {
  const A = "0192f0aa-1111-7000-8000-000000000001";
  const B = "0192f0aa-2222-7000-8000-000000000002";
  const finisher = (id: number, ph: string | null) => ({
    id,
    day: "2026-10-02",
    at: "2026-10-02T10:00:00Z",
    src: "google",
    med: "cpc",
    ads: false,
    ph,
  });
  beforeEach(() => {
    mockSupabaseFetch.mockImplementation(async (path: string) => {
      if (path === "/rest/v1/rpc/ap_question_answers")
        return json({
          rows: [
            { answer: ["Yes"], src: "google", med: "cpc", ph: A },
            { answer: ["No"], src: "google", med: "cpc", ph: B },
            { answer: ["No"], src: "google", med: "cpc", ph: "not-a-session'); DROP" },
          ],
          finished: 3,
        });
      if (path === "/rest/v1/rpc/ap_facts")
        return json({
          visits: [],
          starts: [],
          // A was new, B had visited before, C's id is no session id, D PostHog never saw.
          subs: [
            finisher(1, A),
            finisher(2, B),
            finisher(3, "x' OR 1=1 --"),
            finisher(4, "0192f0aa-4444-7000-8000-000000000004"),
          ],
          money: [],
          checkouts: [],
          intro: [],
          invites: [],
          quotes: [],
        });
      return json(null, { status: 404 });
    });
    // PostHog: each visit's start and its person's first event (ms). A came on this visit;
    // B was seen a day before.
    const visit = Date.parse("2026-10-02T09:50:00Z");
    mockHogql.mockResolvedValue({
      ok: true,
      cut: null,
      rows: [
        [A, visit, visit],
        [B, visit, visit - 86_400_000],
      ],
    });
  });
  const get = async (visitor: string) => {
    clearFactsCache();
    const res = await answersGet(
      new Request(
        `http://localhost/api/admin/ap/survey/answers?q=02001&dim=none&period=custom&from=2026-10-01&to=2026-10-07&visitor=${visitor}`
      )
    );
    expect(res.status).toBe(200);
    return (await res.json()) as { respondents: number; finished: number };
  };

  it("splits finishers and their answers by PostHog's first visit; unknown is in neither", async () => {
    mockHogql.mockClear();
    expect(await get("new")).toMatchObject({ respondents: 1, finished: 1 });
    // Only well-formed session ids ever reach the query.
    const first = mockHogql.mock.calls.map((c) => String(c[0])).join("\n");
    expect(first).toContain(`'${A}'`);
    expect(first).toContain(`'${B}'`);
    expect(first).not.toMatch(/DROP|OR 1=1/);
    mockHogql.mockClear();
    expect(await get("returning")).toMatchObject({ respondents: 1, finished: 1 });
    // A known visit is not asked again; one PostHog never saw is.
    const again = mockHogql.mock.calls.map((c) => String(c[0])).join("\n");
    expect(again).not.toContain(A);
    expect(again).toContain("0192f0aa-4444-7000-8000-000000000004");
    mockHogql.mockClear();
    expect(await get("all")).toMatchObject({ respondents: 3, finished: 4 });
    expect(mockHogql).not.toHaveBeenCalled();
  });

  it("keeps a first-timer new when a pause mid-survey made PostHog start a second visit", async () => {
    const P = "0192f0aa-6666-7000-8000-000000000006";
    const facts = mockSupabaseFetch.getMockImplementation()!;
    mockSupabaseFetch.mockImplementation(async (path: string, init?: unknown) => {
      if (path !== "/rest/v1/rpc/ap_facts") return facts(path, init);
      const res = (await facts(path, init)) as Response;
      const body = (await res.json()) as { subs: Array<Record<string, unknown>> };
      // Landed 10:00, started the survey 10:02, paused 40 minutes, finished on a new visit.
      body.subs.push({ ...finisher(6, P), startAt: "2026-10-02T10:02:00Z" });
      return json(body);
    });
    mockHogql.mockResolvedValue({
      ok: true,
      cut: null,
      rows: [[P, Date.parse("2026-10-02T10:52:00Z"), Date.parse("2026-10-02T10:00:00Z")]],
    });
    clearFactsCache();
    const res = await answersGet(
      new Request(
        `http://localhost/api/admin/ap/survey/answers?q=02001&dim=none&period=custom&from=2026-10-01&to=2026-10-07&visitor=new`
      )
    );
    expect(res.status).toBe(200);
    // A (new), and P: still on their first visit by the survey's start.
    expect(((await res.json()) as { finished: number }).finished).toBe(2);
  });

  it("fails the page plainly when PostHog can't be read, instead of showing zeros", async () => {
    // A visit not asked before (a five-minute cache holds the last answer), and PostHog fails.
    const facts = mockSupabaseFetch.getMockImplementation()!;
    mockSupabaseFetch.mockImplementation(async (path: string, init?: unknown) => {
      if (path !== "/rest/v1/rpc/ap_facts") return facts(path, init);
      const res = (await facts(path, init)) as Response;
      const body = (await res.json()) as { subs: Array<Record<string, unknown>> };
      body.subs.push(finisher(5, "0192f0aa-5555-7000-8000-000000000005"));
      return json(body);
    });
    mockHogql.mockResolvedValue({ ok: false, error: "boom" });
    clearFactsCache();
    const res = await answersGet(
      new Request(
        `http://localhost/api/admin/ap/survey/answers?q=02001&dim=none&period=custom&from=2026-10-01&to=2026-10-07&visitor=returning`
      )
    );
    expect(res.status).toBe(500);
  });
});

describe("fetchSurveyIntroClicks", () => {
  it("counts the sessions that tapped the intro's silhouette, by its aria-label", async () => {
    mockHogql.mockResolvedValue({
      ok: true,
      cut: null,
      rows: [[100, 20, 60, 5, 3, 8, 55, 70, 31]],
    });
    // Its own range, so the five-minute cache holds nothing for it.
    const r = await fetchSurveyIntroClicks("2026-07-01", "2026-07-07");
    // Reached question 1: the engine started or a question was answered, so at least answered.
    expect(r).toMatchObject({
      ok: true,
      value: { opened: 100, answered: 55, reachedQ1: 70, silhouette: 31 },
    });
    expect(String(mockHogql.mock.calls[0]?.[0])).toContain(
      "event IN ('survey_answer', 'survey_started')"
    );
    expect(String(mockHogql.mock.calls[0]?.[0])).toContain(
      "event = '$autocapture' AND elements_chain LIKE '%Continue to survey introduction%'"
    );
  });
});

describe("fetchSessionSources", () => {
  it("groups the live site's visits by their first page's tags, read as the tracker reads them", async () => {
    mockHogql.mockResolvedValue({
      ok: true,
      cut: null,
      rows: [
        ["google", "cpc", 1, 0, "", 30],
        ["", "", 0, 0, "www.google.com", 10],
        ["", "", 0, 0, "$direct", 50],
        ["", "", 0, 0, "www.loveiq.org", 5],
        ["paid%20social", null, 0, 1, "", 2],
      ],
    });
    // Its own range, so the five-minute cache holds nothing for it.
    const r = await fetchSessionSources("2026-06-01", "2026-06-07");
    const tag = { src: null, med: null, ads: false, fb: false, ref: null };
    expect(r).toEqual({
      ok: true,
      value: [
        { ...tag, src: "google", med: "cpc", ads: true, sessions: 30 },
        { ...tag, ref: "www.google.com", sessions: 10 },
        // No referrer, or our own page: no site to name, as the tracker keeps it.
        { ...tag, sessions: 50 },
        { ...tag, sessions: 5 },
        { ...tag, src: "paid social", fb: true, sessions: 2 },
      ],
    });
    const [query, cap] = mockHogql.mock.calls[0]!;
    expect(cap).toBe(1000);
    expect(String(query)).toMatch(/LIMIT 1000$/);
    expect(String(query)).toContain("properties.$host = 'www.loveiq.org'");
    expect(String(query)).toContain("argMin(properties.$current_url, timestamp) AS url");
    // The referrer only where classifySource reads it, so the groups stay few.
    expect(String(query)).toContain("if(src = '' AND med = '' AND ads = 0 AND fb = 0, ref, '')");
    // Berlin's 1 Jun starts at 22:00 UTC the day before.
    expect(String(query)).toContain("timestamp >= toDateTime('2026-05-31 22:00:00', 'UTC')");
  });

  it("fails plainly when PostHog cuts the answer short, rather than splitting part of it", async () => {
    mockHogql.mockResolvedValue({ ok: true, cut: "own_limit", rows: [] });
    expect(await fetchSessionSources("2026-06-08", "2026-06-14")).toMatchObject({ ok: false });
  });
});

describe("fetchVisitorGroups", () => {
  const A = "0192f0aa-1111-7000-8000-000000000001";
  const B = "0192f0aa-2222-7000-8000-000000000002";

  it("asks only about real visit ids, and reads each one's group for the range", async () => {
    mockHogql.mockResolvedValue({
      ok: true,
      cut: null,
      rows: [
        [A, "new"],
        [B, "returning"],
      ],
    });
    const r = await fetchVisitorGroups("2026-06-01", "2026-06-07", [
      A.toUpperCase(),
      B,
      B,
      null,
      "x' OR 1=1 --",
    ]);
    expect(r.ok && [...r.value]).toEqual([
      [A, "new"],
      [B, "returning"],
    ]);
    const query = String(mockHogql.mock.calls[0]![0]);
    expect(query).toContain(`'${A}','${B}')`);
    expect(query).not.toMatch(/OR 1=1/);
    // New: first seen in the range, as fetchNewReturning counts its visitors.
    expect(query).toContain(
      "if(f.first_seen >= toDateTime('2026-05-31 22:00:00', 'UTC'), 'new', 'returning')"
    );
  });

  it("asks nothing when no payment has a visit id, and says when PostHog fails", async () => {
    expect(await fetchVisitorGroups("2026-06-01", "2026-06-07", [null])).toEqual({
      ok: true,
      value: new Map(),
    });
    expect(mockHogql).not.toHaveBeenCalled();
    mockHogql.mockResolvedValue({ ok: false, error: "boom" });
    expect(
      await fetchVisitorGroups("2026-06-15", "2026-06-21", ["0192f0aa-9999-7000-8000-000000000009"])
    ).toMatchObject({ ok: false });
  });
});

describe("fetchFacts", () => {
  it("stamps the Berlin day it read the facts on", async () => {
    clearFactsCache();
    mockSupabaseFetch.mockResolvedValue(
      json({
        visits: [],
        starts: [],
        subs: [],
        money: [],
        checkouts: [],
        intro: [],
        invites: [],
        quotes: [],
      })
    );
    // 22:30 UTC on 13 Oct is already 14 Oct in Berlin.
    const f = await fetchFacts("2026-10-01", "2026-10-07", Date.parse("2026-10-13T22:30:00Z"));
    expect(f.asOf).toBe("2026-10-14");
    clearFactsCache();
  });
});
