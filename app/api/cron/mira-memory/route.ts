/**
 * GET /api/cron/mira-memory: Mira's memory limit (Sanjin's coach config: "Memory kept for 12
 * months after last chat"). Daily, it deletes a person's chats once the last message they wrote
 * is more than 12 months old (supabase function mira_forget_old_memory), and sign-in codes
 * issued more than a day ago (a code lives an hour; an unused one would keep the address it was
 * sent to for good). Production host only. Protected by `Authorization: Bearer ${CRON_SECRET}`.
 */
import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { supabaseFetch } from "@features/admin/server/supabase";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import logger from "@shared/observability/logger";
import { recordCronRun } from "@shared/observability/slack-alert-dedup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Months after the last message a person wrote. */
export const MEMORY_MONTHS = 12;

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
}

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  if (!safeCompare(request.headers.get("authorization") || "", `Bearer ${expected}`)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 401 });
  }
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }
  const startMs = Date.now();
  try {
    const res = await supabaseFetch("/rest/v1/rpc/mira_forget_old_memory", {
      method: "POST",
      body: JSON.stringify({ p_months: MEMORY_MONTHS }),
    });
    if (!res.ok) throw new Error(`memory limit: status ${res.status}`);
    const deleted = (await res.json()) as number;
    const dayAgo = new Date(startMs - 86_400_000).toISOString();
    const codes = await supabaseFetch(
      `/rest/v1/mira_sign_in_code?issued_at=lt.${encodeURIComponent(dayAgo)}`,
      { method: "DELETE" }
    );
    if (!codes.ok) throw new Error(`old sign-in codes: status ${codes.status}`);
    await recordCronRun("mira-memory", startMs, "success");
    return NextResponse.json({ ok: true, chatsDeleted: deleted });
  } catch (err) {
    const reason = (err as Error)?.message;
    logger.error({ err, reason }, "mira-memory cron failed");
    await recordCronRun("mira-memory", startMs, "error", reason);
    return NextResponse.json({ error: "Unable to apply the memory limit." }, { status: 500 });
  }
}
