/**
 * /api/mira/passkeys — passkeys for Mira's free account (features/mira/server/passkeys.ts).
 *
 *   POST { action: "register-options", via }    signed in within the last 15 minutes: options for
 *       a new passkey (via "offer": "Use Face ID next time?" after a code sign-in; "settings")
 *   POST { action: "register", response, via }   the new passkey, checked, then kept
 *   POST { action: "sign-in-options" }           options for signing in (the button, or autofill)
 *   POST { action: "sign-in", response, ticks? } a passkey's signature → Mira's own session
 *   PATCH { id, label }                          renames one of the account's passkeys
 *   DELETE ?id=                                  removes one of them; answers the passkeys left
 *
 * Every ceremony's challenge is single use, lives 5 minutes, and is bound to the browser that asked
 * (an httpOnly cookie holding its row id, SameSite=Strict, this path only) and, for a new passkey,
 * to the account. The origin and the relying party are this site's own (production, staging,
 * local), user verification (Face ID, a fingerprint, a PIN) is required, and the signature counter
 * may only move forward. A passkey sign-in makes exactly the session an emailed code makes (a code
 * minted and checked on the server), never for staff (admin_users, as with Google) or anyone Mira
 * stopped as under 18, and records the device. It needs no ticks while the account's consent is
 * the current wording's; otherwise the form's three ticks, recorded like any sign-in's.
 */
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { anonId } from "@features/mira/server/anon";
import { fromTeamBrowser } from "@features/mira/server/attribution";
import { CONSENT_VERSION } from "@features/mira/server/config";
import { deviceLabel, isRecentSignIn, recordSession } from "@features/mira/server/devices";
import { loginEmail } from "@features/mira/server/email-change";
import { isStaffEmail } from "@features/mira/server/google";
import { isMinor } from "@features/mira/server/minor";
import {
  CHALLENGE_COOKIE,
  CHALLENGE_PATH,
  CHALLENGE_TTL_MS,
  MAX_PASSKEYS,
  addPasskey,
  findPasskey,
  listPasskeys,
  relyingParty,
  removePasskeys,
  renamePasskey,
  saveChallenge,
  takeChallenge,
  markPasskeyUsed,
  summarise,
  userHandleOf,
  type ChallengePurpose,
} from "@features/mira/server/passkeys";
import { createMiraSupabase, getMiraAccount } from "@features/mira/server/session";
import {
  mintSignInCode,
  passkeyAddedNotice,
  sendNeutralEmail,
} from "@features/mira/server/sign-in";
import {
  getProfile,
  logMiraEvent,
  updateProfile,
  upsertProfileAtSignIn,
} from "@features/mira/server/store";
import { scheduleAfterResponse } from "@shared/http/after-response";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";

/** EdDSA, ES256 and RS256: what platform authenticators use, the same on every runtime. */
const ALGORITHMS = [-8, -7, -257];
const ADULTS_ONLY = "Mira is only for adults.";
const DIDNT_WORK = "That passkey didn't work. Please try again, or use your email.";
const TOO_SLOW = "That took a little too long. Please try your passkey again.";

const b64 = z.string().regex(/^[A-Za-z0-9_-]*$/);
const credentialId = b64.min(16).max(1366);
const common = {
  id: credentialId,
  rawId: credentialId,
  type: z.literal("public-key"),
  authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
  clientExtensionResults: z.record(z.string(), z.unknown()).default({}),
};
const registration = z.object({
  ...common,
  response: z.object({
    clientDataJSON: b64.max(4096),
    attestationObject: b64.max(16_384),
    authenticatorData: b64.max(16_384).optional(),
    transports: z.array(z.string().max(32)).max(8).optional(),
    publicKey: b64.max(8192).optional(),
    publicKeyAlgorithm: z.number().int().optional(),
  }),
});
const authentication = z.object({
  ...common,
  response: z.object({
    clientDataJSON: b64.max(4096),
    authenticatorData: b64.max(4096),
    signature: b64.max(4096),
    userHandle: b64.max(512).optional(),
  }),
});
const via = z.enum(["offer", "settings"]).default("settings");

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("register-options"), via }),
  z.object({ action: z.literal("register"), response: registration, via }),
  z.object({ action: z.literal("sign-in-options") }),
  z.object({
    action: z.literal("sign-in"),
    response: authentication,
    ticks: z
      .object({
        adult: z.boolean(),
        terms: z.boolean(),
        consent: z.boolean(),
        useAssessment: z.boolean().default(false),
      })
      .optional(),
  }),
]);
const renameSchema = z.object({ id: credentialId, label: z.string().trim().min(1).max(60) });

