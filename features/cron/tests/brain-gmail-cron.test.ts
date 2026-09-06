import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockIngest = vi.fn();
vi.mock("@features/brain/server/ingest/gmail", () => ({
  ingestGmail: (...a: unknown[]) => mockIngest(...(a as [])),
}));

let prodHost = true;
vi.mock("@shared/http/is-prod-cron-host", () => ({ isProdCronHost: () => prodHost }));
vi.mock("@shared/http/vercel-oidc", () => ({ readVercelOidcToken: () => null }));

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

import { GET } from "@/app/api/cron/brain-gmail/route";

const req = () => new Request("https://www.loveiq.org/api/cron/brain-gmail");

describe("/api/cron/brain-gmail records WHY, not just whether", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recorded.length = 0;
    notified.length = 0;
    authOk = true;
    prodHost = true;
  });

  it("records the walk detail even when the skip is deliberate and nothing alerts", async () => {
    /**
     * THE REGRESSION THIS EXISTS FOR.
     *
     * `gmail-walk-in-progress` is in DELIBERATE_SKIPS, so it reports success and
     * never alerts — correct, a converging re-walk is not a fault. But it also left
     * `error_message` empty, which made a walk that has NEVER completed byte-identical
     * in `cron_run` to a healthy one.
     *
     * Measured 2026-09-06: `brain_sweep_state` had no gmail row at all — not one
     * completed walk, ever — across 24 consecutive runs that every one recorded
     * `success` with no message. The diagnosis existed the whole time and went only
     * to a log stream that cannot be queried after the fact.
     */
    mockIngest.mockResolvedValue({
      source: "gmail",
      rows: 12,
      swept: 0,
      skipped: "gmail-walk-in-progress",
      complete: false,
      detail:
        "boxes=7 listed=3918 fetched=120 written=12 complete=false stopped=time-budget@ec@loveiq.org:p9",
    });
    await GET(req());
    expect(recorded).toHaveLength(1);
    // Still success: a converging walk must not be loud.
    expect(recorded[0]!.status).toBe("success");
    expect(notified).toHaveLength(0);
    // ...but no longer silent about what it saw.
    expect(recorded[0]!.error).toMatch(/stopped=time-budget@ec@loveiq\.org:p9/);
  });

  it("keeps the detail alongside the skip name when the skip IS a fault", async () => {
    mockIngest.mockResolvedValue({
      source: "gmail",
      rows: 0,
      swept: 0,
      skipped: "gmail-walk-incomplete",
      complete: false,
      detail: "boxes=7 listed=0 stopped=listing-refused@ec@loveiq.org:p0",
    });
    await GET(req());
    expect(recorded[0]!.status).toBe("error");
    expect(recorded[0]!.error).toMatch(/gmail-walk-incomplete/);
    expect(recorded[0]!.error).toMatch(/stopped=listing-refused/);
    expect(notified).toHaveLength(1);
  });

  it("records the detail on a fully healthy run too", async () => {
    // Otherwise "no message" would still be ambiguous between healthy and unreported.
    mockIngest.mockResolvedValue({
      source: "gmail",
      rows: 9000,
      swept: 4,
      complete: true,
      detail: "boxes=7 listed=3918 fetched=30 written=30 swept=4 complete=true",
    });
    await GET(req());
    expect(recorded[0]!.status).toBe("success");
    expect(recorded[0]!.error).toMatch(/complete=true/);
  });
});
