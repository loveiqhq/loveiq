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
      ["gsc"].sort()
    );
  });

  it("runs ONLY the sources whose upstream changes daily", async () => {
    /**
     * GA4 and Search Console lag 1-3 days at Google's end, so nightly IS live for
     * them and polling faster just refetches identical numbers. Everything that
     * changes continuously moved to `brain-fast` (15 min) and `brain-notion`
     * (hourly). If a continuously-changing source reappears here, the corpus goes
     * back to being up to 24 hours stale without anything looking broken.
     */
    await GET(req());
    // GSC ONLY. GA4 moved to the 15-minute lane once it was found to serve
    // intraday data; Search Console genuinely lags ~3 days, so nightly is live
    // for it and asking sooner returns identical numbers.
    expect(calls.map((c) => c.name).sort()).toEqual(["gsc"]);
  });

  it("passes the OIDC token from the REQUEST HEADER to every Google-dependent source", async () => {
    // The token is a header, not an env var. Reading it from process.env is what
    // made keyless auth fail silently in production with oidc=0.
    await GET(req({ [VERCEL_OIDC_HEADER]: OIDC }));
    for (const name of ["gsc"]) {
      const call = calls.find((c) => c.name === name)!;
      expect(call.args, name).toContain(OIDC);
    }
  });

  it("has no non-Google source left that could be handed the token by mistake", async () => {
    // The original of this test asserted analytics/notion/slack were NOT given the
    // OIDC token. Those three now live in brain-fast, so the meaningful assertion
    // moved with them; here the point is that this lane is Google-only.
    await GET(req({ [VERCEL_OIDC_HEADER]: OIDC }));
    expect(calls.every((c) => c.name === "gsc")).toBe(true);
  });
});
