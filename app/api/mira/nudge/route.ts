/**
 * GET /api/mira/nudge?t=… : the button in a nudge email. Counts the click, then opens the chat
 * where the nudge is Mira's latest message. The signed token stands for one nudge; no sign-in is
 * needed to count it (the chat itself still needs the person's own sign-in).
 */
import { NextResponse } from "next/server";
import { supabaseFetch } from "@features/admin/server/supabase";
import { readToken } from "@features/mira/server/nudges";
import { logMiraEvent } from "@features/mira/server/store";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const home = new URL("/mira", url.origin);
  const limit = await checkRateLimit(getClientIp(request), {
    bucket: "mira-nudge-open",
    limit: 30,
    windowMs: 60_000,
  });
  const id = limit.allowed ? readToken("open", url.searchParams.get("t")) : null;
  if (!id) return NextResponse.redirect(home);
  try {
    const res = await supabaseFetch(
      `/rest/v1/mira_nudge?id=eq.${encodeURIComponent(id)}&select=user_id,chat_id,type,clicked_at&limit=1`
    );
    const nudge = res.ok
      ? (
          (await res.json()) as Array<{
            user_id: string;
            chat_id: string | null;
            type: string;
            clicked_at: string | null;
          }>
        )[0]
      : undefined;
    if (!nudge) return NextResponse.redirect(home);
    if (!nudge.clicked_at) {
      await supabaseFetch(
        `/rest/v1/mira_nudge?id=eq.${encodeURIComponent(id)}&clicked_at=is.null`,
        {
          method: "PATCH",
          body: JSON.stringify({ clicked_at: new Date().toISOString() }),
        }
      );
      logMiraEvent("nudge_clicked", { userId: nudge.user_id }, { type: nudge.type });
    }
    return NextResponse.redirect(
      nudge.chat_id ? new URL(`/mira?chat=${nudge.chat_id}`, url.origin) : home
    );
  } catch (err) {
    logger.error({ err }, "mira: a nudge click was not counted");
    return NextResponse.redirect(home);
  }
}
