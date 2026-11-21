/**
 * /api/mira/goals/[id] — one of the signed-in person's goals (Challenges & goals).
 *
 *   PATCH   → { text?, weeklyTarget?: 1 to 7 or null, archived?, completed? }: edit it, put it
 *             away or mark it done (true), or bring it back (false; 409 past MAX_ACTIVE_GOALS)
 *   DELETE  → the goal and its ticks
 *
 * 404 for any id that isn't one of the person's own; 403 on PATCH for an account or browser that
 * said it is under 18 (rail 15), while DELETE always works. The KPI log counts goal_completed,
 * goal_archived and goal_deleted, never the words.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ADULTS_ONLY,
  MAX_ACTIVE_GOALS,
  deleteGoal,
  goalText,
  updateGoal,
  weeklyTarget,
} from "@features/mira/server/goals";
import { isMinor } from "@features/mira/server/minor";
import { getMiraAccount } from "@features/mira/server/session";
import { logMiraEvent } from "@features/mira/server/store";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const PER_MINUTE = { bucket: "mira-goals", limit: 60, windowMs: 60_000 };

const patchSchema = z
  .object({
    text: goalText.optional(),
    weeklyTarget: weeklyTarget.optional(),
    archived: z.boolean().optional(),
    completed: z.boolean().optional(),
  })
  .strict()
  .refine((p) => Object.keys(p).length > 0);

const NOT_FOUND = () => NextResponse.json({ error: "Not found." }, { status: 404 });

export async function PATCH(request: Request, { params }: Params) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }
  if (!(await checkRateLimit(getClientIp(request), PER_MINUTE)).allowed) {
    return NextResponse.json({ error: "Please try again in a minute." }, { status: 429 });
  }
  const account = await getMiraAccount();
  if (!account) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { id } = await params;
  try {
    if (await isMinor(account.id)) {
      return NextResponse.json({ error: ADULTS_ONLY }, { status: 403 });
    }
    const goal = await updateGoal(account.id, id, parsed.data);
    if (goal === "missing") return NOT_FOUND();
    if (goal === "full") {
      return NextResponse.json(
        {
          error: `You have ${MAX_ACTIVE_GOALS} goals on the go. Mark one done or put one away first.`,
        },
        { status: 409 }
      );
    }
    if (parsed.data.completed) logMiraEvent("goal_completed", { userId: account.id });
    if (parsed.data.archived) logMiraEvent("goal_archived", { userId: account.id });
    return NextResponse.json({ goal });
  } catch (err) {
    logger.error({ err }, "mira: a goal was not changed");
    return NextResponse.json({ error: "That didn't save. Please try again." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }
  if (!(await checkRateLimit(getClientIp(request), PER_MINUTE)).allowed) {
    return NextResponse.json({ error: "Please try again in a minute." }, { status: 429 });
  }
  const account = await getMiraAccount();
  if (!account) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const { id } = await params;
  try {
    if (!(await deleteGoal(account.id, id))) return NOT_FOUND();
    logMiraEvent("goal_deleted", { userId: account.id });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "mira: a goal was not deleted");
    return NextResponse.json(
      { error: "Unable to delete right now. Please try again." },
      { status: 500 }
    );
  }
}
