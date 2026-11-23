/**
 * POST /api/mira/chat — one message to Mira, one reply back.
 *
 * Anonymous: the browser keeps the chat and sends the recent turns; nothing is stored here, and
 * every message is counted per browser id (ANON_FREE_MESSAGES, then the sign-up card), with a
 * daily message cap per browser and per network against cost and abuse.
 * Signed in: turns come from the account's stored chat, and the exchange is stored when
 * "Remember our conversations" is on. Both need the first-message consent (18+ and the
 * sensitive-data yes), sent with every message. Over everyone together, GLOBAL_DAILY_MESSAGES
 * caps the model calls a day.
 *
 * A crisis message is read before anything can stop it: whatever the limits, the rest of the
 * body or the database say, it gets Sanjin's message E and the support lines (crisisReply).
 * A reply the model declines (or leaves empty) is a short fixed line with the support lines too,
 * counted as reply_declined, not as a crisis. Once a person says they are under 18 ([[MINOR]]),
 * their browser and account get message G from then on, without the model (server/minor.ts).
 *
 * For the MVP success board, the reply's markers (safety.ts parseReply) are logged as events,
 * never with the person's words: which intake question a message answered (`answering`, sent
 * by the browser when Mira's last reply asked one), a referral to a therapist or doctor, and a
 * new chat's topic when it opened in the person's own words.
 *
 * A spoken turn (features/mira/ui/voice) is the same message with `voice`: the same rails, limits
 * and sign-up gate, a reply asked to sound spoken, and, when stored, its messages tagged with the
 * voice session (`voice.session`) that keeps them as a session to look back on (server/voice.ts).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import miraConfig from "@features/mira/content/mira-config.json";
import { alertDailyCeiling } from "@features/mira/server/alerts";
import { anonId } from "@features/mira/server/anon";
import {
  ANON_FREE_MESSAGES,
  DAILY_MESSAGES,
  GLOBAL_DAILY_MESSAGES,
  HISTORY_TURNS,
  MAX_MESSAGE_CHARS,
} from "@features/mira/server/config";
import { checksForMira } from "@features/mira/server/checks";
import { crisisFor, requestCountry } from "@features/mira/server/crisis";
import { goalsForPrompt } from "@features/mira/server/goals";
import { invitationShown } from "@features/mira/server/intake";
import { journalContext } from "@features/mira/server/journal";
import { neutralTitle, shownTitle } from "@features/mira/server/chat-titles";
import { isMinor, stopForMinor } from "@features/mira/server/minor";
import { askModel, type MiraTurn } from "@features/mira/server/model";
import { CRISIS_QUIET_DAYS, hadCrisis, lastChat } from "@features/mira/server/nudges";
import {
  STABLE_INSTRUCTIONS,
  personalInstructions,
  sessionOpeningInstructions,
  weeklySessionInstructions,
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
import { getSlot, type StoredSlot } from "@features/mira/server/weekly-sessions";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";
// The model gets at most MODEL_BUDGET_MS (50 s, the fallback included); the rest is for loading
// and storing the chat. A literal, because Next reads it statically.
export const maxDuration = 75;

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
  content: z.string().max(4000),
});

/** What the model is sent of the earlier turns: the newest ones that fit. */
const MAX_HISTORY_CHARS = 24_000;

const schema = z.object({
  message: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
  consent: z.literal(true),
  chatId: z.string().uuid().optional(),
  // The hard cap: 24 turns of at most 4,000 characters (96,000). A long chat is trimmed to
  // MAX_HISTORY_CHARS in cleanHistory, never refused, or it would fail on every later message.
  history: z.array(turnSchema).max(HISTORY_TURNS).optional(),
  style: styleSchema.optional(),
  /** The intake question this message answers (Mira's last reply asked it). */
  answering: z
    .string()
    .regex(/^[a-z]{2,16}$/)
    .optional(),
  /** Spoken, not typed: the voice session it belongs to (an id the browser made for it). */
  voice: z.object({ session: z.string().uuid().optional() }).strict().optional(),
  /** The first message of a weekly session opened from its link (signed in only). */
  session: z.literal(true).optional(),
  /** Sent from a page rendered signed in: without the sign-in now, ask for it again. */
  signedIn: z.literal(true).optional(),
});

