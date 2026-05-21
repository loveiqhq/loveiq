import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";

describe("fetchWithTimeout", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("returns response on successful fetch", async () => {
    const mockResponse = new Response("ok", { status: 200 });
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    const result = await fetchWithTimeout("https://example.com");

    expect(result).toBe(mockResponse);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it("passes fetch options through", async () => {
    const mockResponse = new Response("ok", { status: 200 });
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    await fetchWithTimeout("https://example.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"test":true}',
    });

    const [url, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://example.com");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({ "Content-Type": "application/json" });
    expect(options.body).toBe('{"test":true}');
  });

  it("attaches an AbortSignal to the request", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("ok"));

    await fetchWithTimeout("https://example.com");

    const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("throws a timeout error when fetch takes too long", async () => {
    globalThis.fetch = vi.fn().mockImplementation(
      (_url: string, opts: RequestInit) =>
        new Promise((_resolve, reject) => {
          opts.signal?.addEventListener("abort", () => {
            const err = new Error("The operation was aborted");
            err.name = "AbortError";
            reject(err);
          });
        })
    );

    const promise = fetchWithTimeout("https://example.com/slow", {
      timeoutMs: 3000,
    });

    vi.advanceTimersByTime(3000);

    await expect(promise).rejects.toThrow("Request timeout after 3000ms");
  });

  it("uses default timeout of 5000ms", async () => {
    globalThis.fetch = vi.fn().mockImplementation(
      (_url: string, opts: RequestInit) =>
        new Promise((_resolve, reject) => {
          opts.signal?.addEventListener("abort", () => {
            const err = new Error("The operation was aborted");
            err.name = "AbortError";
            reject(err);
          });
        })
    );

    const promise = fetchWithTimeout("https://example.com/slow");

    vi.advanceTimersByTime(4999);
    // Should not have rejected yet
    vi.advanceTimersByTime(1);

    await expect(promise).rejects.toThrow("Request timeout after 5000ms");
  });

  it("re-throws non-abort errors", async () => {
    const networkError = new Error("Network failure");
    globalThis.fetch = vi.fn().mockRejectedValue(networkError);

    await expect(fetchWithTimeout("https://example.com")).rejects.toThrow("Network failure");
  });

  it("accepts custom timeout via timeoutMs option", async () => {
    globalThis.fetch = vi.fn().mockImplementation(
      (_url: string, opts: RequestInit) =>
        new Promise((_resolve, reject) => {
          opts.signal?.addEventListener("abort", () => {
            const err = new Error("The operation was aborted");
            err.name = "AbortError";
            reject(err);
          });
        })
    );

    const promise = fetchWithTimeout("https://example.com", {
      timeoutMs: 1000,
    });

    vi.advanceTimersByTime(1000);

    await expect(promise).rejects.toThrow("Request timeout after 1000ms");
  });
});
