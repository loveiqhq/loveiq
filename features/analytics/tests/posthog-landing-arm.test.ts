// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ph = vi.hoisted(() => ({
  init: vi.fn(),
  register: vi.fn(),
  unregister: vi.fn(),
  capture: vi.fn(),
}));
vi.mock("posthog-js", () => ({ default: ph }));

import { LANDING_VARIANT_COOKIE } from "@shared/experiments/landingVariant";

const setArmCookie = (value: string | null) => {
  document.cookie =
    value === null
      ? `${LANDING_VARIANT_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
      : `${LANDING_VARIANT_COOKIE}=${value}; path=/`;
};

/** Run PostHog's `loaded` callback the way posthog-js does, before the first $pageview. */
const runLoaded = async () => {
  await import("@/instrumentation-client");
  const config = ph.init.mock.calls[0]?.[1] as { loaded: (p: typeof ph) => void };
  config.loaded(ph);
};

beforeEach(() => {
  vi.resetModules();
  for (const fn of Object.values(ph)) fn.mockClear();
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com");
});
afterEach(() => {
  setArmCookie(null);
  vi.unstubAllEnvs();
});

/**
 * The landing arm used to be registered only by the landing page's mount effect, which
 * runs after the session's first $pageview: a first visit's landing pageview had no arm,
 * and a returning visitor's carried round 2's.
 */
describe("PostHog carries the landing arm from the first event", () => {
  it.each(["white_card", "white_video", "white"])("registers %s from the cookie", async (arm) => {
    setArmCookie(arm);
    await runLoaded();
    expect(ph.register).toHaveBeenCalledWith({ landing_variant: arm });
    expect(ph.unregister).not.toHaveBeenCalled();
  });

  it.each([null, "evil", "__proto__"])("drops a stale arm when the cookie is %s", async (value) => {
    setArmCookie(value);
    await runLoaded();
    expect(ph.register).not.toHaveBeenCalledWith(
      expect.objectContaining({ landing_variant: expect.anything() })
    );
    expect(ph.unregister).toHaveBeenCalledWith("landing_variant");
  });

  it("still labels the environment", async () => {
    await runLoaded();
    expect(ph.register).toHaveBeenCalledWith({ deploy_env: expect.any(String) });
  });
});
