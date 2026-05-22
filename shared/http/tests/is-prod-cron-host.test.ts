import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isProdCronHost } from "../is-prod-cron-host";

describe("isProdCronHost", () => {
  const ORIGINAL = process.env.NEXT_PUBLIC_SITE_URL;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  });

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL;
  });

  it("returns false when env is unset", () => {
    expect(isProdCronHost()).toBe(false);
  });

  it("returns false when env is empty", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "";
    expect(isProdCronHost()).toBe(false);
  });

  it("returns true on canonical prod URL", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.loveiq.org";
    expect(isProdCronHost()).toBe(true);
  });

  it("returns true on canonical prod URL with trailing slash", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.loveiq.org/";
    expect(isProdCronHost()).toBe(true);
  });

  it("returns false on staging subdomain", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://staging.loveiq.org";
    expect(isProdCronHost()).toBe(false);
  });

  it("returns false on vercel.app preview", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://loveiq-web-abc.vercel.app";
    expect(isProdCronHost()).toBe(false);
  });

  it("returns true on apex prod URL (without www) — Vercel apex→www redirect is transparent", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://loveiq.org";
    expect(isProdCronHost()).toBe(true);
  });

  it("returns true on apex prod URL with trailing slash", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://loveiq.org/";
    expect(isProdCronHost()).toBe(true);
  });

  it("returns false on a loveiq.org subpath (not exact host match)", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://loveiq.org/admin";
    expect(isProdCronHost()).toBe(false);
  });

  it("returns false on localhost", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    expect(isProdCronHost()).toBe(false);
  });
});