const fail = (error: string, status: number, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error, ...extra }, { status });

async function guard(request: Request) {
  if (!(await verifyCsrfToken(request))) return { error: fail("Invalid request.", 403) };
  const rate = await checkRateLimit(getClientIp(request), {
    bucket: "mira-passkey",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed) return { error: fail("Please try again in a minute.", 429) };
  return {};
}

/** Hands this browser the challenge's row id, for its next step only. */
async function bindChallenge(purpose: ChallengePurpose, challenge: string, userId: string | null) {
  const id = await saveChallenge(purpose, challenge, userId);
  (await cookies()).set(CHALLENGE_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: CHALLENGE_PATH,
    maxAge: CHALLENGE_TTL_MS / 1000,
  });
}

/** The challenge this browser holds, taken out for good whatever happens next. */
async function redeemChallenge(purpose: ChallengePurpose, userId: string | null) {
  const jar = await cookies();
  const id = jar.get(CHALLENGE_COOKIE)?.value;
  jar.delete({ name: CHALLENGE_COOKIE, path: CHALLENGE_PATH });
  return takeChallenge(id, purpose, userId);
}

export async function POST(request: Request) {
  const g = await guard(request);
  if (g.error) return g.error;
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return fail("Please try again.", 400);
  const body = parsed.data;
  const rp = relyingParty(request.url);
  if (!rp) return fail("Passkeys aren't available on this site.", 503);

  try {
    if (body.action === "sign-in-options") {
      const options = await generateAuthenticationOptions({
        rpID: rp.rpID,
        userVerification: "required",
        timeout: CHALLENGE_TTL_MS,
      });
      await bindChallenge("sign_in", options.challenge, null);
      return NextResponse.json({ options });
    }
    if (body.action === "sign-in") return await signIn(request, rp, body);

    const account = await getMiraAccount();
    if (!account) return fail("Please sign in again.", 401);
    if (await isMinor(account.id)) return fail(ADULTS_ONLY, 403, { minor: true });

    if (body.action === "register-options") {
      if (await isStaffEmail(account.email)) {
        return fail("Passkeys aren't available for team addresses. Use the emailed code.", 403);
      }
      // A device left signed in can't add its own way in: a passkey needs a fresh sign-in.
      if (!account.session || !isRecentSignIn(account.session.signedInAt)) {
        return fail("For your security, please sign in again to add a passkey.", 403, {
          reauth: true,
        });
      }
      const [existing, profile] = await Promise.all([
        listPasskeys(account.id),
        getProfile(account.id),
      ]);
      if (existing.length >= MAX_PASSKEYS) {
        return fail(`You have ${MAX_PASSKEYS} passkeys. Remove one to add another.`, 400);
      }
      const options = await generateRegistrationOptions({
        rpName: "LoveIQ",
        rpID: rp.rpID,
        userName: account.email,
        userDisplayName: profile?.name || account.email,
        userID: Buffer.from(account.id, "utf8"),
        attestationType: "none",
        excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports })),
        authenticatorSelection: { residentKey: "required", userVerification: "required" },
        supportedAlgorithmIDs: ALGORITHMS,
        timeout: CHALLENGE_TTL_MS,
        ...(body.via === "offer" ? { preferredAuthenticatorType: "localDevice" as const } : {}),
      });
      await bindChallenge("register", options.challenge, account.id);
      return NextResponse.json({ options });
    }

    // register
    const challenge = await redeemChallenge("register", account.id);
    if (!challenge) return fail(TOO_SLOW, 400, { retry: true });
    let verified: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
    try {
      verified = await verifyRegistrationResponse({
        response: body.response as RegistrationResponseJSON,
        expectedChallenge: challenge,
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpID,
        requireUserVerification: true,
        supportedAlgorithmIDs: ALGORITHMS,
      });
    } catch (err) {
      logger.info({ reason: (err as Error).message }, "mira: a new passkey was refused");
      return fail("We couldn't save that passkey. Please try again.", 400);
    }
    if (!verified.verified) return fail("We couldn't save that passkey. Please try again.", 400);
    const info = verified.registrationInfo;
    const passkey = await addPasskey({
      id: info.credential.id,
      user_id: account.id,
      public_key: Buffer.from(info.credential.publicKey).toString("base64url"),
      counter: info.credential.counter,
      transports: (info.credential.transports ?? []).slice(0, 8),
      backed_up: info.credentialBackedUp,
      label: deviceLabel(request.headers.get("user-agent")),
    }).catch((err: unknown) => {
      logger.warn({ err }, "mira: a verified passkey was not saved");
      return null;
    });
    if (!passkey) return fail("We couldn't save that passkey. Please try again.", 400);
    logMiraEvent(
      "passkey_added",
      { userId: account.id },
      { via: body.via, synced: info.credentialBackedUp }
    );
    if (body.via === "offer") logMiraEvent("passkey_offer_accepted", { userId: account.id });
    // The owner hears of every new passkey, wherever it was added from (security review M1).
    const label = passkey.label;
    scheduleAfterResponse("mira-passkey-added-notice", async () => {
      if (!(await sendNeutralEmail(account.email, passkeyAddedNotice(label)))) {
        logger.warn("mira: the new-passkey notice was not sent");
      }
    });
    return NextResponse.json({ passkey });
  } catch (err) {
    logger.error({ err }, "mira: a passkey step failed");
    return fail("Passkeys aren't working right now. Please use your email.", 500);
  }
}

