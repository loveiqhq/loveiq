/**
 * The email journeys' switches and the names each email goes by. A switch is a system_flags row
 * (20261108230000), every one off until the email's trial send is approved; read with the
 * default OFF, so a missing row or an unreadable table keeps today's email and sends no new one.
 */

import { isFeatureEnabled, type SystemFlagKey } from "@shared/flags/system-flags";

export const EMAIL_SWITCHES = {
  // Redesigned live emails: on, the new design; off, today's email.
  i1: "email_i1_v2",
  r1: "email_r1_v2",
  u1: "email_u1_v2",
  c1: "email_c1_v2",
  s2: "email_s2_v2",
  i3: "email_i3_v2",
  c3c4: "email_c3_c4_v2",
  // New emails: on, sent; off, not.
  i2: "email_i2",
  i4: "email_i4",
  r2: "email_r2",
  c2: "email_c2",
  s3s5: "email_s3_s5",
  ptsReminders: "email_pts_reminders",
} as const satisfies Record<string, SystemFlagKey>;

export type EmailSwitch = keyof typeof EMAIL_SWITCHES;

export function isEmailSwitchOn(key: EmailSwitch): Promise<boolean> {
  return isFeatureEnabled(EMAIL_SWITCHES[key], false);
}

/**
 * Each email's Resend `stage` tag: the webhook keeps its delivery, opens and clicks by it (and
 * the submission, when there is one). The new emails' stage is also their key in
 * email_journey_send, their links' utm_campaign and their unsubscribe campaign.
 */
export const EMAIL_STAGES = {
  i1: "report_ready",
  r1: "survey_paused",
  u1: "core_unlocked",
  c1: "full_unlocked",
  s2: "pts_payment_received",
  i3: "initial_gift",
  c3: "invite_reminder_1",
  c4: "invite_reminder_2",
  i2: "what_199_opens",
  i4: "gift_unopened",
  r2: "survey_paused_2",
  c2: "back_into_report",
  s3: "pts_survey_waiting",
  s4: "pts_fifteen_minutes",
  s5: "pts_last_reminder",
  r1Pts: "pts_survey_paused",
  r2Pts: "pts_survey_paused_2",
} as const;

export type EmailStage = (typeof EMAIL_STAGES)[keyof typeof EMAIL_STAGES];
