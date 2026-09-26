import { beforeEach, describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import { http, passthrough } from "msw";
import { ImageResponse } from "next/og";

import { server } from "@/__tests__/__fixtures__/msw-server";

import { GET, renderDropoutByArm } from "@/app/api/admin/digest-image/[kind]/route";
import { signImagePayload } from "@shared/url/signed-image-url";

/** Every string the picture will print. */
function textsIn(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) textsIn(child, out);
    return out;
  }
  if (!node || typeof node !== "object") return out;
  const props = ((node as ReactElement<Record<string, unknown>>).props ?? {}) as Record<
    string,
    unknown
  >;
  if (props.children !== undefined) textsIn(props.children, out);
  return out;
}

const payload = (extra: Record<string, unknown> = {}) => ({
  kind: "metric-trend" as const,
  labels: ["1 Sep", "2 Sep", "3 Sep", "4 Sep"],
  first: [120, 180, 150, 240],
  title: "Visitors (our own count)",
  footnote: "daily, UTC",
  ...extra,
});
/** Values the renderer prints: axis ticks, end labels and the default headline. */
const valueTexts = (texts: string[]) => texts.filter((t) => /^\d[\d.]*%?$|^Latest/.test(t));

describe("digest-image: the unit a value wears", () => {
  it("prints a percent sign by default, so the digest's charts are unchanged", () => {
    const values = valueTexts(textsIn(renderDropoutByArm(payload()).element));
    expect(values.length).toBeGreaterThan(3);
    for (const v of values) expect(v, v).toMatch(/%/);
  });

  it("prints counts bare when the payload says unit ''", () => {
    const texts = textsIn(renderDropoutByArm(payload({ unit: "" })).element);
    const values = valueTexts(texts);
    // The end label of the last reading, and the axis, both read as plain numbers.
    expect(values).toContain("240");
    expect(values.length).toBeGreaterThan(3);
    for (const t of texts) expect(t, t).not.toMatch(/%/);
  });

  it("honours only '' and falls back to percent for anything else", () => {
    const values = valueTexts(textsIn(renderDropoutByArm(payload({ unit: "px" })).element));
    expect(values.length).toBeGreaterThan(3);
    for (const v of values) expect(v, v).toMatch(/%/);
  });
});

/**
 * The brain's show_chart links to this kind. Nothing else calls the route with it, so the
 * route itself is exercised here: dropping the kind from VALID_KINDS 400s every link, and
 * dropping its case from renderForKind serves an "Unknown chart kind" picture with a 200.
 */
describe("digest-image: the metric-trend kind is served", () => {
  const SECRET = "a-test-secret-of-some-length";
  // next/og loads its renderer from an inline data: URL, which is not the network. MSW
  // matches a data: URL as origin + path, "null" then the MIME type, so match the payload.
  beforeEach(() => {
    server.use(http.get(/^nullapplication\/octet-stream;base64,/, () => passthrough()));
  });
  const get = (d: string, s: string) =>
    GET(new Request(`https://loveiq.example/api/admin/digest-image/metric-trend?d=${d}&s=${s}`), {
      params: Promise.resolve({ kind: "metric-trend" }),
    });

  it("serves a signed chart as exactly the picture the renderer draws", async () => {
    process.env.STRATEGY_DIGEST_SIGNING_SECRET = SECRET;
    const p = payload({ unit: "" });
    const { d, s } = await signImagePayload(p, SECRET);
    const res = await get(d, s);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    const { element, height } = renderDropoutByArm(p);
    const direct = Buffer.from(
      await new ImageResponse(element, { width: 800, height }).arrayBuffer()
    );
    expect(Buffer.from(await res.arrayBuffer()).equals(direct)).toBe(true);
  });

  it("refuses a chart whose numbers were changed after signing", async () => {
    process.env.STRATEGY_DIGEST_SIGNING_SECRET = SECRET;
    const { s } = await signImagePayload(payload(), SECRET);
    const { d: forged } = await signImagePayload(payload({ first: [1, 1, 1, 9999] }), SECRET);
    expect((await get(forged, s)).status).toBe(403);
  });
});
