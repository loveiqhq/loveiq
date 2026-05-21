/**
 * Fetch wrapper with timeout support using AbortController.
 * Prevents hanging requests from blocking API responses.
 */

const DEFAULT_TIMEOUT_MS = 5000; // 5 seconds

interface FetchWithTimeoutOptions extends RequestInit {
  timeoutMs?: number;
}

/**
 * Fetch with automatic timeout.
 * @param url - The URL to fetch
 * @param options - Fetch options plus optional timeoutMs (default: 5000ms)
 * @returns Response or throws on timeout/error
 */
export async function fetchWithTimeout(
  url: string,
  options: FetchWithTimeoutOptions = {}
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timeout after ${timeoutMs}ms: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
