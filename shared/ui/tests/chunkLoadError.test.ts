// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { isChunkLoadError, recoverFromError } from "@shared/ui/chunkLoadError";

/**
 * Production produced 4 stale-deployment chunk failures across 3 sessions in a
 * fortnight, on `/` and `/survey`, each naming a different `?dpl=` deployment
 * id. The error boundary offered "Try again" wired to React's `reset()`, which
 * re-renders the same tree and re-requests the same missing file — a recovery
 * button that cannot recover. Only a reload fetches the current manifest.
 */
describe("stale-deployment chunk failures are recognised", () => {
  it("matches the exact message production emitted", () => {
    expect(
      isChunkLoadError(
        new Error(
          "Failed to load chunk /_next/static/chunks/30piubmczzvv6.js?dpl=dpl_4fYJVZeRtVWrZFyxsep1JahoiA32 from module 964893"
        )
      )
    ).toBe(true);
  });

  it("matches by error NAME even when the message is unhelpful", () => {
    const e = new Error("boom");
    e.name = "ChunkLoadError";
    expect(isChunkLoadError(e)).toBe(true);
  });

  it("matches the Safari and Firefox wordings, which differ from Chrome's", () => {
    expect(isChunkLoadError(new Error("Importing a module script failed."))).toBe(true);
    expect(
      isChunkLoadError(new Error("error loading dynamically imported module: https://x/y.js"))
    ).toBe(true);
    expect(isChunkLoadError(new Error("Loading chunk 964893 failed."))).toBe(true);
  });

  it("does NOT match ordinary application errors", () => {
    expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isChunkLoadError(new Error("Network request failed"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError({})).toBe(false);
    expect(isChunkLoadError({ message: 42 })).toBe(false);
  });
});

describe("recovery picks the action that can actually work", () => {
  const realLocation = window.location;
  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: realLocation });
  });

  function stubReload() {
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...realLocation, reload },
    });
    return reload;
  }

  it("reloads on a chunk failure instead of calling reset", () => {
    const reload = stubReload();
    const reset = vi.fn();
    recoverFromError(new Error("Failed to load chunk /_next/static/chunks/a.js?dpl=x"), reset);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
  });

  it("re-renders in place for an ordinary error, keeping scroll and state", () => {
    const reload = stubReload();
    const reset = vi.fn();
    recoverFromError(new Error("Cannot read properties of undefined"), reset);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });
});
