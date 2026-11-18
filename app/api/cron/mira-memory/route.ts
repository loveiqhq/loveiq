/**
 * GET /api/cron/mira-memory: Mira's memory limit (Sanjin's coach config: "Memory kept for 12
 * months after last chat"). Daily, it deletes a person's chats once the last message they wrote
 * is more than 12 months old (supabase function mira_forget_old_memory). Production host only.
 * Protected by `Authorization: Bearer ${CRON_SECRET}`.
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
  const res = await supabaseFetch("/rest/v1/rpc/mira_forget_old_memory", {
    method: "POST",
    body: JSON.stringify({ p_months: MEMORY_MONTHS }),
  });
  if (!res.ok) {
    logger.error({ status: res.status }, "mira-memory cron failed");
    await recordCronRun("mira-memory", startMs, "error", `status ${res.status}`);
    return NextResponse.json({ error: "Unable to apply the memory limit." }, { status: 500 });
  }
  const deleted = (await res.json()) as number;
  await recordCronRun("mira-memory", startMs, "success");
  return NextResponse.json({ ok: true, chatsDeleted: deleted });
}
