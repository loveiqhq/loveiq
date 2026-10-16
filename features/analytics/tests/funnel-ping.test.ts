// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetFunnelPingsForTests, pingFunnelEvent } from "@features/analytics/client";

describe("pingFunnelEvent", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  const sent = () =>
    fetchSpy.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)).event);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    __resetFunnelPingsForTests();
    document.cookie = "__liq_vid=11111111-1111-4111-8111-111111111111; path=/";
    document.cookie = "__csrf=test-token; path=/";
    Object.defineProperty(navigator, "sendBeacon", { value: undefined, configurable: true });
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
  });
  afterEach(() => {
    fetchSpy.mockRestore();
    vi.useRealTimers();
    document.cookie = "__liq_vid=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  });

  it("sends each step once a page and UTC day, as the table keeps them", () => {
    vi.setSystemTime(new Date("2026-10-20T23:59:00Z"));
    pingFunnelEvent("intro_view");
    pingFunnelEvent("intro_view");
    expect(sent()).toEqual(["intro_view"]);
    // The tab is still open after midnight UTC: that day gets its own row.
    vi.setSystemTime(new Date("2026-10-21T00:01:00Z"));
    pingFunnelEvent("intro_view");
    pingFunnelEvent("intro_view");
    expect(sent()).toEqual(["intro_view", "intro_view"]);
  });
});