/** A spoken crisis message's session, read leniently: the crisis reply never waits for the body. */
function spokenSession(raw: Record<string, unknown>): string | undefined {
  const v =
    raw.voice && typeof raw.voice === "object" ? (raw.voice as { session?: unknown }) : null;
  return typeof v?.session === "string" && z.string().uuid().safeParse(v.session).success
    ? v.session
    : undefined;
}

const INTAKE_IDS = new Set(miraConfig.intakeQuestions.map((q) => q.id));

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_BODY_CHARS = 200_000;
/** The function's own limit (maxDuration, 75 s) less time to store the reply and answer. */
const ROUTE_BUDGET_MS = 65_000;
const PER_MINUTE = { bucket: "mira-chat", limit: 20, windowMs: 60_000 };
const RESTING = () =>
  NextResponse.json(
    { error: "Mira is resting for today. Please come back tomorrow." },
    { status: 503 }
  );
/**
 * Everyone's model calls together, per UTC day (so resting ends at midnight UTC; the team is
 * alerted once that day). Checked only for a message that goes to the model: after the person's
 * own daily caps and, without an account, after the free message, so someone at a cap or past
 * the free message can't spend everyone's (round-4 security SEC-R4-1).
 */
const everyoneMayAsk = async () => {
  const allowed = (
    await checkRateLimit(`all:${new Date().toISOString().slice(0, 10)}`, {
      bucket: "mira-global-day",
      limit: GLOBAL_DAILY_MESSAGES,
      windowMs: DAY_MS,
    })
  ).allowed;
  if (!allowed) alertDailyCeiling();
  return allowed;
};
/**
 * The last chat Mira remembers, for a weekly session's opening. None after the support lines
 * showed in the last 14 days (as nudges and reminders pause then), none when that chat holds the
 * crisis message, and none when either can't be read: she never reopens a crisis.
 */
async function sessionMemory(userId: string) {
  const since = new Date(Date.now() - CRISIS_QUIET_DAYS * DAY_MS);
  const [last, crisis] = await Promise.all([lastChat(userId), hadCrisis(userId, since)]);
  if (crisis || last?.turns.some((t) => t.content === miraConfig.crisisMessage)) return null;
  return last;
}

/** Crisis exchanges stored and counted a day per network: the reply itself is never limited. */
const CRISIS_LOGGED_PER_DAY = 50;
/** A paying-attention daily ceiling per account: model cost and abuse, not a product limit. */
const DAILY = { bucket: "mira-daily", limit: DAILY_MESSAGES, windowMs: DAY_MS };

function cleanHistory(history: MiraTurn[]): MiraTurn[] {
  const turns: MiraTurn[] = [];
  for (const t of history) {
    if (!t.content.trim()) continue;
    const last = turns.at(-1);
    // Mira's first reply and the intake invitation are two messages on screen, one turn here.
    if (last?.role === t.role) last.content += `\n\n${t.content}`;
    else turns.push({ role: t.role, content: t.content });
  }
  const recent = turns.slice(-HISTORY_TURNS);
  // A long chat keeps its newest turns: the oldest go until the rest fits.
  let chars = recent.reduce((n, t) => n + t.content.length, 0);
  while (recent.length > 1 && chars > MAX_HISTORY_CHARS) chars -= recent.shift()!.content.length;
  // The model's conversation must open with the person; Mira's greeting is UI, not history.
  while (recent[0]?.role === "assistant") recent.shift();
  return recent;
}

/**
 * Sanjin's message E and the support lines for the person's country. Nothing here can stop it:
 * the profile's country, the stored copy and the KPI rows are best effort, and past the
 * per-minute limit they are skipped (the reply still goes out) so the tables can't be flooded.
 */
