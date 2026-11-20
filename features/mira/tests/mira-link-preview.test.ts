import { http, passthrough } from "msw";
import type { Metadata } from "next";
import { beforeEach, describe, expect, it } from "vitest";

import { server } from "@/__tests__/__fixtures__/msw-server";
import Image, { alt, contentType, size } from "@/app/mira/opengraph-image";
import { metadata as chat } from "@/app/mira/page";
import { metadata as feedback } from "@/app/mira/feedback/page";
import { metadata as home } from "@/app/mira/home/page";
import { metadata as nudges } from "@/app/mira/nudges/page";
import { metadata as privacy } from "@/app/mira/privacy/page";
import { metadata as settings } from "@/app/mira/settings/page";
import { metadata as start } from "@/app/mira/start/page";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.loveiq.org";
const TITLE = "Mira, your AI coach for body confidence in sex | LoveIQ";
const DESCRIPTION =
  "Talk privately with Mira, LoveIQ's AI coach for body confidence in sex. Free beta, no account needed to start.";

// Until 21 Nov 2026 Mira's pages inherited the home page's preview: the assessment's title, and
// the home page as og:url and canonical.
describe("Mira's link previews", () => {
  it("gives /mira its own title, description, address, image and card", () => {
    expect(chat.title).toBe(TITLE);
    expect(chat.description).toBe(DESCRIPTION);
    expect(chat.alternates?.canonical).toBe(`${SITE}/mira`);
    expect(chat.openGraph).toMatchObject({
      title: TITLE,
      description: DESCRIPTION,
      url: `${SITE}/mira`,
      siteName: "LoveIQ",
      type: "website",
      images: [{ url: "/mira/opengraph-image", width: 1200, height: 630, alt }],
    });
    expect(chat.twitter).toMatchObject({
      card: "summary_large_image",
      title: TITLE,
      description: DESCRIPTION,
    });
  });

  it.each([
    ["/mira", chat],
    ["/mira/start", start],
    ["/mira/home", home],
    ["/mira/settings", settings],
    ["/mira/feedback", feedback],
    ["/mira/nudges", nudges],
    ["/mira/privacy", privacy],
  ] as Array<[string, Metadata]>)(
    "%s names its own address, keeps Mira's image and stays out of search",
    (path, m) => {
      expect(m.alternates?.canonical).toBe(`${SITE}${path}`);
      expect(m.openGraph?.url).toBe(`${SITE}${path}`);
      expect(m.openGraph?.images).toEqual([
        { url: "/mira/opengraph-image", width: 1200, height: 630, alt },
      ]);
      expect(m.description).toBe(DESCRIPTION);
      expect(m.robots).toEqual({ index: false, follow: false });
    }
  );
});

describe("Mira's Open Graph image", () => {
  // ImageResponse loads its font and renderer from data: URLs, which MSW would refuse.
  beforeEach(() => {
    server.use(http.get(/^nullapplication\/octet-stream;base64,/, () => passthrough()));
  });

  it("is a 1200 × 630 PNG with its alt text", async () => {
    expect(size).toEqual({ width: 1200, height: 630 });
    expect(contentType).toBe("image/png");
    expect(alt).toMatch(/^Mira, your AI coach for body confidence in sex, by LoveIQ$/);
    const res = Image();
    expect(res.headers.get("content-type")).toBe("image/png");
    const png = Buffer.from(await res.arrayBuffer());
    // The PNG header's IHDR chunk: width at byte 16, height at byte 20.
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
  });
});
