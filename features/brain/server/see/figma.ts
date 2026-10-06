/**
 * Look at a design, rather than read a description of one.
 *
 * The MCP server returned text only. So a request to critique a screen could reach the
 * Figma node tree -- a JSON structure of rectangles and fills -- and never the picture.
 * A critique of a node tree is a critique of a data structure; it cannot see that two
 * elements collide, that contrast fails, or that the eye lands in the wrong place.
 *
 * THE BINDING CONSTRAINT IS NOT FILE SIZE. A vision model downscales anything whose
 * longest edge exceeds ~1568px. A full-page Figma render is commonly 1440x11800, which
 * arrives as 191x1568 and is illegible in every word. So the ceiling here is PIXELS, not
 * bytes, and a frame too tall to survive that downscale is refused with its children
 * offered instead -- an unreadable image is worse than a refusal, because the model will
 * answer from it anyway.
 *
 * MEASURED 2026-09-12 against the real file: one mobile screen renders to 12 KB at
 * scale 1 and 28 KB at scale 2 (16 KB and 38 KB base64). A whole page is 2.34 MB. The
 * per-image budget below sits far above the former and far below the latter on purpose.
 */
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";

/** Longest edge we will ask Figma for. Above ~1568 the client downscales anyway, so a
 *  larger number buys bytes and no detail. 2000 leaves a little headroom for clients
 *  that do not downscale. */
export const MAX_EDGE_PX = 2000;
/** Default when the caller does not choose. Comfortably legible, ~40-200 KB. */
export const DEFAULT_EDGE_PX = 1600;
/** Base64 characters per image. ~1 MB of encoded data; a screen is 40x smaller. */
export const MAX_IMAGE_B64 = 1_400_000;
/** Taller (or wider) than this and no scale keeps the text readable after downscaling. */
export const MAX_ASPECT = 3;
/** The longest edge a vision client shows without shrinking the image. */
export const CLIENT_EDGE_PX = 1568;

/**
 * Too long to show readably: longer than MAX_ASPECT:1 in either direction AND longer than
 * the client's edge, so it would be shrunk until its text is gone. One test for both the
 * listing and the render: the listing used to warn only about TALL frames while the render
 * refused wide ones too, so a listed frame could answer "cannot be shown" with no warning.
 */
export function tooLongToShow(w: number, h: number): boolean {
  return Math.max(w, h) > Math.min(w, h) * MAX_ASPECT && Math.max(w, h) > CLIENT_EDGE_PX;
}

export type ShowDesignOutcome =
  | { kind: "image"; text: string; data: string; mimeType: string }
  | { kind: "text"; text: string; isError: boolean }
  /**
   * "This node is a container, not a picture — list what is inside it."
   *
   * A kind rather than a string the caller matches on. The first version signalled the
   * too-tall case by putting "longer than" in the text and having the route grep for it,
   * which worked for that branch and silently missed this one: a PAGE has no
   * `absoluteBoundingBox` at all, so it fell through to "no size Figma will report" and
   * was reported as a broken frame rather than as the page it is. Asking for a page id
   * is the obvious second step after the page list, so that was the common path.
   */
  | { kind: "list-instead"; reason: string };

function api(fileKey: string, path: string): string {
  return `https://api.figma.com/v1${path.replace("<key>", encodeURIComponent(fileKey))}`;
}

/**
 * FIGMA'S LIMIT IS ONE ALLOWANCE, AND THE WHOLE TEAM SHARES IT.
 *
 * Figma counts per user and plan, not per token or tool: file, node and image reads allow
 * 15 a minute on Professional and 20 on Organization for a full or dev seat. On 2026-09-29
 * at 14:21 UTC an agent sent 31 node reads through query_external_service in one minute,
 * one id each, and seven came back 429 within 40 seconds, while every other tool on the
 * token was locked out with it. Each 429 carries `Retry-After` in seconds. A short one is
 * waited out once, because a failed call costs more than a pause; a long one is the
 * caller's to decide, so `figmaLimitText` says how long and how to ask for less.
 */
