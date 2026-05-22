import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getEmailSiteUrl } from "../site-url";

describe("getEmailSiteUrl", () => {
  const ORIGINAL = process.env.NEXT_PUBLIC_SITE_URL;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  });

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL;
  });

  it("returns prod URL when env is unset", () => {
    expect(getEmailSiteUrl()).toBe("https://www.loveiq.org");
  });

  it("returns prod URL when env is an empty string", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "";
    expect(getEmailSiteUrl()).toBe("https://www.loveiq.org");
  });

  it("strips trailing slash from a valid prod URL", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.loveiq.org/";
    expect(getEmailSiteUrl()).toBe("https://www.loveiq.org");
  });

  it("passes through a valid prod URL unchanged", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.loveiq.org";
    expect(getEmailSiteUrl()).toBe("https://www.loveiq.org");
  });

  it("coerces a 'staging' subdomain to prod", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://staging.loveiq.org";
    expect(getEmailSiteUrl()).toBe("https://www.loveiq.org");
  });

  it("coerces a vercel.app preview alias to prod", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://loveiq-web-staging-abc.vercel.app";
    expect(getEmailSiteUrl()).toBe("https://www.loveiq.org");
  });

  it("coerces a git-branch preview alias to prod", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://loveiq-web-git-staging.vercel.app";
    expect(getEmailSiteUrl()).toBe("https://www.loveiq.org");
  });

  it("allows http://localhost for local dev", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    expect(getEmailSiteUrl()).toBe("http://localhost:3000");
  });

  it("coerces non-localhost http to prod (no plain-http for real domains)", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://192.168.0.10:3000";
    expect(getEmailSiteUrl()).toBe("https://www.loveiq.org");
  });

  it("coerces a URL containing 'preview' to prod", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://preview.loveiq.org";
    expect(getEmailSiteUrl()).toBe("https://www.loveiq.org");
  });
});
