import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@shared/http/csrf", () => ({ verifyCsrfToken: vi.fn().mockResolvedValue(true) }));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn(),
  checkCooldown: vi.fn(),
  getClientIp: vi.fn().mockReturnValue("203.0.113.9"),
  releaseCooldown: vi.fn(),
}));
const mockFetchWithTimeout = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));
vi.mock("@shared/http/circuit-breaker", () => ({
  getBreaker: () => ({ fire: (fn: () => Promise<unknown>) => fn() }),
  CircuitOpenError: class CircuitOpenError extends Error {},
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
const gate = vi.hoisted(() => ({ on: true }));
vi.mock("@shared/flags/system-flags", () => ({
  isFeatureEnabled: vi.fn(async (key: string) =>
    key === "report_initial_unlock_gate" ? gate.on : true
  ),
}));
vi.mock("@features/report/server/personalReport", () => ({
  ensurePersonalReportForSubmission: vi.fn().mockResolvedValue({ id: 10 }),
}));
vi.mock("@features/pay-to-start/server/claim", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@features/pay-to-start/server/claim")>();
  return {
    ...actual,
    claimPayToStartForSubmission: vi.fn().mockResolvedValue(null),
    claimedEntitlementFor: vi.fn().mockResolvedValue(null),
    reportClaimProblem: vi.fn(),
  };
});
// What the route leaves for after its reply is held here instead of run, so whatever the
// test sees once the reply resolves ran before it.
const later = vi.hoisted(() => ({ tasks: [] as Array<() => Promise<void>> }));
vi.mock("@shared/http/after-response", () => ({
  scheduleAfterResponse: (_name: string, fn: () => Promise<void>) => {
    later.tasks.push(fn);
  },
  flushAfterResponse: async () => {},
}));
vi.mock("resend", () => ({
  Resend: class {
    contacts = { create: vi.fn() };
    emails = { send: vi.fn().mockResolvedValue({ data: { id: "e1" }, error: null }) };
  },
}));

process.env.SUPABASE_URL = "https://db.example";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
process.env.RESEND_API_KEY = "re_test";

import { POST } from "@/app/api/survey/route";
import { __resetSurveyStatusCacheForTests } from "@features/survey/server/server";
import { checkCooldown, checkRateLimit } from "@shared/http/ratelimit";

const SESSION = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const COHORT_STAMP = "/rest/v1/personal_report?id=eq.10&initial_gate_cohort_at=is.null";

function routeSupabase({
  existingSubmission = null,
  stampFails = false,
}: { existingSubmission?: number | null; stampFails?: boolean } = {}) {
  mockFetchWithTimeout.mockImplementation(async (url: string) => {
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
    if (url.endsWith(COHORT_STAMP) && stampFails) throw new Error("db down");
    if (url.includes("/rest/v1/survey_submission?session_id=eq.")) {
      return ok(existingSubmission ? [{ id: existingSubmission, status: "completed" }] : []);
    }
    if (url.includes("/rpc/submit_survey")) {
      return ok({ success: true, submission_id: 123 });
    }
    return ok([]);
  });
}

function submit(body: Record<string, unknown> = {}) {
  return POST(
    new Request("https://www.loveiq.org/api/survey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "alice@example.com",
        firstName: "Alice",
        answers: { q1: "yes", q2: 3 },
        startedAt: new Date().toISOString(),
        durationMs: 540_000,
        ...body,
      }),
    })
  );
}

function cohortStamps() {
  return mockFetchWithTimeout.mock.calls.filter(
    ([url, init]) =>
      String(url).endsWith(COHORT_STAMP) && (init as { method?: string })?.method === "PATCH"
  );
}

async function runWhatComesAfterTheReply() {
  while (later.tasks.length > 0) await later.tasks.shift()!();
}

beforeEach(() => {
  vi.clearAllMocks();
  later.tasks.length = 0;
  gate.on = true;
  __resetSurveyStatusCacheForTests(false);
  vi.mocked(checkRateLimit).mockResolvedValue({
    allowed: true,
    remaining: 2,
    resetAt: new Date(Date.now() + 60_000),
  } as never);
  vi.mocked(checkCooldown).mockResolvedValue({ allowed: true, retryAfterMs: 0 } as never);
});

describe("a survey submitted while the EUR 1.99 gate is on", () => {
  it("joins the gate's cohort before the reply, so even a reader who skips the wizard meets it", async () => {
    routeSupabase();
    const response = await submit();
    expect(response.status).toBe(200);
    expect(cohortStamps()).toHaveLength(1);
  });

  it("is still saved and answered when the stamp fails", async () => {
    routeSupabase({ stampFails: true });
    const response = await submit();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, submissionId: 123 });
  });
});

describe("no survey joins the cohort", () => {
  it("while the gate is off, not even after the reply", async () => {
    gate.on = false;
    routeSupabase();
    await submit();
    await runWhatComesAfterTheReply();
    expect(cohortStamps()).toHaveLength(0);
  });

  it("when it is a replay of a submission saved earlier", async () => {
    routeSupabase({ existingSubmission: 99 });
    const response = await submit({ sessionId: SESSION });
    expect(await response.json()).toMatchObject({ success: true, submissionId: 99 });
    await runWhatComesAfterTheReply();
    expect(cohortStamps()).toHaveLength(0);
  });
});
