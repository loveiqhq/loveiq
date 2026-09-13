import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";
import { server } from "./__fixtures__/msw-server";

// MSW node server — global lifecycle. Tests opt in by registering handlers
// via `server.use(http.get(…))` in their own setup. Unhandled requests now
// hard-error so accidental real-network calls fail loudly. Legacy
// vi.mock-based fetch mocks still work — they replace fetchWithTimeout
// before it can call `fetch`, so MSW never sees those requests.
beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
});

// Settle any post-response work this test started before the next one begins.
// `scheduleAfterResponse` runs DETACHED when there is no request context, so without
// this a survey POST's Slack send lands part-way through a LATER test and inflates its
// mock counts — the cause of five randomly-failing tests across survey-notifications,
// funnel-digest-handler and anomaly-watcher. See shared/http/after-response.ts.
afterEach(async () => {
  /**
   * Imported DEFENSIVELY. Five test files `vi.mock` this module to stub
   * `scheduleAfterResponse` into a no-op, and their mocks have no
   * `flushAfterResponse` — vitest then throws `No "flushAfterResponse" export is
   * defined on the mock`, which failed 76 tests when this hook first landed.
   *
   * Requiring every mock to grow an export it does not need is the wrong fix: a file
   * that stubs the scheduler has no detached work, so "no flush available" already
   * means "nothing to drain". Any future mock is covered for free.
   */
  try {
    const mod = await import("@shared/http/after-response");
    if (typeof mod.flushAfterResponse === "function") {
      await mod.flushAfterResponse();
    }
  } catch {
    /* mocked without the export, or never loaded in this file */
  }
});
afterAll(() => {
  server.close();
});

// jsdom does not implement window.matchMedia, but several report components
// use it to detect prefers-reduced-motion. Per-test stubGlobal calls have
// races under suite-wide parallel pressure (the stub can be cleared by
// another file's afterEach mid-effect), so define a stable no-op default
// here. Tests that need a different return value still override via
// vi.stubGlobal in their own setup.
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// vitest 4.x / jsdom 29.x: the file-based localStorage persistence feature
// emits "--localstorage-file was provided without a valid path" and leaves
// localStorage/sessionStorage without standard methods (getItem, setItem …).
// Replace them with a fresh in-memory stub before every jsdom-environment
// test so that all tests get a clean, functional Storage object.
if (typeof window !== "undefined") {
  beforeEach(() => {
    const makeStorage = (): Storage => {
      const s: Record<string, string> = {};
      return {
        getItem: (k) => (k in s ? s[k] : null),
        setItem: (k, v) => {
          s[k] = String(v);
        },
        removeItem: (k) => {
          delete s[k];
        },
        clear: () => {
          Object.keys(s).forEach((k) => delete s[k]);
        },
        key: (i) => Object.keys(s)[i] ?? null,
        get length() {
          return Object.keys(s).length;
        },
      };
    };
    vi.stubGlobal("localStorage", makeStorage());
    vi.stubGlobal("sessionStorage", makeStorage());
  });
}