async function crisisReply(request: Request, raw: Record<string, unknown>, message: string) {
  let country = requestCountry(request);
  let who: { anonId: string | null; userId: string | null } | null = null;
  let chatId: string | null = null;
  let messageId: number | null = null;
  let title: string | undefined;
  try {
    const ip = getClientIp(request);
    const logged =
      (await checkRateLimit(ip, PER_MINUTE)).allowed &&
      (
        await checkRateLimit(ip, {
          bucket: "mira-crisis-day",
          limit: CRISIS_LOGGED_PER_DAY,
          windowMs: DAY_MS,
        })
      ).allowed;
    if (logged) {
      const account = await getMiraAccount();
      who = { anonId: account ? null : await anonId(), userId: account?.id ?? null };
      const profile = account ? await getProfile(account.id) : null;
      if (profile?.country && profile.country !== "OTHER") country = profile.country;
      // Stored like any exchange while remembering is on, but not past the daily cap.
      if (profile?.remember_chats && (await checkRateLimit(profile.id, DAILY)).allowed) {
        const asked = typeof raw.chatId === "string" ? raw.chatId : null;
        // A chat it opens is named by its date, never by these words (lead decision 5).
        const opened =
          asked && (await ownsChat(profile.id, asked))
            ? null
            : neutralTitle(new Date(), profile.time_zone);
        const id = opened ? await createChat(profile.id, opened) : asked!;
        title = opened ?? undefined;
        const voiceSession = spokenSession(raw);
        const ids = await addMessages(id, [
          { role: "user", content: message.trim().slice(0, MAX_MESSAGE_CHARS), voiceSession },
          { role: "assistant", content: miraConfig.crisisMessage, voiceSession },
        ]);
        chatId = id;
        messageId = ids[1] ?? null;
      }
    }
  } catch (err) {
    logger.error({ err }, "mira: a crisis reply was not stored");
  }
  if (who) {
    const signedIn = who.userId !== null;
    const history = Array.isArray(raw.history) ? raw.history : [];
    if (!raw.chatId && history.length === 0) logMiraEvent("chat_started", who, { signedIn });
    logMiraEvent("message_sent", who, { signedIn, chars: message.length });
    logMiraEvent("reply_shown", who, { sources: [], crisis: true });
    logMiraEvent("crisis_shown", who, { country });
  }
  return NextResponse.json({
    reply: miraConfig.crisisMessage,
    sources: [],
    crisis: true,
    crisisLines: crisisFor(country),
    chatId,
    messageId,
    ...(title ? { title } : {}),
  });
}

