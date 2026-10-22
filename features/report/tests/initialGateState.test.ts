import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
const mockFetchWithTimeout = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));
vi.mock("@shared/http/circuit-breaker", () => ({
  getBreaker: () => ({ fire: (fn: () => Promise<unknown>) => fn() }),
}));
const mockEnsureReport = vi.fn();
vi.mock("@features/report/server/personalReport", () => ({
  ensurePersonalReportForSubmission: (...args: unknown[]) => mockEnsureReport(...args),
}));

process.env.SUPABASE_URL = "https://db.example";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";

import {
  isInitialGiftEmailEnabled,
  isInitialUnlockGateEnabled,
  joinInitialGateCohort,
  readInitialGateCohortIds,
  readInitialGateState,
  stampInitialGateCohort,
  stampInitialGateSeen,
} from "@features/report/server/initialGateState";
import { __resetSystemFlagsCacheForTests } from "@shared/flags/system-flags";

const reply = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
});

function requests() {
  return mockFetchWithTimeout.mock.calls.map(([url, init]) => {
    const options = (init ?? {}) as { method?: string; body?: string };
    return { url: String(url), method: options.method ?? "GET", body: options.body };
  });
}

const FLAG_ENV = [
  "SYSTEM_FLAG_report_initial_unlock_gate",
  "SYSTEM_FLAG_initial_unlock_gift_email",
];

beforeEach(() => {
  vi.clearAllMocks();
  __resetSystemFlagsCacheForTests();
  for (const name of FLAG_ENV) delete process.env[name];
});

afterEach(() => {
  for (const name of FLAG_ENV) delete process.env[name];
});

describe("the gate's two switches", () => {
  it("stay off when Supabase can't be reached, so an outage never gates anyone", async () => {
    mockFetchWithTimeout.mockRejectedValue(new Error("network down"));
    await expect(isInitialUnlockGateEnabled()).resolves.toBe(false);
    await expect(isInitialGiftEmailEnabled()).resolves.toBe(false);
  });

  it("stay off while their rows don't exist (the migration not yet applied)", async () => {
    mockFetchWithTimeout.mockResolvedValue(reply([]));
    await expect(isInitialUnlockGateEnabled()).resolves.toBe(false);
    await expect(isInitialGiftEmailEnabled()).resolves.toBe(false);
  });

  it("each read their own row", async () => {
    mockFetchWithTimeout.mockImplementation(async (url: string) =>
      reply(
        url.includes("key=eq.report_initial_unlock_gate")
          ? [{ enabled: true }]
          : [{ enabled: false }]
      )
    );
    await expect(isInitialUnlockGateEnabled()).resolves.toBe(true);
    await expect(isInitialGiftEmailEnabled()).resolves.toBe(false);
  });
});

describe("readInitialGateState", () => {
  it("returns the report's cohort and first-view stamps", async () => {
    mockFetchWithTimeout.mockResolvedValue(
      reply([{ initial_gate_cohort_at: "2026-10-20T08:00:00.000Z", initial_gate_seen_at: null }])
    );
    await expect(readInitialGateState(10)).resolves.toEqual({
      cohortAt: "2026-10-20T08:00:00.000Z",
      seenAt: null,
    });
    expect(requests()).toEqual([
      {
        url: "https://db.example/rest/v1/personal_report?id=eq.10&select=initial_gate_cohort_at,initial_gate_seen_at&limit=1",
        method: "GET",
        body: undefined,
      },
    ]);
  });

  it("returns null when PostgREST refuses the query, as it does before the migration", async () => {
    mockFetchWithTimeout.mockResolvedValue(reply({ message: "column does not exist" }, 400));
    await expect(readInitialGateState(10)).resolves.toBeNull();
  });

  it("returns null when the request throws", async () => {
    mockFetchWithTimeout.mockRejectedValue(new Error("timeout"));
    await expect(readInitialGateState(10)).resolves.toBeNull();
  });

  it("returns null when the report has no row", async () => {
    mockFetchWithTimeout.mockResolvedValue(reply([]));
    await expect(readInitialGateState(10)).resolves.toBeNull();
  });
});

