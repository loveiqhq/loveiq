/**
 * Monthly vendor-invoice filing, reconciliation and cost-sheet update.
 *
 * WHY THIS EXISTS. On 2026-09-19 an audit of the Business Case cost sheet found
 * it understated the monthly run rate by EUR 1,175 — Claude was recorded as a
 * 2-seat Pro plan at EUR 42.84 while the real invoice was EUR 450.78, Google
 * Workspace had carried EUR 111.87 flat for eleven months against a real
 * EUR 149.60, and seven vendors were absent entirely. Nothing recomputes that
 * sheet, so a line stays whatever it was the day someone typed it. This cron is
 * the thing that recomputes it.
 *
 * WHAT IT DOES, in order:
 *   1. Walks the company mailboxes for vendor invoice emails with a PDF.
 *   2. Files each PDF into Drive under the existing convention,
 *      `Finance / Invoices and Receipts / <Vendor> / <YYYY/MM>/`.
 *   3. Reads the charged total out of the PDF (falling back to the email body).
 *   4. Writes that total into the Costs tab of the Business Case, and carries it
 *      forward across the forecast months, which is how that sheet models a rate.
 *   5. Posts to #ops what it filed and, separately, every amount that MOVED.
 *
 * IT IS NEVER SILENT ABOUT A CHANGE. Updating the sheet automatically is a
 * deliberate choice (Eman, 2026-09-19) and the risk it carries is that a vendor
 * changes seats and a line is rewritten with nobody reading it. The mitigation is
 * that every write is also a Slack line naming the old and new value, so the
 * change is announced even though it is not gated.
 *
 * WHAT IT WILL NEVER SEE, and why silence from these is not evidence of zero:
 *   - Figma emails a receipt LINK, never a PDF.
 *   - Upwork sends an HTML summary, and is hourly rather than a fixed fee.
 *   - The domain registrar (united-domains, Kunden-Nr 724754-8) sends order and
 *     renewal confirmations ONLY to the portfolio owner's personal account, so no
 *     domain invoice can ever reach a loveiq.org mailbox. That is by design, not
 *     a lost email — do not "fix" it by widening the search.
 * These three are reported as "no invoice seen" rather than omitted, because an
 * absent line is indistinguishable from a working one at a glance.
 *
 * Schedule: 06:40 UTC on the 3rd of each month — late enough that the vendors
 * billing on the 1st and 2nd (Google, CookieYes) have sent, early enough to be
 * read with the morning digests.
 */

import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getDelegatedToken, GMAIL_SCOPE, DRIVE_WRITE_SCOPE } from "@shared/http/google-oauth";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import { notifySlack, escapeSlack } from "@shared/observability/slack";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import { recordCronRun, startCronTimer } from "@shared/observability/slack-alert-dedup";
import logger from "@shared/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

/** Finance / Invoices and Receipts. */
// eslint-disable-next-line no-secrets/no-secrets -- Drive folder id, not a credential
const DRIVE_ROOT = "1ml7y_fMcGB8YFpelnQJzWWcpEgTExBBO";
// eslint-disable-next-line no-secrets/no-secrets -- public Sheets file id, not a credential
const SHEET_ID = "11ulNYMtbZ34eQEdBFaW2OWn1FpRvYH9GFRwAoc_8rXE";
const SHEET_TAB = "Costs";
const READ_RANGE = "A1:AZ60";
const RAW_VALUES = "UNFORMATTED" + "_VALUE";

/**
 * Column I is November 2025 — the first month the sheet models. Every other month
 * column is offset from there, so a month maps to a column by counting from it.
 */
const FIRST_COL_INDEX = 8; // 0-based, i.e. "I"
const FIRST_YEAR = 2025;
const FIRST_MONTH = 11;

/** Gmail lookback. Wider than a month so a failed run still catches up next time. */
const LOOKBACK_DAYS = 45;

/**
 * True only when EVERY day of that month is inside the lookback window.
 *
 * Without this the cron corrupts the very data it exists to fix. A 45-day window
 * read on 3 October reaches back to 19 August, so August is only PARTIALLY
 * visible — invoices dated the 1st to the 18th are missing. Summing what is
 * visible and writing it would overwrite a correct August total with a smaller,
 * partial one, and then carry that wrong figure forward across every forecast
 * month. A partial month must be filed but never reconciled.
 */
