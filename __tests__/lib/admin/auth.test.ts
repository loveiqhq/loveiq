import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
vi.mock("../../../lib/admin/supabase-server", () => ({
  createSupabaseServer: vi.fn().mockResolvedValue({
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
    },
  }),
}));

const mockSupabaseFetch = vi.fn();
vi.mock("../../../lib/admin/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));

import { verifyAdminSession } from "../../../lib/admin/auth";

describe("verifyAdminSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when getUser fails", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "No session" },
    });
    const result = await verifyAdminSession();
    expect(result).toBeNull();
  });

  it("returns null when user has no email", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "123", email: null } },
      error: null,
    });
    const result = await verifyAdminSession();
    expect(result).toBeNull();
  });

  it("returns null when email not in admin_users", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "123", email: "nobody@test.com" } },
      error: null,
    });
    mockSupabaseFetch.mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    const result = await verifyAdminSession();
    expect(result).toBeNull();
  });

  it("returns null when supabaseFetch fails", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "123", email: "admin@test.com" } },
      error: null,
    });
    mockSupabaseFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    const result = await verifyAdminSession();
    expect(result).toBeNull();
  });

  it("returns AdminUser when email is in admin_users", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "123", email: "admin@test.com" } },
      error: null,
    });
    mockSupabaseFetch.mockResolvedValue({
      ok: true,
      json: async () => [{ email: "admin@test.com", role: "admin" }],
    });

    const result = await verifyAdminSession();
    expect(result).toEqual({ email: "admin@test.com", role: "admin" });
  });

  it("returns viewer role correctly", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "456", email: "viewer@test.com" } },
      error: null,
    });
    mockSupabaseFetch.mockResolvedValue({
      ok: true,
      json: async () => [{ email: "viewer@test.com", role: "viewer" }],
    });

    const result = await verifyAdminSession();
    expect(result).toEqual({ email: "viewer@test.com", role: "viewer" });
  });

  it("returns null on unexpected error", async () => {
    mockGetUser.mockRejectedValue(new Error("Unexpected"));
    const result = await verifyAdminSession();
    expect(result).toBeNull();
  });
});
