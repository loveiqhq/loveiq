/**
 * /api/mira/goals — Challenges & goals (22 Nov 2026), signed in only.
 *
 *   GET     → the person's goals in the order they were set, each with the days it was ticked
 *   POST    → a new goal { text, weeklyTarget?: 1 to 7 or null, via?: "hand" | "mira" } ("mira":
 *             "Add as a goal" under one of Mira's replies); 409 with MAX_ACTIVE_GOALS on the go
 *   DELETE  → every goal of the person's, and their ticks
 *
 * Everything is scoped to the signed-in account (features/mira/server/goals.ts). The KPI log
 * counts goals, never their words: goal_set (how, and the target), goals_deleted.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  MAX_ACTIVE_GOALS,
  createGoal,
  deleteGoals,
  goalText,
  listGoals,
  weeklyTarget,
} from "@features/mira/server/goals";
import { isMinor } from "@features/mira/server/minor";
import { getMiraAccount } from "@features/mira/server/session";
import { logMiraEvent } from "@features/mira/server/store";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";

const PER_MINUTE = { bucket: "mira-goals", limit: 60, windowMs: 60_000 };
/** New goals a day per account: people set a few; this only stops a flood. */
const NEW_PER_DAY = { bucket: "mira-goals-new", limit: 30, windowMs: 24 * 60 * 60 * 1000 };

const createSchema = z
  .object({
    text: goalText,
    weeklyTarget: weeklyTarget.optional(),
    via: z.enum(["hand", "mira"]).optional(),
  })
  .strict();

const slowDown = () =>
  NextResponse.json({ error: "Please try again in a minute." }, { status: 429 });
const signIn = () => NextResponse.json({ error: "Please sign in." }, { status: 401 });
const invalid = () => NextResponse.json({ error: "Invalid request." }, { status: 403 });

export async function GET(request: Request) {
  if (!(await checkRateLimit(getClientIp(request), PER_MINUTE)).allowed) return slowDown();
  const account = await getMiraAccount();
  if (!account) return signIn();
  try {
    const goals = await listGoals(account.id);
    return NextResponse.json({ goals }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logger.error({ err }, "mira: could not read goals");
    return NextResponse.json({ error: "Unable to load your goals." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await verifyCsrfToken(request))) return invalid();
  if (!(await checkRateLimit(getClientIp(request), PER_MINUTE)).allowed) return slowDown();
  const account = await getMiraAccount();
  if (!account) return signIn();
  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { text, weeklyTarget: target = null, via = "hand" } = parsed.data;
  try {
    // Coaching is for adults: an account that said it is under 18 sets no goals (rail 15).
    if (await isMinor(account.id)) {
      return NextResponse.json({ error: "Mira's coaching is only for adults." }, { status: 403 });
    }
    if (!(await checkRateLimit(account.id, NEW_PER_DAY)).allowed) {
      return NextResponse.json({ error: "That's plenty of new goals for today." }, { status: 429 });
    }
    const goal = await createGoal(account.id, { text, weeklyTarget: target, via });
    if (goal === "full") {
      return NextResponse.json(
        {
          error: `You have ${MAX_ACTIVE_GOALS} goals on the go. Mark one done or put one away first.`,
        },
        { status: 409 }
      );
    }
    logMiraEvent("goal_set", { userId: account.id }, { via, target });
    return NextResponse.json({ goal });
  } catch (err) {
    logger.error({ err }, "mira: a goal was not saved");
    return NextResponse.json(
      { error: "Your goal didn't save. Please try again." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  if (!(await verifyCsrfToken(request))) return invalid();
  if (!(await checkRateLimit(getClientIp(request), PER_MINUTE)).allowed) return slowDown();
  const account = await getMiraAccount();
  if (!account) return signIn();
  try {
    await deleteGoals(account.id);
    logMiraEvent("goals_deleted", { userId: account.id });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "mira: goals were not deleted");
    return NextResponse.json(
      { error: "Unable to delete right now. Please try again." },
      { status: 500 }
    );
  }
}
