import { isTablet } from "@shared/http/tablet";
import { lookupPrimaryArchetypeForSubmission } from "@features/checkout/server/fulfillment";
import { getReportReturnHref } from "@features/checkout/server/reportPurchase";
import { getDeviceTypeFromUserAgent } from "@features/pricing/logic/reportPricing";
import {
  lookupReportTokenBySubmissionId,
  supabaseServiceFetch,
} from "@features/report/server/personalReport";
import { keepKnownChips, type UnlockReason } from "@features/unlock-feedback/logic/reasons";
import { unlockForFeedback } from "@features/unlock-feedback/server/grant";
import { hashLinkToken } from "@features/unlock-feedback/server/link";

const COLUMNS = "id,survey_submission_id,reason,answered_at,answer_loads,already_paid,unlocked_at";

interface FeedbackRow {
  id: number;
  survey_submission_id: number;
  reason: UnlockReason | null;
  answered_at: string | null;
  answer_loads: number;
  already_paid: boolean;
  unlocked_at: string | null;
}

export type Device = "mobile" | "tablet" | "desktop";

/** What the /why page shows once the answer is in. */
export interface AnswerResult {
  /** The reader's own archetype, for "All 50+ pages for [ARCHETYPE]"; null without scoring. */
  archetypeName: string | null;
  reportPath: string;
  /** The answer as kept: the first one, or what the page changed it to since. */
  reason: UnlockReason;
  /** They had bought before answering: nothing was unlocked. */
  alreadyPaid: boolean;
}

/** The row an emailed link opens: only one the send actually sent. */
async function findSentRow(token: string): Promise<FeedbackRow | null> {
  const response = await supabaseServiceFetch(
    `/rest/v1/unlock_feedback?link_hash=eq.${hashLinkToken(token)}&sent_at=not.is.null&select=${COLUMNS}&limit=1`
  );
  if (!response.ok) throw new Error("unlock_feedback_lookup_failed");
  const rows = (await response.json()) as FeedbackRow[];
  return rows[0] ?? null;
}

async function update(
  filter: string,
  body: Record<string, unknown>,
  returnRows = false
): Promise<FeedbackRow[]> {
  const response = await supabaseServiceFetch(
    `/rest/v1/unlock_feedback?${filter}${returnRows ? `&select=${COLUMNS}` : ""}`,
    {
      body: JSON.stringify(body),
      headers: { Prefer: returnRows ? "return=representation" : "return=minimal" },
      method: "PATCH",
    }
  );
  if (!response.ok) throw new Error("unlock_feedback_update_failed");
  return returnRows ? ((await response.json()) as FeedbackRow[]) : [];
}

/** mobile, tablet or desktop, by the rules the survey tracking and the price quote use. */
export function deviceOf(userAgent: string | null, touch: boolean | undefined): Device | null {
  if (!userAgent) return null;
  if (isTablet(userAgent, touch)) return "tablet";
  return getDeviceTypeFromUserAgent(userAgent) === "Desktop" ? "desktop" : "mobile";
}

/**
 * Record a tap on the email's answer, now that /why has loaded in a browser, and unlock the
 * report. The first answer is kept: another tap (a different button, a reload) only counts
 * in `answer_loads`. Null when the link opens no sent email.
 */
export async function recordAnswer({
  device,
  reason,
  token,
}: {
  device: Device | null;
  reason: UnlockReason;
  token: string;
}): Promise<AnswerResult | null> {
  let row = await findSentRow(token);
  if (!row) return null;
  const now = new Date().toISOString();

  // Filtered on answered_at, so of two posts at the same instant exactly one is the first.
  let first = false;
  if (!row.answered_at) {
    const [won] = await update(
      `id=eq.${row.id}&answered_at=is.null`,
      {
        reason,
        first_reason: reason,
        answered_at: now,
        answer_loads: 1,
        device,
        updated_at: now,
      },
      true
    );
    if (won) {
      row = won;
      first = true;
    } else {
      row = (await findSentRow(token)) ?? row;
    }
  }
  if (!first) {
    // ponytail: compare-and-set, so two repeats in the same instant count once.
    await update(`id=eq.${row.id}&answer_loads=eq.${row.answer_loads}`, {
      answer_loads: row.answer_loads + 1,
      updated_at: now,
    });
  }

  const submissionId = row.survey_submission_id;
  const archetype = await lookupPrimaryArchetypeForSubmission(submissionId);
  let alreadyPaid = row.already_paid && !row.unlocked_at;
  if (!row.unlocked_at && !row.already_paid) {
    // Also on a repeat: a first try that failed half-way is finished, never doubled.
    const outcome = await unlockForFeedback({ archetype, submissionId });
    if (outcome.kind === "already_paid") {
      await update(`id=eq.${row.id}&unlocked_at=is.null`, { already_paid: true, updated_at: now });
      alreadyPaid = true;
    } else {
      await update(`id=eq.${row.id}&unlocked_at=is.null`, {
        unlocked_at: now,
        payment_id: outcome.paymentId,
        updated_at: now,
      });
    }
  }

  return {
    alreadyPaid,
    archetypeName: archetype,
    reason: row.reason ?? reason,
    reportPath: getReportReturnHref(await lookupReportTokenBySubmissionId(submissionId)),
  };
}

/**
 * The reader's own words as kept: control characters out (line breaks and tabs stay), and
 * trimmed. The route allows 2,000 characters, the column's limit, so nothing is cut here.
 */
export function cleanNote(note: string | undefined): string | null {
  const text = (note ?? "").replace(/(?![\n\t])\p{Cc}/gu, "").trim();
  return text || null;
}

/**
 * The optional follow-up: the chips the reason offers, the reader's words and, when they
 * changed it on the page, the reason (`first_reason` never changes). Each post replaces the
 * last. False when the link opens no answered row.
 */
export async function recordDetail({
  chips,
  note,
  reason,
  token,
}: {
  chips: readonly string[];
  note?: string;
  reason?: UnlockReason;
  token: string;
}): Promise<boolean> {
  const row = await findSentRow(token);
  if (!row?.answered_at || !row.reason) return false;
  const now = new Date().toISOString();
  const next = reason ?? row.reason;
  await update(`id=eq.${row.id}`, {
    chips: keepKnownChips(next, chips),
    note: cleanNote(note),
    detail_at: now,
    updated_at: now,
    ...(next !== row.reason ? { reason: next, changed_at: now } : {}),
  });
  return true;
}
