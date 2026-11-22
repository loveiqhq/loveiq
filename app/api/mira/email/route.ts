/**
 * POST /api/mira/email — changes the signed-in account's email (features/mira/server/email-change.ts).
 *
 *   { action: "start", email }  → emails an 8-digit code to the new address. Within 15 minutes of
 *       signing in only (a device left signed in can't move the account), never for a login the
 *       admin panel or Jarvis shares, nor for anyone Mira stopped as under 18.
 *   { action: "confirm", code } → with the code, the account's address becomes the new one, and
 *       the old address gets a neutral note.
 *
 * The code email shares the sign-in code's limits: one per inbox per 10 minutes (with sign-in's
 * own), ten an hour per network and sixty an hour in all; five changes a day per account. "start"
 * answers the same whether or not the address has an account or takes our mail, so it can't be used
 * to learn either; an address that is taken is only said so once its code proved it is the
 * person's. Guesses: 5 per code (reserved before each check) and 5 per 10 minutes per account
 * and network.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { alertCodeCap } from "@features/mira/server/alerts";
import { isRecentSignIn } from "@features/mira/server/devices";
import {
  changeAccountEmail,
  confirmPendingChange,
  dropPendingChange,
  maskEmail,
  newAddressCode,
  savePendingChange,
} from "@features/mira/server/email-change";
import { isMinor } from "@features/mira/server/minor";
import { getMiraAccount } from "@features/mira/server/session";
import {
  addressKey,
  claimDaySlot,
  emailChangedNotice,
  sendNeutralEmail,
  signInCodeEmail,
} from "@features/mira/server/sign-in";
import { consumeCode, logMiraEvent, sharesLogin } from "@features/mira/server/store";
import { isUndeliverable } from "@shared/emails/suppression";
import { scheduleAfterResponse } from "@shared/http/after-response";
import { verifyCsrfToken } from "@shared/http/csrf";
import {
  checkCooldown,
  checkRateLimit,
  getClientIp,
  releaseCooldown,
} from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), email: z.string().trim().toLowerCase().email().max(320) }),
  z.object({
    action: z.literal("confirm"),
    code: z
      .string()
      .trim()
      .regex(/^\d{8}$/),
  }),
]);

const fail = (error: string, status: number, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error, ...extra }, { status });
const tryLater = () => fail("Please try again later.", 429);

/** The answer to a code that was not sent: a sent one's, after about as long as a send takes. */
async function sentNothing(): Promise<NextResponse> {
  await new Promise((resolve) => setTimeout(resolve, 400 + Math.random() * 600));
  return NextResponse.json({ success: true });
}

export async function POST(request: Request) {
  if (!(await verifyCsrfToken(request))) return fail("Invalid request.", 403);
  const ip = getClientIp(request);
  const rate = await checkRateLimit(ip, { bucket: "mira-email", limit: 10, windowMs: MINUTE_MS });
  if (!rate.allowed) return fail("Please try again in a minute.", 429);
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return fail("Please check the address and try again.", 400);
  const body = parsed.data;
  const account = await getMiraAccount();
  if (!account) return fail("Please sign in again.", 401);

  try {
    if (await isMinor(account.id)) return fail("Mira is only for adults.", 403, { minor: true });

    if (body.action === "start") {
      if (body.email === account.email) return fail("That's already your email.", 400);
      if (await sharesLogin(account.email)) {
        return fail("This address is also a LoveIQ team login, so it can't be changed here.", 403);
      }
      if (!account.session || !isRecentSignIn(account.session.signedInAt)) {
        return fail("For your security, please sign in again to change your email.", 403, {
          reauth: true,
        });
      }
      const perIp = await checkRateLimit(ip, {
        bucket: "mira-code-ip",
        limit: 10,
        windowMs: HOUR_MS,
      });
      const perAccount = await checkRateLimit(`u:${account.id}`, {
        bucket: "mira-email-day",
        limit: 5,
        windowMs: DAY_MS,
      });
      if (!perIp.allowed || !perAccount.allowed) return tryLater();
      const inbox = addressKey(body.email);
      // The same wait as sign-in's: one code an inbox per 10 minutes, whichever sent it.
      if (!(await checkCooldown(inbox, "mira-code-wait", 10 * MINUTE_MS)).allowed) {
        return fail(
          "We just sent a code to that address. Check its inbox and spam, or try again in a few minutes.",
          429
        );
      }
      // And one of the inbox's five codes a day, shared with sign-in (sign-in.ts claimDaySlot).
      const daySlot = await claimDaySlot(inbox);
      if (!daySlot) {
        await releaseCooldown(inbox, "mira-code-wait");
        return fail(
          "We've sent several codes to that address today. Check its inbox and spam, or try again tomorrow.",
          429
        );
      }
      const giveBack = async () => {
        await releaseCooldown(inbox, "mira-code-wait");
        await releaseCooldown(inbox, daySlot);
      };
      const all = await checkRateLimit("all", {
        bucket: "mira-code-all",
        limit: 60,
        windowMs: HOUR_MS,
      });
      if (!all.allowed) {
        await giveBack();
        alertCodeCap(60);
        return tryLater();
      }
      if (await isUndeliverable(body.email)) {
        logger.warn("mira: no email change code sent (address bounced or complained)");
        return sentNothing();
      }
      const code = newAddressCode();
      try {
        await savePendingChange(account.id, body.email, code);
      } catch (err) {
        await giveBack(); // no code went out: the inbox may have one again at once
        throw err;
      }
      if (!(await sendNeutralEmail(body.email, signInCodeEmail(code, "new-address")))) {
        await dropPendingChange(account.id).catch(() => undefined);
        await giveBack();
        return fail("We couldn't send the code. Please try again.", 500);
      }
      return NextResponse.json({ success: true });
    }

    // confirm
    const guesses = await checkRateLimit(`${account.id}|${ip}`, {
      bucket: "mira-email-guess",
      limit: 5,
      windowMs: 10 * MINUTE_MS,
    });
    if (!guesses.allowed) return fail("Too many tries. Please wait a few minutes.", 429);
    const newEmail = await confirmPendingChange(account.id, body.code);
    if (!newEmail) {
      return fail("That code didn't work, or it has expired. Check it, or send a new one.", 400);
    }
    // Staff and Jarvis addresses stay theirs (an account moved there would open the admin panel
    // or Jarvis): proven or not, Mira doesn't move an account onto one.
    if (await sharesLogin(newEmail)) {
      await dropPendingChange(account.id);
      return fail("We can't use that address here. Please choose another.", 403);
    }
    if ((await changeAccountEmail(account.id, account.email, newEmail)) === "taken") {
      await dropPendingChange(account.id);
      return fail(
        "That address already has an account. Sign in with it instead, or choose another.",
        409
      );
    }
    await dropPendingChange(account.id).catch(() => undefined);
    await consumeCode(account.email).catch(() => undefined); // a sign-in code for the old one
    const oldEmail = account.email;
    scheduleAfterResponse("mira-email-changed-notice", async () => {
      if (!(await sendNeutralEmail(oldEmail, emailChangedNotice(maskEmail(newEmail))))) {
        logger.error("mira: the old address was not told about an email change");
      }
    });
    logMiraEvent("email_changed", { userId: account.id });
    return NextResponse.json({ success: true, email: newEmail });
  } catch (err) {
    logger.error({ err }, "mira: an email change failed");
    return fail("We couldn't change your email right now. Please try again.", 500);
  }
}
