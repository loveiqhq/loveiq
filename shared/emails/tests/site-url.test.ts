import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getEmailImageBaseUrl, getEmailSiteUrl } from "../site-url";

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

describe("getEmailImageBaseUrl", () => {
  const ORIGINAL_SITE = process.env.NEXT_PUBLIC_SITE_URL;
  const ORIGINAL_IMG = process.env.EMAIL_IMAGE_BASE_URL;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.EMAIL_IMAGE_BASE_URL;
  });

  afterEach(() => {
    if (ORIGINAL_SITE === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_SITE;
    if (ORIGINAL_IMG === undefined) delete process.env.EMAIL_IMAGE_BASE_URL;
    else process.env.EMAIL_IMAGE_BASE_URL = ORIGINAL_IMG;
  });

  it("falls back to the passed link base when EMAIL_IMAGE_BASE_URL is unset (no regression)", () => {
    expect(getEmailImageBaseUrl("https://www.loveiq.org")).toBe("https://www.loveiq.org");
  });

  it("strips a trailing slash from the fallback", () => {
    expect(getEmailImageBaseUrl("https://www.loveiq.org/")).toBe("https://www.loveiq.org");
  });

  it("falls back to getEmailSiteUrl() when both env and fallback are absent", () => {
    expect(getEmailImageBaseUrl()).toBe("https://www.loveiq.org");
  });

  it("uses EMAIL_IMAGE_BASE_URL when set (sending-domain alignment)", () => {
    process.env.EMAIL_IMAGE_BASE_URL = "https://send.loveiq.org";
    expect(getEmailImageBaseUrl("https://www.loveiq.org")).toBe("https://send.loveiq.org");
  });

  it("strips a trailing slash from EMAIL_IMAGE_BASE_URL", () => {
    process.env.EMAIL_IMAGE_BASE_URL = "https://send.loveiq.org/";
    expect(getEmailImageBaseUrl("https://www.loveiq.org")).toBe("https://send.loveiq.org");
  });

  it("env value wins over the fallback", () => {
    process.env.EMAIL_IMAGE_BASE_URL = "https://assets.loveiq.org";
    expect(getEmailImageBaseUrl("https://www.loveiq.org")).toBe("https://assets.loveiq.org");
  });

  it("rejects a staging/preview EMAIL_IMAGE_BASE_URL back to the fallback", () => {
    process.env.EMAIL_IMAGE_BASE_URL = "https://staging.loveiq.org";
    expect(getEmailImageBaseUrl("https://www.loveiq.org")).toBe("https://www.loveiq.org");
  });

  it("rejects a vercel.app preview EMAIL_IMAGE_BASE_URL back to the fallback", () => {
    process.env.EMAIL_IMAGE_BASE_URL = "https://loveiq-web-abc.vercel.app";
    expect(getEmailImageBaseUrl("https://www.loveiq.org")).toBe("https://www.loveiq.org");
  });

  it("rejects non-localhost http EMAIL_IMAGE_BASE_URL back to the fallback", () => {
    process.env.EMAIL_IMAGE_BASE_URL = "http://10.0.0.5";
    expect(getEmailImageBaseUrl("https://www.loveiq.org")).toBe("https://www.loveiq.org");
  });
});
