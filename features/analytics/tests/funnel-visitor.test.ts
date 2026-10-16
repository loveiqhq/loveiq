// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetFunnelVisitorForTests, funnelVisitorId } from "@features/analytics/funnelVisitor";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("funnelVisitorId", () => {
  beforeEach(() => __resetFunnelVisitorForTests());
  afterEach(() => {
    document.cookie = "__liq_vid=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    vi.unstubAllGlobals();
  });

  it("is the visitor cookie once cookies were accepted", () => {
    document.cookie = "__liq_vid=11111111-1111-4111-8111-111111111111; path=/";
    expect(funnelVisitorId()).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("is a page's own id without it, the same all page long, and stored nowhere", () => {
    const id = funnelVisitorId();
    expect(id).toMatch(UUID);
    // A banner accepted mid-page does not split the visitor.
    document.cookie = "__liq_vid=11111111-1111-4111-8111-111111111111; path=/";
    expect(funnelVisitorId()).toBe(id);
    expect(document.cookie).not.toContain(id);
    expect(localStorage.length + sessionStorage.length).toBe(0);
    // A new page (a reload) is a new id.
    __resetFunnelVisitorForTests();
    document.cookie = "__liq_vid=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    expect(funnelVisitorId()).not.toBe(id);
  });

  it("makes a valid id where crypto.randomUUID is missing (older iOS Safari)", () => {
    vi.stubGlobal("crypto", { getRandomValues: (a: Uint8Array) => a.fill(0xab) });
    expect(funnelVisitorId()).toMatch(UUID);
  });
});
