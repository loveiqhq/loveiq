/**
 * Mira's fixed numbers, in one place. The calls behind them (Eman delegated them on 18 Nov
 * 2026, after the AI Mira Synch of 17 Nov and Marcus's canvas):
 *
 * - FREE MESSAGES. Marcus's board 01b asked for a free account "after 10 conversations"; the
 *   team moved it to 10 messages on 20 Nov 2026, and Eman to ONE on 21 Nov ("lets do it after
 *   one message", after Mark's canvas note "after 1-2 messages ask for a sign in"). An anonymous
 *   browser may send one (counted per browser id over 30 days; a crisis message is never
 *   counted); the reply to it brings the sign-up card and the next needs a free account.
 * - DAILY MESSAGES. Free in the beta, so a daily cap per person (and per network for anonymous
 *   chats) keeps cost and abuse in check; it never applies to a crisis message.
 * - MODEL. Sanjin's coach config (09, "RFD" 18 Nov): Claude Sonnet as the main model and Claude
 *   Haiku when it is down, through MIRA_LLM_KEY. MIRA_LLM_MODEL and MIRA_LLM_FALLBACK_MODEL swap
 *   them without a deploy. Low effort: a chat reply is short and the person is waiting. The board
 *   also asks for EU-only processing, which Anthropic's own API doesn't offer (that needs Google
 *   Cloud or Amazon Bedrock in the EU): open, with the key decision.
 */
export const ANON_FREE_MESSAGES = 1;
export const DAILY_MESSAGES = 50;

/**
 * Every cap above is per browser, network or account; this one is everyone's together, so a busy
 * or abusive day can't spend the month's API budget ($500, about $16 a day; a message costs
 * roughly $0.01 to $0.06). It counts model calls only: a crisis message is never counted or stopped.
 */
export const GLOBAL_DAILY_MESSAGES = 800;

/** One message, as typed. Longer is refused, not cut, so nothing is silently lost. */
export const MAX_MESSAGE_CHARS = 2000;

/** Turns sent back to the model with each message (the newest ones). */
export const HISTORY_TURNS = 24;

/**
 * Bumped whenever the consent wording on the chat or the sign-up changes: a browser that ticked
 * an older version is asked again. Pure constants, so the chat page imports this file too.
 */
export const CONSENT_VERSION = "mira-2026-11-21";

export const DEFAULT_MODEL = "claude-sonnet-5-5";
export const DEFAULT_FALLBACK_MODEL = "claude-haiku-5-5";
export const MODEL_EFFORT = "low";
export const MODEL_MAX_TOKENS = 2000;

/**
 * The model's time, inside the chat route's 75 s (its maxDuration): the main model gets at most
 * 30 s, the fallback whatever is left of 50 s, so a hung main model still leaves the fallback 20 s
 * and the route time to store and answer. A low-effort reply of at most 250 words takes seconds.
 */
export const MODEL_FIRST_TRY_MS = 30_000;
export const MODEL_BUDGET_MS = 50_000;

/** The cookie holding a signed-in Mira session; separate from the admin and Jarvis sign-in. */
export const MIRA_AUTH_COOKIE = "mira-auth";

/** A random browser id: counts free messages and links anonymous events, nothing else. */
export const ANON_COOKIE = "mira_anon";

/** Set once a person in this browser said they are under 18 (rail 15, server/minor.ts). */
export const MINOR_COOKIE = "mira_minor";
/**
 * Where the visit came from (server/attribution.ts): the header every Mira call carries, and the
 * cookie Google sign-in's link leaves for the Google routes. Here because both sides use them.
 */
export const SOURCE_HEADER = "x-mira-source";
export const SOURCE_COOKIE = "mira_source";