export async function POST(request: Request) {
  const started = Date.now();
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }
  // A real request is at most about 100 KB (24 turns of 4,000 characters); anything far larger
  // is refused before it is parsed or searched for crisis words.
  const text = await request.text().catch(() => "");
  if (text.length > MAX_BODY_CHARS) {
    return NextResponse.json({ error: "That message is too long." }, { status: 413 });
  }
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  // Read leniently first: a crisis message is answered whatever else the body holds.
  const raw = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (typeof raw.message === "string" && isCrisisMessage(raw.message)) {
    return crisisReply(request, raw, raw.message);
  }

  const ip = getClientIp(request);
  const perMinute = await checkRateLimit(ip, PER_MINUTE);
  if (!perMinute.allowed) {
    return NextResponse.json(
      { error: "Please slow down a little and try again in a minute." },
      { status: 429 }
    );
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { message, chatId: askedChatId, history, style: bodyStyle, answering, voice } = parsed.data;

  const account = await getMiraAccount();
  // A page rendered signed in whose sign-in has since ended (expired, or signed out on another
  // device) is never turned anonymous: no free message spent, no sign-up card for an account
  // holder (round-2 audit CHAT-19). A crisis message was answered above, whatever the sign-in.
  if (parsed.data.signedIn && !account) {
    return NextResponse.json({ error: "Please sign in again.", signIn: true }, { status: 401 });
  }
  const anon = account ? null : await anonId();
  const who = { anonId: anon, userId: account?.id ?? null };
  // Weekly sessions: the booked slot (undefined: unknown, so Mira is told nothing either way),
  // and whether this message opens a session from its link, with the last chat she remembers.
  const opening = Boolean(parsed.data.session && account);
  let weekly: StoredSlot | null | undefined;
  let earlier: Array<{ role: "user" | "assistant"; content: string }> | null = null;

  let style: CoachingStyle | undefined = bodyStyle;
  let person: Parameters<typeof personalInstructions>[1] = { signedIn: false };
  let turns: MiraTurn[];
  let chatId: string | null = null;
  let remember = false;
  let freeLeft: number | null = null;
  let country = requestCountry(request);
  let timeZone: string | null = null;

  try {
    // Under 18 (rail 15): message G from then on, whatever the limits; crisis words came first.
    if (await isMinor(account?.id ?? null)) {
      return NextResponse.json({ reply: miraConfig.minorMessage, sources: [], minor: true });
    }
    if (account) {
      const profile = await getProfile(account.id);
      if (!profile) {
        return NextResponse.json({ error: "Please sign in again.", signIn: true }, { status: 401 });
      }
      const daily = await checkRateLimit(account.id, DAILY);
      if (!daily.allowed) {
        return NextResponse.json(
          { error: "That's today's limit for the beta. Mira is here again tomorrow." },
          { status: 429 }
        );
      }
      if (!(await everyoneMayAsk())) return RESTING();
      style = profile.style;
      remember = profile.remember_chats;
      timeZone = profile.time_zone ?? null;
      country = profile.country && profile.country !== "OTHER" ? profile.country : country;
      // Challenges & goals: their goals on the go, read beside the result, so Mira can check in.
      const goals = goalsForPrompt(account.id, profile.time_zone).catch((err) => {
        logger.warn({ err }, "mira: goals were not read for the chat");
        return [];
      });
      const [assessment, checks, slot, last] = await Promise.all([
        profile.use_assessment ? findAssessment(account.email).catch(() => null) : null,
        // Self-check bands only with "Mira may use my check results"; a failed read adds none.
        checksForMira(account.id).catch(() => []),
        getSlot(account.id).catch(() => undefined),
        opening && profile.remember_chats ? sessionMemory(account.id).catch(() => null) : null,
      ]);
      weekly = slot;
      earlier = last?.turns.map(({ role, content }) => ({ role, content })) ?? null;
      person = {
        signedIn: true,
        name: profile.name,
        gender: profile.gender,
        country: profile.country,
        archetype: assessment?.archetype ?? null,
        replyLanguage: profile.reply_language,
        goals: await goals,
        checks,
      };
      // The daily journal's last 7 days, only if the person let Mira read it (server/journal.ts).
      person.journal = await journalContext(account.id).catch(() => null);
      // A saved chat is read from storage only while remembering is on: with it off nothing new is
      // stored, so the conversation on the page is the only full one (round-2 audit CHAT-8).
      if (askedChatId && remember && (await ownsChat(account.id, askedChatId))) {
        chatId = askedChatId;
        const stored = await getMessages(account.id, chatId, HISTORY_TURNS);
        turns = cleanHistory(stored.map((m) => ({ role: m.role, content: m.content })));
      } else {
        turns = cleanHistory(history ?? []);
      }
    } else {
      turns = cleanHistory(history ?? []);
      // Messages are capped per day per browser id and, because a cleared cookie is a new id,
      // per network too (generous: a household or office shares one address).
      const caps = await Promise.all([
        checkRateLimit(anon!, {
          bucket: "mira-anon-daily",
          limit: DAILY_MESSAGES,
          windowMs: DAY_MS,
        }),
        checkRateLimit(ip, {
          bucket: "mira-anon-ip",
          limit: DAILY_MESSAGES * 6,
          windowMs: DAY_MS,
        }),
      ]);
      if (caps.some((c) => !c.allowed)) {
        return NextResponse.json(
          { error: "That's today's limit for the beta. Mira is here again tomorrow." },
          { status: 429 }
        );
      }
      // Every message is counted per browser id, then the sign-up card. ponytail: a cleared
      // cookie is a new id with another free message (the per-network daily cap above bounds
      // that), and a reply the model then fails to write still used it. Upgrade: count after
      // the reply.
      const free = await checkRateLimit(anon!, {
        bucket: "mira-anon-messages",
        limit: ANON_FREE_MESSAGES,
        windowMs: 30 * DAY_MS,
      });
      if (!free.allowed) {
        logMiraEvent("gate_shown", who, { limit: ANON_FREE_MESSAGES });
        return NextResponse.json({ gate: true, freeLeft: 0 });
      }
      // Only now, as this message goes to the model (SEC-R4-1). ponytail: a resting day spends
      // the browser's free message; give it back (a release in shared/http/ratelimit.ts) if
      // resting days ever become common.
      if (!(await everyoneMayAsk())) return RESTING();
      freeLeft = free.remaining;
    }
  } catch (err) {
    logger.error({ err }, "mira: could not load the conversation");
    return NextResponse.json(
      { error: "Mira couldn't load this chat. Please try again." },
      { status: 500 }
    );
  }

  const isFirst = turns.length === 0;
  // Sanjin's intake invitation follows a first reply in the account's first chat only (round-2
  // audit CHAT-2); never after a weekly session's opening: it is their session, not a first chat;
  // nor with the reply that uses the last free message, as nobody could answer it without an
  // account (round-3 R3-CHAT-3). Offered when that can't be read.
  const inviting =
    isFirst &&
    !opening &&
    freeLeft !== 0 &&
    !(account && remember && (await invitationShown(account.id).catch(() => false)));
  // Which starter chip opened the chat, as its index (-1: the person's own words), never text.
  // A weekly session's opening line is the app's, neither (null).
  const chip = isFirst && !opening ? miraConfig.starterChips.indexOf(message) : null;
  turns = cleanHistory([...turns, { role: "user", content: message }]);

  let reply: string;
  let sources: CitedSource[] = [];
  let crisis = false;
  let refused = false;
  let support = false; // the question-9 check-in's support lines, not a crisis (HAB-11)
  let ask: string | null = null;
  let goal: string | null = null;

  const result = await askModel(
    STABLE_INSTRUCTIONS,
    [
      personalInstructions(style, person, {
        topic: chip === -1,
        voice: Boolean(voice),
        invitation: inviting,
      }),
      ...(weekly === undefined
        ? []
        : [weeklySessionInstructions(weekly, { justBooked: answering === "weekly" })]),
      ...(opening ? [sessionOpeningInstructions(weekly ?? null, earlier)] : []),
    ].join("\n\n"),
    turns,
    started + ROUTE_BUDGET_MS
  );
  if (!result.ok) {
    // The AI budget is used up (model.ts alerted the team): the resting answer, not "busy".
    if (result.reason === "budget_exhausted") return RESTING();
    const status = result.reason === "unconfigured" ? 503 : result.reason === "error" ? 502 : 503;
    const error =
      result.reason === "unconfigured"
        ? "Mira isn't switched on yet."
        : "Mira is busy for a moment. Please try again.";
    return NextResponse.json({ error }, { status });
  }
  const out = result.refused ? null : parseReply(result.text);
  const minor = Boolean(out?.minor);
  if (out?.crisis && !out.text) {
    // A stop rail fired and the reply held nothing else (the token, perhaps a Sources line):
    // the fixed message, so the support panel still opens.
    reply = miraConfig.crisisMessage;
    crisis = true;
  } else if (minor && !out?.crisis) {
    reply = miraConfig.minorMessage; // Sanjin's message G, whatever the model wrote
  } else if (!out?.text) {
    // Declined or empty: a neutral line, and the support panel opens in case something happened.
    reply = miraConfig.refusalMessage;
    refused = true;
  } else {
    reply = out.text;
    sources = out.sources;
    crisis = out.crisis;
    support = out.support;
    ask = out.ask;
    goal = out.goal ?? null; // parseReply never offers one beside a crisis or an under-18 stop
  }

  // The invitation is its own message after Mira's reply (with reply buttons). Not when her reply
  // already asked an intake question: that question's buttons come first.
  const invitation =
    inviting && !crisis && !refused && !support && !minor && !ask
      ? miraConfig.intakeInvitation
      : null;

  // A declined reply, and the question-9 check-in, open the support lines the way a crisis reply
  // does (the browser's `crisis`); only a crisis is counted as one (crisis_shown).
  const lines = crisis || refused || support;
  let messageId: number | null = null;
  let title: string | undefined; // a new chat's, as it is shown (Home, the chat list)
  if (minor) {
    // An under-18 stop keeps nothing: stopForMinor deletes the account's chats, this one too.
    chatId = null;
    await stopForMinor(account?.id ?? null);
  } else if (account && remember) {
    try {
      if (!chatId) {
        // Named after its first message, unless the reply to it was a crisis or a declined one:
        // then by its date, never those words (round-2 audit CHAT-17, lead decision 5). The
        // question-9 check-in's lines come from a check, not the message, which names it.
        const now = new Date();
        const stored =
          crisis || refused
            ? neutralTitle(now, timeZone)
            : message.replace(/\s+/g, " ").slice(0, 80);
        chatId = await createChat(account.id, stored);
        title = shownTitle(stored, now, timeZone);
      }
      const voiceSession = voice?.session;
      const ids = await addMessages(chatId, [
        { role: "user", content: message, voiceSession },
        { role: "assistant", content: reply, sources, ask, goal, voiceSession },
        ...(invitation ? [{ role: "assistant" as const, content: invitation, voiceSession }] : []),
      ]);
      messageId = ids[1] ?? null;
    } catch (err) {
      // The person still gets the reply; only the saved copy is missing.
      logger.error({ err }, "mira: the exchange was not stored");
    }
  }

  if (isFirst) logMiraEvent("chat_started", who, { signedIn: Boolean(account), chip });
  // With its chat's id, so the picks forget it when that chat is deleted (round-3 R3-DATA-1).
  if (chip === -1 && out?.topic && !crisis) {
    logMiraEvent("chat_topic", who, { topic: out.topic, ...(chatId ? { chat: chatId } : {}) });
  }
  if (answering && INTAKE_IDS.has(answering))
    logMiraEvent("intake_answered", who, { q: answering });
  // A reply that was only markers gets the refusal message: it referred nobody.
  if (out?.refer && !refused) logMiraEvent("referred", who);
  logMiraEvent("message_sent", who, { signedIn: Boolean(account), chars: message.length });
  logMiraEvent("reply_shown", who, { sources: sources.map((s) => s.id), crisis });
  if (crisis) logMiraEvent("crisis_shown", who, { country });
  if (refused) {
    // Apart from crisis_shown, so the crisis count stays true. The category's id, never text.
    const why = result.refused ? "refusal" : "empty";
    logMiraEvent("reply_declined", who, { why, category: result.category ?? null });
  }
  if (minor) logMiraEvent("minor_stop", who, { signedIn: Boolean(account) });
  if (goal) logMiraEvent("goal_suggested", who, { signedIn: Boolean(account) });
  // The reply that used the last free message brings the sign-up card, never beside the support
  // lines or an under-18 stop.
  if (freeLeft === 0 && !lines && !minor) {
    logMiraEvent("gate_shown", who, { limit: ANON_FREE_MESSAGES });
  }
  return NextResponse.json({
    reply,
    sources,
    crisis: lines,
    crisisLines: lines ? crisisFor(country) : undefined,
    chatId,
    messageId,
    ...(title ? { title } : {}),
    ...(minor ? { minor: true } : {}),
    // A referral (the event's own rule): the chat asks for no rating after it (reviews/ReviewAsk).
    ...(out?.refer && !refused ? { refer: true } : {}),
    ...(ask ? { ask } : {}),
    ...(goal ? { goal } : {}),
    ...(invitation ? { invitation } : {}),
    ...(freeLeft === null ? {} : { freeLeft }),
  });
}
