import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockIngest = vi.fn();
vi.mock("@features/brain/server/ingest/drive", () => ({
  ingestDrive: (...a: unknown[]) => mockIngest(...(a as [])),
}));

let prodHost = true;
vi.mock("@shared/http/is-prod-cron-host", () => ({ isProdCronHost: () => prodHost }));

let authOk = true;
const claims: string[] = [];
let claimGranted = true;
const marked: string[] = [];
const recorded: Array<{ name: string; status: string; error?: string }> = [];
vi.mock("@shared/observability/slack-alert-dedup", () => ({
  verifyCronAuth: () => authOk,
  startCronTimer: () => async () => {},
  recordCronRun: async (name: string, _s: number, status: string, error?: string) => {
    recorded.push({ name, status, error });
  },
  tryClaimSlackAlert: async (key: string) => {
    claims.push(key);
    return claimGranted;
  },
  markSlackAlertDelivered: async (key: string) => {
    marked.push(key);
  },
}));

const notified: Array<{ channel: string; text: string }> = [];
vi.mock("@shared/observability/slack", () => ({
  notifySlack: async (i: { channel: string; text: string }) => {
    notified.push(i);
  },
  escapeSlack: (s: string) => s,
}));

import { GET } from "@/app/api/cron/brain-drive/route";

const req = () => new Request("https://www.loveiq.org/api/cron/brain-drive");

describe("/api/cron/brain-drive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    claims.length = 0;
    marked.length = 0;
    notified.length = 0;
    recorded.length = 0;
    authOk = true;
    prodHost = true;
    claimGranted = true;
    mockIngest.mockResolvedValue({ source: "drive", rows: 3, swept: 0 });
  });

  it("refuses an unauthenticated request", async () => {
    authOk = false;
    expect((await GET(req())).status).toBe(401);
    expect(mockIngest).not.toHaveBeenCalled();
  });

  it("does nothing on a non-production host, because both share one database", async () => {
    // Without this the staging deployment would double-write every 15 minutes.
    prodHost = false;
    const body = await (await GET(req())).json();
    expect(body.skipped).toBe(true);
    expect(mockIngest).not.toHaveBeenCalled();
  });

  it("does NOT alert when nothing has been shared yet", async () => {
    // The expected state until somebody shares a folder. Alerting would page
    // 96 times a day for a source nobody has enabled.
    mockIngest.mockResolvedValue({ source: "drive", rows: 0, swept: 0, skipped: "drive-nothing-shared" });
    const body = await (await GET(req())).json();
    expect(body.ok).toBe(true);
    expect(notified).toHaveLength(0);
    expect(recorded[0].status).toBe("success");
  });

  it("does NOT alert when the credential is simply unconfigured", async () => {
    mockIngest.mockResolvedValue({ source: "drive", rows: 0, swept: 0, skipped: "google-not-configured" });
    await GET(req());
    expect(notified).toHaveLength(0);
  });

  it("DOES alert on an unexpected skip, and marks the claim delivered", async () => {
    // Unmarked claims were a real bug in the sibling cron: the row stayed
    // delivered=false and the stale-reclaim path re-fired on the next run.
    mockIngest.mockResolvedValue({ source: "drive", rows: 0, swept: 0, skipped: "drive-list-failed" });
    const body = await (await GET(req())).json();
    expect(body.ok).toBe(false);
    expect(notified).toHaveLength(1);
    expect(notified[0].text).toContain("drive-list-failed");
    expect(marked).toEqual(claims);
    expect(recorded[0].status).toBe("error");
  });

  it("alerts once per day, not once per run", async () => {
    mockIngest.mockResolvedValue({ source: "drive", rows: 0, swept: 0, skipped: "drive-list-failed" });
    claimGranted = false; // the day's claim is already taken
    await GET(req());
    expect(notified).toHaveLength(0);
    expect(recorded[0].status).toBe("error"); // still recorded, just not re-posted
  });

  it("returns 200 on a thrown error so Vercel does not retry a job that will fail again", async () => {
    mockIngest.mockRejectedValue(new Error("drive exploded"));
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(false);
    expect(recorded[0].status).toBe("error");
    expect(notified[0].text).toContain("drive exploded");
  });

  it("records the run even when it throws", async () => {
    mockIngest.mockRejectedValue(new Error("boom"));
    await GET(req());
    expect(recorded).toHaveLength(1);
    expect(recorded[0].name).toBe("brain-drive");
  });
});
