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
