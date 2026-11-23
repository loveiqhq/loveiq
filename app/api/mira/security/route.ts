/**
 * /api/mira/security — Settings › Sign-in & security (features/mira/ui/account/SecuritySettings.tsx).
 *
 *   GET                  → the account's address, how it can sign in (Google connected, its
 *                          passkeys) and where it is signed in (devices, this one marked), with
 *                          what Settings may offer: passkeys and Google never for staff, a change
 *                          of email never for a login the admin panel or Jarvis shares, none of
 *                          them for anyone Mira stopped as under 18
 *   DELETE ?device=<id>  → signs out one of the account's devices (this one too, if it is); its
 *                          login ends at Supabase too, at once
 *   DELETE ?device=all   → signs out everywhere, this device included
 *
 * Signing out takes effect on the device's next request to any Mira page or route
 * (session.ts getMiraAccount), and is always allowed.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  endAuthSessions,
  isRecentSignIn,
  listDevices,
  signOutDevices,
} from "@features/mira/server/devices";
import { googleConnected, isStaffEmail } from "@features/mira/server/google";
import { isMinor } from "@features/mira/server/minor";
import {
  listPasskeys,
  relyingParty,
  removePasskeys,
  summarise,
  userHandleOf,
} from "@features/mira/server/passkeys";
import { createMiraSupabase, getMiraAccount } from "@features/mira/server/session";
import { logMiraEvent, sharesLogin } from "@features/mira/server/store";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";

const deviceSchema = z.union([z.literal("all"), z.string().uuid()]);

async function guard(request: Request, write: boolean) {
  if (write && !(await verifyCsrfToken(request))) {
    return { error: NextResponse.json({ error: "Invalid request." }, { status: 403 }) };
  }
  const rate = await checkRateLimit(getClientIp(request), {
    bucket: "mira-me",
    limit: 60,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return {
      error: NextResponse.json({ error: "Please try again in a minute." }, { status: 429 }),
    };
  }
  const account = await getMiraAccount();
  if (!account) return { error: NextResponse.json({ error: "Please sign in." }, { status: 401 }) };
  return { account };
}

export async function GET(request: Request) {
  const g = await guard(request, false);
  if ("error" in g) return g.error;
  const { account } = g;
  try {
    const [devices, passkeys, connected, staff, shared, minor] = await Promise.all([
      listDevices(account.id),
      listPasskeys(account.id),
      googleConnected(account.id),
      isStaffEmail(account.email),
      sharesLogin(account.email),
      isMinor(account.id),
    ]);
    const rp = relyingParty(request.url);
    return NextResponse.json(
      {
        email: account.email,
        // Stopped as under 18: Settings says so, never that the address is a team login.
        minor,
        recent: Boolean(account.session && isRecentSignIn(account.session.signedInAt)),
        emailChange: { allowed: !shared && !minor },
        google: { allowed: !minor, connected },
        passkeys: {
          allowed: !staff && !minor && rp !== null,
          rpID: rp?.rpID ?? null,
          userHandle: userHandleOf(account.id),
          list: passkeys.map(summarise),
        },
        devices: devices.map((d) => ({ ...d, current: d.id === account.session?.id })),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    logger.error({ err }, "mira: could not read sign-in and security");
    return NextResponse.json({ error: "Unable to load this right now." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const g = await guard(request, true);
  if ("error" in g) return g.error;
  const { account } = g;
  const device = deviceSchema.safeParse(new URL(request.url).searchParams.get("device"));
  if (!device.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    const all = device.data === "all";
    // "Also remove my passkeys" (security review M1): a passkey someone else added would
    // otherwise outlive every sign-out.
    const keys = all && new URL(request.url).searchParams.get("passkeys") === "1";
    const gone = await signOutDevices(account.id, all ? undefined : device.data);
    if (!all && gone.length === 0) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    if (keys) await removePasskeys(account.id);
    // The other devices' logins end at Supabase now, not at their next call to Mira: this one's
    // ends below, by its own sign-out (round-2 SEC-L1 / COR-9).
    await endAuthSessions(
      account.id,
      gone.filter((id) => id !== account.session?.id)
    );
    const here = all || device.data === account.session?.id;
    if (here) {
      const supabase = await createMiraSupabase();
      // A login only Mira uses ends everywhere at Supabase too (security review L1); a staff or
      // Jarvis login shared with Mira keeps its other sessions, which Mira refuses anyway.
      const scope = all && !(await sharesLogin(account.email)) ? "global" : "local";
      await supabase.auth.signOut({ scope }).catch(() => undefined);
    }
    if (all) {
      logMiraEvent(
        "signed_out_everywhere",
        { userId: account.id },
        { devices: gone.length, passkeys: keys }
      );
    } else logMiraEvent("device_signed_out", { userId: account.id }, { thisDevice: here });
    return NextResponse.json({ success: true, signedOut: here });
  } catch (err) {
    logger.error({ err }, "mira: a device was not signed out");
    return NextResponse.json(
      { error: "Unable to sign out right now. Please try again." },
      { status: 500 }
    );
  }
}
