/**
 * POST /api/mira/auth — the free account, by emailed code (boards 04 and 05).
 *
 *   { action: "start", email, adult: true, terms: true, consent: true } → emails a sign-in code
 *   { action: "verify", email, code, carry?, useAssessment?, shareRated? }  → signs in (Mira's
 *       own cookie), records the consent with the form's two optional ticks (off unless sent
 *       true), and moves the anonymous chat into the account ("your current chat comes with you")
 *   { action: "carry", carry } → after Google sign-in, moves the anonymous chat into the account
 *   { action: "logout" }
 *
 * "start" answers the same whether or not the address is new, so it can't be used to learn who
 * has an account.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { CONSENT_VERSION, HISTORY_TURNS, MAX_MESSAGE_CHARS } from "@features/mira/server/config";
import { createMiraSupabase, getMiraAccount } from "@features/mira/server/session";
import { SIGN_IN_CODE, addressKey, sendSignInCode } from "@features/mira/server/sign-in";
import {
  addMessages,
  claimCodeAttempt,
  consumeCode,
  createChat,
  getProfile,
  logMiraEvent,
  recordCodeIssued,
  upsertProfileAtSignIn,
} from "@features/mira/server/store";
import { anonId } from "@features/mira/server/anon";
import { verifyCsrfToken } from "@shared/http/csrf";
import {
  checkCooldown,
  checkRateLimit,
  getClientIp,
  releaseCooldown,
} from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";
import { notifySlack } from "@shared/observability/slack";

export const dynamic = "force-dynamic";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
/** Codes per inbox per 10 minutes; code emails per network per hour, and in all per hour. */
const CODES_PER_ADDRESS = 3;
const CODES_PER_IP_HOUR = 15;
const CODES_PER_HOUR = 300;
/** Code guesses per address and network per 10 minutes. */
const GUESSES_PER_ADDRESS_AND_IP = 5;
/** A carried reply is as long as the chat route takes a turn; a carried user turn, a message. */
const MAX_REPLY_CHARS = 4000;
const CARRIES_PER_DAY = 5;

const email = z.string().trim().toLowerCase().email().max(320);
// The page sends up to 48 turns; carryChat keeps what the chat itself allows.
const carrySchema = z
  .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) }))
  .max(HISTORY_TURNS * 2);

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    email,
    adult: z.literal(true),
    terms: z.literal(true),
    consent: z.literal(true),
  }),
  z.object({
    action: z.literal("verify"),
    email,
    code: z.string().trim().regex(SIGN_IN_CODE),
    carry: carrySchema.optional(),
    useAssessment: z.boolean().default(false),
    shareRated: z.boolean().default(false),
  }),
  z.object({ action: z.literal("carry"), carry: carrySchema.min(1) }),
  z.object({ action: z.literal("logout") }),
]);

type Turn = z.infer<typeof carrySchema>[number];

const tryLater = () => NextResponse.json({ error: "Please try again later." }, { status: 429 });

/**
 * One of the inbox's codes for the next 10 minutes, or null when they're used. One cooldown per
 * code rather than a counter, so a code that never went out is given back (a counter can't be).
 * ponytail: without Redis (local, staging) cooldowns always pass, so only the per-IP caps hold.
 */
async function claimCodeSlot(inbox: string): Promise<string | null> {
  for (let i = 1; i <= CODES_PER_ADDRESS; i++) {
    const bucket = `mira-code-${i}`;
    if ((await checkCooldown(inbox, bucket, 10 * MINUTE_MS)).allowed) return bucket;
  }
  return null;
}

/**
 * Moves the anonymous chat into the account, within the chat's own limits: its newest
 * HISTORY_TURNS turns, each no longer than the chat lets it be. At most CARRIES_PER_DAY a day
 * per account, so this can't be used to fill the database. The new chat's id, null when there
 * is nothing to keep, or "limited".
 */
async function carryChat(
  accountId: string,
  remember: boolean,
  turns: Turn[]
): Promise<string | null | "limited"> {
  const kept = turns.slice(-HISTORY_TURNS).map((t) => ({
    role: t.role,
    content: t.content.slice(0, t.role === "user" ? MAX_MESSAGE_CHARS : MAX_REPLY_CHARS),
  }));
  if (kept.length === 0 || !remember) return null;
  const quota = await checkRateLimit(accountId, {
    bucket: "mira-carry",
    limit: CARRIES_PER_DAY,
    windowMs: 24 * HOUR_MS,
  });
  if (!quota.allowed) return "limited";
  const firstUser = kept.find((t) => t.role === "user")?.content ?? "New chat";
  const chatId = await createChat(accountId, firstUser.replace(/\s+/g, " ").slice(0, 80));
  await addMessages(chatId, kept);
  return chatId;
}

