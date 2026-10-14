import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockIngest = vi.fn();
vi.mock("@features/brain/server/ingest/drive", () => ({
  ingestFreshMeetingNotes: (...a: unknown[]) => mockIngest(...(a as [])),
}));

const mockLink = vi.fn();
vi.mock("@features/brain/server/ingest/link", () => ({
  linkMeetings: (...a: unknown[]) => mockLink(...(a as [])),
}));

let prodHost = true;
vi.mock("@shared/http/is-prod-cron-host", () => ({ isProdCronHost: () => prodHost }));
vi.mock("@shared/http/google-oauth", () => ({ readVercelOidcToken: () => null }));

let authOk = true;
const recorded: Array<{ name: string; status: string; error?: string }> = [];
vi.mock("@shared/observability/slack-alert-dedup", () => ({
  verifyCronAuth: () => authOk,
  startCronTimer: () => async () => {},
  recordCronRun: async (name: string, _s: number, status: string, error?: string) => {
    recorded.push({ name, status, error });
  },
  tryClaimSlackAlert: async () => true,
  markSlackAlertDelivered: async () => {},
}));

const notified: Array<{ channel: string; text: string }> = [];
vi.mock("@shared/observability/slack", () => ({
  notifySlack: async (i: { channel: string; text: string }) => {
    notified.push(i);
  },
  escapeSlack: (s: string) => s,
}));

import { GET } from "@/app/api/cron/brain-meeting-notes/route";

const req = () => new Request("https://www.loveiq.org/api/cron/brain-meeting-notes");

describe("/api/cron/brain-meeting-notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recorded.length = 0;
    notified.length = 0;
    authOk = true;
    prodHost = true;
    mockLink.mockResolvedValue({ source: "links", rows: 0, swept: 0 });
  });

  it("refuses a caller without the cron secret", async () => {
    authOk = false;
    expect((await GET(req())).status).toBe(401);
    expect(mockIngest).not.toHaveBeenCalled();
  });

  it("does nothing on staging, which shares the database", async () => {
    prodHost = false;
    expect(await (await GET(req())).json()).toMatchObject({ skipped: true });
    expect(mockIngest).not.toHaveBeenCalled();
  });

  it("links the meetings when it wrote a note, since a write replaces the link", async () => {
    mockIngest.mockResolvedValue({
      source: "drive",
      rows: 3,
      swept: 0,
      detail: "notes=1 stale=1 written=3",
    });
    await GET(req());
    expect(mockLink).toHaveBeenCalledTimes(1);
    expect(recorded).toEqual([
      { name: "brain-meeting-notes", status: "success", error: "notes=1 stale=1 written=3" },
    ]);
  });

  it("skips the linker when nothing was written, which is most runs", async () => {
    mockIngest.mockResolvedValue({
      source: "drive",
      rows: 0,
      swept: 0,
      detail: "notes=2 stale=0 written=0",
    });
    await GET(req());
    expect(mockLink).not.toHaveBeenCalled();
    expect(recorded[0]!.status).toBe("success");
    expect(notified).toHaveLength(0);
  });

  it("keeps a failed link from failing the run", async () => {
    mockIngest.mockResolvedValue({ source: "drive", rows: 3, swept: 0, detail: "written=3" });
    mockLink.mockRejectedValue(new Error("db down"));
    await GET(req());
    expect(recorded[0]!.status).toBe("success");
  });

  it("alerts #brain once when it skips for a reason that is a fault", async () => {
    mockIngest.mockResolvedValue({
      source: "drive",
      rows: 0,
      swept: 0,
      skipped: "team-export-check-failed",
    });
    await GET(req());
    expect(recorded[0]!.status).toBe("error");
    expect(notified).toHaveLength(1);
    expect(notified[0]!.channel).toBe("brain");
  });

  it("stays quiet where Google is not set up", async () => {
    mockIngest.mockResolvedValue({
      source: "drive",
      rows: 0,
      swept: 0,
      skipped: "google-not-configured",
    });
    await GET(req());
    expect(recorded[0]!.status).toBe("success");
    expect(notified).toHaveLength(0);
  });

  it("records and alerts a crash, and still answers 200 so Vercel does not retry", async () => {
    mockIngest.mockRejectedValue(new Error("brain_chunk upsert failed (500)"));
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(recorded[0]).toMatchObject({
      status: "error",
      error: "brain_chunk upsert failed (500)",
    });
    expect(notified[0]!.text).toMatch(/brain-meeting-notes failed/);
  });

  it("gives itself twenty seconds of reading under a sixty-second ceiling", async () => {
    mockIngest.mockResolvedValue({ source: "drive", rows: 0, swept: 0 });
    await GET(req());
    const isOutOfTime = mockIngest.mock.calls[0]![1] as () => boolean;
    expect(isOutOfTime()).toBe(false);
  });
});