export const FIGMA_RETRY_MAX_S = 10;

/** `Retry-After` in seconds, as Figma sends it; null when absent or not a number. */
export function retryAfterSeconds(headers: Headers | undefined): number | null {
  const raw = headers?.get("retry-after")?.trim() ?? "";
  return /^\d+$/.test(raw) ? Number(raw) : null;
}

/** Every Figma API read goes through here: one retry on a short 429, never more. */
export async function figmaFetch(
  url: string,
  init: Parameters<typeof fetchWithTimeout>[1]
): Promise<Response> {
  const res = await fetchWithTimeout(url, init);
  const wait = res.status === 429 ? retryAfterSeconds(res.headers) : null;
  if (wait === null || wait > FIGMA_RETRY_MAX_S) return res;
  await res.body?.cancel().catch(() => undefined);
  await new Promise((r) => setTimeout(r, wait * 1000));
  return fetchWithTimeout(url, init);
}

/** What a 429 tells the caller: Figma's wait, its plan tier, and how to ask for less. */
export function figmaLimitText(headers: Headers | undefined, what: string): string {
  const wait = retryAfterSeconds(headers);
  const tier = headers?.get("x-figma-plan-tier");
  const seat = headers?.get("x-figma-rate-limit-type");
  return (
    `Figma is rate-limiting us, so ${what} could not be read just now` +
    (wait === null ? "; it did not say for how long" : `; it asks us to wait ${wait} s`) +
    (tier ? ` (plan tier: ${tier}${seat ? `, rate-limit type: ${seat}` : ""})` : "") +
    `. This is a limit on Figma's side, not a design that does not exist. The allowance is ` +
    `shared by everyone on the token, so ask for less at once: put several node ids in ONE ` +
    `request (\`/files/<key>/nodes?ids=a,b,c\`), render fewer ids per images call or at a lower ` +
    `scale, and never send the same request twice in parallel.`
  );
}

async function figmaGet(
  url: string,
  token: string
): Promise<{ ok: true; body: unknown } | { ok: false; status: number; headers?: Headers }> {
  const res = await figmaFetch(url, {
    headers: { "X-Figma-Token": token },
    timeoutMs: 20_000,
  });
  if (!res.ok) return { ok: false, status: res.status, headers: res.headers };
  return { ok: true, body: await res.json() };
}

/** Figma's error shape differs per endpoint; these are the two that change what we say. */
function outageText(
  { status, headers }: { status: number; headers?: Headers },
  what: string
): string {
  if (status === 429) return figmaLimitText(headers, what);
  if (status === 403 || status === 401) {
    return (
      `Figma refused the credential (${status}) when reading ${what}. The token is set but ` +
      `not accepted — this is an access problem, not an empty file.`
    );
  }
  return (
    `Figma returned ${status} for ${what}. That is a failure to read the design, not a ` +
    `design with nothing in it.`
  );
}

/**
 * The page list: what is in the file, and which frames are worth asking for.
 *
 * `depth=1` is about 9 KB and fits; `depth=2` on a single page already exceeded the
 * 40,000-character result cap when measured, which is why the listing is two calls
 * rather than one deep one.
 */
