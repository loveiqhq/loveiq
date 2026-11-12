/**
 * The words on the sheets between questions (features/survey/surveySheets.ts), in one place
 * for Marcus's copy suggestions. Mark's boards are the source (Claude Design
 * NGyoLVAex5vSW4voVs7Tcc, "Survey – Proposal 10.11.2026"); where a number or a quote on a
 * board was not true, the true one is here, with how it was checked.
 */

export const KEEP_GOING = "Keep going";

/**
 * Sheet 1, after 02004 "What kind of starting point usually leads to the best sex for you?":
 * one message for every reader, as Mark's board draws it (his review of 12 Nov: "Wrong
 * headline. Check Design Artifact."; the answer-by-answer headlines are gone).
 *
 * The board's "Most people love to respond" is not true: the most common answer is "It
 * happens naturally". "More people love to respond", read with the line under it (36% against
 * 12% who start), is. Shares of every finished survey, the team's own runs left out, rounded
 * down as the opt-in sheet's 95% is (production, 12 Nov 2026, n = 2,605): naturally 44.6%,
 * respond 36.8%, start 12.7%, plan it ahead 6.0%. Run it again before changing a number:
 *
 *   select ao.option_text, count(*) as n,
 *          round(100.0 * count(*) / sum(count(*)) over (), 1) as pct
 *   from survey_submission_answer ssa
 *   join survey_question sq on sq.id = ssa.survey_question_id and sq.frontend_qid = '02004'
 *   join answer_option ao on ao.id = ssa.answer_option_id
 *   join survey_submission s on s.id = ssa.survey_submission_id and s.status = 'completed'
 *   where not exists (select 1 from ap_team_user t where t.id = s.user_id)
 *   group by 1 order by n desc;
 */
export const SCIENCE_SHARES = { naturally: 44, respond: 36, start: 12, plan: 6 } as const;

export const SCIENCE_SHEET_COPY = {
  headLead: "More people love to ",
  headEmphasis: "respond",
  headEnd: "",
  /** The number that counts up. */
  share: SCIENCE_SHARES.respond,
  statText: " say their best sex starts when the other person makes the first move. Only ",
  contrastShare: SCIENCE_SHARES.start,
  contrastText: " say it’s when they start.",
} as const;

/**
 * Sheet 2, after 03008: the TrustScore and one real review. The board's quote ("Every
 * question was worth answering…") is not on our Trustpilot profile; this one is, word for
 * word, shortened with an ellipsis (Sani, 26 Oct 2026; Fatih picked it, 12 Nov). The score and
 * the count are never typed in here: shared/ui/trustpilot/config.ts.
 */
export const TRUSTPILOT_SHEET_COPY = {
  scoreLead: "TrustScore ",
  outOf: " out of 5",
  reviews: (count: string) => `${count} reviews`,
  quote:
    "Very interesting report, and personalised in a way I didn’t expect. The questions were thoughtful…",
  author: "Sani",
  date: "26 Oct 2026",
  reviewUrl: "https://www.trustpilot.com/reviews/6adf12350401525d372fa295",
} as const;

/**
 * Sheet 3, before 01005: Mark's board, word for word. Before production: her written OK to
 * these exact words, one version of her credentials (the landing page has "HHL & ESADE" once
 * and Columbia + HHL twice), and that she sits on our Academic Board.
 */
export const EXPERT_SHEET_COPY = {
  name: "Dr. Dijana Galijašević",
  discipline: "Business Ethics & Social Science",
  affiliation: "HHL & ESADE",
  photo: "/academic/dijana-avatar.jpg",
  quoteLead: "Not every question made sense to me at first, but in the end ",
  quoteEmphasis: "all the dots connected",
  quoteEnd: ".",
} as const;

/**
 * Sheet 4, after 11003 (32/62): Mark's board as he revised it on 12 Nov ("it's motivation"
 * corrected). It describes the EUR 1.99 change still to come (the Core Archetype free, the
 * Light Report for EUR 1.99), so its switch stays off in production until that change ships.
 */
export const HALFWAY_SHEET_COPY = {
  titleLead: "You’re already ",
  titleEmphasis: "halfway",
  titleEnd: ". Your Core Archetype is taking shape.",
  finishTitle: "Finish the remaining questions",
  finishBody: (minutes: number) => `Only ~${minutes} more minutes.`,
  archetypeTitle: "Discover your Core Archetype",
  archetypeBody: "Your highest scored sexual personality and its motivation.",
  free: "Free",
  lightTitle: "Unlock your Light Report for €1.99",
  lightGuarantee: "with a 14-day money-back guarantee",
  lightBody: "Dive deeper into your sexual behavior & improve your sex life",
  optional: "Optional",
  lockedLabel: "Step 3, optional",
} as const;

/**
 * Sheet 5, after 16005. "15%" is true: "Steady — Sex feels normal and good in my life" is
 * 15.5% of finished surveys, the team's own runs left out (production, 12 Nov 2026, 403 of
 * 2,605; the query above, with '16005'). The board's "+2.500 participants" is the report's
 * 2,369. The tick box records nothing yet: what it promises waits on Marcus (the link, and
 * the EUR 5 code), and keeping it needs its own consent. Its switch stays off in production
 * until both exist.
 */
export const DESIRE_SHEET_COPY = {
  eyebrow: "Did you know?",
  /** "For only 15%": the words, then the number that counts up. */
  statLead: "For only ",
  statShare: 15,
  statEnd: " of people, sex feels steady and good right now.",
  titleLead: "Learn what ",
  titleEmphasis: "turns people on",
  titleEnd: ", and what holds them back",
  price: "€9.99",
  participants: "Insights from 2,369 participants in our State of Desire 2026 study.",
  tickLead: "I am interested in the study. Email me a ",
  tickEmphasis: "5€ off",
  tickEnd: " code.",
  coverLabel: "State of Desire 2026 report cover",
  cover: {
    kicker: "SURVEY REPORT",
    month: "OCTOBER 2026",
    titleTop: "State of",
    titleItalic: "Desire 2026",
    blurb: "What 2,369 adults told us about what turns them on and what holds them back.",
    meta: "2,369 adults · 14 archetypes · Women vs men",
    brand: "LoveIQ",
  },
} as const;

/**
 * Sheet 6, the report map when three questions are left. The parts and chapters are the
 * report's own (features/survey/ui/wizard/wizardContent.ts): 6 parts, 17 chapters, where the
 * board said 20 and listed 22. Its Free and EUR 1.99 labels describe the EUR 1.99 change still
 * to come, so its switch stays off in production until that change ships.
 */
export const REPORT_MAP_COPY = {
  titleLead: "Only ",
  titleEmphasis: (left: number) => `${left} questions left`,
  titleMid: " to unlock your results. ",
  titleEnd: "This is waiting:",
  parts: (n: number) => `${n} Parts,`,
  chapters: (n: number) => `${n} Chapters`,
  free: "Free",
  freeLead: "Read ",
  freeEmphasis: "your Core Archetype",
  freeEnd: " for free.",
  price: "€1.99",
  lightLead: "Unlock ",
  lightEmphasis: "your Light Report",
  /** Mark's board breaks the line after "your Light Report". */
  lightMid: "also opening part of each ",
  lightFeatured: "featured",
  lightEnd: " chapter.",
  fullLead: "The ",
  fullEmphasis: "full report",
  fullEnd: " unlocks all chapters.",
  previous: "Previous",
  next: "Next",
} as const;
