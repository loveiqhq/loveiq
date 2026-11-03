import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";
import {
  PLACEMENTS,
  PLATFORMS,
  shortLinkTarget,
  shortLinkUrl,
} from "@features/short-links/logic/shortLink";
import {
  createShortLink,
  listShortLinks,
  type ShortLinkRow,
} from "@features/short-links/server/shortLinks";

/**
 * Short links for the AI influencer pilot (features/short-links): Seedlane creates them here
 * (POST) and reads their clicks back (GET), from Postman or Claude.
 *
 * Machine to machine: the caller sends `Authorization: Bearer <SHORT_LINK_API_KEY>` and no
 * cookie, so there is no CSRF token to check (security.yml exempts this route, as it does
 * /api/mcp). Rate limited before the key is compared.
 */

const lower = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : v), schema);

const INFLUENCER = z.string().regex(/^[a-z0-9_]{2,30}$/);

/**
 * Seedlane's own notes on a link: flat, small, and kept off the address. A text the database's
 * jsonb refuses (a NUL, a lone surrogate) is refused here, as a 400, not as a failed insert.
 */
const NOTE = z
  .string()
  .max(200)
  .refine((s) => !s.includes("\u0000") && s.isWellFormed());
const META = z
  .record(z.string().regex(/^[A-Za-z0-9_]{1,40}$/), z.union([NOTE, z.number(), z.boolean()]))
  .refine((m) => Object.keys(m).length <= 20 && JSON.stringify(m).length <= 2000);

const createSchema = z.object({
  influencer: lower(INFLUENCER),
  platform: lower(z.enum(PLATFORMS)),
  placement: lower(z.enum(PLACEMENTS)),
  meta: META.optional(),
});

const listSchema = z.object({
  code: lower(z.string().regex(/^[a-z0-9]{7}$/)).optional(),
  influencer: lower(INFLUENCER).optional(),
  // A real calendar day: 2026-02-31 passes a digits pattern and then fails in the database.
  since: z.iso.date().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});

const CREATE_LIMIT = { bucket: "short-links-create", limit: 120, windowMs: 60_000 };
const READ_LIMIT = { bucket: "short-links-read", limit: 60, windowMs: 60_000 };

const digest = (value: string) => createHash("sha256").update(value).digest();

/** null when no key is configured; otherwise whether the request carries it. */
function authorized(request: Request): boolean | null {
  const key = process.env.SHORT_LINK_API_KEY;
  if (!key) return null;
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  // Hashes of equal length, so neither the comparison's time nor its length check leaks.
  return given.length > 0 && timingSafeEqual(digest(given), digest(key));
}

/** Rate limit, then the key: a response when the request must stop here, else null. */
async function gate(
  request: Request,
  limit: { bucket: string; limit: number; windowMs: number }
): Promise<NextResponse | null> {
  const rateLimit = await checkRateLimit(getClientIp(request), limit);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000)),
        },
      }
    );
  }
  const ok = authorized(request);
  if (ok === null) {
    return NextResponse.json({ error: "Short links are not available." }, { status: 503 });
  }
  if (!ok) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return null;
}

function present(row: ShortLinkRow, origin: string) {
  return {
    ...row,
    url: shortLinkUrl(row.code, origin),
    target: shortLinkTarget(row, row.code, origin).toString(),
  };
}

export async function POST(request: Request) {
  const stop = await gate(request, CREATE_LIMIT);
  if (stop) return stop;

  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const { meta, ...fields } = parsed.data;
    const row = await createShortLink(fields, meta ?? {});
    return NextResponse.json(present(row, new URL(request.url).origin), { status: 201 });
  } catch (err) {
    logger.error({ err }, "short-links: create failed");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const stop = await gate(request, READ_LIMIT);
  if (stop) return stop;

  const url = new URL(request.url);
  const parsed = listSchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const rows = await listShortLinks(parsed.data);
    return NextResponse.json({ links: rows.map((row) => present(row, url.origin)) });
  } catch (err) {
    logger.error({ err }, "short-links: list failed");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