export async function listDesign(
  fileKey: string,
  token: string,
  pageId?: string
): Promise<ShowDesignOutcome> {
  const url = pageId
    ? api(fileKey, `/files/<key>/nodes?ids=${encodeURIComponent(pageId)}&depth=1`)
    : api(fileKey, "/files/<key>?depth=1");
  const res = await figmaGet(url, token);
  if (!res.ok) return { kind: "text", text: outageText(res, "the file listing"), isError: true };

  if (!pageId) {
    const body = res.body as {
      name?: string;
      lastModified?: string;
      document?: { children?: Array<{ id: string; name: string }> };
    };
    const pages = body.document?.children ?? [];
    if (pages.length === 0) {
      return {
        kind: "text",
        text: "Figma returned the file with no pages in it, which is a read failure rather than an empty design file.",
        isError: true,
      };
    }
    return {
      kind: "text",
      text:
        `${body.name ?? "the design file"} — last changed ${body.lastModified ?? "unknown"}.\n` +
        `${pages.length} pages. Call show_design again with one of these node_ids to see its frames:\n\n` +
        pages.map((p) => `  ${p.id}  ${p.name}`).join("\n") +
        `\n\nA page is not a picture — it holds dozens of frames and renders far too large to ` +
        `read. Ask for a FRAME.`,
      isError: false,
    };
  }

  const body = res.body as {
    nodes?: Record<
      string,
      { document?: { name?: string; children?: Array<Record<string, unknown>> } }
    >;
  };
  const doc = Object.values(body.nodes ?? {})[0]?.document;
  if (!doc) {
    return {
      kind: "text",
      text: `No node \`${pageId}\` is in this file. Call show_design with no arguments for the page list.`,
      isError: true,
    };
  }
  const kids = (doc.children ?? []).map((c) => {
    const b = (c.absoluteBoundingBox ?? {}) as { width?: number; height?: number };
    return {
      id: String(c.id ?? ""),
      name: String(c.name ?? "(unnamed)"),
      w: Math.round(b.width ?? 0),
      h: Math.round(b.height ?? 0),
    };
  });
  if (kids.length === 0) {
    return {
      kind: "text",
      text: `\`${doc.name ?? pageId}\` has no frames inside it.`,
      isError: false,
    };
  }
  return {
    kind: "text",
    text:
      `${doc.name ?? pageId} — ${kids.length} frames. The pixel size is why some are worth ` +
      `asking for and some are not: anything longer than ${MAX_ASPECT}:1 that a vision model would ` +
      `also shrink is refused, because it would be downscaled until every word in it is gone.\n\n` +
      kids
        .map(
          (k) =>
            `  ${k.id}  ${k.w}x${k.h}${tooLongToShow(k.w, k.h) ? "  (too long to render)" : ""}  ${k.name}`
        )
        .join("\n"),
    isError: false,
  };
}

