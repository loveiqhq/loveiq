import { beforeEach, describe, expect, it, vi } from "vitest";

const mockIsProdCronHost = vi.fn();
const mockIngestGa4 = vi.fn();
const mockVerifyCronAuth = vi.fn();
const mockRecordCronRun = vi.fn();
vi.mock("@shared/http/is-prod-cron-host", () => ({
  isProdCronHost: () => mockIsProdCronHost(),
}));
vi.mock("@shared/observability/slack-alert-dedup", () => ({
  verifyCronAuth: (r: Request) => mockVerifyCronAuth(r),
  recordCronRun: (...a: unknown[]) => mockRecordCronRun(...a),
  startCronTimer: () => vi.fn(),
}));
vi.mock("@shared/http/google-oauth", () => ({ readVercelOidcToken: () => "oidc" }));
vi.mock("@features/brain/server/ingest/google", () => ({
  BACKFILL_DAYS: 480,
  ingestGa4: (...a: unknown[]) => mockIngestGa4(...a),
}));

import { GET } from "@/app/api/cron/brain-ga4-backfill/route";

const req = () => new Request("https://www.loveiq.org/api/cron/brain-ga4-backfill");

describe("GET /api/cron/brain-ga4-backfill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyCronAuth.mockReturnValue(true);
    mockIsProdCronHost.mockReturnValue(true);
    mockIngestGa4.mockResolvedValue({ source: "ga4", rows: 480, swept: 0 });
  });

  it("refuses without the cron secret and writes nothing", async () => {
    mockVerifyCronAuth.mockReturnValue(false);
    expect((await GET(req())).status).toBe(401);
    expect(mockIngestGa4).not.toHaveBeenCalled();
  });

  it("writes only from production", async () => {
    mockIsProdCronHost.mockReturnValue(false);
    expect(await (await GET(req())).json()).toMatchObject({ skipped: true });
    expect(mockIngestGa4).not.toHaveBeenCalled();
  });

  it("fetches GA4's whole history once, and records the run", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(mockIngestGa4).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Function),
      480,
      "oidc"
    );
    expect(mockRecordCronRun).toHaveBeenCalledWith(
      "brain-ga4-backfill",
      expect.any(Number),
      "success",
      undefined
    );
  });

  it("reports a skipped ingest (out of time, Google not set up) as a failure, not a success", async () => {
    mockIngestGa4.mockResolvedValue({
      source: "ga4",
      rows: 0,
      swept: 0,
      skipped: "ga4-time-budget",
    });
    expect((await GET(req())).status).toBe(503);
    expect(mockRecordCronRun).toHaveBeenCalledWith(
      "brain-ga4-backfill",
      expect.any(Number),
      "error",
      "ga4-time-budget"
    );
  });
});
