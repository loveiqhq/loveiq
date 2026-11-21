/**
 * /api/mira/reviews — Mira's ratings (features/mira/reviews.ts).
 *
 *   GET   → what any visitor may see: { reviews: { average, people, quote, initials } } once 20
 *           different people who are not the team's have rated Mira and a quote is approved,
 *           else { reviews: null }. Never an address; read through a short cache that a
 *           withdrawal or a decision clears at once.
 *   POST  { stars: 1..5, words?: { quote, name, ageRange?, consent } } → the signed-in person's
 *           one rating (409 for a second). Words only with the consent to show them, in the
 *           current wording; they wait for the team's approval.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  AGE_RANGES,
  NAME_MAX,
  NAME_PATTERN,
  QUOTE_MAX,
  REVIEW_CONSENT_VERSION,
  forToday,
} from "@features/mira/reviews";
import { fromTeamBrowser } from "@features/mira/server/attribution";
import { addReview, cachedPublicReviews } from "@features/mira/server/reviews";
import { getMiraAccount } from "@features/mira/server/session";
import { logMiraEvent } from "@features/mira/server/store";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const rate = await checkRateLimit(getClientIp(request), {
    bucket: "mira-reviews",
    limit: 120,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return NextResponse.json({ error: "Please try again in a minute." }, { status: 429 });
  try {
    const pub = await cachedPublicReviews();
    return NextResponse.json(
      { reviews: pub ? forToday(pub, new Date()) : null },
      { headers: NO_STORE }
    );
  } catch (err) {
    logger.error({ err }, "mira: the public ratings could not be read");
    return NextResponse.json({ error: "Unable to load ratings." }, { status: 500 });
  }
}

const schema = z
  .object({
    stars: z.number().int().min(1).max(5),
    words: z
      .object({
        quote: z
          .string()
          .trim()
          .min(1)
          .max(QUOTE_MAX)
          .transform((s) => s.replace(/\s+/g, " ")),
        name: z.string().trim().min(1).max(NAME_MAX).regex(NAME_PATTERN),
        ageRange: z.enum(AGE_RANGES).nullable().optional(),
        // Words go nowhere without the consent to show them, in the wording shown today.
        consent: z.literal(REVIEW_CONSENT_VERSION),
      })
      .strict()
      .optional(),
  })
  .strict();

export async function POST(request: Request) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }
  const rate = await checkRateLimit(getClientIp(request), {
    bucket: "mira-review-write",
    limit: 10,
    windowMs: 60 * 60_000,
  });
  if (!rate.allowed)
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  const account = await getMiraAccount();
  if (!account) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    if (!(await addReview(account.id, parsed.data, await fromTeamBrowser()))) {
      return NextResponse.json({ error: "You've already rated Mira." }, { status: 409 });
    }
    logMiraEvent("review_given", { userId: account.id }, { words: Boolean(parsed.data.words) });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "mira: a rating was not saved");
    return NextResponse.json(
      { error: "Your rating didn't save. Please try again." },
      { status: 500 }
    );
  }
}
