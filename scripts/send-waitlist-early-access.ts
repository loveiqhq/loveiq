/**
 * One-shot broadcast: sends the waitlist early-access invitation
 * (lib/emails/waitlist-early-access.ts) to every waitlist_user row that
 * hasn't already received it and isn't unsubscribed.
 *
 * Idempotency: each successful send writes early_access_email_sent_at on
 * the row, so re-running this script is safe — already-sent rows are
 * filtered out at query time.
 *
 * Usage:
 *   npx tsx scripts/send-waitlist-early-access.ts                          # dry-run
 *   npx tsx scripts/send-waitlist-early-access.ts --apply                  # send to all pending
 *   npx tsx scripts/send-waitlist-early-access.ts --apply --limit=10       # cap recipients
 *   npx tsx scripts/send-waitlist-early-access.ts --apply --only=foo@bar   # single recipient
 *
 * Required env (from .env.local locally, GitHub secrets in CI):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, NEXT_PUBLIC_SITE_URL
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local manually (no dotenv dep) — matches scripts/rescore-submissions.ts pattern.
const envPath = resolve(__dirname, "..", ".env.local");
try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed
      .slice(eqIdx + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  // .env.local missing is fine in CI (env vars come from GitHub secrets).
}

import { Resend } from "resend";
import { waitlistEarlyAccessEmail } from "../lib/emails/waitlist-early-access";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.loveiq.org";
const FROM = "LoveIQ <hello@loveiq.org>";
const REPLY_TO = process.env.RESEND_REPLY_TO || "hello@loveiq.org";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const limitArg = args.find((a) => a.startsWith("--limit="));
const onlyArg = args.find((a) => a.startsWith("--only="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : null;
const ONLY = onlyArg ? onlyArg.split("=")[1].trim().toLowerCase() : null;

const THROTTLE_MS = 120; // ~8 req/s, well under Resend's 10/s default.
const RESEND_TIMEOUT_MS = 8_000;
const FAILURE_RATE_THRESHOLD = 0.05;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (APPLY && !RESEND_API_KEY) {
  console.error("Missing RESEND_API_KEY (required when --apply is set)");
  process.exit(1);
}

const supaHeaders: Record<string, string> = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

interface WaitlistRow {
  id: number;
  email: string;
}

async function fetchPendingRecipients(): Promise<WaitlistRow[]> {
  const params = new URLSearchParams({
    select: "id,email",
    early_access_email_sent_at: "is.null",
    unsub_status: "eq.false",
    order: "id.asc",
  });
  if (ONLY) params.set("email", `eq.${ONLY}`);
  const url = `${SUPABASE_URL}/rest/v1/waitlist_user?${params.toString()}`;
  const res = await fetch(url, { headers: supaHeaders });
  if (!res.ok) {
    throw new Error(`Supabase GET failed: ${res.status} ${await res.text()}`);
  }
  const rows = (await res.json()) as WaitlistRow[];
  return LIMIT ? rows.slice(0, LIMIT) : rows;
}

async function markSent(id: number): Promise<void> {
  const url = `${SUPABASE_URL}/rest/v1/waitlist_user?id=eq.${id}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { ...supaHeaders, Prefer: "return=minimal" },
    body: JSON.stringify({ early_access_email_sent_at: new Date().toISOString() }),
  });
  if (!res.ok) {
    throw new Error(`Supabase PATCH failed for id=${id}: ${res.status} ${await res.text()}`);
  }
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  const masked = local.length <= 2 ? "*".repeat(local.length) : `${local[0]}***${local.slice(-1)}`;
  return `${masked}@${domain}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sendOne(resend: Resend, row: WaitlistRow): Promise<void> {
  const tpl = waitlistEarlyAccessEmail({ firstName: null, siteUrl: SITE_URL });
  const sendPromise = resend.emails.send({
    from: FROM,
    to: row.email,
    replyTo: REPLY_TO,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
  });
  const { error } = await Promise.race([
    sendPromise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Resend timeout")), RESEND_TIMEOUT_MS)
    ),
  ]);
  if (error) throw new Error(`Resend error: ${JSON.stringify(error)}`);
}

async function main() {
  const startedAt = Date.now();
  console.log(
    APPLY ? "=== APPLY MODE — sending real emails ===" : "=== DRY RUN (pass --apply to send) ==="
  );
  if (ONLY) console.log(`Filter: only=${ONLY}`);
  if (LIMIT) console.log(`Filter: limit=${LIMIT}`);
  console.log(`From: ${FROM}`);
  console.log(`Site: ${SITE_URL}`);

  const recipients = await fetchPendingRecipients();
  console.log(`Pending recipients: ${recipients.length}`);

  if (recipients.length === 0) {
    console.log("Nothing to send.");
    return;
  }

  console.log(`Sample (first ${Math.min(5, recipients.length)}):`);
  for (const r of recipients.slice(0, 5)) {
    console.log(`  ${r.id}\t${maskEmail(r.email)}`);
  }

  if (!APPLY) {
    const tpl = waitlistEarlyAccessEmail({ firstName: null, siteUrl: SITE_URL });
    console.log(`\nSubject preview: ${tpl.subject}`);
    console.log(`HTML length: ${tpl.html.length} chars · text length: ${tpl.text.length} chars`);
    console.log("\nDry-run complete. Re-run with --apply to send.");
    return;
  }

  const resend = new Resend(RESEND_API_KEY!);
  let sent = 0;
  let errors = 0;

  for (const row of recipients) {
    try {
      await sendOne(resend, row);
      await markSent(row.id);
      sent += 1;
      if (sent % 25 === 0) console.log(`  …sent ${sent}/${recipients.length}`);
    } catch (err) {
      errors += 1;
      console.error(`  FAIL id=${row.id} ${maskEmail(row.email)}: ${(err as Error).message}`);
    }
    await sleep(THROTTLE_MS);
  }

  const durationMs = Date.now() - startedAt;
  const failureRate = errors / recipients.length;
  console.log("\n=== Summary ===");
  console.log(JSON.stringify({ scanned: recipients.length, sent, errors, durationMs }, null, 2));

  if (failureRate > FAILURE_RATE_THRESHOLD) {
    console.error(
      `Failure rate ${(failureRate * 100).toFixed(1)}% exceeds threshold ${(FAILURE_RATE_THRESHOLD * 100).toFixed(1)}%`
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
