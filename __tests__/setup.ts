import "@testing-library/jest-dom/vitest";

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
