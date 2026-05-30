import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@shared/http/csrf", () => ({
  verifyCsrfToken: vi.fn().mockResolvedValue(true),
  verifyCsrfTokenFromBody: vi.fn().mockResolvedValue(true),
  verifyCsrfHeaderOrBody: vi.fn().mockResolvedValue(true),
}));

vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 59, resetAt: new Date() }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { POST } from "@/app/api/analytics-event/route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/analytics-event", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": "valid-token",
    },
    body: JSON.stringify(body),
  });
}

function mockSubmissionLookup(submissionId: number) {
  mockSupabaseFetch.mockImplementation((url: string) => {
    if (url.includes(`/rest/v1/survey_submission?id=eq.${submissionId}`)) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([{ id: submissionId }]),
      });
    }
    if (url.includes("/rest/v1/analytics_event")) {
      return Promise.resolve({ ok: true });
    }
    return Promise.resolve({ ok: false, status: 500 });
  });
}

describe("PERSISTED_EVENTS ↔ ALLOWED_EVENTS parity", () => {
  it("client allowlist and route allowlist contain the same event_types", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    // Resolve from this test file's location. `fileURLToPath` handles
    // percent-decoding on Windows where the path contains spaces.
    const here = path.dirname(fileURLToPath(import.meta.url));
    const clientPath = path.join(here, "..", "client.ts");
    const routePath = path.join(
      here,
      "..",
      "..",
      "..",
      "app",
      "api",
      "analytics-event",
      "route.ts"
    );

    const extractList = (source: string, header: RegExp, label: string): Set<string> => {
      const match = source.match(header);
      if (!match || !match[1]) throw new Error(`Could not locate ${label}`);
      return new Set(
        match[1]
          .split(/[,\n]/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && !s.startsWith("//"))
          .map((s) => s.replace(/^["'`]/, "").replace(/["'`].*$/, ""))
          .filter((s) => /^[a-z][a-z0-9_]+$/.test(s))
      );
    };

    const clientSource = fs.readFileSync(clientPath, "utf8");
    const routeSource = fs.readFileSync(routePath, "utf8");
    const persisted = extractList(
      clientSource,
      /PERSISTED_EVENTS\s*=\s*new\s+Set\(\[([\s\S]*?)\]\)/,
      "PERSISTED_EVENTS"
    );
    const allowed = extractList(
      routeSource,
      /ALLOWED_EVENTS\s*=\s*\[([\s\S]*?)\]\s*as\s+const/,
      "ALLOWED_EVENTS"
    );

    const missingInRoute = [...persisted].filter((e) => !allowed.has(e));
    const missingInClient = [...allowed].filter((e) => !persisted.has(e));
    expect(missingInRoute, "events in PERSISTED_EVENTS but not in ALLOWED_EVENTS").toEqual([]);
    expect(missingInClient, "events in ALLOWED_EVENTS but not in PERSISTED_EVENTS").toEqual([]);
    expect(persisted.size).toBeGreaterThan(0);
  });
});

describe("POST /api/analytics-event — allowlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubmissionLookup(42);
  });

  it("accepts price_shown with full pricing-cluster metadata", async () => {
    const res = await POST(
      makeRequest({
        event_type: "price_shown",
        submission_id: 42,
        metadata: {
          plan: "full_report",
          price: 9.99,
          currency: "EUR",
          bucket: "A",
          pricing_cluster_id: "B-full_report-A-tier_2-iOS-google-engaged-d0",
          discount_step: 0,
          experiment_group: "B",
          msrp: 69.99,
          initial_price: 9.99,
        },
      })
    );
    expect(res.status).toBe(204);
    expect(mockSupabaseFetch).toHaveBeenCalledWith(
      "/rest/v1/analytics_event",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"event_type":"price_shown"'),
      })
    );
  });

  it("rejects unknown event types with 400", async () => {
    const res = await POST(
      makeRequest({
        event_type: "made_up_event",
        submission_id: 42,
      })
    );
    expect(res.status).toBe(400);
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
  });

  it("does not allowlist landing_page_view server-side (GA4-only event)", async () => {
    // landing_page_view fires before any submission exists; it has no FK target
    // and so is intentionally not persisted to analytics_event.
    const res = await POST(
      makeRequest({
        event_type: "landing_page_view",
        submission_id: 42,
      })
    );
    expect(res.status).toBe(400);
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
  });
});

describe("POST /api/analytics-event — forced-paywall experiment events (Phase E)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubmissionLookup(42);
  });

  const cases: Array<{ event_type: string; entity_type: string; metadata: object }> = [
    {
      event_type: "experiment_exposure",
      entity_type: "experiment",
      metadata: {
        experiment: "report-forced-paywall",
        variant: "treatment",
        surface: "report_scroll_paywall",
        forced_paywall_arm: "treatment",
      },
    },
    {
      event_type: "scroll_paywall_shown",
      entity_type: "paywall",
      metadata: { surface: "report_scroll_paywall", forced_paywall_arm: "control" },
    },
    {
      event_type: "experiment_card_flipped",
      entity_type: "experiment",
      metadata: { to: "pricing", forced_paywall_arm: "treatment" },
    },
  ];

  it.each(cases)(
    "accepts $event_type and stamps entity_type=$entity_type + forwards metadata",
    async ({ event_type, entity_type, metadata }) => {
      const res = await POST(makeRequest({ event_type, submission_id: 42, metadata }));
      expect(res.status).toBe(204);
      expect(mockSupabaseFetch).toHaveBeenCalledWith(
        "/rest/v1/analytics_event",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining(`"event_type":"${event_type}"`),
        })
      );
      const insertCall = mockSupabaseFetch.mock.calls.find(
        (c) => c[0] === "/rest/v1/analytics_event"
      );
      expect(insertCall).toBeDefined();
      const sentBody = JSON.parse((insertCall![1] as { body: string }).body);
      expect(sentBody.entity_type).toBe(entity_type);
      expect(sentBody.survey_submission_id).toBe(42);
      // The arm stamp the client merges must survive the route untouched.
      expect(sentBody.metadata.forced_paywall_arm).toBe(
        (metadata as { forced_paywall_arm: string }).forced_paywall_arm
      );
    }
  );
});
