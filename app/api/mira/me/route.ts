/**
 * /api/mira/me — the signed-in account (boards 06, 08, 08b, 08c).
 *
 *   GET            → profile, chats, the LoveIQ result matched on the verified email
 *   PATCH          → name, country, gender, coaching style, the two "What Mira may use" switches
 *   DELETE ?what=chats    → deletes every stored chat
 *   DELETE ?what=account  → deletes the account, its profile, chats and messages
 */
import { NextResponse } from "next/server";
import { z } from "zod";
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
  })
  .strict();

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
    const [profile, chats, assessment] = await Promise.all([
      getProfile(g.account.id),
      listChats(g.account.id),
      findAssessment(g.account.email).catch(() => null),
    ]);
    if (!profile) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    return NextResponse.json(
      { profile, chats, assessment },
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
    await updateProfile(g.account.id, parsed.data);
    logMiraEvent("settings_saved", { userId: g.account.id }, { fields: Object.keys(parsed.data) });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "mira: could not save the account");
    return NextResponse.json({ error: "Unable to save." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const g = await guard(request, true);
  if ("error" in g) return g.error;
  const what = new URL(request.url).searchParams.get("what");
  try {
    if (what === "chats") {
      await deleteChats(g.account.id);
      logMiraEvent("chats_deleted", { userId: g.account.id });
      return NextResponse.json({ success: true });
    }
    if (what === "account") {
      // Logged before the delete: the event row keeps the count, its user link goes with the account.
      logMiraEvent("account_deleted", {});
      await deleteAccount(g.account.id);
      const supabase = await createMiraSupabase();
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  } catch (err) {
    logger.error({ err }, "mira: a delete failed");
    return NextResponse.json(
      { error: "Unable to delete right now. Please try again." },
      { status: 500 }
    );
  }
}