type SignInBody = Extract<z.infer<typeof schema>, { action: "sign-in" }>;

async function signIn(
  request: Request,
  rp: { origin: string; rpID: string },
  body: SignInBody
): Promise<NextResponse> {
  const challenge = await redeemChallenge("sign_in", null);
  if (!challenge) return fail(TOO_SLOW, 400, { retry: true });
  const response = body.response as AuthenticationResponseJSON;
  const passkey = await findPasskey(response.id);
  // The browser may tell its passkey manager to forget one we don't know (a removed passkey).
  if (!passkey) return fail(DIDNT_WORK, 400, { unknown: true, rpID: rp.rpID });
  if (
    response.response.userHandle &&
    response.response.userHandle !== userHandleOf(passkey.user_id)
  ) {
    return fail(DIDNT_WORK, 400);
  }
  let verified: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
  try {
    verified = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      credential: {
        id: passkey.id,
        publicKey: Buffer.from(passkey.public_key, "base64url"),
        counter: Number(passkey.counter),
        transports: passkey.transports,
      },
      requireUserVerification: true,
    });
  } catch (err) {
    // A counter that went backwards is how a cloned authenticator shows: the team should know.
    const reason = (err as Error).message;
    const log = /counter/i.test(reason) ? logger.warn : logger.info;
    log.call(logger, { reason }, "mira: a passkey sign-in was refused");
    return fail(DIDNT_WORK, 400);
  }
  if (!verified.verified) return fail(DIDNT_WORK, 400);

  // Every refusal comes before the counter moves: a passkey is marked used only by a sign-in that
  // happens (Settings shows when each was last used). The challenge is already spent, so a refused
  // answer can't be sent again.
  const userId = passkey.user_id;
  const profile = await getProfile(userId);
  if (!profile) return fail(DIDNT_WORK, 400);
  // A browser or an account Mira stopped as under 18. A passkey's account already exists, so the
  // browser's cookie alone never stops or wipes it (carryMinorStop); this browser stays stopped.
  if (await isMinor(userId)) return fail(ADULTS_ONLY, 403, { minor: true });
  // The login's own address, never the profile's copy (which a change of email may have left
  // behind): a code minted for an address no login has would make a new login.
  const email = await loginEmail(userId);
  if (!email) return fail("We couldn't sign you in. Please try again.", 500);
  // Staff sign in by emailed code only, as with Google (their session would also open admin).
  if (await isStaffEmail(email)) {
    return fail("Please sign in with your email for this address. We'll send you a code.", 403);
  }
  const t = body.ticks;
  const ticked = Boolean(t?.adult && t.terms && t.consent);
  if (!ticked && profile.consent_version !== CONSENT_VERSION) {
    return fail("Please tick the three boxes, then use your passkey again.", 409, {
      needsConsent: true,
    });
  }
  // Compare and set, right before the session: two sign-ins racing with one counter (a cloned
  // authenticator's sign) can't both pass.
  if (!(await markPasskeyUsed(passkey, verified.authenticationInfo.newCounter))) {
    logger.warn("mira: a passkey's counter moved during its sign-in");
    return fail(DIDNT_WORK, 400);
  }

  const code = await mintSignInCode(email);
  if (!code) return fail("We couldn't sign you in. Please try again.", 500);
  const supabase = await createMiraSupabase();
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token: code,
    type: "email",
  });
  if (error || !data.user || data.user.id !== userId) {
    logger.warn({ reason: error?.message }, "mira: a passkey sign-in could not start a session");
    if (data?.user) await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    return fail("We couldn't sign you in. Please try again.", 500);
  }
  try {
    // The form's ticks, when given, are recorded like any sign-in's; otherwise the consent on
    // file is this wording's already and stays as it was given.
    if (ticked) {
      await upsertProfileAtSignIn(userId, email, CONSENT_VERSION, {
        useAssessment: t!.useAssessment,
      });
    } else if (await fromTeamBrowser()) {
      await updateProfile(userId, { is_team: true });
    }
    await recordSession(data.session?.access_token, userId, "passkey", request.headers);
  } catch (err) {
    logger.error({ err }, "mira: a passkey sign-in was not recorded");
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    return fail("We couldn't sign you in. Please try again.", 500);
  }
  logMiraEvent("signup_completed", { anonId: await anonId(), userId }, { method: "passkey" });
  return NextResponse.json({ success: true, needsProfile: !profile.name });
}

