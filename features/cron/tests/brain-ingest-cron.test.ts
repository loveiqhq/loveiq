import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/**
 * Every ingester, so the route can be asserted to actually CALL each one.
 *
 * `vi.hoisted` because `vi.mock` factories are hoisted above ordinary top-level
 * declarations — a plain `const mk = …` is not initialised when the factory runs.
 */
const { calls, mk } = vi.hoisted(() => {
  const calls: Array<{ name: string; args: unknown[] }> = [];
  const mk =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push({ name, args });
      return Promise.resolve({ source: name, rows: 1, swept: 0 });
    };
  return { calls, mk };
});
vi.mock("@features/brain/server/ingest/analytics", () => ({ ingestAnalytics: mk("analytics") }));
vi.mock("@features/brain/server/ingest/drive", () => ({ ingestDrive: mk("drive") }));
vi.mock("@features/brain/server/ingest/google", () => ({
  ingestGa4: mk("ga4"),
  ingestSearchConsole: mk("gsc"),
}));
vi.mock("@features/brain/server/ingest/slack", () => ({ ingestSlack: mk("slack") }));
vi.mock("@features/brain/server/ingest/notion", () => ({ ingestNotion: mk("notion") }));

vi.mock("@shared/http/is-prod-cron-host", () => ({ isProdCronHost: () => true }));
vi.mock("@shared/observability/slack-alert-dedup", () => ({
  verifyCronAuth: () => true,
  startCronTimer: () => async () => {},
  recordCronRun: async () => {},
  tryClaimSlackAlert: async () => true,
  markSlackAlertDelivered: async () => {},
}));
vi.mock("@shared/observability/slack", () => ({
  notifySlack: async () => {},
  escapeSlack: (s: string) => s,
}));

import { GET } from "@/app/api/cron/brain-ingest/route";
import { VERCEL_OIDC_HEADER } from "@shared/http/google-oauth";

const OIDC = "vercel.oidc.jwt";
const req = (headers: Record<string, string> = {}) =>
  new Request("https://www.loveiq.org/api/cron/brain-ingest", { headers });

describe("/api/cron/brain-ingest wiring", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("actually CALLS every ingester it imports", async () => {
    // `ingestDrive` was imported and never called for several commits: my edit
    // added the import, the call site never matched, and the unused import hid
    // among ~98 pre-existing lint warnings. The runbook meanwhile claimed Drive
    // was ingested nightly as "deliberate redundancy" — documentation describing
    // something that was not happening.
    await GET(req());
    expect(calls.map((c) => c.name).sort()).toEqual(
      ["analytics", "drive", "ga4", "gsc", "notion", "slack"].sort()
    );
  });

  it("keeps GA4 before analytics, which reads GA4's ad spend back out", async () => {
    await GET(req());
    const order = calls.map((c) => c.name);
    expect(order.indexOf("ga4")).toBeLessThan(order.indexOf("analytics"));
  });

  it("keeps Notion last, since it is the source most likely to be cut short", async () => {
    await GET(req());
    const order = calls.map((c) => c.name);
    expect(order[order.length - 1]).toBe("notion");
  });

  it("passes the OIDC token from the REQUEST HEADER to every Google-dependent source", async () => {
    // The token is a header, not an env var. Reading it from process.env is what
    // made keyless auth fail silently in production with oidc=0.
    await GET(req({ [VERCEL_OIDC_HEADER]: OIDC }));
    for (const name of ["ga4", "gsc", "drive"]) {
      const call = calls.find((c) => c.name === name)!;
      expect(call.args, name).toContain(OIDC);
    }
  });

  it("does not pass the token to sources that do not use Google", async () => {
    await GET(req({ [VERCEL_OIDC_HEADER]: OIDC }));
    for (const name of ["analytics", "notion", "slack"]) {
      const call = calls.find((c) => c.name === name)!;
      expect(call.args, name).not.toContain(OIDC);
    }
  });
});
