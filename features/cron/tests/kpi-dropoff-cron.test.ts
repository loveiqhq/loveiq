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

const mockRuns = vi.fn();
vi.mock("@features/admin/server/dropoff-report", async (orig) => ({
  ...(await orig<typeof import("@features/admin/server/dropoff-report")>()),
  fetchDropoffRuns: (...a: unknown[]) => mockRuns(...a),
}));

const mockReadRows = vi.fn();
const mockApply = vi.fn();
vi.mock("@features/admin/server/dropoff-notion", async (orig) => ({
  ...(await orig<typeof import("@features/admin/server/dropoff-notion")>()),
  readDropoffRows: (...a: unknown[]) => mockReadRows(...a),
  applySync: (...a: unknown[]) => mockApply(...a),
}));

const mockPng = vi.fn();
vi.mock("@features/brain/server/chart", () => ({ chartPng: (...a: unknown[]) => mockPng(...a) }));

const mockUpload = vi.fn();
const mockImage = vi.fn();
const mockCallout = vi.fn();
vi.mock("@features/brain/server/act/notion", () => ({
  uploadNotionPng: (...a: unknown[]) => mockUpload(...a),
  upsertMarkedImage: (...a: unknown[]) => mockImage(...a),
  upsertMarkedCallout: (...a: unknown[]) => mockCallout(...a),
}));

import { CHART_MARKER, GET } from "@/app/api/cron/kpi-dropoff/route";
import { DROPOFF_DATA_DATABASE_ID, type SyncPlan } from "@features/admin/server/dropoff-notion";
import { DROPOFF_KPI_PAGE_ID } from "@features/admin/server/dropoff-weekly";

const call = (auth = "Bearer s") =>
  GET(new Request("https://loveiq.org/api/cron/kpi-dropoff", { headers: { authorization: auth } }));

const someone = {
  sessionId: "00000000-0000-4000-8000-000000000001",
  startedAt: Date.parse("2026-09-22T10:00:00Z"),
  reached: ["00001", "00000"],
  leftAt: "00000",
  source: "google_ads" as const,
};

describe("GET /api/cron/kpi-dropoff", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-12T08:30:00Z")); // a Monday: three complete weeks
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.loveiq.org";
    process.env.STRATEGY_DIGEST_SIGNING_SECRET = "a-test-secret-of-some-length";
    mockRecordCronRun.mockReset();
    mockProdHost.mockReturnValue(true);
    mockRuns.mockReset().mockResolvedValue(Array.from({ length: 30 }, () => someone));
    mockPng.mockReset().mockResolvedValue(Buffer.from("PNGDATA").toString("base64"));
    mockUpload.mockReset().mockResolvedValue("upload-1");
    mockImage.mockReset().mockResolvedValue("updated");
    mockCallout.mockReset().mockResolvedValue("updated");
    mockReadRows.mockReset().mockResolvedValue([]);
    mockApply.mockReset().mockImplementation(async (_db: string, plan: SyncPlan) => ({
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
    expect(mockRuns).not.toHaveBeenCalled();
    expect(mockCallout).not.toHaveBeenCalled();
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("reads every complete week and the tests since launch, then writes all three parts", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    // Three weeks plus the tests' window from the first launch to today (Berlin).
    expect(mockRuns).toHaveBeenCalledTimes(4);
    const windows = mockRuns.mock.calls.map(([s, u]) => [
      (s as Date).toISOString(),
      (u as Date).toISOString(),
    ]);
    expect(windows).toContainEqual(["2026-10-06T18:18:00.000Z", "2026-10-11T22:00:00.000Z"]);
    expect(windows).toContainEqual(["2026-09-20T22:00:00.000Z", "2026-09-27T22:00:00.000Z"]);

    const [pageId, callout] = mockCallout.mock.calls[0] as [
      string,
      { marker: string; lines: Array<Array<{ text: string }>> },
    ];
    expect(pageId).toBe(DROPOFF_KPI_PAGE_ID);
    expect(callout.marker).toBe(CHART_MARKER);
    expect(
      callout.lines
        .flat()
        .map((s) => s.text)
        .join("")
    ).toContain(CHART_MARKER);

    const chartUrl = new URL(String(mockPng.mock.calls[0]![0]));
    expect(chartUrl.origin + chartUrl.pathname).toBe(
      "https://www.loveiq.org/api/admin/digest-image/dropout-weekly"
    );
    expect(mockUpload.mock.calls[0]![1]).toBe("dropoff-per-question-2026-10-12.png");
    const image = mockImage.mock.calls[0]![1] as {
      marker: string;
      caption: string;
      fileUploadId: string;
    };
    expect(image).toMatchObject({ marker: CHART_MARKER, fileUploadId: "upload-1" });
    expect(image.caption).toContain(CHART_MARKER); // or tomorrow's run cannot find it again

    expect(mockReadRows).toHaveBeenCalledWith(DROPOFF_DATA_DATABASE_ID, "2026-09-21");
    const [db, plan] = mockApply.mock.calls[0] as [string, SyncPlan];
    expect(db).toBe(DROPOFF_DATA_DATABASE_ID);
    expect(plan.create.length).toBeGreaterThan(0);
    expect(plan.create.every((r) => r.week >= "2026-09-21")).toBe(true);

    const [name, , status, detail] = mockRecordCronRun.mock.calls[0] as [
      string,
      number,
      string,
      string,
    ];
    expect([name, status]).toEqual(["kpi-dropoff", "success"]);
    expect(detail).toMatch(
      /^summary=updated picture=updated weeks=3 rows=\d+ created=\d+ updated=0 archived=0$/
    );
  });

  it("writes nothing when any week cannot be read", async () => {
    mockRuns.mockRejectedValueOnce(new Error("get_survey_dropoff_runs 500"));
    expect((await call()).status).toBe(500);
    expect(mockCallout).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockApply).not.toHaveBeenCalled();
    expect(mockRecordCronRun).toHaveBeenCalledWith(
      "kpi-dropoff",
      expect.any(Number),
      "error",
      "get_survey_dropoff_runs 500"
    );
  });

  it("keeps writing the other parts when one fails, and records the run as an error", async () => {
    mockPng.mockResolvedValue(null);
    expect((await call()).status).toBe(500);
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockCallout).toHaveBeenCalled();
    expect(mockApply).toHaveBeenCalled();
    const [, , status, detail] = mockRecordCronRun.mock.calls[0] as [
      string,
      number,
      string,
      string,
    ];
    expect(status).toBe("error");
    expect(detail).toContain("picture=failed");
    expect(detail).toContain("picture: the chart did not render");
  });

  it("records rows left for tomorrow or failed writes as an error", async () => {
    mockApply.mockResolvedValueOnce({
      created: 10,
      updated: 0,
      archived: 0,
      pending: 5,
      failed: 0,
      firstError: null,
    });
    expect((await call()).status).toBe(500);
    expect(mockRecordCronRun.mock.calls[0]![3]).toContain("rows: 5 writes left for tomorrow");
    mockRecordCronRun.mockReset();
    mockApply.mockResolvedValueOnce({
      created: 0,
      updated: 0,
      archived: 0,
      pending: 0,
      failed: 2,
      firstError: "validation_error",
    });
    expect((await call()).status).toBe(500);
    expect(mockRecordCronRun.mock.calls[0]![3]).toContain(
      "rows: 2 writes failed: validation_error"
    );
  });
});
