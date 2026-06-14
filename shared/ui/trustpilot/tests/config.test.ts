import { afterEach, describe, expect, it } from "vitest";
import { isTrustpilotEnabled } from "@shared/ui/trustpilot/config";

const KEY = "NEXT_PUBLIC_TRUSTPILOT_ENABLED";

afterEach(() => {
  delete process.env[KEY];
});

describe("isTrustpilotEnabled (master kill switch)", () => {
  it("is OFF when the env var is unset", () => {
    delete process.env[KEY];
    expect(isTrustpilotEnabled()).toBe(false);
  });

  it('is ON only for exactly "true"', () => {
    process.env[KEY] = "true";
    expect(isTrustpilotEnabled()).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    process.env[KEY] = "  true  ";
    expect(isTrustpilotEnabled()).toBe(true);
  });

  it("treats other truthy-looking values as OFF (fail-closed)", () => {
    for (const v of ["TRUE", "True", "1", "yes", "on", "", " "]) {
      process.env[KEY] = v;
      expect(isTrustpilotEnabled()).toBe(false);
    }
  });
});
