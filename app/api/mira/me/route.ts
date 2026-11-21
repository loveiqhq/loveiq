/**
 * /api/mira/me — the signed-in account (boards 06, 08, 08b, 08c).
 *
 *   GET            → profile, chats, the LoveIQ result matched on the verified email, and
 *                    which body check is due (features/mira/server/body-check.ts)
 *   PATCH          → name, country, gender, coaching style, the "What Mira may use" switches
 *                    (memory, the LoveIQ result and, from 22 Nov 2026, the self-checks' bands)
 *   DELETE ?what=chats    → deletes every stored chat
 *   DELETE ?what=account  → deletes the account, its profile, chats and messages (a staff or
 *       Jarvis login stays: see deleteAccount)
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { bodyCheckDue, listBodyChecks } from "@features/mira/server/body-check";
import { isValidTimeZone } from "@features/mira/server/nudges";
import { getMiraAccount, createMiraSupabase } from "@features/mira/server/session";
import {
  deleteAccount,
  deleteChats,
  findAssessment,
  getProfile,
  listChats,
  logMiraEvent,
  updateProfile,
} from "@features/mira/server/store";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";

const scale = z.number().int().min(1).max(5);
const patchSchema = z
  .object({
    name: z.string().trim().max(60).nullable().optional(),
    country: z
      .string()
      .regex(/^([A-Z]{2}|OTHER)$/)
      .nullable()
      .optional(),
    gender: z.string().trim().max(40).nullable().optional(),
    style: z
      .object({
        guidance: scale.optional(),
        challenge: scale.optional(),
        depth: scale.optional(),
        practical: scale.optional(),
        tone: scale.optional(),
      })
      .strict()
      .optional(),
    remember_chats: z.boolean().optional(),
    use_assessment: z.boolean().optional(),
    // "Mira may use my check results" (the self-checks, 20261122090000_mira_checks.sql).
    use_checks: z.boolean().optional(),
    nudges_on: z.boolean().optional(),
    nudge_time: z.enum(["08:00", "19:00", "21:30"]).optional(),
    time_zone: z.string().max(64).refine(isValidTimeZone).optional(),
  })
  .strict();
const deleteSchema = z.object({ what: z.enum(["chats", "account"]) });

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
  try {
    const [profile, chats, assessment, checks] = await Promise.all([
      getProfile(g.account.id),
      listChats(g.account.id),
      findAssessment(g.account.email).catch(() => null),
      // Only offers the check: a failed read offers nothing rather than failing the page.
      listBodyChecks(g.account.id).catch(() => null),
    ]);
    if (!profile) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const bodyCheck = {
      due: checks
        ? bodyCheckDue(
            checks.map((c) => c.created_at),
            new Date()
          )
        : null,
    };
    return NextResponse.json(
      { profile, chats, assessment, bodyCheck },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    logger.error({ err }, "mira: could not read the account");
    return NextResponse.json({ error: "Unable to load your account." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const g = await guard(request, true);
  if ("error" in g) return g.error;
  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    const { nudges_on, ...rest } = parsed.data;
    // The switch in Settings is the same stop as the email's: on again clears the stop. Settings
    // sends nudges_on with every save, so only a real switch counts: the same value again must
    // not re-stamp the stop or wipe the reason given for it.
    const stored = nudges_on === undefined ? null : await getProfile(g.account.id);
    const nudgeState =
      !stored || nudges_on === stored.nudges_on
        ? {}
        : nudges_on
          ? {
              nudges_on,
              nudges_stopped_at: null,
              nudge_stop_reason: null,
              nudges_paused_until: null,
            }
          : { nudges_on, nudges_stopped_at: new Date().toISOString(), nudge_stop_reason: null };
    await updateProfile(g.account.id, { ...rest, ...nudgeState });
    logMiraEvent("settings_saved", { userId: g.account.id }, { fields: Object.keys(parsed.data) });
    // The "Nudge emails" unsubscribe numbers count a stop wherever it happens, Settings included.
    if ("nudges_on" in nudgeState) {
      logMiraEvent(
        nudgeState.nudges_on ? "nudge_resumed" : "nudge_stopped",
        { userId: g.account.id },
        nudgeState.nudges_on ? { source: "settings" } : { reason: null, source: "settings" }
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "mira: could not save the account");
    return NextResponse.json({ error: "Unable to save." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const g = await guard(request, true);
  if ("error" in g) return g.error;
  const query = deleteSchema.safeParse({ what: new URL(request.url).searchParams.get("what") });
  if (!query.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    if (query.data.what === "chats") {
      await deleteChats(g.account.id);
      logMiraEvent("chats_deleted", { userId: g.account.id });
      return NextResponse.json({ success: true });
    }
    await deleteAccount(g.account);
    // Only once it's gone, and with no link to the person: the row keeps the count.
    logMiraEvent("account_deleted", {});
    const supabase = await createMiraSupabase();
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "mira: a delete failed");
    return NextResponse.json(
      { error: "Unable to delete right now. Please try again." },
      { status: 500 }
    );
  }
}
