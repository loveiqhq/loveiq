// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ph = vi.hoisted(() => ({ init: vi.fn(), register: vi.fn(), capture: vi.fn() }));
vi.mock("posthog-js", () => ({ default: ph }));

import { PROBE_COOKIE } from "@shared/http/probe-cookie";

const clearCookie = () => {
  document.cookie = `${PROBE_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
};

beforeEach(() => {
  vi.resetModules();
  ph.init.mockClear();
  clearCookie();
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com");
});
afterEach(() => {
  clearCookie();
  vi.unstubAllEnvs();
});

describe("PostHog and our own probes", () => {
  it("starts for a visitor", async () => {
    await import("@/instrumentation-client");
    expect(ph.init).toHaveBeenCalledOnce();
  });

  it("stays off for a probe, which is not a visitor", async () => {
    document.cookie = `${PROBE_COOKIE}=1; path=/`;
    await import("@/instrumentation-client");
    expect(ph.init).not.toHaveBeenCalled();
  });

  it("is not fooled by a cookie that only looks like the probe's", async () => {
    document.cookie = `not_${PROBE_COOKIE}=1; path=/`;
    await import("@/instrumentation-client");
    expect(ph.init).toHaveBeenCalledOnce();
    document.cookie = `not_${PROBE_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  });

  it("can read the cookie the probes set, so the check above ever fires", async () => {
    const { stagingCookies } = await import("@/scripts/probes/staging-cookie.mjs");
    const probe = stagingCookies("https://www.loveiq.org").find(
      (c: { name: string }) => c.name === PROBE_COOKIE
    );
    expect(probe).toMatchObject({ value: "1", httpOnly: false });
  });
});
