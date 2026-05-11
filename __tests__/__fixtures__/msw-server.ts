// MSW node server for Vitest. Configured in `../setup.ts` with
// `onUnhandledRequest: "error"` so accidental real-network calls fail loudly.
// Legacy `vi.mock("@/lib/fetch-with-timeout")` still works alongside MSW —
// the mock replaces fetchWithTimeout before it can call `fetch`, so MSW
// never sees those requests. New tests should register handlers via
// `server.use(http.get(…))` inside their own setup.
//
// ─────────────────────────────────────────────────────────────────────────
// MIGRATION PATTERN — convert `vi.mock("@/lib/fetch-with-timeout", …)` →
// MSW handlers. See `__tests__/api/health.test.ts` for a fully migrated
// reference.
//
// Before (vi.mock):
//   const mockFetchWithTimeout = vi.fn();
//   vi.mock("../../lib/fetch-with-timeout", () => ({
//     fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
//   }));
//   // …
//   mockFetchWithTimeout.mockResolvedValue({ ok: true, status: 200 });
//
// After (MSW):
//   import { http, HttpResponse } from "msw";
//   import { server } from "../__fixtures__/msw-server";
//   // …
//   server.use(
//     http.get("https://test.supabase.co/rest/v1/", () =>
//       HttpResponse.json({}, { status: 200 })
//     )
//   );
//
// When MSW is a poor fit:
//   • Tests that primarily assert on request *body* shape or URL composition.
//     `mockFetchWithTimeout.mock.calls[0]` introspection has no MSW analogue
//     short of capturing requests in the handler — usually not worth it.
//   • Tests that need per-call ordered responses (`mockResolvedValueOnce`)
//     against the same URL — MSW handlers are first-match-wins; for ordered
//     sequences keep vi.mock or use `http.get(url, () => …, { once: true })`
//     and stack calls in order (added with the latest handler at the bottom).
// ─────────────────────────────────────────────────────────────────────────

import { setupServer } from "msw/node";

export const server = setupServer();
