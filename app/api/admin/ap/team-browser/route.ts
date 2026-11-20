import { NextResponse } from "next/server";
import { z } from "zod";

import { apGuard, NO_STORE } from "@features/admin/server/ap/route-guard";
import { verifyCsrfToken } from "@shared/http/csrf";
import { isProbeRequest } from "@shared/http/probe-cookie";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import { TEAM_COOKIE, isTeamBrowser, teamCookieOptions } from "@shared/http/team-cookie";

export const dynamic = "force-dynamic";

/**
 * AP › Mira's "This browser counts as team": whether this browser's Mira events and accounts are
 * left out of the numbers (shared/http/team-cookie.ts). The cookie is httpOnly, so the page asks
 * here. GET reads it; POST `{ team }` sets it for two years or clears it. Our probes' cookie
 * counts as team too and is theirs to clear, so `team` can stay true after a clear.
 */
export async function GET(request: Request) {
  const admin = await apGuard(request, { bucket: "admin-ap-team-browser" });
  if (admin instanceof NextResponse) return admin;
  return NextResponse.json(
    { team: isTeamBrowser(request.headers.get("cookie")) },
    { headers: NO_STORE }
  );
}

const schema = z.object({ team: z.boolean() });

export async function POST(request: Request) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }
  const rate = await checkRateLimit(getClientIp(request), {
    bucket: "admin-ap-team-browser-write",
    limit: 10,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  const admin = await apGuard(request, { write: true });
  if (admin instanceof NextResponse) return admin;
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });

  const { team } = parsed.data;
  const res = NextResponse.json(
    { team: team || isProbeRequest(request.headers.get("cookie")) },
    { headers: NO_STORE }
  );
  res.cookies.set(TEAM_COOKIE, team ? "1" : "", {
    ...teamCookieOptions(),
    ...(team ? {} : { maxAge: 0 }),
  });
  return res;
}
