/**
 * POST /api/mira/body-check — a signed-in person's finished body check (the Body Appreciation
 * Scale-2: features/mira/server/body-check.ts), { answers: ten whole numbers, 1 = never to
 * 5 = always }. Taken at the start and once more four weeks later; any other time is refused
 * (409), so a double tap or an old tab can't add a third. Their score is computed by the table.
 */
import { NextResponse } from "next/server";
import { ADULTS_ONLY } from "@features/mira/server/goals";
import { isMinor } from "@features/mira/server/minor";
import { z } from "zod";
import { addBodyCheck, bodyCheckDue, listBodyChecks } from "@features/mira/server/body-check";
import { getMiraAccount } from "@features/mira/server/session";
import { logMiraEvent } from "@features/mira/server/store";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";

const schema = z.object({
  answers: z.array(z.number().int().min(1).max(5)).length(10),
});

export async function POST(request: Request) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }
  const rate = await checkRateLimit(getClientIp(request), {
    bucket: "mira-body-check",
    limit: 10,
    windowMs: 60 * 60 * 1000,
  });
  if (!rate.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }
  const account = await getMiraAccount();
  if (!account) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  // As every other self-check: an account stopped as under 18 gives no health answers (minor.ts).
  if (await isMinor(account.id)) {
    return NextResponse.json({ error: ADULTS_ONLY }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    const taken = await listBodyChecks(account.id);
    const due = bodyCheckDue(
      taken.map((t) => t.created_at),
      new Date()
    );
    if (!due) {
      return NextResponse.json({ error: "There's no body check due right now." }, { status: 409 });
    }
    await addBodyCheck(account.id, parsed.data.answers);
    logMiraEvent("body_check_done", { userId: account.id }, { week: due === "baseline" ? 0 : 4 });
    return NextResponse.json({ success: true, week: due === "baseline" ? 0 : 4 });
  } catch (err) {
    logger.error({ err }, "mira: a body check was not saved");
    return NextResponse.json(
      { error: "Your answers didn't save. Please try again." },
      { status: 500 }
    );
  }
}
