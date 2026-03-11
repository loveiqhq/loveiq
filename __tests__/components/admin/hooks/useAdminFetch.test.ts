// @vitest-environment jsdom
import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useAdminFetch", () => {
  it("fetches on mount with correct URL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: "test" }),
    });

    renderHook(() => useAdminFetch("/api/admin/stats"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/admin/stats");
    });
  });

  it("sets loading true initially then false after response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ value: 42 }),
    });

    const { result } = renderHook(() => useAdminFetch("/api/test"));

    // Initially loading
    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it("sets data on successful response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ count: 5 }),
    });

    const { result } = renderHook(() => useAdminFetch<{ count: number }>("/api/test"));

    await waitFor(() => {
      expect(result.current.data).toEqual({ count: 5 });
      expect(result.current.error).toBeNull();
    });
  });

  it("sets error on non-ok response with API message", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "Unauthorized." }),
    });

    const { result } = renderHook(() => useAdminFetch("/api/test"));

    await waitFor(() => {
      expect(result.current.error).toBe("Unauthorized.");
      expect(result.current.data).toBeNull();
    });
  });

  it("sets fallback error when response has no JSON body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("no body");
      },
    });

    const { result } = renderHook(() => useAdminFetch("/api/test"));

    await waitFor(() => {
      expect(result.current.error).toBe("Request failed: 500");
      expect(result.current.data).toBeNull();
    });
  });

  it("sets error on network failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useAdminFetch("/api/test"));

    await waitFor(() => {
      expect(result.current.error).toBe("Network error");
      expect(result.current.data).toBeNull();
    });
  });

  it("appends query params to URL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    renderHook(() => useAdminFetch("/api/test", { status: "completed", page: "1" }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/test?status=completed&page=1");
    });
  });

  it("refetch triggers new fetch", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ v: 1 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ v: 2 }) });

    const { result } = renderHook(() => useAdminFetch<{ v: number }>("/api/test"));

    await waitFor(() => {
      expect(result.current.data).toEqual({ v: 1 });
    });

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.data).toEqual({ v: 2 });
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
