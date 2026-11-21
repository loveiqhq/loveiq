/**
 * POST /api/mira/goals/[id]/log — "Did it today" on one of the signed-in person's goals
 * (Challenges & goals): { day, done }. `day` is today in the person's own time zone, as the
 * browser has it; no other day can be ticked (goal-progress.ts isTickableDay). done: true ticks
 * it (once, however often it is tapped), false takes the tick back. 404 for a goal that isn't
 * the person's own. The KPI log counts goal_logged, with no words or ids.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { isTickableDay } from "@features/mira/server/goal-progress";
import { setTick } from "@features/mira/server/goals";
import { getMiraAccount } from "@features/mira/server/session";
import { logMiraEvent } from "@features/mira/server/store";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";

const schema = z.object({ day: z.string().max(10), done: z.boolean() }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }
  const rate = await checkRateLimit(getClientIp(request), {
    bucket: "mira-goals",
    limit: 60,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json({ error: "Please try again in a minute." }, { status: 429 });
  }
  const account = await getMiraAccount();
  if (!account) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success || !isTickableDay(parsed.data.day, new Date())) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { id } = await params;
  try {
    if (!(await setTick(account.id, id, parsed.data.day, parsed.data.done))) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    if (parsed.data.done) logMiraEvent("goal_logged", { userId: account.id });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "mira: a goal tick was not saved");
    return NextResponse.json({ error: "That didn't save. Please try again." }, { status: 500 });
  }
}