/** One frame, as pixels. */
export async function renderDesign(
  fileKey: string,
  token: string,
  nodeId: string,
  maxPx: number
): Promise<ShowDesignOutcome> {
  // 1. Measure before rendering, so the scale is chosen rather than discovered.
  // depth=1, not 0: depth=0 returns the node with NO children (checked live 2026-09-27,
  // the landing frame had 0 at depth 0 and 15 at depth 1), so every frame taller than
  // 3:1 said it "has no children to ask for" and could not be shown at all.
  const meta = await figmaGet(
    api(fileKey, `/files/<key>/nodes?ids=${encodeURIComponent(nodeId)}&depth=1`),
    token
  );
  if (!meta.ok) return { kind: "text", text: outageText(meta, `node ${nodeId}`), isError: true };

  const node = Object.values(
    (meta.body as { nodes?: Record<string, { document?: Record<string, unknown> }> }).nodes ?? {}
  )[0]?.document;
  if (!node) {
    return {
      kind: "text",
      text:
        `No node \`${nodeId}\` is in this file. Ids come from show_design's own listing — ` +
        `call it with no arguments for the pages, then with a page id for its frames.`,
      isError: true,
    };
  }
  const box = (node.absoluteBoundingBox ?? {}) as { width?: number; height?: number };
  const w = Math.round(box.width ?? 0);
  const h = Math.round(box.height ?? 0);
  const name = String(node.name ?? nodeId);

  // A page (CANVAS) reports no bounding box, because it is a container rather than a
  // drawing. That is not a failure — it is the caller asking to see a page, which is a
  // request to list its frames.
  if (!w || !h) {
    return {
      kind: "list-instead",
      reason: `\`${name}\` is a ${String(node.type ?? "container")}, which holds frames rather than being one.`,
    };
  }

  /**
   * Refuse the unreadable rather than return it. A 1440x11800 page becomes 191x1568
   * after the client's downscale -- the model then answers from an image in which no
   * text survived, which is worse than being told to ask for a child.
   */
  // Only a frame the client will SHRINK loses its text. A strip that fits (the landing's
  // 1115x95 nav, its 1115x68 sticky bar) is never shrunk, so its shape does not matter;
  // refusing it left four of the landing's fifteen sections impossible to look at.
  if (tooLongToShow(w, h)) {
    const kids = (node.children ?? []) as Array<Record<string, unknown>>;
    const why =
      `\`${name}\` is ${w}x${h}, which is longer than ${MAX_ASPECT}:1. Rendered small enough ` +
      `to fit, its text would be unreadable — a vision model reduces anything over about ` +
      `1568px on its longest edge, so a tall frame arrives as a stripe.`;
    return kids.length
      ? { kind: "list-instead", reason: why }
      : {
          kind: "text",
          text: `${why} It has no children to ask for, so this frame cannot be shown.`,
          isError: false,
        };
  }

  const scale = Math.min(2, Math.max(0.25, maxPx / Math.max(w, h)));
  const imgRes = await figmaGet(
    api(
      fileKey,
      `/images/<key>?ids=${encodeURIComponent(nodeId)}&format=png&scale=${scale.toFixed(2)}`
    ),
    token
  );
  if (!imgRes.ok)
    return { kind: "text", text: outageText(imgRes, `a render of ${name}`), isError: true };

  const imgBody = imgRes.body as { err?: unknown; images?: Record<string, string | null> };
  if (imgBody.err) {
    return {
      kind: "text",
      text: `Figma could not render \`${name}\`: ${String(imgBody.err)}.`,
      isError: true,
    };
  }
  const url = Object.values(imgBody.images ?? {})[0];
  if (!url) {
    /**
     * A null URL means Figma is STILL RENDERING, not that the frame is blank. Reported
     * as the transient state it is, because "no image" would be read as "nothing there".
     */
    return {
      kind: "text",
      text:
        `Figma accepted the request for \`${name}\` (${w}x${h}) but has not finished ` +
        `rendering it yet — it returns the frame with no URL while the render is still ` +
        `being produced. This is a render in progress, not an empty frame. Ask again.`,
      isError: false,
    };
  }

  // The S3 URL is pre-signed; sending the Figma header to it is refused by S3.
  const png = await fetchWithTimeout(url, { timeoutMs: 20_000 });
  if (!png.ok) {
    return {
      kind: "text",
      text:
        `Figma produced a render of \`${name}\` and the image itself could not be ` +
        `downloaded (${png.status}). The design exists; the fetch failed.`,
      isError: true,
    };
  }
  const bytes = Buffer.from(await png.arrayBuffer());
  const data = bytes.toString("base64");

  /**
   * OVER BUDGET IS A TEXT ANSWER, never a sliced image. Slicing base64 yields a PNG that
   * renders as nothing, with no way to carry a truncation notice -- exactly the failure
   * `capWithNotice` exists to prevent, in a medium where its notice cannot be read.
   */
  if (data.length > MAX_IMAGE_B64) {
    return {
      kind: "text",
      text:
        `\`${name}\` is ${w}x${h}; at the smallest scale that keeps its text legible the ` +
        `render is ${Math.round(data.length / 1024)} KB encoded, above the ${Math.round(
          MAX_IMAGE_B64 / 1024
        )} KB ceiling. It is not returned shrunk, because a shrunk copy would be ` +
        `unreadable and would still be answered from. Ask for a child frame.`,
      isError: false,
    };
  }

  logger.info(
    { nodeId, w, h, scale, kb: Math.round(data.length / 1024) },
    "brain: rendered a design frame"
  );
  return {
    kind: "image",
    text:
      `${name} — node ${nodeId}, ${w}x${h} in Figma, rendered at scale ${scale.toFixed(2)} ` +
      `(${Math.round((w * scale) as number)}x${Math.round(h * scale)} px, ${Math.round(
        data.length / 1024
      )} KB).\n` +
      `THIS IS THE DESIGN, NOT WHAT SHIPPED. It is what is in Figma right now, which may be ` +
      `ahead of the code, behind it, or a direction nobody built. Use show_page to see what ` +
      `a visitor actually gets.`,
    data,
    mimeType: "image/png",
  };
}
