/**
 * GET /api/mira/auth/google/callback — where Google sends people back.
 *
 * Checks the state against the start cookie, swaps the code for the person's confirmed email,
 * then signs in exactly as a verified emailed code does: Mira's own session cookie, and the
 * consent recorded with the form's optional ticks (the start route checked the ticks and kept
 * them in the cookie). The page then brings the chat along ("your current chat comes with you"),
 * asks the "About you" questions if they're new, and goes on to `next` (checked again here).
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { anonId } from "@features/mira/server/anon";
import { CONSENT_VERSION } from "@features/mira/server/config";
import {
  GOOGLE_COOKIE,
  GOOGLE_COOKIE_PATH,
  exchangeCode,
  googleClient,
  isStaffEmail,
  returnOrigin,
  sameState,
  unpackStart,
} from "@features/mira/server/google";
import { createMiraSupabase, safeNext } from "@features/mira/server/session";
import { mintSignInCode } from "@features/mira/server/sign-in";
import { logMiraEvent, upsertProfileAtSignIn } from "@features/mira/server/store";
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
  const back = (why: string) =>
    NextResponse.redirect(new URL(`/mira/start?google=${why}${andNext}`, url.origin), 303);

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

  const who = await exchangeCode(client, origin, q.data.code, start);
  if (!who) {
    logger.info("mira: Google sign-in was refused at the token step");
    return back("failed");
  }
  // Only addresses Google runs, and never staff: everyone else gets the emailed code.
  if (!who.googleRuns || (await isStaffEmail(who.email))) return back("other");
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
      shareRated: start.shareRated,
    });
    logMiraEvent(
      "signup_completed",
      { anonId: await anonId(), userId: account.id },
      { method: "google" }
    );
    const done = `/mira/start?google=done${profile?.name ? "" : "&about=1"}${andNext}`;
    return NextResponse.redirect(new URL(done, origin), 303);
  } catch (err) {
    // Signed in without a profile is a dead end (/api/mira/me answers 401): sign out again, so
    // the next try starts clean.
    logger.error({ err }, "mira: the profile was not saved at Google sign-in");
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    return back("failed");
  }
}
