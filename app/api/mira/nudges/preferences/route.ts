/**
 * POST /api/mira/nudges/preferences: the "Fewer nudges / Pause / Unsubscribe" pages behind every
 * nudge email (Marcus's boards 2 to 4b): `read` the choices, `save`, `stop` or `resume`. The
 * signed token in the email's link stands for the person, so a `stop` needs no sign-in; the page
 * sends it in the body, never in an address (DATA-1: addresses reach logs and analytics), which
 * is why reading is a POST too. Anything else needs that account signed in as well (401
 * `signIn: true`): the token never expires and stays in every inbox the email reached, an address
 * the person has since left too, so alone it may only stop (round-4 security SEC-R4-2).
 * CSRF-checked and rate limited.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  describePrefs,
  getNudgePrefs,
  resumeNudges,
  saveNudgeChoice,
  stopNudges,
} from "@features/mira/server/nudge-prefs";
import { NUDGE_TYPES, readToken, type NudgeType } from "@features/mira/server/nudges";
import { getMiraAccount } from "@features/mira/server/session";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";

const REASONS = [
  "Too many emails",
  "Wrong time of day",
  "The questions don’t fit where I am",
  "I’d rather not get this in my inbox",
  "I got what I needed",
  "Something else",
] as const;

const token = z.string().min(40).max(200);
const schema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("save"),
      t: token,
      choice: z.enum(["twice_weekly", "pause", "types"]),
      types: z
        .array(z.enum(NUDGE_TYPES as [NudgeType, ...NudgeType[]]))
        .max(NUDGE_TYPES.length)
        .optional(),
    })
    .refine((b) => b.choice !== "types" || (b.types?.length ?? 0) > 0, {
      message: "Pick at least one kind",
    }),
  z.object({
    action: z.literal("stop"),
    t: token,
    reason: z.enum(REASONS).nullish(),
    note: z.string().trim().max(500).nullish(),
  }),
  z.object({ action: z.literal("resume"), t: token }),
  z.object({ action: z.literal("read"), t: token }),
]);

async function limited(request: Request): Promise<boolean> {
  const r = await checkRateLimit(getClientIp(request), {
    bucket: "mira-nudge-prefs",
    limit: 20,
    windowMs: 60_000,
  });
  return !r.allowed;
}

export async function POST(request: Request) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }
  if (await limited(request)) {
    return NextResponse.json({ error: "Please try again in a minute." }, { status: 429 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const body = parsed.data;
  const userId = readToken("prefs", body.t);
  if (!userId) return NextResponse.json({ error: "This link doesn't work." }, { status: 403 });
  if (body.action === "stop") {
    try {
      const reason = [body.reason, body.note].filter(Boolean).join(" · ") || null;
      await stopNudges(userId, reason, "page");
      return NextResponse.json({ success: true });
    } catch (err) {
      logger.error({ err }, "mira: nudge prefs update failed");
      return NextResponse.json({ error: "Unable to save your choice." }, { status: 500 });
    }
  }
  if ((await getMiraAccount())?.id !== userId) {
    return NextResponse.json(
      { error: "Please sign in to change your nudges.", signIn: true },
      { status: 401 }
    );
  }
  if (body.action === "read") {
    try {
      const prefs = await getNudgePrefs(userId);
      if (!prefs) return NextResponse.json({ error: "This link doesn't work." }, { status: 404 });
      return NextResponse.json({ prefs: describePrefs(prefs), types: prefs.nudge_types });
    } catch (err) {
      logger.error({ err }, "mira: nudge prefs read failed");
      return NextResponse.json({ error: "Unable to load your choices." }, { status: 500 });
    }
  }
  try {
    if (body.action === "save") {
      await saveNudgeChoice(
        userId,
        body.choice === "types" ? { kind: "types", types: body.types ?? [] } : { kind: body.choice }
      );
    } else {
      await resumeNudges(userId);
    }
    const prefs = await getNudgePrefs(userId);
    return NextResponse.json({ success: true, prefs: prefs ? describePrefs(prefs) : null });
  } catch (err) {
    logger.error({ err }, "mira: nudge prefs update failed");
    return NextResponse.json({ error: "Unable to save your choice." }, { status: 500 });
  }
}
