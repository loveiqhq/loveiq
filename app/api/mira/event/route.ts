/**
 * POST /api/mira/event — what people tell us about Mira, and the KPI moments the browser sees.
 *
 *   { type: "rating", rating: 1 | -1, messageId? , reply? } thumbs on one reply. A signed-in
 *       person's stored reply gets the rating on its row; an anonymous one keeps the rated reply's
 *       text with the rating (covered by the first-message consent), so we can see what went wrong.
 *   { type: "feedback", challenges, wish?, other?, mayEmail }  board 10
 *   { type: "notify", coach }                                  "Notify me" on a coming-soon coach
 *   { type: "track", name }                                    chat opened, consent given, gate shown
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { anonId } from "@features/mira/server/anon";
import { getMiraAccount } from "@features/mira/server/session";
import { logMiraEvent, rateMessage } from "@features/mira/server/store";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";

export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("rating"),
    rating: z.union([z.literal(1), z.literal(-1)]),
    messageId: z.number().int().positive().optional(),
    reply: z.string().max(4000).optional(),
  }),
  z.object({
    type: z.literal("feedback"),
    challenges: z.array(z.string().max(60)).max(12),
    wish: z.string().trim().max(2000).optional(),
    other: z.string().trim().max(2000).optional(),
    mayEmail: z.boolean(),
  }),
  z.object({ type: z.literal("notify"), coach: z.string().max(60) }),
  z.object({
    type: z.literal("track"),
    name: z.enum(["chat_opened", "consent_given", "gate_shown"]),
  }),
]);

export async function POST(request: Request) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }
  const rate = await checkRateLimit(getClientIp(request), {
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
  const who = account ? { userId: account.id } : { anonId: await anonId() };

  switch (body.type) {
    case "rating": {
      if (account && body.messageId) {
        const ok = await rateMessage(account.id, body.messageId, body.rating).catch(() => false);
        logMiraEvent("rating", who, { rating: body.rating, stored: ok });
      } else {
        logMiraEvent("rating", who, { rating: body.rating, reply: body.reply ?? null });
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
    case "track":
      logMiraEvent(body.name, who);
      break;
  }
  return NextResponse.json({ success: true });
}
