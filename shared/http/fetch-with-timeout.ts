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

  // DO NOT clearTimeout ON SUCCESS. `fetch()` resolves when the response HEADERS
  // arrive, not when the body does, so clearing the timer here disarmed the abort
  // before a single byte of body was read — every `res.json()` / `res.text()` in
  // the app was then completely unbounded, and `timeoutMs` only ever protected
  // the connect/TTFB phase.
  //
  // Reproduced against a server that flushes headers immediately and writes the
  // body 6s later, with timeoutMs 1000: headers at 5ms, `res.json()` resolved at
  // 6004ms — 5s past a ceiling that had already been cancelled. That is the shape
  // of an HTTP/2 gateway holding a connection open while it generates, which is
  // exactly what an LLM endpoint on a non-streaming request does.
  //
  // Leaving the timer armed makes timeoutMs cover the WHOLE exchange, body
  // included, which is what every caller already assumes from the name. Aborting
  // after the body is fully consumed is a no-op, so the only behaviour change is
  // that a genuinely over-budget response now fails instead of hanging. `unref`
  // so a CLI script still exits promptly instead of waiting out the timer;
  // it is absent on the Edge/browser numeric timer, hence the optional call.
  (timeoutId as unknown as { unref?: () => void }).unref?.();

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
  }
}
