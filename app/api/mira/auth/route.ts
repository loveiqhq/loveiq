/**
 * POST /api/mira/auth — the free account, by emailed code (boards 04 and 05).
 *
 *   { action: "start", email, adult: true, terms: true, consent: true } → emails a sign-in code
 *   { action: "verify", email, code, carry? }  → signs in (Mira's own cookie), records the
 *       consent, and moves the anonymous chat into the account ("your current chat comes with you")
 *   { action: "logout" }
 *
 * "start" answers the same whether or not the address is new, so it can't be used to learn who
 * has an account.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { CONSENT_VERSION, HISTORY_TURNS } from "@features/mira/server/config";
import { createMiraSupabase } from "@features/mira/server/session";
import { SIGN_IN_CODE, sendSignInCode } from "@features/mira/server/sign-in";
import {
  addMessages,
  claimCodeAttempt,
  consumeCode,
  createChat,
  logMiraEvent,
  recordCodeIssued,
  upsertProfileAtSignIn,
} from "@features/mira/server/store";
import { anonId } from "@features/mira/server/anon";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";

const email = z.string().trim().toLowerCase().email().max(320);

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
    carry: z
      .array(
        z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) })
      )
      .max(HISTORY_TURNS * 2)
      .optional(),
  }),
  z.object({ action: z.literal("logout") }),
]);

export async function POST(request: Request) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }
  const ip = getClientIp(request);
  const rate = await checkRateLimit(ip, { bucket: "mira-auth", limit: 10, windowMs: 60_000 });
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

  if (body.action === "start") {
    const perEmail = await checkRateLimit(body.email, {
      bucket: "mira-code",
      limit: 3,
      windowMs: 10 * 60_000,
    });
    if (!perEmail.allowed) {
      return NextResponse.json(
        {
          error:
            "We just sent you a code. Check your inbox and spam, or try again in a few minutes.",
        },
        { status: 429 }
      );
    }
    const sent = await sendSignInCode(body.email);
    if (!sent) {
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
      return NextResponse.json(
        { error: "We couldn't send the code. Please try again." },
        { status: 500 }
      );
    }
    logMiraEvent("signup_code_sent", { anonId: await anonId() });
    return NextResponse.json({ success: true });
  }

  // verify. A code is checked only if Mira emailed it to this address within the hour and it
  // has guesses left: one guess is reserved atomically BEFORE the check (5 per code), so
  // parallel or spread-out guesses cannot pass the cap, and nobody can use this route to guess
  // a code Mira did not send. A new code resets the count, so the real person is never locked
  // out. Fails closed: no reserved guess, no check.
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

  try {
    const profile = await upsertProfileAtSignIn(account.id, account.email, CONSENT_VERSION);
    let chatId: string | null = null;
    const carry = body.carry?.filter((t) => t.content.trim()) ?? [];
    if (carry.length > 0 && profile?.remember_chats !== false) {
      const firstUser = carry.find((t) => t.role === "user")?.content ?? "New chat";
      chatId = await createChat(account.id, firstUser.replace(/\s+/g, " ").slice(0, 80));
      await addMessages(chatId, carry);
    }
    logMiraEvent(
      "signup_completed",
      { anonId: await anonId(), userId: account.id },
      { carried: carry.length }
    );
    return NextResponse.json({ success: true, needsProfile: !profile?.name, chatId });
  } catch (err) {
    logger.error({ err }, "mira: the profile was not saved at sign-in");
    return NextResponse.json(
      { error: "You're signed in, but we couldn't finish. Please reload." },
      { status: 500 }
    );
  }
}
