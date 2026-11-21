import { NextResponse } from "next/server";
import { z } from "zod";

import { apGuard, NO_STORE } from "@features/admin/server/ap/route-guard";
import { QUOTE_MAX } from "@features/mira/reviews";
import { decideQuote, quotesToReview } from "@features/mira/server/reviews";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";

/**
 * AP › Mira, the quotes people agreed to show (features/mira/reviews.ts).
 *
 *   GET  → { quotes }: waiting for a decision, and shown now; never an address
 *   POST { id, decision: "approve", text } → shown on Mira's pages: the words as written, or with
 *          details that could identify someone (up to three words each, never a negation)
 *          replaced by a visible […]; nothing else (400)
 *   POST { id, decision: "reject" } → not shown, or taken down; the words are deleted
 *
 * Editors and admins decide (CSRF, rate limit, session and role); 409 when the person took the
 * words back or someone decided first. A decision shows on Mira's pages from the next request.
 */
export async function GET(request: Request) {
  const admin = await apGuard(request, { bucket: "admin-ap-mira-reviews" });
  if (admin instanceof NextResponse) return admin;
  try {
    return NextResponse.json({ quotes: await quotesToReview() }, { headers: NO_STORE });
  } catch (err) {
    logger.error({ err }, "AP mira quotes failed");
    return NextResponse.json({ error: "Unable to load the quotes." }, { status: 500 });
  }
}

const BODY = z.discriminatedUnion("decision", [
  z.object({
    id: z.number().int().positive(),
    decision: z.literal("approve"),
    text: z.string().max(QUOTE_MAX * 2),
  }),
  z.object({ id: z.number().int().positive(), decision: z.literal("reject") }),
]);

export async function POST(request: Request) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }
  const rate = await checkRateLimit(getClientIp(request), {
    bucket: "admin-ap-mira-reviews-write",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  const admin = await apGuard(request, { role: "editor", write: true });
  if (admin instanceof NextResponse) return admin;
  const parsed = BODY.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  try {
    const outcome = await decideQuote(parsed.data, admin.email);
    if (outcome === "edited") {
      return NextResponse.json(
        {
          error:
            "Only take out a detail that could identify someone, up to three words, marked […], and never a “not”. Nothing may be added or changed.",
        },
        { status: 400 }
      );
    }
    if (outcome === "gone") {
      return NextResponse.json(
        { error: "These words were taken back or already decided. Reload the list." },
        { status: 409 }
      );
    }
    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch (err) {
    logger.error({ err }, "AP mira quote decision failed");
    return NextResponse.json({ error: "Unable to save the decision." }, { status: 500 });
  }
}