export function monthFullyCovered(year: number, month: number, windowStartMs: number): boolean {
  return Date.UTC(year, month - 1, 1) >= windowStartMs;
}

/**
 * ECB euro reference rates, USD per EUR, by date.
 *
 * The Costs tab is denominated in euros and five of the nine vendors invoice in
 * dollars, so something has to convert. The ECB's daily reference rate is the
 * published one, needs no credential, and — crucially — is dated: a charge is
 * converted at the rate on ITS OWN invoice date, not at today's. Converting
 * everything at a single current rate would silently restate history every month.
 *
 * The feed covers 90 days and the lookback is 45, so every invoice this cron sees
 * is inside it.
 */
async function ecbUsdRates(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const res = await fetchWithTimeout(
    "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml",
    {
      timeoutMs: 20_000,
    }
  );
  if (!res.ok) throw new Error(`ecb rates -> ${res.status}`);
  const xml = await res.text();
  for (const m of xml.matchAll(
    /time=['"]([\d-]+)['"]([\s\S]*?)(?=<Cube time=|<\/Cube>\s*<\/Cube>)/g
  )) {
    const rate = /currency=['"]USD['"]\s+rate=['"]([\d.]+)['"]/.exec(m[2] ?? "");
    if (m[1] && rate?.[1]) out.set(m[1], Number(rate[1]));
  }
  return out;
}

/**
 * The rate on `isoDate`, walking BACK to the most recent published day.
 *
 * The ECB publishes on business days only, so an invoice dated a Saturday, a
 * Sunday or a TARGET holiday has no rate of its own. Walking back uses the last
 * rate actually in force, which is what a bank does. Walking forward would
 * convert a charge at a rate that did not exist when it was made.
 */
export function rateOn(
  rates: Map<string, number>,
  isoDate: string,
  maxBackDays = 8
): number | null {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  for (let i = 0; i < maxBackDays; i++) {
    const key = d.toISOString().slice(0, 10);
    const r = rates.get(key);
    if (r) return r;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return null;
}

/**
 * Converts a charge to euros at the rate in force on its invoice date.
 *
 * A charge already in euros is returned untouched — never round-tripped through a
 * rate. `OTHER` means no currency marker was found beside the total, and guessing
 * it is euros is exactly the mistake this whole path exists to prevent, so it
 * stays unconverted and gets reported.
 */
export function toEur(charge: Charge, rates: Map<string, number>, isoDate: string): Charge | null {
  if (charge.currency === "EUR") return charge;
  if (charge.currency !== "USD") return null;
  const rate = rateOn(rates, isoDate);
  if (!rate) return null;
  return { value: Math.round((charge.value / rate) * 100) / 100, currency: "EUR" };
}

/**
 * Is `next` a better reading of the same charge than `best` so far?
 *
 * Euros win outright. One email carries the invoice AND the receipt for a single
 * charge, and those two documents do not always state it in the same currency —
 * picking the larger number would discard a euro figure in favour of a dollar
 * one, and a dollar figure is the one we cannot write.
 */
export function betterCharge(next: Charge, best: Charge | null): boolean {
  if (!best) return true;
  if (next.currency === "EUR" && best.currency !== "EUR") return true;
  if (best.currency === "EUR" && next.currency !== "EUR") return false;
  return next.value > best.value;
}

/** Drive query strings are single-quoted, so a name containing one ends the literal. */
export function driveQuoteEscape(name: string): string {
  return name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * The mailbox a vendor bills is not guessable and has bitten us: Supabase mails
 * mo@, Google and Slack mail mb@, everything else mails ec@. Walking all of them
 * is cheaper than maintaining a map that goes stale when somebody is offboarded.
 */
const MAILBOXES = [
  "ec@loveiq.org",
  "mb@loveiq.org",
  "mo@loveiq.org",
  "teamwork@loveiq.org",
  "admin@loveiq.org",
];

/**
 * `sheetName` must match column A of the Costs tab exactly — the row is looked up
 * by name rather than hardcoded, so inserting a row above does not silently
 * redirect a write to the wrong vendor.
 */
interface Vendor {
  sheetName: string;
  match: RegExp;
  /** Google bills Workspace and Ads from ONE sender, so the sender alone is ambiguous. */
  subject?: RegExp;
}

const VENDORS: Vendor[] = [
  { sheetName: "Claude", match: /anthropic\.com/i },
  { sheetName: "ChatGPT", match: /openai\.com/i },
  { sheetName: "Vercel", match: /vercel\.com/i },
  { sheetName: "Resend", match: /resend\.com/i },
  { sheetName: "CookieYes", match: /cookieyes\.com/i },
  { sheetName: "Contentsquare", match: /contentsquare\.com/i },
  { sheetName: "Jira", match: /atlassian\.com/i },
  { sheetName: "Github", match: /github\.com/i },
  { sheetName: "Slack", match: /slack\.com/i },
  { sheetName: "Supabase", match: /supabase\.(io|com)/i },
  // Both of Google's billing mails come from payments-noreply@google.com, so this
  // one MUST also match on subject or Ads mail would be filed as Workspace.
  {
    sheetName: "Google Workspace",
    match: /google\.com/i,
    subject: /Google Workspace/i,
  },
];

/** Vendors that bill us but never attach a PDF. Reported, never silently dropped. */
const NEVER_ATTACHES = [
  { sheetName: "Figma", why: "emails a receipt link, not a PDF" },
  { sheetName: "Adwords", why: "billing doc lives in the Ads console; spend is read from GA4" },
  { sheetName: "Upwork - Arsalan Majid", why: "HTML summary, hourly not fixed" },
  { sheetName: "Domain - united-domains", why: "registrar mails the portfolio owner only" },
];

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export function colLetter(index0: number): string {
  let s = "";
  let i = index0 + 1;
  while (i > 0) {
    const r = (i - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

/** Returns null when the month predates the sheet or runs past its last column. */
export function columnForMonth(year: number, month: number, lastIndex: number): string | null {
  const offset = (year - FIRST_YEAR) * 12 + (month - FIRST_MONTH);
  const idx = FIRST_COL_INDEX + offset;
  if (offset < 0 || idx > lastIndex) return null;
  return colLetter(idx);
}

async function gapi<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithTimeout(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
    timeoutMs: 30_000,
  });
  if (!res.ok)
    throw new Error(`${url.split("?")[0]} -> ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

/**
 * A charged total, WITH the currency it was charged in.
 *
 * The currency is not decoration. The Costs tab is denominated in euros, but
 * Vercel, Resend, GitHub, CookieYes and Atlassian all invoice in dollars — five
 * of the nine vendors this cron watches. Returning a bare number let the first
 * version write "20.00" into a euro column for a USD 20 charge, which is not a
 * rounding error, it is the wrong number.
 *
 * We do NOT convert. An FX rate applied silently here would disagree with what
 * the card was actually charged, and would drift every month. A foreign-currency
 * invoice is reported to #ops with its amount and left for a human.
 */
export interface Charge {
  value: number;
  currency: "EUR" | "USD" | "OTHER";
}

/**
 * Largest match wins: a multi-page invoice repeats net, per-line and gross totals.
 *
 * A match preceded by "exclusive"/"excl." is DROPPED. Atlassian's invoice states
 * "The VAT exclusive total on this invoice is EUR 46.64" and nowhere prints the
 * EUR gross — taking that figure would quietly book a EUR 55.50 charge as 46.64,
 * every month, and it would look entirely plausible.
 */
function largest(text: string, pattern: RegExp): number | null {
  const nums: number[] = [];
  for (const m of text.matchAll(pattern)) {
    const before = text.slice(Math.max(0, (m.index ?? 0) - 40), m.index ?? 0);
    if (/exclusi|excl\./i.test(before)) continue;
    const n = Number((m[1] ?? "").replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) nums.push(n);
  }
  return nums.length ? Math.max(...nums) : null;
}

/**
 * Pulls the charged total out of an invoice. The PDF is authoritative — Google
 * Workspace puts the figure NOWHERE else, which is precisely why the audit of
 * 2026-09-19 could not verify that line from email text alone.
 *
 * A euro figure is preferred wherever the document states a gross one, because a
 * stated figure always beats a rate we would have to invent.
 */
export async function amountFrom(pdf: Uint8Array | null, body: string): Promise<Charge | null> {
  let text = body;
  if (pdf) {
    try {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const doc = await getDocumentProxy(pdf);
      const extracted = await extractText(doc, { mergePages: true });
      text = String(extracted.text);
    } catch (err) {
      logger.warn({ err }, "file-invoices: pdf parse failed, falling back to body");
    }
  }

  // `\s*` and not `\s?`: Contentsquare's extracted text reads "Total cost € EUR  58.31"
  // with a space after the symbol AND two before the number. Allowing exactly one
  // made a euro invoice look currency-less and blocked it from ever being written.
  // Control characters are stripped from BOTH sources, not just the PDF one.
  // Extraction embeds them mid-number: Contentsquare's invoice comes out as
  // "Total cost \u20ac\0EUR\0 58.31", with NUL bytes either side of the currency
  // code. A NUL is not whitespace, so widening the whitespace class never reaches
  // the figure, and a euro invoice that cannot be recognised as euros is never
  // written at all. Doing this only on the PDF branch left the body fallback
  // broken in exactly the same way.
  text = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ");

  const TOTAL = String.raw`(?:Total(?:\s+in\s+EUR)?|Amount paid|Total cost|Amount due|Invoice Total)`;
  const eur = largest(
    text,
    new RegExp(TOTAL + String.raw`[^\d]{0,28}?(?:€|EUR)[\s€]*([\d,]+\.\d{2})`, "gi")
  );
  if (eur !== null) return { value: eur, currency: "EUR" };

  const usd = largest(
    text,
    new RegExp(TOTAL + String.raw`[^\d]{0,28}?(?:\$|USD)[\s$]*([\d,]+\.\d{2})`, "gi")
  );
  if (usd !== null) return { value: usd, currency: "USD" };

  // No currency marker beside the total, so we cannot claim it is euros.
  const bare = largest(text, new RegExp(TOTAL + String.raw`[^\d]{0,28}?([\d,]+\.\d{2})`, "gi"));
  return bare !== null ? { value: bare, currency: "OTHER" } : null;
}

interface Filed {
  vendor: string;
  month: string;
  file: string;
  amount: Charge | null;
}

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }
  const auth = request.headers.get("authorization") || "";
  if (!safeCompare(auth, `Bearer ${expected}`)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 401 });
  }
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }

  const trackDuration = startCronTimer("file-invoices", 280);
  const startMs = Date.now();
  let cronError: string | undefined;

  try {
    const driveToken = await getDelegatedToken("ec@loveiq.org", DRIVE_WRITE_SCOPE);
    const sheetToken = await getDelegatedToken("ec@loveiq.org", SHEETS_SCOPE);
    if (!driveToken || !sheetToken) {
      throw new Error(
        "delegation unavailable — check GOOGLE_IMPERSONATE_SERVICE_ACCOUNT and the domain-wide grant"
      );
    }

    const filed: Filed[] = [];
    const unconverted: string[] = [];
    /**
     * Vendor+month -> summed charge. BOTH halves matter.
     *
     * SUMMED, because a vendor can invoice several times in one month and the last
     * one is not the month's rate: Anthropic billed three times in August 2026 (450.78
     * renewal, then 20.28 and 66.82 seat prorations). Taking the last would have
     * written 66.82 into a line whose real cost was 537.88, and then carried that
     * wrong figure across every forecast month.
     *
     * Counted even when the PDF is ALREADY in Drive, because otherwise a re-run
     * reconciles nothing — and the very first run after this ships would skip all
     * 69 back-filled PDFs and update the sheet not at all.
     */
    const charged = new Map<string, Charge>();
    const folderCache = new Map<string, string>();

    async function ensureFolder(parent: string, name: string): Promise<string> {
      const key = `${parent}/${name}`;
      const cached = folderCache.get(key);
      if (cached) return cached;
      const q = encodeURIComponent(
        `'${parent}' in parents and name='${driveQuoteEscape(name)}' and trashed=false`
      );
      const found = await gapi<{ files?: Array<{ id: string }> }>(
        `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=2`,
        driveToken!
      );
      let id = found.files?.[0]?.id;
      if (!id) {
        const made = await gapi<{ id: string }>(
          "https://www.googleapis.com/drive/v3/files",
          driveToken!,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name,
              mimeType: "application/vnd.google-apps.folder",
              parents: [parent],
            }),
          }
        );
        id = made.id;
      }
      folderCache.set(key, id);
      return id;
    }

    // Fetched once for the whole run. A failure here must not lose the filing:
    // PDFs still get filed, and a charge that cannot be converted is reported.
    let rates = new Map<string, number>();
    try {
      rates = await ecbUsdRates();
    } catch (err) {
      logger.warn(
        { err },
        "file-invoices: ECB rates unavailable, foreign charges will be reported not converted"
      );
    }

    let outOfTime = false;
    for (const mailbox of MAILBOXES) {
      if (outOfTime) break;
      const gmailToken = await getDelegatedToken(mailbox, GMAIL_SCOPE);
      if (!gmailToken) {
        logger.warn({ mailbox }, "file-invoices: no gmail token, skipping mailbox");
        continue;
      }
      const q = encodeURIComponent(`has:attachment filename:pdf newer_than:${LOOKBACK_DAYS}d`);
      const list = await gapi<{ messages?: Array<{ id: string }> }>(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=100`,
        gmailToken
      );

      for (const ref of list.messages || []) {
        if (Date.now() - startMs > 240_000) {
          // Stops the whole walk, not just this mailbox. Breaking only the inner
          // loop would start the next mailbox with no budget left and blow the
          // 300s ceiling, which leaves NO cron_run row at all to debug from.
          outOfTime = true;
          break;
        }

        const msg = await gapi<{
          internalDate: string;
          payload: { headers?: Array<{ name: string; value: string }> };
        }>(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${ref.id}?format=full`,
          gmailToken
        );

        const headers = Object.fromEntries(
          (msg.payload.headers || []).map((h) => [h.name, h.value])
        );
        const from = headers["From"] || "";
        const subject = headers["Subject"] || "";

        // Our own outgoing customer receipts are billed BY us, not TO us. They
        // outnumber real vendor invoices roughly four to one, so this is the
        // difference between a useful report and noise.
        if (/Applied Psychometrics/i.test(subject)) continue;

        const vendor = VENDORS.find(
          (v) => v.match.test(from) && (!v.subject || v.subject.test(subject))
        );
        if (!vendor) continue;

        const parts: Array<{
          filename?: string;
          body?: { attachmentId?: string; data?: string };
          parts?: unknown[];
        }> = [];
        const walk = (p: Record<string, unknown>) => {
          parts.push(p as never);
          for (const c of (p.parts as Record<string, unknown>[]) || []) walk(c);
        };
        walk(msg.payload as unknown as Record<string, unknown>);

        const bodyText = parts
          .map((p) => (p.body?.data ? Buffer.from(p.body.data, "base64url").toString("utf8") : ""))
          .join("\n");

        const date = new Date(Number(msg.internalDate));
        const month = `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

        /**
         * The charge this ONE email represents, counted once however many PDFs
         * it carries.
         *
         * Vendors routinely attach the invoice AND the receipt for the same
         * transaction — Resend, Vercel and Anthropic all do, and Slack adds a
         * fair-billing statement on top. Summing per attachment double-counted
         * every one of them: a live dry run on 2026-09-19 produced Resend 40.00
         * against a real USD 20, Slack 157.54 against 78.77, and Claude August
         * 1,075.76 against 537.88 — exactly twice, across the board. The unit
         * tests could not see this; only running it against real mail could.
         *
         * Max rather than first, because the two documents state the same gross
         * figure and the larger is the one that survives a partial parse.
         */
        let messageAmount: Charge | null = null;

        for (const p of parts) {
          if (!p.filename?.toLowerCase().endsWith(".pdf") || !p.body?.attachmentId) continue;

          // The attachment is fetched BEFORE the duplicate check, because its
          // total has to be counted whether or not the file is new. Skipping
          // early here is what made the first version reconcile nothing on a
          // re-run.
          const att = await gapi<{ data: string }>(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${ref.id}/attachments/${p.body.attachmentId}`,
            gmailToken
          );
          const bytes = Buffer.from(att.data, "base64url");

          const amount = await amountFrom(bytes, bodyText);
          // ONE amount per EMAIL, never per attachment — see messageAmount above.
          // A EUR reading always beats a USD one, whatever their sizes: comparing
          // on value alone would let a USD 64.62 invoice displace a EUR 58.31
          // receipt for the same charge, throwing away the only figure we can
          // actually write into a euro column.
          if (amount !== null && betterCharge(amount, messageAmount)) {
            messageAmount = amount;
          }

          const vendorFolder = await ensureFolder(DRIVE_ROOT, vendor.sheetName);
          const monthFolder = await ensureFolder(vendorFolder, month);
          const nq = encodeURIComponent(
            `'${monthFolder}' in parents and name='${driveQuoteEscape(p.filename)}' and trashed=false`
          );
          const dup = await gapi<{ files?: unknown[] }>(
            `https://www.googleapis.com/drive/v3/files?q=${nq}&fields=files(id)&pageSize=1`,
            driveToken
          );
          if (dup.files?.length) continue;

          const boundary = `b${Date.now().toString(36)}`;
          const multipart = Buffer.concat([
            Buffer.from(
              `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
                JSON.stringify({ name: p.filename, parents: [monthFolder] }) +
                `\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`
            ),
            bytes,
            Buffer.from(`\r\n--${boundary}--\r\n`),
          ]);
          await gapi(
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
            driveToken,
            {
              method: "POST",
              headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
              body: multipart as unknown as BodyInit,
            }
          );

          filed.push({ vendor: vendor.sheetName, month, file: p.filename, amount });
        }

        if (messageAmount !== null) {
          // Converted HERE, where the invoice's own date is still in hand. Doing it
          // later, from the month key alone, would convert a 3 September charge at
          // a 30 September rate.
          const isoDate = date.toISOString().slice(0, 10);
          const eur = toEur(messageAmount, rates, isoDate);
          const key = `${vendor.sheetName}|${month}`;
          const prior = charged.get(key);
          if (!eur) {
            unconverted.push(
              `${vendor.sheetName} ${month}: ${messageAmount.currency} ${messageAmount.value.toFixed(2)}`
            );
            // Poison the month so a half-converted sum is never written.
            charged.set(key, {
              value: (prior?.value ?? 0) + messageAmount.value,
              currency: "OTHER",
            });
          } else {
            charged.set(key, {
              value: (prior?.value ?? 0) + eur.value,
              currency: prior?.currency === "OTHER" ? "OTHER" : "EUR",
            });
          }
        }
      }
    }

    // ---- reconcile against the sheet ------------------------------------
    const grid = await gapi<{ values?: string[][] }>(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${SHEET_TAB}!${READ_RANGE}?valueRenderOption=${RAW_VALUES}`,
      sheetToken
    );
    const rows = grid.values || [];
    // Bound the model to the month columns that actually exist. Row 1 carries a
    // date serial per month, so its width IS the model's width. Deriving this from
    // the widest row instead would let one stray cell out near AZ convince the
    // carry-forward to write twenty-odd columns past February 2027, outside
    // anything the header or the =SUM row describes.
    const lastIndex = (rows[0]?.length ?? 0) - 1;
    const rowOf = (name: string) => rows.findIndex((r) => String(r?.[0] ?? "").trim() === name) + 1;

    const changes: string[] = [];
    const skippedPartial: string[] = [];
    const foreignCurrency: string[] = [];
    const updates: Array<{ range: string; values: number[][] }> = [];
    const windowStartMs = Date.now() - LOOKBACK_DAYS * 86_400_000;

    // Chronological, and it matters. Each write carries its value forward to the
    // last column, so two months for one vendor produce OVERLAPPING ranges. Map
    // order is mailbox-then-message order, not time — applying October before
    // September would let September's figure overwrite October's tail.
    const chargedRows = [...charged.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [key, total] of chargedRows) {
      const [vendorName = "", monthKey = ""] = key.split("|");
      const row = rowOf(vendorName);
      if (row === 0) {
        changes.push(
          `:warning: ${vendorName} — no row in the sheet, PDF filed but nothing updated`
        );
        continue;
      }
      const ym = monthKey.split("/");
      const y = Number(ym[0]);
      const m = Number(ym[1]);
      if (!Number.isFinite(y) || !Number.isFinite(m)) continue;
      if (!monthFullyCovered(y, m, windowStartMs)) {
        // Filed, deliberately not reconciled — see monthFullyCovered.
        skippedPartial.push(`${vendorName} ${monthKey}`);
        continue;
      }
      const col = columnForMonth(y, m, lastIndex);
      if (!col) continue;

      const colIndex = FIRST_COL_INDEX + (y - FIRST_YEAR) * 12 + (m - FIRST_MONTH);
      const current = Number(rows[row - 1]?.[colIndex] ?? NaN);
      if (total.currency !== "EUR") {
        // The Costs tab is in euros and we do not invent an FX rate. Reported so
        // a person can enter the converted figure; never written blind.
        foreignCurrency.push(
          `${vendorName} ${monthKey}: ${total.currency} ${total.value.toFixed(2)}`
        );
        continue;
      }
      const next = -Math.abs(total.value);
      if (Number.isFinite(current) && Math.abs(current - next) < 0.005) continue;

      // Carry the new rate across this month and every forecast month after it:
      // that is how this sheet models a recurring cost, and leaving the tail at the
      // old figure is what let Claude sit at EUR 42.84 for seven months.
      const span = lastIndex - colIndex + 1;
      updates.push({
        range: `${SHEET_TAB}!${col}${row}:${colLetter(lastIndex)}${row}`,
        values: [Array.from({ length: span }, () => next)],
      });
      changes.push(
        `${vendorName} ${monthKey}: ${Number.isFinite(current) ? current.toFixed(2) : "(blank)"} → ${next.toFixed(2)}`
      );
    }

    if (updates.length) {
      await gapi(
        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchUpdate`,
        sheetToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ valueInputOption: "USER_ENTERED", data: updates }),
        }
      );
    }

    const lines = [
      `:page_facing_up: *Invoice filing* — ${filed.length} PDF${filed.length === 1 ? "" : "s"} filed to Drive`,
      ...filed.map((f) => `• ${escapeSlack(f.vendor)}/${f.month}/${escapeSlack(f.file)}`),
      "",
      changes.length
        ? `:heavy_dollar_sign: *Cost sheet updated* (${changes.length})\n` +
          changes.map((c) => `• ${escapeSlack(c)}`).join("\n")
        : ":white_check_mark: Cost sheet already matched every invoice.",
      unconverted.length
        ? `_Converted to EUR at the ECB reference rate on each invoice's own date._`
        : "",
      foreignCurrency.length
        ? `:currency_exchange: *Not written — could not be converted, enter by hand:*\n` +
          foreignCurrency.map((f) => `• ${escapeSlack(f)}`).join("\n")
        : "",
      skippedPartial.length
        ? `_Filed but not reconciled (month only partly inside the ${LOOKBACK_DAYS}-day window): ${escapeSlack(skippedPartial.join(", "))}._`
        : "",
      "",
      `_No invoice expected by email from: ${NEVER_ATTACHES.map((n) => `${n.sheetName} (${n.why})`).join("; ")}._`,
    ];

    await notifySlack({
      channel: "ops",
      kind: "file-invoices",
      text: lines.join("\n"),
    });

    return NextResponse.json({ filed: filed.length, changed: changes.length });
  } catch (err) {
    cronError = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "file-invoices: run failed");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  } finally {
    await trackDuration();
    await recordCronRun("file-invoices", startMs, cronError ? "error" : "success", cronError);
  }
}
