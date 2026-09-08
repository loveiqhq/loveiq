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
