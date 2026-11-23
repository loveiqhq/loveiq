/**
 * GET /api/mira/auth/google/callback — where Google sends people back.
 *
 * Checks the state against the start cookie, swaps the code for the person's confirmed email,
 * then signs in exactly as a verified emailed code does: Mira's own session cookie, and the
 * consent recorded with the form's optional ticks (the start route checked the ticks and kept
 * them in the cookie). The page then brings the chat along ("your current chat comes with you"),
 * asks the "About you" questions if they're new, and goes on to `next` (checked again here).
 * The device is recorded (devices.ts) and the account marked as confirmed by Google.
 *
 * Settings' "Connect Google" (`connect` in the start cookie) signs nobody in: it records that
 * Google confirmed the signed-in account's own address, exactly as typed there, and goes back to
 * Settings. Another address is refused, since Continue with Google would open that address's
 * account instead.
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { anonId } from "@features/mira/server/anon";
import { CONSENT_VERSION } from "@features/mira/server/config";
import { recordSession } from "@features/mira/server/devices";
import {
  exchangeCode,
  GOOGLE_COOKIE,
  GOOGLE_COOKIE_PATH,
  googleClient,
  returnOrigin,
  sameState,
  unpackStart,
} from "@features/mira/server/google";
import { isMinor } from "@features/mira/server/minor";
import { createMiraSupabase, getMiraAccount, safeNext } from "@features/mira/server/session";
import { mintSignInCode } from "@features/mira/server/sign-in";
import { logMiraEvent, updateProfile, upsertProfileAtSignIn } from "@features/mira/server/store";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";

const query = z.object({
  code: z.string().min(1).max(2048).optional(),
  state: z.string().max(200).optional(),
  error: z.string().max(200).optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const jar = await cookies();
  const start = unpackStart(jar.get(GOOGLE_COOKIE)?.value);
  jar.delete({ name: GOOGLE_COOKIE, path: GOOGLE_COOKIE_PATH }); // one use only
  const next = safeNext(start?.next);
  const andNext = next ? `&next=${encodeURIComponent(next)}` : "";
  const connect = start?.connect === true;
  const back = (why: string) =>
    NextResponse.redirect(
      new URL(
        connect ? `/mira/settings?google=${why}#security` : `/mira/start?google=${why}${andNext}`,
        url.origin
      ),
      303
    );

  const rate = await checkRateLimit(getClientIp(request), {
    bucket: "mira-google",
    limit: 10,
    windowMs: 60_000,
  });
  if (!rate.allowed) return back("busy");
  const client = googleClient();
  const origin = returnOrigin(request.url);
  if (!client || !origin) return back("off");
  const q = query.safeParse(Object.fromEntries(url.searchParams));
  if (!q.success) return back("failed");
  if (q.data.error) return back("cancelled");
  if (!start || !q.data.code || !q.data.state || !sameState(q.data.state, start.state)) {
    return back("failed");
  }
  // A browser Mira stopped as under 18 makes no account and signs nobody in, as the emailed code
  // and passkeys refuse it (round-4 R4-CORE-1); Connect Google answers the same.
  if (await isMinor(null)) return back("minor");

  const who = await exchangeCode(client, origin, q.data.code, start);
  if (!who) {
    logger.info("mira: Google sign-in was refused at the token step");
    return back("failed");
  }
  if (connect) {
    const account = await getMiraAccount();
    if (!account) {
      return NextResponse.redirect(new URL("/mira/start?next=%2Fmira%2Fsettings", origin), 303);
    }
    if (who.email !== account.email) return back("mismatch");
    if (!who.googleRuns) return back("other");
    if (await isMinor(account.id)) return back("minor");
    try {
      await updateProfile(account.id, { google_connected_at: new Date().toISOString() });
    } catch (err) {
      logger.error({ err }, "mira: a Google connection was not saved");
      return back("failed");
    }
    logMiraEvent("google_connected", { userId: account.id });
    return back("connected");
  }
  // Only addresses Google runs (Gmail, or Workspace on its own domain); everyone else gets the
  // emailed code. Staff too, since 23 Nov 2026: Mira's session is in its own cookie, which the
  // admin panel never reads, and staff could already sign in with the emailed code.
  if (!who.googleRuns) return back("other");
  const code = await mintSignInCode(who.email);
  if (!code) return back("failed");
  const supabase = await createMiraSupabase();
  const { data, error } = await supabase.auth.verifyOtp({
    email: who.email,
    token: code,
    type: "email",
  });
  if (error || !data.user?.email) {
    logger.warn({ reason: error?.message }, "mira: Google sign-in could not start a session");
    return back("failed");
  }

  const account = { id: data.user.id, email: data.user.email.toLowerCase() };
  try {
    const profile = await upsertProfileAtSignIn(account.id, account.email, CONSENT_VERSION, {
      useAssessment: start.useAssessment,
    });
    await recordSession(data.session?.access_token, account.id, "google", request.headers);
    // Settings shows Google as connected; only a label, so a failed write doesn't stop the sign-in.
    await updateProfile(account.id, { google_connected_at: new Date().toISOString() }).catch(
      (err: unknown) => logger.warn({ err }, "mira: Google's confirmation was not saved")
    );
    logMiraEvent(
      "signup_completed",
      { anonId: await anonId(), userId: account.id },
      { method: "google" }
    );
    const done = `/mira/start?google=done${profile?.name ? "" : "&about=1"}${andNext}`;
    return NextResponse.redirect(new URL(done, origin), 303);
  } catch (err) {
    // Signed in without a profile (or a recorded device) is a dead end (/api/mira/me answers
    // 401): sign out again, so the next try starts clean.
    logger.error({ err }, "mira: the profile was not saved at Google sign-in");
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    return back("failed");
  }
}