export async function POST(request: Request) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }
  const ip = getClientIp(request);
  const rate = await checkRateLimit(ip, { bucket: "mira-auth", limit: 10, windowMs: MINUTE_MS });
  if (!rate.allowed) {
    return NextResponse.json({ error: "Please try again in a minute." }, { status: 429 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Please check the form and try again." }, { status: 400 });
  }
  const body = parsed.data;

  if (body.action === "logout") {
    const supabase = await createMiraSupabase();
    await supabase.auth.signOut({ scope: "local" });
    return NextResponse.json({ success: true });
  }

  if (body.action === "carry") {
    // Google sign-in ends on a redirect, so the browser sends its anonymous chat afterwards.
    const account = await getMiraAccount();
    if (!account) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    try {
      const profile = await getProfile(account.id);
      const turns = body.carry.filter((t) => t.content.trim());
      const chatId = await carryChat(account.id, profile?.remember_chats !== false, turns);
      if (chatId === "limited") return tryLater();
      return NextResponse.json({ success: true, chatId });
    } catch (err) {
      logger.error({ err }, "mira: the chat was not carried into the account");
      return NextResponse.json({ error: "We couldn't bring your chat along." }, { status: 500 });
    }
  }

  if (body.action === "start") {
    // A code email costs us mail and makes an auth user for any address, so it has caps of its
    // own: per network per hour, and all of them per hour. The inbox's allowance is spent last
    // and only by a code that went out, so a refused or failed request never uses it up.
    const perIp = await checkRateLimit(ip, {
      bucket: "mira-code-ip",
      limit: CODES_PER_IP_HOUR,
      windowMs: HOUR_MS,
    });
    if (!perIp.allowed) return tryLater();
    const inbox = addressKey(body.email);
    const slot = await claimCodeSlot(inbox);
    if (!slot) {
      return NextResponse.json(
        {
          error:
            "We just sent you a code. Check your inbox and spam, or try again in a few minutes.",
        },
        { status: 429 }
      );
    }
    const all = await checkRateLimit("all", {
      bucket: "mira-code-all",
      limit: CODES_PER_HOUR,
      windowMs: HOUR_MS,
    });
    if (!all.allowed) {
      await releaseCooldown(inbox, slot);
      // Email sign-up is closed until the hour turns (Google still works), so ops hear of it,
      // once an hour: either sign-ups took off or someone is pushing codes at strangers.
      const alert = await checkRateLimit("all", {
        bucket: "mira-code-all-alert",
        limit: 1,
        windowMs: HOUR_MS,
      });
      if (alert.allowed) {
        await notifySlack({
          channel: "ops",
          kind: "mira_code_cap",
          text: `:warning: Mira: ${CODES_PER_HOUR} sign-in code emails in the last hour, so email sign-up waits until the hour is over (Google sign-in still works). A launch spike, or someone sending codes to strangers: check mira_event signup_code_sent.`,
          username: "ops_alerts",
        }).catch(() => {});
      }
      return tryLater();
    }
    const sent = await sendSignInCode(body.email);
    if (!sent) {
      await releaseCooldown(inbox, slot);
      return NextResponse.json(
        { error: "We couldn't send the code. Please try again." },
        { status: 500 }
      );
    }
    try {
      await recordCodeIssued(body.email);
    } catch (err) {
      // Fails closed: without the record the code is never checked, so ask for a new one.
      logger.error({ err }, "mira: a sent code was not recorded");
      await releaseCooldown(inbox, slot);
      return NextResponse.json(
        { error: "We couldn't send the code. Please try again." },
        { status: 500 }
      );
    }
    logMiraEvent("signup_code_sent", { anonId: await anonId() });
    return NextResponse.json({ success: true });
  }

  // verify. A code is checked only if Mira emailed it to this address within the hour and it
  // has guesses left: one guess is reserved atomically BEFORE the check (25 per code), so
  // parallel or spread-out guesses cannot pass the cap, and nobody can use this route to guess
  // a code Mira did not send. Before that, guesses are counted per address and network (5 per
  // 10 minutes), so a stranger who knows the address can't burn the real person's code from
  // elsewhere. Fails closed: no reserved guess, no check.
  const guesses = await checkRateLimit(`${body.email}|${ip}`, {
    bucket: "mira-code-guess",
    limit: GUESSES_PER_ADDRESS_AND_IP,
    windowMs: 10 * MINUTE_MS,
  });
  if (!guesses.allowed) {
    return NextResponse.json(
      { error: "Too many tries. Please wait a few minutes, then try again." },
      { status: 429 }
    );
  }
  if (!(await claimCodeAttempt(body.email))) {
    return NextResponse.json(
      { error: "That code didn't work or has expired. Please send a new code." },
      { status: 400 }
    );
  }
  const supabase = await createMiraSupabase();
  const { data, error } = await supabase.auth.verifyOtp({
    email: body.email,
    token: body.code,
    type: "email",
  });
  if (error || !data.user?.email) {
    logger.info({ reason: error?.message }, "mira: a sign-in code was refused");
    return NextResponse.json(
      { error: "That code didn't work. Check it, or send a new one." },
      { status: 400 }
    );
  }
  await consumeCode(body.email).catch(() => undefined);
  // The session cookie was just set on this response; the user comes from the verify itself.
  const account = { id: data.user.id, email: data.user.email.toLowerCase() };

  let profile: Awaited<ReturnType<typeof upsertProfileAtSignIn>>;
  try {
    profile = await upsertProfileAtSignIn(account.id, account.email, CONSENT_VERSION, {
      useAssessment: body.useAssessment,
      shareRated: body.shareRated,
    });
  } catch (err) {
    // Signed in without a profile is a dead end (/api/mira/me answers 401) and the code is
    // used up, so sign out again: the next code starts clean.
    logger.error({ err }, "mira: the profile was not saved at sign-in");
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    return NextResponse.json(
      { error: "We couldn't finish signing you in. Please send a new code." },
      { status: 500 }
    );
  }
  try {
    const carry = body.carry?.filter((t) => t.content.trim()) ?? [];
    const chatId = await carryChat(account.id, profile?.remember_chats !== false, carry);
    logMiraEvent(
      "signup_completed",
      { anonId: await anonId(), userId: account.id },
      { carried: carry.length, method: "email" }
    );
    return NextResponse.json({
      success: true,
      needsProfile: !profile?.name,
      chatId: chatId === "limited" ? null : chatId,
    });
  } catch (err) {
    logger.error({ err }, "mira: the chat was not carried in at sign-in");
    return NextResponse.json(
      { error: "You're signed in, but we couldn't finish. Please reload." },
      { status: 500 }
    );
  }
}
