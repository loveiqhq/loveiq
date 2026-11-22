/**
 * /api/mira/reviews/mine — what the signed-in person shared about Mira (Settings, and the ask).
 *
 *   GET                  → { review: MyReview | null, name, canRate }: their rating and words
 *                          with their status, the first name the ask offers to sign with, and
 *                          whether they may rate now (not yet rated, and talked with Mira)
 *   DELETE ?what=words   → takes their words back (the rating stays)
 *   DELETE ?what=all     → removes the rating and the words
 *   Either way they show nowhere from the next request (features/mira/server/reviews.ts).
 *   After an under-18 stop GET is refused (403 `minor: true`); taking back never is.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { NAME_MAX, NAME_PATTERN } from "@features/mira/reviews";
import { isMinor } from "@features/mira/server/minor";
import { getMyReview, hasTalkedWithMira, withdrawReview } from "@features/mira/server/reviews";
import { getMiraAccount } from "@features/mira/server/session";
import { getProfile, logMiraEvent } from "@features/mira/server/store";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";

/** The profile name's first word, when it reads as a name. */
function firstName(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0]?.slice(0, NAME_MAX);
  return first && NAME_PATTERN.test(first) ? first : null;
}

async function guard(request: Request, write: boolean) {
  if (write && !(await verifyCsrfToken(request))) {
    return { error: NextResponse.json({ error: "Invalid request." }, { status: 403 }) };
  }
  const rate = await checkRateLimit(getClientIp(request), {
    bucket: write ? "mira-review-withdraw" : "mira-review-mine",
    limit: write ? 20 : 60,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return {
      error: NextResponse.json({ error: "Please try again in a minute." }, { status: 429 }),
    };
  }
  const account = await getMiraAccount();
  if (!account) return { error: NextResponse.json({ error: "Please sign in." }, { status: 401 }) };
  // Taking back is never refused, not even after an under-18 stop: whatever is left goes.
  if (write) return { account };
  // Stopped as under 18 (server/minor.ts): what they shared went with the stop. A failed check
  // is an error, never a pass.
  const minor = await isMinor(account.id).catch(() => null);
  if (minor === null) {
    return { error: NextResponse.json({ error: "Please try again." }, { status: 500 }) };
  }
  // The one under-18 refusal (decision 9): Settings then offers taking a rating back (SET-R1).
  if (minor) {
    const refused = { error: "Mira is only for adults.", minor: true };
    return { error: NextResponse.json(refused, { status: 403 }) };
  }
  return { account };
}

export async function GET(request: Request) {
  const g = await guard(request, false);
  if ("error" in g) return g.error;
  try {
    const [review, profile, talked] = await Promise.all([
      getMyReview(g.account.id),
      getProfile(g.account.id).catch(() => null),
      hasTalkedWithMira(g.account.id),
    ]);
    return NextResponse.json(
      { review, name: firstName(profile?.name), canRate: !review && talked },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    logger.error({ err }, "mira: a person's rating could not be read");
    return NextResponse.json({ error: "Unable to load your rating." }, { status: 500 });
  }
}

const deleteSchema = z.object({ what: z.enum(["words", "all"]) });

export async function DELETE(request: Request) {
  const g = await guard(request, true);
  if ("error" in g) return g.error;
  const query = deleteSchema.safeParse({ what: new URL(request.url).searchParams.get("what") });
  if (!query.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    await withdrawReview(g.account.id, query.data.what);
    logMiraEvent("review_withdrawn", { userId: g.account.id }, { what: query.data.what });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "mira: a withdrawal failed");
    return NextResponse.json(
      { error: "That didn't go through. Please try again." },
      { status: 500 }
    );
  }
}
