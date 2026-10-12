import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockRecordCronRun = vi.fn();
vi.mock("@shared/observability/slack-alert-dedup", () => ({
  verifyCronAuth: (req: Request) => req.headers.get("authorization") === "Bearer s",
  recordCronRun: (...a: unknown[]) => mockRecordCronRun(...a),
}));

const mockProdHost = vi.fn(() => true);
vi.mock("@shared/http/is-prod-cron-host", () => ({ isProdCronHost: () => mockProdHost() }));

const mockKpiWeek = vi.fn();
vi.mock("@features/admin/server/kpi-weekly", async (orig) => ({
  ...(await orig<typeof import("@features/admin/server/kpi-weekly")>()),
  fetchKpiWeek: (...a: unknown[]) => mockKpiWeek(...a),
}));

const mockRuns = vi.fn();
vi.mock("@features/admin/server/dropoff-report", async (orig) => ({
  ...(await orig<typeof import("@features/admin/server/dropoff-report")>()),
  fetchDropoffRuns: (...a: unknown[]) => mockRuns(...a),
}));

const mockAdCost = vi.fn();
vi.mock("@features/brain/server/ingest/analytics", async (orig) => ({
  ...(await orig<typeof import("@features/brain/server/ingest/analytics")>()),
  adCostByDay: () => mockAdCost(),
}));

const mockPages = vi.fn();
const mockReadRows = vi.fn();
vi.mock("@features/admin/server/kpi-notion", async (orig) => ({
  ...(await orig<typeof import("@features/admin/server/kpi-notion")>()),
  readKpiPages: (...a: unknown[]) => mockPages(...a),
  readKpiRows: (...a: unknown[]) => mockReadRows(...a),
}));

const mockApply = vi.fn();
vi.mock("@features/admin/server/notion-row-sync", async (orig) => ({
  ...(await orig<typeof import("@features/admin/server/notion-row-sync")>()),
  applyRowSync: (...a: unknown[]) => mockApply(...a),
}));

const mockUpdate = vi.fn();
const mockCallout = vi.fn();
const mockDeadline = vi.fn();
vi.mock("@features/brain/server/act/notion", () => ({
  updateNotionPage: (...a: unknown[]) => mockUpdate(...a),
  upsertMarkedCallout: (...a: unknown[]) => mockCallout(...a),
  withNotionDeadline: (deadline: number, work: () => Promise<unknown>) => {
    mockDeadline(deadline);
    return work();
  },
}));

import { GET, KPI_MARKER } from "@/app/api/cron/kpi-weekly/route";
import { KPI_NUMBERS_DATABASE_ID } from "@features/admin/server/kpi-notion";
import { KPIS, type KpiRow } from "@features/admin/server/kpi-weekly";
import type { SyncPlan } from "@features/admin/server/notion-row-sync";

const call = (auth = "Bearer s") =>
  GET(new Request("https://loveiq.org/api/cron/kpi-weekly", { headers: { authorization: auth } }));

const week = {
  visits: { all: 2000, by_arm: { white_card: 300, white_video: 300 } },
  starts: { all: 280, google_ads: 250, by_arm: { white_card: 80, white_video: 90 } },
  finished: { all: 140, google_ads: 125 },
  checkout: 6,
  checkout_paid: 1,
  paywall: 90,
  sales: 1,
  sales_google_ads: 1,
  gifted: 0,
  revenue: 6.99,
  finish_cohort: { finished: 140, paid: 1 },
  start_cohort: {
    all: { started: 300, finished: 140 },
    google_ads: { started: 270, finished: 126 },
    other: { started: 30, finished: 14 },
    phone: { started: 0, finished: 0 },
    computer: { started: 0, finished: 0 },
  },
  survey_minutes: { n: 140, median: 15, p90: 28 },
  report_minutes: { n: 160, median: 2, p90: 15 },
  thumbs: { up: 5, down: 1 },
};

const allPages = () =>
  new Map([
    ...KPIS.map((k, i): [string, string] => [k.title, `page-${i}`]),
    ["Survey Drop-off Rate per Question %", "page-dropoff"],
  ]);