describe("the stamps", () => {
  it("stamp the first view once: the PATCH only matches a row that has none", async () => {
    mockFetchWithTimeout.mockResolvedValue(reply(null, 204));
    await stampInitialGateSeen(10);
    const [request] = requests();
    expect(request?.method).toBe("PATCH");
    expect(request?.url).toBe(
      "https://db.example/rest/v1/personal_report?id=eq.10&initial_gate_seen_at=is.null"
    );
    expect(Object.keys(JSON.parse(request?.body ?? "{}"))).toEqual(["initial_gate_seen_at"]);
  });

  it("stamp the cohort once, the same way", async () => {
    mockFetchWithTimeout.mockResolvedValue(reply(null, 204));
    await stampInitialGateCohort(10);
    const [request] = requests();
    expect(request?.method).toBe("PATCH");
    expect(request?.url).toBe(
      "https://db.example/rest/v1/personal_report?id=eq.10&initial_gate_cohort_at=is.null"
    );
    expect(Object.keys(JSON.parse(request?.body ?? "{}"))).toEqual(["initial_gate_cohort_at"]);
  });

  it("never throw", async () => {
    mockFetchWithTimeout.mockRejectedValue(new Error("down"));
    await expect(stampInitialGateSeen(10)).resolves.toBeUndefined();
    await expect(stampInitialGateCohort(10)).resolves.toBeUndefined();
  });
});

describe("readInitialGateCohortIds", () => {
  it("returns which of a batch of reports are in the gate's cohort", async () => {
    mockFetchWithTimeout.mockResolvedValue(reply([{ id: 2 }, { id: 3 }]));
    await expect(readInitialGateCohortIds([1, 2, 3])).resolves.toEqual(new Set([2, 3]));
    expect(requests()[0]?.url).toBe(
      "https://db.example/rest/v1/personal_report?id=in.(1,2,3)&initial_gate_cohort_at=not.is.null&select=id"
    );
  });

  it("asks nothing for an empty batch", async () => {
    await expect(readInitialGateCohortIds([])).resolves.toEqual(new Set());
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
  });

  it("returns an empty set when the read fails, so the batch is treated as before the gate", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce(reply({ message: "nope" }, 400));
    await expect(readInitialGateCohortIds([1, 2])).resolves.toEqual(new Set());
    mockFetchWithTimeout.mockRejectedValueOnce(new Error("down"));
    await expect(readInitialGateCohortIds([1, 2])).resolves.toEqual(new Set());
  });
});

describe("joinInitialGateCohort", () => {
  it("stamps a new survey's report into the cohort while the gate is on", async () => {
    process.env.SYSTEM_FLAG_report_initial_unlock_gate = "true";
    mockEnsureReport.mockResolvedValue({ id: 10 });
    mockFetchWithTimeout.mockResolvedValue(reply(null, 204));
    await joinInitialGateCohort(123);
    expect(requests().map((request) => `${request.method} ${request.url}`)).toEqual([
      "PATCH https://db.example/rest/v1/personal_report?id=eq.10&initial_gate_cohort_at=is.null",
    ]);
  });

  it("creates and stamps nothing while the gate is off", async () => {
    process.env.SYSTEM_FLAG_report_initial_unlock_gate = "false";
    await joinInitialGateCohort(123);
    expect(mockEnsureReport).not.toHaveBeenCalled();
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
  });

  it("never throws, so the survey is saved whatever happens here", async () => {
    process.env.SYSTEM_FLAG_report_initial_unlock_gate = "true";
    mockEnsureReport.mockRejectedValue(new Error("personal_report_create_failed"));
    await expect(joinInitialGateCohort(123)).resolves.toBeUndefined();
  });
});