export async function PATCH(request: Request) {
  const g = await guard(request);
  if (g.error) return g.error;
  const account = await getMiraAccount();
  if (!account) return fail("Please sign in again.", 401);
  const parsed = renameSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return fail("Please give the passkey a name of up to 60 characters.", 400);
  try {
    if (!(await renamePasskey(account.id, parsed.data.id, parsed.data.label))) {
      return fail("Not found.", 404);
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "mira: a passkey was not renamed");
    return fail("Unable to save. Please try again.", 500);
  }
}

export async function DELETE(request: Request) {
  const g = await guard(request);
  if (g.error) return g.error;
  const account = await getMiraAccount();
  if (!account) return fail("Please sign in again.", 401);
  const id = credentialId.safeParse(new URL(request.url).searchParams.get("id"));
  if (!id.success) return fail("Invalid input", 400);
  try {
    if ((await removePasskeys(account.id, id.data)) === 0) return fail("Not found.", 404);
    logMiraEvent("passkey_removed", { userId: account.id });
    // The passkeys left, for the page to tell the passkey manager which still work (one added on
    // another device since the page loaded included); none when they can't be read.
    const left = await listPasskeys(account.id).catch(() => null);
    return NextResponse.json({
      success: true,
      ...(left ? { passkeys: left.map(summarise) } : {}),
    });
  } catch (err) {
    logger.error({ err }, "mira: a passkey was not removed");
    return fail("Unable to remove it right now. Please try again.", 500);
  }
}