describe("GET /api/cron/kpi-weekly", () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-13T08:15:00Z")); // a Tuesday: eight weeks and one day
    process.env.NOTION_KPI_TOKEN = "ntn_kpi_test";
    const { parseKpiWeek } = await import("@features/admin/server/kpi-weekly");
    for (const m of [mockRecordCronRun, mockUpdate, mockCallout, mockDeadline]) m.mockReset();
    mockProdHost.mockReturnValue(true);
    mockKpiWeek.mockReset().mockImplementation(async () => parseKpiWeek(week));
    mockRuns.mockReset().mockResolvedValue([]);
    mockAdCost.mockReset().mockResolvedValue({
      byDay: new Map([["2026-10-05", 40]]),
      from: "2026-05-28",
      to: "2026-10-11",
    });
    mockPages.mockReset().mockResolvedValue(allPages());
    mockReadRows.mockReset().mockResolvedValue([]);
    mockCallout.mockResolvedValue("updated");
    mockApply.mockReset().mockImplementation(async (_db: string, plan: SyncPlan<KpiRow>) => ({
      created: plan.create.length,
      updated: plan.update.length,
      archived: plan.archive.length,
      pending: 0,
      failed: 0,
      firstError: null,
    }));
  });

  it("refuses without the cron bearer, and does nothing off production", async () => {
    expect((await call("Bearer nope")).status).toBe(401);
    mockProdHost.mockReturnValue(false);
    expect(await (await call()).json()).toMatchObject({ skipped: true });
    expect(mockKpiWeek).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("writes nothing without its own Notion connection", async () => {
    delete process.env.NOTION_KPI_TOKEN;
    expect((await call()).status).toBe(500);
    expect(mockKpiWeek).not.toHaveBeenCalled();
    expect(mockRecordCronRun.mock.calls[0]![3]).toBe("NOTION_KPI_TOKEN is unset");
  });

  it("reads every week first, then writes the columns, the High pages and the rows", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(mockKpiWeek).toHaveBeenCalledTimes(9); // eight complete weeks and the week so far

    // 📊 KPI: every computed KPI's row and the drop-off row, with the KPI connection.
    expect(mockUpdate).toHaveBeenCalledTimes(KPIS.length + 1);
    expect(mockUpdate.mock.calls.every((c) => c[2] === "ntn_kpi_test")).toBe(true);
    expect(mockUpdate.mock.calls.map((c) => c[0])).toContain("page-dropoff");
    const finished = mockUpdate.mock.calls.find(
      (c) => c[0] === `page-${KPIS.findIndex((k) => k.id === "finished")}`
    )![1] as Record<string, { rich_text: Array<{ text: { content: string } }> }>;
    expect(finished["Last full week"]!.rich_text[0]!.text.content).toBe("140 (5 to 11 Oct)");
    expect(finished["This week so far"]!.rich_text[0]!.text.content).toBe("140 (1 day)");

    // A summary on each High KPI's page, found again by the marker.
    const high = KPIS.filter((k) => k.high);
    expect(mockCallout).toHaveBeenCalledTimes(high.length);
    for (const [, opts] of mockCallout.mock.calls as Array<
      [string, { marker: string; token: string }]
    >) {
      expect(opts.marker).toBe(KPI_MARKER);
      expect(opts.token).toBe("ntn_kpi_test");
    }

    // The rows, from the first week shown, with frozen weeks left alone.
    expect(mockReadRows).toHaveBeenCalledWith(KPI_NUMBERS_DATABASE_ID, "2026-08-17", {
      token: "ntn_kpi_test",
      isOutOfTime: expect.any(Function),
    });
    const [, plan, , , token] = mockApply.mock.calls[0] as [
      string,
      SyncPlan<KpiRow>,
      unknown,
      unknown,
      string,
    ];
    expect(token).toBe("ntn_kpi_test");
    expect(plan.create.some((r) => r.key === "finished · 2026-10-12 · All traffic")).toBe(true);

    // Every part under one Notion deadline, 270 s after the start.
    expect(new Set(mockDeadline.mock.calls.map((c) => c[0]))).toEqual(
      new Set([Date.parse("2026-10-13T08:15:00Z") + 270_000])
    );
    const [name, , status, detail] = mockRecordCronRun.mock.calls[0] as [
      string,
      number,
      string,
      string,
    ];
    expect([name, status]).toEqual(["kpi-weekly", "success"]);
    expect(detail).toMatch(
      /^weeks=9 kpis=18 table=19 pages=11 rows=\d+ created=\d+ updated=0 archived=0$/
    );
  });

  it("writes nothing when any week cannot be read", async () => {
    mockKpiWeek.mockRejectedValueOnce(new Error("get_kpi_week 500"));
    expect((await call()).status).toBe(500);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCallout).not.toHaveBeenCalled();
    expect(mockApply).not.toHaveBeenCalled();
    expect(mockRecordCronRun.mock.calls[0]![3]).toBe("get_kpi_week 500");
  });

  it("writes nothing when the ad spend cannot be read, rather than trash the cost rows", async () => {
    // What adCostByDay returns when its read fails.
    mockAdCost.mockResolvedValue({ byDay: new Map(), from: null, to: null });
    expect((await call()).status).toBe(500);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCallout).not.toHaveBeenCalled();
    expect(mockApply).not.toHaveBeenCalled();
    const [, , status, detail] = mockRecordCronRun.mock.calls[0] as [
      string,
      number,
      string,
      string,
    ];
    expect([status, detail]).toEqual(["error", "Google Ads spend could not be read"]);
  });

  it("names a KPI that has gone from 📊 KPI, and still writes the rest", async () => {
    const pages = allPages();
    pages.delete("Paid Reports #");
    mockPages.mockResolvedValue(pages);
    expect((await call()).status).toBe(500);
    expect(mockUpdate).toHaveBeenCalledTimes(KPIS.length);
    expect(mockApply).toHaveBeenCalled();
    expect(mockRecordCronRun.mock.calls[0]![3]).toContain(
      "kpi table: not in 📊 KPI: Paid Reports #"
    );
  });

  it("records rows left for tomorrow as an error", async () => {
    mockApply.mockResolvedValueOnce({
      created: 3,
      updated: 0,
      archived: 0,
      pending: 4,
      failed: 0,
      firstError: null,
    });
    expect((await call()).status).toBe(500);
    expect(mockRecordCronRun.mock.calls[0]![3]).toContain("rows: 4 writes left for tomorrow");
  });
});
