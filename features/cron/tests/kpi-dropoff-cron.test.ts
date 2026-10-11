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

const mockEnds = vi.fn();
vi.mock("@features/admin/server/dropoff-weekly", async (orig) => ({
  ...(await orig<typeof import("@features/admin/server/dropoff-weekly")>()),
  fetchQuestionEnds: (...a: unknown[]) => mockEnds(...a),
}));

const mockPng = vi.fn();
vi.mock("@features/brain/server/chart", () => ({ chartPng: (...a: unknown[]) => mockPng(...a) }));

const mockUpload = vi.fn();
const mockUpsert = vi.fn();
vi.mock("@features/brain/server/act/notion", () => ({
  uploadNotionPng: (...a: unknown[]) => mockUpload(...a),
  upsertMarkedImage: (...a: unknown[]) => mockUpsert(...a),
}));

import { CHART_MARKER, GET } from "@/app/api/cron/kpi-dropoff/route";
import { DROPOFF_KPI_PAGE_ID } from "@features/admin/server/dropoff-weekly";

const call = (auth = "Bearer s") =>
  GET(new Request("https://loveiq.org/api/cron/kpi-dropoff", { headers: { authorization: auth } }));

describe("GET /api/cron/kpi-dropoff", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-12T08:30:00Z")); // a Monday: three complete weeks
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.loveiq.org";
    process.env.STRATEGY_DIGEST_SIGNING_SECRET = "a-test-secret-of-some-length";
    mockRecordCronRun.mockReset();
    mockProdHost.mockReturnValue(true);
    mockEnds.mockReset().mockResolvedValue(new Map([["00000", { sessions: 160, quits: 25 }]]));
    mockPng.mockReset().mockResolvedValue(Buffer.from("PNGDATA").toString("base64"));
    mockUpload.mockReset().mockResolvedValue("upload-1");
    mockUpsert.mockReset().mockResolvedValue("created");
  });

  it("refuses without the cron bearer, and does nothing off production", async () => {
    expect((await call("Bearer nope")).status).toBe(401);
    mockProdHost.mockReturnValue(false);
    expect(await (await call()).json()).toMatchObject({ skipped: true });
    expect(mockEnds).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("draws every complete week and replaces only its own image on the KPI page", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(mockEnds).toHaveBeenCalledTimes(3);
    const chartUrl = new URL(String(mockPng.mock.calls[0]![0]));
    expect(chartUrl.origin + chartUrl.pathname).toBe(
      "https://www.loveiq.org/api/admin/digest-image/dropout-weekly"
    );
    expect(chartUrl.searchParams.get("d")).toBeTruthy();
    expect(chartUrl.searchParams.get("s")).toBeTruthy();
    const [bytes, filename] = mockUpload.mock.calls[0] as [Buffer, string];
    expect(bytes.toString()).toBe("PNGDATA");
    expect(filename).toBe("dropoff-per-question-2026-10-12.png");
    expect(mockUpsert).toHaveBeenCalledWith(
      DROPOFF_KPI_PAGE_ID,
      expect.objectContaining({ marker: CHART_MARKER, fileUploadId: "upload-1" })
    );
    const { caption } = mockUpsert.mock.calls[0]![1] as { caption: string };
    expect(caption).toContain(CHART_MARKER); // or tomorrow's run cannot find it again
    expect(mockRecordCronRun).toHaveBeenCalledWith(
      "kpi-dropoff",
      expect.any(Number),
      "success",
      expect.stringMatching(/^created weeks=3 questions=\d+$/)
    );
  });

  it("keeps yesterday's chart when a week cannot be read", async () => {
    mockEnds.mockRejectedValueOnce(new Error("get_survey_friction 500"));
    expect((await call()).status).toBe(500);
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockRecordCronRun).toHaveBeenCalledWith(
      "kpi-dropoff",
      expect.any(Number),
      "error",
      "get_survey_friction 500"
    );
  });

  it("keeps yesterday's chart when the picture does not render", async () => {
    mockPng.mockResolvedValue(null);
    expect((await call()).status).toBe(500);
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockRecordCronRun.mock.calls[0]![2]).toBe("error");
  });
});
