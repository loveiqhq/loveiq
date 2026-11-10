/**
 * The Emails pages' registry: every email, the days it is counted and how, its funnel and its
 * goal. Pure (no server import), so the page and its info cards read the same list as the
 * builder (features/admin/server/ap/emails.ts).
 */
/**
 * The first whole Berlin day every email with a reader carries its stage and sub tags (the
 * release of the Emails page): Survey done, the receipts and the pay-to-start report emails are
 * counted per reader from it. Correct it if that release moves.
 */
export const EMAIL_TAGS_FROM = "2026-11-11";
/** Resend's open tracking went on on 16 Oct 2026: no open is known before. */
export const OPENS_FROM = "2026-10-16";
/** A goal counts within this many days of the send. */
export const GOAL_DAYS = 7;
/** A rate on fewer delivered emails is greyed and never ranked. */
export const MIN_DELIVERED = 20;
/** Days in the clicks line at the end of each row. */
export const CLICK_DAYS = 30;

export type Funnel = "after" | "full" | "pre" | "gate" | "shared";
export type GoalKind = "open_report" | "buy_full" | "buy_core" | "answer" | "invite" | "share";
export type Scope = "overall" | "assessment";

export const FUNNEL_NAMES: Record<Funnel, string> = {
  after: "Pay after the report",
  full: "Pay to start · €29.99",
  pre: "Pay to start · €1.99",
  gate: "€1.99 after the survey",
  shared: "Sharing",
};

export interface EmailDef {
  key: string;
  name: string;
  /** Its per-reader rows' stage tags. */
  stages: string[];
  /** Counted per reader from this Berlin day on. */
  readerFrom?: string;
  /** Counted from Resend's daily tallies of this test, from (and to) these days. */
  tally?: { experiment: string; from: string; to?: string };
  /** The assessment whose survey, report or payment sends it; null: none. */
  assessment: "A" | null;
  funnel: Funnel;
  /** Other funnels that send it too. */
  also?: Funnel[];
  /** What the email is sent to make the reader do. */
  goal: string;
  /** How that is read; none: it can't be (and why). */
  goalKind?: GoalKind;
  goalNote?: string;
  /** Its unsubscribe links' campaigns (email_suppression.source_campaign). */
  unsub: string[];
  /** Sent today: listed even with no send in the range. */
  live: boolean;
  /** Sent, but counted nowhere: why. */
  untracked?: string;
  /** Built and switched off (Mark's rework): listed from its first send. */
  switchedOff?: true;
}

const PER_READER = "2026-11-09";

