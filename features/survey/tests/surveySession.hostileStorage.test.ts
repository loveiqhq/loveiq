// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetInMemorySessionIdForTests,
  getSessionId,
} from "@features/survey/ui/hooks/surveySession";

/**
 * Storage does not merely go missing — it THROWS. Safari private mode and some
 * in-app WebViews raise SecurityError on every `sessionStorage` access, and we
 * have those users in production (one session logged 28 of them).
 *
 * `getSessionId` was the only accessor in its module without a try/catch, and
 * it runs during render in `usePartialSave` — so the throw took the whole
 * survey down at the first step of the funnel.
 */
function breakStorage(kind: "throws" | "works") {
  const real = window.sessionStorage;
  if (kind === "works") return () => {};
  const boom = () => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  };
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    get: () => ({
      getItem: boom,
      setItem: boom,
      removeItem: boom,
      clear: boom,
      key: boom,
      get length() {
        return boom();
      },
    }),
  });
  return () => Object.defineProperty(window, "sessionStorage", { configurable: true, value: real });
}

/**
 * Break ONLY localStorage. `sessionStorage` keeps working.
 *
 * `Object.defineProperty` on window, not `vi.spyOn(Storage.prototype, ...)`: in this
 * jsdom, `getItem` is an OWN property of the storage object and its prototype is not
 * `Storage.prototype`, so a prototype spy never fires and the test passes while
 * exercising nothing. Verified — the first version of these two tests was written that
 * way and survived the mutation it was meant to catch.
 */
function breakLocalStorage() {
  const real = window.localStorage;
  const boom = () => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  };
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    get: () => ({
      getItem: boom,
      setItem: boom,
      removeItem: boom,
      clear: boom,
      key: boom,
      get length() {
        return boom();
      },
    }),
  });
  return () => Object.defineProperty(window, "localStorage", { configurable: true, value: real });
}

const UUID_ISH = /^[0-9a-f-]{20,}$|^s-[a-z0-9]+-[a-z0-9]+$/i;

describe("getSessionId under hostile storage", () => {
  beforeEach(() => {
    __resetInMemorySessionIdForTests();
    window.sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normally persists one id in sessionStorage", () => {
    const a = getSessionId();
    const b = getSessionId();
    expect(a).toMatch(UUID_ISH);
    expect(b).toBe(a);
    expect(window.sessionStorage.getItem("loveiq-survey-session")).toBe(a);
  });

  /**
   * The session id is mirrored into localStorage so it outlives a closed tab for as long
   * as the draft does. That mirror must never cost anything when localStorage is the half
   * that is refused — which is a real configuration, not only the all-or-nothing case
   * above.
   *
   * The regression: the mirror was first written inside the SAME try as the sessionStorage
   * reads, so one localStorage throw fell through to the per-page-load in-memory fallback
   * and discarded a good, reload-surviving id.
   */
  it("keeps the sessionStorage id when ONLY localStorage throws", () => {
    const first = getSessionId();
    expect(first).toMatch(UUID_ISH);

    const restore = breakLocalStorage();
    try {
      expect(getSessionId(), "a localStorage failure must not cost the session id").toBe(first);
      expect(
        window.sessionStorage.getItem("loveiq-survey-session"),
        "and must not replace what sessionStorage already holds"
      ).toBe(first);
    } finally {
      restore();
    }
  });

  it("still mints and keeps an id when localStorage throws and there is none yet", () => {
    const restore = breakLocalStorage();
    try {
      const a = getSessionId();
      expect(a).toMatch(UUID_ISH);
      // Stable across calls: it landed in sessionStorage even though the mirror failed.
      expect(getSessionId()).toBe(a);
      expect(window.sessionStorage.getItem("loveiq-survey-session")).toBe(a);
    } finally {
      restore();
    }
  });

  it("does not throw when every storage access throws", () => {
    const restore = breakStorage("throws");
    try {
      expect(() => getSessionId()).not.toThrow();
      expect(getSessionId()).toMatch(UUID_ISH);
    } finally {
      restore();
    }
  });

  it("returns a STABLE id across calls when storage throws", () => {
    const restore = breakStorage("throws");
    try {
      // Partial save and tracking both call this; two different ids would
      // split one visitor into two sessions.
      expect(getSessionId()).toBe(getSessionId());
    } finally {
      restore();
    }
  });

  it("still works when crypto.randomUUID is unavailable too", () => {
    const restore = breakStorage("throws");
    const realCrypto = globalThis.crypto;
    try {
      vi.stubGlobal("crypto", {});
      const id = getSessionId();
      expect(id).toMatch(/^s-[a-z0-9]+-[a-z0-9]+$/i);
      expect(id.length).toBeGreaterThan(8);
    } finally {
      vi.stubGlobal("crypto", realCrypto);
      restore();
    }
  });
});
