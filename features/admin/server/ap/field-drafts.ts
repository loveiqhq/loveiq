/**
 * First drafts of what the main production tables and fields hold, checked against the data
 * on 13 Oct 2026 (the values listed are the ones in use then). The catalog shows them until the
 * team writes its own (admin_field_note), and the database's own comments where there is no
 * draft. Written for the team, not for engineers: what a field means, not how it is built.
 */
import { rangeLabel, SURVEY_TRACKING_FROM } from "./filters";

const TRACKING_DAY = rangeLabel(SURVEY_TRACKING_FROM, SURVEY_TRACKING_FROM);

export interface TableDraft {
  table: string;
  fields: Record<string, string>;
}

export const DRAFTS: Record<string, TableDraft> = {
  survey_submission: {
    table:
      "One row per finished survey: a row is written only when the survey is submitted, so status is always completed (unfinished surveys are in survey_partial_save). The spine that joins answers, scores, reports and payments.",
    fields: {
      id: "Submission id.",
      user_id: "The person, in app_user (where the email is).",
      survey_id: "Which assessment was taken.",
      utm_tracker: `Captured at entry, as JSON text: UTM tags, Google Ads click ids (gclid, gbraid, wbraid) and its network and match type, Meta's click id (fbclid) and the name of the site the visit came from (referrer_host, both from ${TRACKING_DAY}), and the test arms the person was in (landing page, question order, email question).`,
      regeneration_url: "Link that rebuilds the report.",
      status: "Always completed.",
      start_date_time: "When the survey was started.",
      created_date_time:
        "When the finished survey reached us: the submission time every count uses.",
      duration_ms: "Time from start to submit, in milliseconds.",
      session_id: "The survey session: joins survey_behavior_event and survey_partial_save.",
      marketing_opt_in: "Said yes to marketing email in the survey.",
      marketing_opt_in_at: "When that yes was given.",
      marketing_opt_in_terms_version: "The terms that yes was given under.",
      consent_at: "When the person confirmed their age and accepted the terms (stamped on submit).",
      terms_version: "The version of the terms the person accepted.",
      posthog_session_id:
        "The visit in PostHog, which opens its recording (kept 30 days); empty when none was made.",
      hotjar_user_id: "Hotjar's visitor id: nothing new since Hotjar was removed on 10 Aug 2026.",
      option_order:
        "The order answer options were shown in, for questions that shuffle them (from 11 Sep 2026).",
      updated_date_time: "Last change to the row.",
    },
  },
  survey_submission_answer: {
    table: "One row per answered or skipped question of a finished survey.",
    fields: {
      id: "Answer id.",
      survey_submission_id: "The finished survey.",
      survey_question_id:
        "The question, in survey_question (its frontend_qid, such as 15003, is the id the survey uses).",
      answer_text:
        "The answer as text: free text, a number or the option's words. The email, name and postcode answers are masked.",
      answer_option_id:
        "The chosen option of a single-choice question (multiple choice: survey_submission_answer_options).",
      normalized_value: "The answer on the scoring scale.",
      answered_at: "When the answer was given.",
      time_spent_seconds: "Seconds on the question.",
      revision_count: "How often the answer was changed.",
      was_skipped: "Passed without an answer.",
      created_date_time: "When the row was written.",
      updated_date_time: "Last change to the row.",
    },
  },
  survey_partial_save: {
    table:
      "A survey in progress, saved at every step: deleted when the survey is finished, and 30 days after its last save when it never is.",
    fields: {
      id: "Draft id.",
      session_id: "The survey session (the submission's session_id once finished).",
      answers:
        "The answers so far, by question id. The email, name and postcode answers are masked.",
      current_index: "The step reached, counted from 0.",
      started_at: "When the survey was started.",
      utm_tracker:
        "As on survey_submission: tags and test arms (the landing arm from 20 Sep 2026).",
      saved_at: "Last save: the draft is deleted 30 days after it.",
    },
  },
  survey_behavior_event: {
    table:
      "One row per question left: time on it, answered or not, and which way the person went. Written for everyone since 18 Sep 2026 (before, only with cookie consent); never deleted.",
    fields: {
      id: "Event id.",
      session_id: "The survey session.",
      q_id: "The question's id as the survey uses it (frontend_qid).",
      chapter: "The survey chapter.",
      question_index: "Position of the question in this run.",
      time_spent_ms: "Milliseconds on the question.",
      answered: "Answered before moving on.",
      direction: "forward, back, abandon (left the survey) or complete.",
      event_time: "When it happened, by the browser's clock.",
      created_at: "When we stored it.",
    },
  },
  funnel_event: {
    table:
      "Visits and the first survey steps, one row per browser, day and step. unique_visitor and survey_page_view are written by our server for everyone; the survey start and the intro's cards are sent by the browser after the cookie banner.",
    fields: {
      visitor_id:
        "A browser's id for one day: a new one every day, so a returning person counts once per day.",
      day: "The day, in Berlin time.",
      event_type: `unique_visitor, survey_page_view, survey_engine_mount (the survey opened), intro_slide_1 to intro_slide_4, prepaid_gate_viewed, prepaid_checkout_started; from ${TRACKING_DAY} also intro_view and consent_view (the intro and the consent shown), intro_back_1 to intro_back_4 and consent_back (went back from it) and intro_skip_1 to intro_skip_4 (Skip Intro on that slide).`,
      first_seen: "First time that day.",
      utm_source:
        "The visit's utm_source tag: most ad clicks carry none, so it undercounts Google.",
      landing_variant: "The landing page test arm shown (recorded from 14 Jun 2026).",
    },
  },
  analytics_event: {
    table:
      "What readers do in their report, written by our server: opens, the intro wizard, prices and the paywall, checkout, scrolling, shares and chapter feedback. Not consent-gated since 18 Sep 2026.",
    fields: {
      id: "Event id.",
      event_time: "When it happened.",
      event_type:
        "What happened, such as report_viewed, wizard_slide_advanced, price_shown, paywall_initiated, begin_checkout, scroll_depth_50.",
      session_id: "The report visit, in report_session.",
      user_id: "The reader.",
      entity_type: "What the event is about.",
      entity_id: "Its id.",
      personal_report_id: "The report.",
      survey_submission_id: "The reader's finished survey.",
      duration_ms: "Time spent, for events that measure one.",
      metadata: "Details: the chapter, the slide, the price, the landing arm.",
    },
  },
  payment: {
    table:
      "One row per Stripe checkout for a report. A sale is succeeded, not a test, and over €0; a €0 payment is a gifted unlock.",
    fields: {
      id: "Payment id.",
      user_id: "The buyer.",
      personal_report_id: "The report it unlocks.",
      stripe_payment_intent_id: "Stripe's payment id.",
      stripe_charge_id: "Stripe's charge id.",
      stripe_customer_id: "Stripe's customer id.",
      stripe_payment_method_id: "Stripe's payment method id.",
      amount: "Amount charged, in euros.",
      currency: "Always EUR.",
      status: "succeeded (paid) or canceled (checkout not completed).",
      payment_method_type: "card or link (Stripe Link); empty on older rows.",
      card_brand: "Visa, Mastercard and so on.",
      description: "Stripe's description of the charge.",
      refund_amount: "Amount refunded.",
      refund_reason: "Why it was refunded.",
      refunded_at: "When it was refunded.",
      metadata: "Plan, price arm, promo code and its email, device, landing arm.",
      failure_code: "Stripe's code when a payment failed.",
      failure_message: "The bank's reason.",
      user_agent: "The buyer's browser.",
      payment_date_time: "When it was paid.",
      created_date_time: "When checkout started.",
      updated_date_time: "Last change to the row.",
      pricing_quote_id: "The price the buyer saw, in report_price_quote.",
    },
  },
  report_price_quote: {
    table:
      "The price each reader was quoted, per plan, and the multipliers that produced it. Prices are per visitor, so this is what we charge.",
    fields: {
      id: "Quote id.",
      personal_report_id: "The report.",
      survey_submission_id: "The reader's finished survey.",
      user_id: "The reader.",
      plan: "full_report or all_reports; essentials and core are retired plans.",
      currency: "Always EUR.",
      experiment_group:
        "The price list the quote is on now: A3 or B3 (Pricing 3.0, from 6 Oct 2026); A or B before. A re-sync moves unpaid quotes to the new lists, so the list a quote was first shown is in report_price_quote_arm_history.",
      base_price: "The list price before multipliers.",
      country_tier: "tier_1 to tier_5, or default.",
      country_multiplier: "Multiplier for the country tier.",
      device_type: "iOS, Android or Desktop.",
      device_multiplier: "Multiplier for the device.",
      traffic_source: "direct, google, other, newsletter or instagram.",
      traffic_multiplier: "Multiplier for the traffic source.",
      engagement_score: "How engaged the reader was, as pricing scores it.",
      initial_price: "The price first shown.",
      current_price: "The price shown now, after any discount steps.",
      discount_step: "Discount steps taken.",
      view_count: "How often the price was viewed.",
      checkout_started_at: "When checkout was opened.",
      purchased_at: "When the quote became a sale.",
      metadata: "The nurture emails sent and their promo codes, among other details.",
      msrp: "The struck-through price.",
      forced_paywall_arm: "Arm of the retired forced-paywall test.",
      created_date_time: "When the price was first quoted.",
    },
  },
  report_section_feedback: {
    table:
      "A reader's thumbs up or down on a report chapter, with a reason and an optional comment.",
    fields: {
      id: "Feedback id.",
      session_id: "The report visit.",
      section_id: "The chapter.",
      feedback: "up or down.",
      comment: "The comment as typed: free text, so a name can remain.",
      issue: "The reason given with a down vote: inaccurate, incomplete or other.",
      created_at: "When it was given.",
      updated_at: "Last change.",
      survey_submission_id: "The reader's finished survey.",
      user_id: "The reader.",
      personal_report_id: "The report.",
    },
  },
  personal_report: {
    table:
      "One report per finished survey: its link, whether it was bought, and the archetypes it unlocks.",
    fields: {
      id: "Report id.",
      report_id: "The report template.",
      survey_submission_id: "The finished survey.",
      url: "The reader's private link.",
      status: "Always generated.",
      payment_status: "succeeded, canceled, or empty when no checkout was started.",
      payment_id: "The payment.",
      price: "Price at checkout.",
      unlocked_archetypes: "Archetypes unlocked, by a purchase or a gift.",
      created_date_time: "When the report was made.",
    },
  },
  report_session: {
    table:
      "One row per report visit. The end is recorded from 18 Sep 2026, for about half the visits.",
    fields: {
      id: "Visit id.",
      personal_report_id: "The report.",
      user_id: "The reader.",
      started_at: "When the report was opened.",
      ended_at: "When it was left, if recorded.",
      utm_tracker: "Tags of the visit: email links carry utm_campaign.",
      user_agent: "The reader's browser.",
    },
  },
  app_user: {
    table: "One row per person who finished a survey.",
    fields: {
      id: "Person id.",
      email: "Email address.",
      user_profile_id: "Demographics, in user_profile.",
      created_date_time: "When the person was first stored.",
      auth_user_id: "Unused (always empty).",
      processing_restricted_at:
        "Set when the person asked us to restrict processing (GDPR Art. 18).",
    },
  },
  user_profile: {
    table: "Demographics from the survey: gender, orientation, relationship, country.",
    fields: {
      gender: "Gender.",
      sexual_orientation: "Sexual orientation.",
      relationship_status: "Relationship status.",
      location_primary: "Country.",
      birthday: "Unused (always empty): age is the answer to question 15003.",
      password_hash: "Unused (always empty).",
    },
  },
  marketing_spend: {
    table:
      "Ad spend entered by hand, per day and channel. Empty: spend comes from Google Ads through Google Analytics.",
    fields: {},
  },
};
