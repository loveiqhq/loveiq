import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  newShortCode,
  shortCodeOf,
  shortLinkTarget,
  shortLinkUrl,
} from "@features/short-links/logic/shortLink";
import { classifySource } from "@features/admin/server/ap/facts";

describe("shortCodeOf", () => {
  it("reads a seven-character code holding a digit, in any case", () => {
    expect(shortCodeOf("/k3x9p2a")).toBe("k3x9p2a");
    expect(shortCodeOf("/K3X9P2A")).toBe("k3x9p2a");
    expect(shortCodeOf("/2345678")).toBe("2345678");
  });

  it("leaves every other path alone", () => {
    for (const path of [
      "/",
      "/imprint",
      "/cookies",
      "/survey",
      "/k3x9p2",
      "/k3x9p2ab",
      "/k3x9p2a/",
      "/k3x9p2a/x",
      "/api/k3x9p2a",
      "/k3x-p2a",
    ]) {
      expect(shortCodeOf(path), path).toBeNull();
    }
  });

  it("can never shadow a page: no top-level route of the app reads as a code", () => {
    const routes = readdirSync("app", { withFileTypes: true }).map((e) => `/${e.name}`);
    expect(routes.length).toBeGreaterThan(10);
    expect(routes.filter((route) => shortCodeOf(route) !== null)).toEqual([]);
  });
});

describe("newShortCode", () => {
  it("draws seven unambiguous characters with at least one digit", () => {
    for (let i = 0; i < 500; i++) {
      const code = newShortCode();
      expect(code).toMatch(/^[a-km-np-z2-9]{7}$/);
      expect(shortCodeOf(`/${code}`)).toBe(code);
    }
  });

  it("puts a digit last when the draw holds none", () => {
    // Byte 0 maps to "a" and the eighth byte to a digit: seven letters, then one digit.
    expect(newShortCode((n) => new Uint8Array(n))).toBe("aaaaaa2");
  });
});

describe("shortLinkTarget", () => {
  it("tags the landing page like the pilot's long links, with the code as utm_term", () => {
    const url = shortLinkTarget(
      { influencer: "mila", platform: "tiktok", placement: "dm" },
      "k3x9p2a",
      "https://www.loveiq.org/k3x9p2a"
    );
    expect(url.toString()).toBe(
      "https://www.loveiq.org/?utm_source=tiktok&utm_medium=social&utm_campaign=ai_mila&utm_content=dm&utm_term=k3x9p2a"
    );
  });

  it("marks a promoted post paid", () => {
    const url = shortLinkTarget(
      { influencer: "jonas", platform: "instagram", placement: "ad" },
      "abc2def",
      "http://localhost:3000/abc2def"
    );
    expect(url.origin).toBe("http://localhost:3000");
    expect(url.searchParams.get("utm_medium")).toBe("paid_social");
    expect(url.searchParams.get("utm_content")).toBe("ad");
  });
});

describe("shortLinkUrl", () => {
  it("gives the address without www", () => {
    expect(shortLinkUrl("k3x9p2a", "https://www.loveiq.org")).toBe("https://loveiq.org/k3x9p2a");
    expect(shortLinkUrl("k3x9p2a", "http://localhost:3000")).toBe("http://localhost:3000/k3x9p2a");
  });
});

describe("where AP-Analytics files short-link traffic", () => {
  it("files TikTok and LinkedIn as social, paid or not", () => {
    for (const med of ["social", "paid_social"]) {
      expect(classifySource({ src: "tiktok", med, ads: false })).toBe("social");
      expect(classifySource({ src: "linkedin", med, ads: false })).toBe("social");
    }
  });

  it("files a promoted Instagram or Facebook post as Meta Ads, an organic one as social", () => {
    expect(classifySource({ src: "instagram", med: "paid_social", ads: false })).toBe("meta_ads");
    expect(classifySource({ src: "facebook", med: "paid_social", ads: false })).toBe("meta_ads");
    expect(classifySource({ src: "instagram", med: "social", ads: false })).toBe("social");
  });
});
