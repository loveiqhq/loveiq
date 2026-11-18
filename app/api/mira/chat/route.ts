/**
 * POST /api/mira/chat — one message to Mira, one reply back.
 *
 * Anonymous: the browser keeps the chat and sends the recent turns; nothing is stored here, and
 * the free replies are counted per browser id (ANON_REPLY_LIMIT, then the sign-up card).
 * Signed in: turns come from the account's stored chat, and the exchange is stored when
 * "Remember our conversations" is on. Both need the first-message consent (18+ and the
 * sensitive-data yes), sent with every message.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import miraConfig from "@features/mira/content/mira-config.json";
import { anonId } from "@features/mira/server/anon";
import { ANON_REPLY_LIMIT, HISTORY_TURNS, MAX_MESSAGE_CHARS } from "@features/mira/server/config";
import { crisisFor, requestCountry } from "@features/mira/server/crisis";
import { askModel, type MiraTurn } from "@features/mira/server/model";
import {
  STABLE_INSTRUCTIONS,
  personalInstructions,
  type CoachingStyle,
} from "@features/mira/server/prompt";
import { isCrisisMessage, parseReply, type CitedSource } from "@features/mira/server/safety";
import { getMiraAccount } from "@features/mira/server/session";
import {
  addMessages,
  createChat,
  findAssessment,
  getMessages,
  getProfile,
  logMiraEvent,
  ownsChat,
} from "@features/mira/server/store";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const scale = z.number().int().min(1).max(5);
const styleSchema = z
  .object({
    guidance: scale.optional(),
    challenge: scale.optional(),
    depth: scale.optional(),
    practical: scale.optional(),
    tone: scale.optional(),
  })
  .strict();

const turnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(8000),
});

const schema = z.object({
  message: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
  consent: z.literal(true),
  chatId: z.string().uuid().optional(),
  history: z.array(turnSchema).max(HISTORY_TURNS).optional(),
  style: styleSchema.optional(),
});

/** A paying-attention daily ceiling per account: model cost and abuse, not a product limit. */
const ACCOUNT_DAILY_MESSAGES = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

function cleanHistory(history: MiraTurn[]): MiraTurn[] {
  const turns = history.filter((t) => t.content.trim().length > 0);
  // The model's conversation must open with the person; Mira's greeting is UI, not history.
  while (turns[0]?.role === "assistant") turns.shift();
  return turns.slice(-HISTORY_TURNS);
}

export async function POST(request: Request) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }
  const ip = getClientIp(request);
  const perMinute = await checkRateLimit(ip, { bucket: "mira-chat", limit: 20, windowMs: 60_000 });
  if (!perMinute.allowed) {
    return NextResponse.json(
      { error: "Please slow down a little and try again in a minute." },
      { status: 429 }
    );
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { message, chatId: askedChatId, history, style: bodyStyle } = parsed.data;

  const account = await getMiraAccount();
  const anon = account ? null : await anonId();
  const who = { anonId: anon, userId: account?.id ?? null };

  let style: CoachingStyle | undefined = bodyStyle;
  let person: Parameters<typeof personalInstructions>[1] = { signedIn: false };
  let turns: MiraTurn[];
  let chatId: string | null = null;
  let remember = false;
  let freeLeft: number | null = null;
  let country = requestCountry(request);

  try {
    if (account) {
      const profile = await getProfile(account.id);
      if (!profile) {
        return NextResponse.json({ error: "Please sign in again.", signIn: true }, { status: 401 });
      }
      const daily = await checkRateLimit(account.id, {
        bucket: "mira-daily",
        limit: ACCOUNT_DAILY_MESSAGES,
        windowMs: DAY_MS,
      });
      if (!daily.allowed) {
        return NextResponse.json(
          { error: "That's today's limit for the beta. Mira is here again tomorrow." },
          { status: 429 }
        );
      }
      style = profile.style;
      remember = profile.remember_chats;
      country = profile.country && profile.country !== "OTHER" ? profile.country : country;
      const assessment = profile.use_assessment
        ? await findAssessment(account.email).catch(() => null)
        : null;
      person = {
        signedIn: true,
        name: profile.name,
        gender: profile.gender,
        country: profile.country,
        archetype: assessment?.archetype ?? null,
      };
      if (askedChatId && (await ownsChat(account.id, askedChatId))) {
        chatId = askedChatId;
        const stored = await getMessages(account.id, chatId, HISTORY_TURNS);
        turns = cleanHistory(stored.map((m) => ({ role: m.role, content: m.content })));
      } else {
        turns = cleanHistory(history ?? []);
      }
    } else {
      const free = await checkRateLimit(anon!, {
        bucket: "mira-anon-replies",
        limit: ANON_REPLY_LIMIT,
        windowMs: 30 * DAY_MS,
      });
      if (!free.allowed) {
        logMiraEvent("gate_shown", who, { limit: ANON_REPLY_LIMIT });
        return NextResponse.json({ gate: true, freeLeft: 0 });
      }
      freeLeft = free.remaining;
      turns = cleanHistory(history ?? []);
    }
  } catch (err) {
    logger.error({ err }, "mira: could not load the conversation");
    return NextResponse.json(
      { error: "Mira couldn't load this chat. Please try again." },
      { status: 500 }
    );
  }

  const isFirst = turns.length === 0;
  turns.push({ role: "user", content: message });

  let reply: string;
  let sources: CitedSource[] = [];
  let crisis = false;

  if (isCrisisMessage(message)) {
    reply = miraConfig.crisisMessage;
    crisis = true;
  } else {
    const result = await askModel(STABLE_INSTRUCTIONS, personalInstructions(style, person), turns);
    if (!result.ok) {
      const status = result.reason === "unconfigured" ? 503 : result.reason === "error" ? 502 : 503;
      const error =
        result.reason === "unconfigured"
          ? "Mira isn't switched on yet."
          : "Mira is busy for a moment. Please try again.";
      return NextResponse.json({ error }, { status });
    }
    if (result.refused || !result.text) {
      reply = miraConfig.refusalMessage;
    } else {
      const out = parseReply(result.text);
      reply = out.text || miraConfig.refusalMessage;
      sources = out.sources;
      crisis = out.crisis;
    }
  }

  let messageId: number | null = null;
  if (account && remember) {
    try {
      chatId ??= await createChat(account.id, message.replace(/\s+/g, " ").slice(0, 80));
      const ids = await addMessages(chatId, [
        { role: "user", content: message },
        { role: "assistant", content: reply, sources },
      ]);
      messageId = ids[1] ?? null;
    } catch (err) {
      // The person still gets the reply; only the saved copy is missing.
      logger.error({ err }, "mira: the exchange was not stored");
    }
  }

  if (isFirst) logMiraEvent("chat_started", who, { signedIn: Boolean(account) });
  logMiraEvent("message_sent", who, { signedIn: Boolean(account), chars: message.length });
  logMiraEvent("reply_shown", who, { sources: sources.map((s) => s.id), crisis });
  if (crisis) logMiraEvent("crisis_shown", who, { country });

  return NextResponse.json({
    reply,
    sources,
    crisis,
    crisisLines: crisis ? crisisFor(country) : undefined,
    chatId,
    messageId,
    freeLeft,
  });
}
