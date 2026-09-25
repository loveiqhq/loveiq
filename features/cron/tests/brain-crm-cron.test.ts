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
const mockNotice = vi.fn();
vi.mock("@features/brain/server/notice", () => ({
  recordNotice: (...a: unknown[]) => mockNotice(...a),
}));
const mockFile = vi.fn();
vi.mock("@features/brain/server/crm-calls", () => ({
  SESSIONS_DB: "Feedback Sessions",
  fileCrmCalls: (...a: unknown[]) => mockFile(...a),
  liveCrmDeps: () => ({}),
}));

import { GET } from "@/app/api/cron/brain-crm/route";

const call = (auth = "Bearer s") =>
  GET(new Request("https://loveiq.org/api/cron/brain-crm", { headers: { authorization: auth } }));

const filing = (over: Record<string, unknown> = {}) => ({
  call: {
    date: "2026-09-29",
    eventTitle: "60 min with Mark (Kiu Coates)",
    title: "t",
    url: "https://docs.google.com/document/d/N/edit",
  },
  people: [{ name: "Kiu Cortes " }],
  type: "Follow-up",
  url: "https://notion.so/row",
  ...over,
});

describe("GET /api/cron/brain-crm", () => {
  beforeEach(() => {
    mockRecordCronRun.mockReset();
    mockNotice.mockReset().mockResolvedValue(true);
    mockFile
      .mockReset()
      .mockResolvedValue({ calls: 5, filed: [filing()], skips: [], near: [], gaps: [] });
    mockProdHost.mockReturnValue(true);
  });

  it("refuses without the cron bearer, and does nothing off production", async () => {
    expect((await call("Bearer nope")).status).toBe(401);
    mockProdHost.mockReturnValue(false);
    expect(await (await call()).json()).toMatchObject({ skipped: true });
    expect(mockFile).not.toHaveBeenCalled();
  });

  it("files for real over the last fourteen days and announces each filed call", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const [since, dryRun] = mockFile.mock.calls[0]!;
    expect(dryRun).toBe(false);
    const days = (Date.now() - Date.parse(`${since as string}T00:00:00Z`)) / 86_400_000;
    expect(days).toBeGreaterThan(13);
    expect(days).toBeLessThan(15.5);
    expect(mockNotice).toHaveBeenCalledWith(
      expect.objectContaining({
        headline: "Filed the call with Kiu Cortes on 2026-09-29 into Feedback Sessions",
        detail: expect.stringContaining("https://notion.so/row"),
        kind: "brain-crm",
      })
    );
    expect(mockRecordCronRun).toHaveBeenCalledWith(
      "brain-crm",
      expect.any(Number),
      "success",
      "calls=5 filed=1 skipped=0 near=0"
    );
  });

  it("announces nothing for a row Notion refused, and fails the run when a row or a board failed", async () => {
    mockFile.mockResolvedValue({
      calls: 5,
      filed: [filing({ url: undefined, error: "validation_error" })],
      skips: [],
      near: [],
      gaps: ["The meeting notes could not be read."],
    });
    const res = await call();
    expect(res.status).toBe(502);
    expect(mockNotice).not.toHaveBeenCalled();
    expect(mockRecordCronRun).toHaveBeenCalledWith(
      "brain-crm",
      expect.any(Number),
      "error",
      "calls=5 filed=0 skipped=0 near=0 unread=The meeting notes could not be read. failed=validation_error"
    );
  });
});
