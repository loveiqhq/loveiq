import { Resend } from "resend";

import { suppressionState, type SuppressionState } from "@shared/emails/suppression";
import { escapeSlack, notifySlack } from "@shared/observability/slack";
import logger from "@shared/observability/logger";

/**
 * Sending email, as the company.
 *
 * THE ONLY ACTION HERE THAT CANNOT BE UNDONE BY ANYONE. A Slack message can be deleted by
 * a person; a Notion page can be archived; a decision record can be corrected. An email
 * is gone the moment it is accepted — out of our systems, into someone's inbox, under our
 * domain. So this is the one tool that does NOT act freely by default, and the owner's
 * "act freely, log everything" was chosen with email named as the exception.
 *
 * DRAFT IS THE DEFAULT. Without `send: true` nothing is dispatched: the tool renders
 * exactly what would go out, checks every recipient against the suppression list, and
 * returns it for a person to read. Sending is one extra field, not a confirmation flow.
 *
 * "COULD NOT CHECK" STOPS A SEND HERE, unlike everywhere else in this codebase. A
 * transactional email that fails to arrive because a lookup timed out is worse than a
 * small compliance risk — nobody is waiting for this one, so unknown means stop.
 */

/**
 * A hard ceiling on recipients per call.
 *
 * Not a rate limit — a change of kind. One agent-composed email to a colleague is a
 * normal action; the same tool addressing two hundred people is a mailshot under our
 * domain that nobody reviewed, and it would be sent before anyone could read the log.
 * Five covers "email the three of us"; anything larger belongs in a campaign someone
 * signed off.
 */
export const MAX_RECIPIENTS = 5;

/** Header injection: a newline in a header field can append headers of its own. */
const HEADER_UNSAFE = /[\r\n]/;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export class EmailRefusal extends Error {}

export interface EmailDraft {
  to: string[];
  subject: string;
  body: string;
  from: string;
  replyTo?: string;
  suppression: Array<{ email: string; state: SuppressionState }>;
}

export interface EmailSendResult {
  draft: EmailDraft;
  sent: boolean;
  id: string | null;
}

function fromAddress(): string {
  // Never caller-supplied. A `from` an agent can set is a `from` that can impersonate a
  // colleague, and Resend will happily send anything on a verified domain.
  return process.env.RESEND_FROM || "LoveIQ <hello@send.loveiq.org>";
}

export async function prepareEmail(input: {
  to: string[];
  subject: string;
  body: string;
  replyTo?: string;
}): Promise<EmailDraft> {
  const to = input.to.map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (to.length === 0) throw new EmailRefusal("Name at least one recipient.");
  if (to.length > MAX_RECIPIENTS) {
    throw new EmailRefusal(
      `${to.length} recipients is more than this tool will address at once (${MAX_RECIPIENTS}). ` +
        `Sending to more than a handful of people under the company's domain is a campaign, ` +
        `not a message — it needs a person to sign it off.`
    );
  }
  for (const address of to) {
    if (!EMAIL_SHAPE.test(address) || HEADER_UNSAFE.test(address)) {
      throw new EmailRefusal(`"${address}" is not an email address.`);
    }
  }
  const subject = input.subject.trim();
  if (!subject) throw new EmailRefusal("Give the email a subject.");
  if (HEADER_UNSAFE.test(subject)) {
    throw new EmailRefusal("A subject line cannot contain a line break.");
  }
  if (!input.body.trim()) throw new EmailRefusal("There is no message to send.");
  if (input.replyTo && (!EMAIL_SHAPE.test(input.replyTo) || HEADER_UNSAFE.test(input.replyTo))) {
    throw new EmailRefusal(`"${input.replyTo}" is not an email address.`);
  }

  // Checked for a DRAFT too, so the answer to "can I email this person" comes before the
  // message is written rather than after it is refused.
  const suppression = await Promise.all(
    to.map(async (email) => ({ email, state: await suppressionState(email) }))
  );

  return {
    to,
    subject,
    body: input.body.trim(),
    from: fromAddress(),
    replyTo: input.replyTo?.trim(),
    suppression,
  };
}

export async function sendEmail(input: {
  to: string[];
  subject: string;
  body: string;
  replyTo?: string;
  send: boolean;
}): Promise<EmailSendResult> {
  const draft = await prepareEmail(input);
  if (!input.send) return { draft, sent: false, id: null };

  const blocked = draft.suppression.filter((s) => s.state === "suppressed");
  if (blocked.length > 0) {
    throw new EmailRefusal(
      `${blocked.map((b) => b.email).join(", ")} asked not to be emailed. Nothing was sent.`
    );
  }
  const unknown = draft.suppression.filter((s) => s.state === "unknown");
  if (unknown.length > 0) {
    // The one place in this codebase where an unreadable suppression list stops a send.
    throw new EmailRefusal(
      `Could not check whether ${unknown.map((u) => u.email).join(", ")} has opted out, so ` +
        `nothing was sent. This is a failure to check, not permission to proceed — try again.`
    );
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is unset, so nothing can be sent");

  const res = await new Resend(apiKey).emails.send({
    from: draft.from,
    to: draft.to,
    ...(draft.replyTo ? { replyTo: draft.replyTo } : {}),
    subject: draft.subject,
    text: draft.body,
  });
  if (res.error) throw new Error(res.error.message ?? "resend_error");

  /**
   * Mirrored to ops the moment it goes, and never allowed to fail the send.
   *
   * The compensating control for act-freely is that a write cannot be done quietly, and
   * that matters most for the one write that leaves the company.
   */
  try {
    await notifySlack({
      channel: "ops",
      kind: "brain_email_sent",
      username: "ops_alerts",
      text:
        `:email: *The brain sent an email* to ${escapeSlack(draft.to.join(", "))}\\n` +
        `_${escapeSlack(draft.subject)}_`,
      context: { id: res.data?.id ?? null, recipients: draft.to.length },
    });
  } catch (err) {
    logger.warn({ err }, "brain: email sent but not mirrored to ops");
  }

  return { draft, sent: true, id: res.data?.id ?? null };
}
