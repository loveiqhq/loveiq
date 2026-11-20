/**
 * POST /api/mira/event — what people tell us about Mira, and the KPI moments the browser sees.
 *
 *   { type: "rating", rating: 1 | -1, messageId? , reply? } thumbs on one reply. A signed-in
 *       person's stored reply gets the rating on its row, and their reply text is never kept
 *       here (it lives only in their chat, and only while Mira may remember it); an anonymous
 *       rating keeps the rated reply's first 2,000 characters (covered by the first-message
 *       consent), so we can see what went wrong.
 *   { type: "feedback", challenges, wish?, other?, mayEmail }  board 10
 *   { type: "notify", coach }                                  "Notify me" on a coming-soon coach
 *   { type: "track", name }        chat opened, consent given, gate shown (on "New chat", which
 *       the server never sees); only these names, so the server's own KPI events can't be sent
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
const RATED_REPLY_CHARS = 2000;

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
  const person = account?.id ?? (await anonId());
  const who = account ? { userId: person } : { anonId: person };
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
        logMiraEvent("rating", who, {
          rating: body.rating,
          reply: body.reply?.slice(0, RATED_REPLY_CHARS) ?? null,
        });
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
