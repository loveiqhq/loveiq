// R-06: F-01 DSAR helper tests. Pure-function coverage of email
// normalisation + hashing. Full cascade-order coverage lives in the
// integration suite (R-29); the focused export/delete cases below use a
// URL-routing supabaseFetch mock to guard that user-authored
// report_section_feedback is both exported (Art. 15) and erased (Art. 17).
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  normalizeEmail,
  emailHash,
  exportDataSubject,
  deleteDataSubject,
} from "@features/admin/server/data-subject";

describe("normalizeEmail (F-01)", () => {
  it("lowercases + trims valid emails", () => {
    expect(normalizeEmail("  Alice@Example.COM  ")).toBe("alice@example.com");
  });

  it("accepts plus-addressed emails", () => {
    expect(normalizeEmail("alice+tag@example.com")).toBe("alice+tag@example.com");
  });

  it("rejects missing @", () => {
    expect(normalizeEmail("not-an-email")).toBeNull();
  });

  it("rejects missing TLD dot", () => {
    expect(normalizeEmail("alice@example")).toBeNull();
  });

  it("rejects empty string", () => {
    expect(normalizeEmail("")).toBeNull();
  });

  it("rejects whitespace-only", () => {
    expect(normalizeEmail("   ")).toBeNull();
  });

  it("rejects too-long input", () => {
    const long = "a".repeat(310) + "@example.com";
    expect(normalizeEmail(long)).toBeNull();
  });
});

describe("emailHash (F-01)", () => {
  it("returns a 64-char hex string", () => {
    const h = emailHash("alice@example.com");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same input", () => {
    expect(emailHash("alice@example.com")).toBe(emailHash("alice@example.com"));
  });

  it("differs for different inputs", () => {
    expect(emailHash("alice@example.com")).not.toBe(emailHash("bob@example.com"));
  });
});

describe("DSAR report_section_feedback handling (F-01)", () => {
  // Route responses by URL substring so the test isn't coupled to call order.
  function routeFetch(path: string, init?: { method?: string }) {
    const isDelete = init?.method === "DELETE";
    const ok = (rows: unknown[] = [], deleted = 0) => ({
      ok: true,
      status: 200,
      headers: new Headers(isDelete ? { "content-range": `*/${deleted}` } : {}),
      json: async () => rows,
      text: async () => "",
    });
    if (path.includes("/app_user?email=")) return ok([{ id: 1, email: "a@x.com" }]);
    if (path.includes("/survey_submission?app_user_id=")) return ok([{ id: 10 }]);
    // Lookups used by the delete cascade.
    if (path.includes("/personal_report?survey_submission_id=")) return ok([]);
    if (path.includes("/survey_submission_answer?survey_submission_id=")) return ok([]);
    if (path.includes("/payment?user_id=")) return ok([]);
    if (path.includes("/report_section_feedback")) return ok([{ id: 5, comment: "hi" }], 1);
    return ok([], 0);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
    mockSupabaseFetch.mockImplementation((path: string, init?: { method?: string }) =>
      routeFetch(path, init)
    );
  });

  it("exports report_section_feedback (Art. 15 completeness)", async () => {
    const result = await exportDataSubject("a@x.com");
    expect(result.exportData?.report_section_feedback).toEqual([{ id: 5, comment: "hi" }]);
    const fetchedFeedback = mockSupabaseFetch.mock.calls.some(
      ([p]) => typeof p === "string" && p.includes("/report_section_feedback?survey_submission_id=")
    );
    expect(fetchedFeedback).toBe(true);
  });

  it("issues an explicit DELETE for report_section_feedback and counts it", async () => {
    const result = await deleteDataSubject("a@x.com");
    const deletedFeedback = mockSupabaseFetch.mock.calls.some(
      ([p, init]) =>
        typeof p === "string" &&
        p.includes("/report_section_feedback?survey_submission_id=") &&
        (init as { method?: string })?.method === "DELETE"
    );
    expect(deletedFeedback).toBe(true);
    expect(result.rowsAffected.report_section_feedback).toBe(1);
  });
});

describe("DSAR delete branches (F-01 / P-02)", () => {
  // Mirrors the routing mock above but lets each test decide whether the user
  // has payments — that flag selects the two distinct erasure branches.
  function makeRouter(hasPayments: boolean) {
    return (path: string, init?: { method?: string }) => {
      const isDelete = init?.method === "DELETE";
      const ok = (rows: unknown[] = [], deleted = 0) => ({
        ok: true,
        status: 200,
        headers: new Headers(isDelete ? { "content-range": `*/${deleted}` } : {}),
        json: async () => rows,
        text: async () => "",
      });
      if (path.includes("/app_user?email=")) return ok([{ id: 1, email: "a@x.com" }]);
      if (path.includes("/payment?user_id=")) return ok(hasPayments ? [{ id: 99 }] : []);
      // No submissions → focus the test on the app_user branch only.
      if (path.includes("/survey_submission?app_user_id=")) return ok([]);
      return ok([], 0);
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
  });

  it("PSEUDONYMIZES app_user (PATCH, no hard delete) when payments exist (P-02 accounting retention)", async () => {
    mockSupabaseFetch.mockImplementation(makeRouter(true));
    const result = await deleteDataSubject("a@x.com");

    const patchedAppUser = mockSupabaseFetch.mock.calls.some(
      ([p, init]) =>
        typeof p === "string" &&
        p.includes("/app_user?id=") &&
        (init as { method?: string })?.method === "PATCH"
    );
    const hardDeletedAppUser = mockSupabaseFetch.mock.calls.some(
      ([p, init]) =>
        typeof p === "string" &&
        p.includes("/app_user?id=") &&
        (init as { method?: string })?.method === "DELETE"
    );
    expect(patchedAppUser).toBe(true);
    expect(hardDeletedAppUser).toBe(false); // payments FK → must NOT hard-delete
    expect(result.rowsAffected.app_user_pseudonymized).toBe(1);
    expect(result.warnings.join(" ")).toMatch(/pseudonymized/i);
  });

  it("HARD-DELETES app_user when there are no payments", async () => {
    mockSupabaseFetch.mockImplementation(makeRouter(false));
    const result = await deleteDataSubject("a@x.com");

    const hardDeletedAppUser = mockSupabaseFetch.mock.calls.some(
      ([p, init]) =>
        typeof p === "string" &&
        p.includes("/app_user?id=") &&
        (init as { method?: string })?.method === "DELETE"
    );
    const patchedAppUser = mockSupabaseFetch.mock.calls.some(
      ([p, init]) =>
        typeof p === "string" &&
        p.includes("/app_user?id=") &&
        (init as { method?: string })?.method === "PATCH"
    );
    expect(hardDeletedAppUser).toBe(true);
    expect(patchedAppUser).toBe(false);
    expect(result.rowsAffected.app_user_pseudonymized).toBeUndefined();
  });
});