/** Every email, in the order a reader meets them. */
export const EMAILS: EmailDef[] = [
  {
    key: "survey_paused",
    name: "Survey paused · come back",
    stages: ["survey_paused"],
    tally: { experiment: "survey-paused", from: "2026-09-19" },
    assessment: "A",
    funnel: "after",
    also: ["gate"],
    goal: "Finish the survey",
    goalNote: "It goes to an unfinished survey, before there is a reader to follow.",
    unsub: ["survey_paused"],
    live: true,
  },
  {
    key: "report_ready",
    name: "Survey done · your report is ready",
    stages: ["report_ready"],
    readerFrom: EMAIL_TAGS_FROM,
    assessment: "A",
    funnel: "after",
    also: ["gate"],
    goal: "Open the report",
    goalKind: "open_report",
    unsub: ["survey_complete"],
    live: true,
  },
  {
    key: "initial_gift",
    name: "Your Core Archetype, unlocked as a gift",
    stages: ["initial_gift"],
    readerFrom: "2026-10-28",
    assessment: "A",
    funnel: "gate",
    goal: "Open the report",
    goalKind: "open_report",
    unsub: ["initial_gift"],
    live: true,
  },
  {
    key: "unlock_feedback",
    name: "Why didn’t you unlock?",
    stages: ["unlock_feedback"],
    readerFrom: "2026-10-22",
    assessment: "A",
    funnel: "after",
    goal: "Answer the unlock question",
    goalKind: "answer",
    unsub: ["unlock_feedback"],
    live: true,
  },
  {
    key: "h72",
    name: "Still locked after 72 hours",
    stages: ["72h_no_unlock"],
    readerFrom: "2026-10-16",
    assessment: "A",
    funnel: "after",
    goal: "Buy the full report",
    goalKind: "buy_full",
    unsub: ["72h_no_unlock"],
    live: true,
  },
  {
    key: "receipt_initial",
    name: "Purchase · Core Archetype (€1.99)",
    stages: ["receipt_initial"],
    readerFrom: EMAIL_TAGS_FROM,
    assessment: "A",
    funnel: "gate",
    also: ["pre"],
    goal: "Open the report",
    goalKind: "open_report",
    unsub: ["initial_unlocked"],
    live: true,
  },
  {
    key: "receipt_full",
    name: "Purchase · full report",
    stages: ["receipt_full_report"],
    readerFrom: EMAIL_TAGS_FROM,
    assessment: "A",
    funnel: "after",
    also: ["pre", "gate"],
    goal: "Open the full report",
    goalKind: "open_report",
    unsub: ["report_unlocked"],
    live: true,
  },
  {
    key: "receipt_all",
    name: "Purchase · all reports",
    stages: ["receipt_all_reports"],
    readerFrom: EMAIL_TAGS_FROM,
    assessment: "A",
    funnel: "after",
    goal: "Open a report",
    goalKind: "open_report",
    unsub: [],
    live: true,
  },
  {
    key: "receipt_core",
    name: "Purchase · Core",
    stages: ["receipt_core", "receipt_essentials"],
    readerFrom: EMAIL_TAGS_FROM,
    assessment: "A",
    funnel: "after",
    goal: "Open the report",
    goalKind: "open_report",
    unsub: [],
    live: false,
  },
  {
    key: "pts_confirm",
    name: "Payment confirmed · start your survey",
    stages: [],
    assessment: "A",
    funnel: "full",
    also: ["pre"],
    goal: "Finish the survey",
    goalNote: "It goes out before the survey, so there is no reader to follow yet.",
    unsub: [],
    live: true,
    untracked: "It goes out before the survey: no reader to count it by, so only Resend has it.",
  },
  {
    key: "pts_report_ready",
    name: "Pay to start · your report is ready",
    stages: ["pts_report_ready"],
    readerFrom: EMAIL_TAGS_FROM,
    assessment: "A",
    funnel: "full",
    also: ["pre"],
    goal: "Open the report",
    goalKind: "open_report",
    unsub: [],
    live: true,
  },
  {
    key: "pts_report_unlocked",
    name: "Pay to start · full report unlocked",
    stages: ["pts_report_unlocked"],
    readerFrom: EMAIL_TAGS_FROM,
    assessment: "A",
    funnel: "full",
    goal: "Open the report",
    goalKind: "open_report",
    unsub: [],
    live: true,
  },
  {
    key: "pts_initial_unlocked",
    name: "Pay to start · Core Archetype unlocked",
    stages: ["pts_initial_unlocked"],
    readerFrom: EMAIL_TAGS_FROM,
    assessment: "A",
    funnel: "pre",
    goal: "Open the report",
    goalKind: "open_report",
    unsub: [],
    live: true,
  },
  {
    key: "report_share",
    name: "Share your report",
    stages: [],
    tally: { experiment: "report-share", from: EMAIL_TAGS_FROM },
    assessment: "A",
    funnel: "shared",
    goal: "Recipient opens the report",
    goalNote: "It goes to someone else, who has no survey of their own to follow.",
    unsub: ["report_shared"],
    live: true,
  },
  {
    key: "invite",
    name: "Invite a friend",
    stages: [],
    tally: { experiment: "invite", from: EMAIL_TAGS_FROM },
    assessment: "A",
    funnel: "shared",
    goal: "Friend finishes the survey",
    goalNote: "It goes to a friend, who has no survey of their own yet.",
    unsub: ["invite"],
    live: true,
  },
  {
    key: "invite_reminder_1",
    name: "Invite reminder · day 3",
    stages: ["invite_reminder_1"],
    readerFrom: EMAIL_TAGS_FROM,
    assessment: "A",
    funnel: "shared",
    goal: "Invite a friend",
    goalKind: "invite",
    unsub: ["invite_reminder_1"],
    live: true,
  },
  {
    key: "invite_reminder_2",
    name: "Invite reminder · day 5",
    stages: ["invite_reminder_2"],
    readerFrom: EMAIL_TAGS_FROM,
    assessment: "A",
    funnel: "shared",
    goal: "Invite a friend",
    goalKind: "invite",
    unsub: ["invite_reminder_2"],
    live: true,
  },
  // Mark's rework, phase 1 (features/email-journeys): built and switched off; each is listed
  // from its first send.
  {
    key: "what_199_opens",
    name: "What €1.99 opens",
    stages: ["what_199_opens"],
    readerFrom: PER_READER,
    assessment: "A",
    funnel: "gate",
    goal: "Unlock the Core Archetype (€1.99)",
    goalKind: "buy_core",
    unsub: ["what_199_opens"],
    live: false,
    switchedOff: true,
  },
  {
    key: "gift_unopened",
    name: "Your gift is still unopened",
    stages: ["gift_unopened"],
    readerFrom: PER_READER,
    assessment: "A",
    funnel: "gate",
    goal: "Open the report",
    goalKind: "open_report",
    unsub: ["gift_unopened"],
    live: false,
    switchedOff: true,
  },
  {
    key: "core_unlocked",
    name: "Core Archetype unlocked (new design)",
    stages: ["core_unlocked"],
    readerFrom: PER_READER,
    assessment: "A",
    funnel: "gate",
    also: ["pre"],
    goal: "Open the report",
    goalKind: "open_report",
    unsub: [],
    live: false,
    switchedOff: true,
  },
  {
    key: "full_unlocked",
    name: "Full report unlocked (new design)",
    stages: ["full_unlocked"],
    readerFrom: PER_READER,
    assessment: "A",
    funnel: "after",
    also: ["full"],
    goal: "Share the report",
    goalKind: "share",
    unsub: [],
    live: false,
    switchedOff: true,
  },
  {
    key: "back_into_report",
    name: "Back into your report",
    stages: ["back_into_report"],
    readerFrom: PER_READER,
    assessment: "A",
    funnel: "after",
    goal: "Open the report",
    goalKind: "open_report",
    unsub: ["back_into_report"],
    live: false,
    switchedOff: true,
  },
];

/** The goal per stage, as ap_emails reads it. */
export function goalsByStage(defs: EmailDef[] = EMAILS): Record<string, GoalKind> {
  const out: Record<string, GoalKind> = {};
  for (const d of defs) if (d.goalKind) for (const s of d.stages) out[s] = d.goalKind;
  return out;
}
