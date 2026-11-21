/**
 * POST /api/mira/event — what people tell us about Mira, and the KPI moments the browser sees.
 *
 *   { type: "rating", rating: 1 | -1, messageId? }  thumbs on one reply. A signed-in person's
 *       stored reply gets the rating on its row. The reply's words are never sent or kept here:
 *       the thumbs only (Eman, 21 Nov 2026, when the optional "Mira's team may read replies I
 *       rate" box went; a text an older page still sends is dropped by the schema).
 *   { type: "consent", version }  the first-message consent, logged as consent_given with its
 *       wording's version
 *   { type: "feedback", challenges, wish?, other?, mayEmail }  board 10
 *   { type: "notify", coach }                                  "Notify me" on a coming-soon coach
 *   { type: "nps", score }        "How likely are you to recommend Mira to a friend?" 0 to 10,
 *       asked after the 3rd conversation and then monthly (Marcus's MVP success board); null is
 *       "Not now", so the response rate is known too
 *   { type: "track", name }        chat opened, gate shown (on "New chat", which the server never
 *       sees), the body check offered and started (its finish is the server's), the "Keep this
 *       chat" card shown, kept or put off, a self-check started and the support lines its mood
 *       check opened; only these names, so the server's own KPI events can't be sent
 *
 * At most DAILY_EVENTS a day per person (account or browser id) and six times that per network
 * (a cleared cookie is a new id), so mira_event can't be flooded or the counts inflated.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { anonId } from "@features/mira/server/anon";
import { getMiraAccount } from "@features/mira/server/session";
import { logMiraEvent, rateMessage } from "@features/mira/server/store";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_EVENTS = 300;

const schema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("rating"),
    rating: z.union([z.literal(1), z.literal(-1)]),
    messageId: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal("feedback"),
    challenges: z.array(z.string().max(60)).max(12),
    wish: z.string().trim().max(2000).optional(),
    other: z.string().trim().max(2000).optional(),
    mayEmail: z.boolean(),
  }),
  z.object({ type: z.literal("notify"), coach: z.string().max(60) }),
  z.object({ type: z.literal("nps"), score: z.number().int().min(0).max(10).nullable() }),
  z.object({
    type: z.literal("consent"),
    version: z.string().regex(/^mira-[\d-]{10,13}$/), // mira-2026-11-21, mira-2026-11-21-2
  }),
  z.object({
    type: z.literal("track"),
    name: z.enum([
      "chat_opened",
      "gate_shown",
      "body_check_offered",
      "body_check_started",
      "keep_card_shown",
      "keep_card_keep",
      "keep_card_not_now",
      "style_tip_shown",
      "style_tip_opened",
      "style_saved",
      // The self-checks (22 Nov 2026): a check started, and the support lines its mood check's
      // question 9 opened (the finish is the server's, app/api/mira/checks).
      "anxiety_check_started",
      "mood_check_started",
      "loneliness_check_started",
      "check_support_shown",
    ]),
  }),
]);

export async function POST(request: Request) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }
  const ip = getClientIp(request);
  const rate = await checkRateLimit(ip, {
    bucket: "mira-event",
    limit: 60,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return NextResponse.json({ error: "Please try again in a minute." }, { status: 429 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const body = parsed.data;

  const account = await getMiraAccount();
  const anon = account ? null : await anonId();
  const who = account ? { userId: account.id } : { anonId: anon };
  // Prefixed: the browser picks its own id, and one equal to an account id must not spend
  // that account's allowance.
  const person = account ? `u:${account.id}` : `a:${anon}`;
  const daily = await Promise.all([
    checkRateLimit(person, { bucket: "mira-event-day", limit: DAILY_EVENTS, windowMs: DAY_MS }),
    checkRateLimit(ip, { bucket: "mira-event-ip-day", limit: DAILY_EVENTS * 6, windowMs: DAY_MS }),
  ]);
  if (daily.some((d) => !d.allowed))
    return NextResponse.json({ error: "Please try again tomorrow." }, { status: 429 });

  switch (body.type) {
    case "rating": {
      if (account) {
        const stored = body.messageId
          ? await rateMessage(account.id, body.messageId, body.rating).catch(() => false)
          : false;
        logMiraEvent("rating", who, {
          rating: body.rating,
          messageId: body.messageId ?? null,
          stored,
        });
      } else {
        logMiraEvent("rating", who, { rating: body.rating });
      }
      break;
    }
    case "feedback":
      logMiraEvent("feedback", who, {
        challenges: body.challenges,
        wish: body.wish ?? null,
        other: body.other ?? null,
        mayEmail: body.mayEmail,
        email: body.mayEmail && account ? account.email : null,
      });
      break;
    case "notify":
      logMiraEvent("notify_me", who, { coach: body.coach });
      break;
    case "nps":
      logMiraEvent("nps", who, { score: body.score });
      break;
    case "consent":
      logMiraEvent("consent_given", who, { version: body.version });
      break;
    case "track":
      logMiraEvent(body.name, who);
      break;
  }
  return NextResponse.json({ success: true });
}
