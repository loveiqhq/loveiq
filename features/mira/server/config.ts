/**
 * Mira's fixed numbers, in one place. The calls behind them (Eman delegated them on 18 Nov
 * 2026, after the AI Mira Synch of 17 Nov and Marcus's canvas):
 *
 * - FREE CONVERSATIONS. Marcus's board 01b and his canvas comment: a free account is asked for
 *   "after 10 conversations" (the call had floated "after two or three response cycles"). A
 *   conversation is one chat; the card shows when an anonymous person starts an 11th. One
 *   number, so it can move.
 * - DAILY MESSAGES. Free in the beta, so a daily cap per person (and per network for anonymous
 *   chats) keeps cost and abuse in check; it never applies to a crisis message.
 * - MODEL. Sanjin's coach config (09, "RFD" 18 Nov): Claude Sonnet as the main model and Claude
 *   Haiku when it is down, through MIRA_LLM_KEY. MIRA_LLM_MODEL and MIRA_LLM_FALLBACK_MODEL swap
 *   them without a deploy. Low effort: a chat reply is short and the person is waiting. The board
 *   also asks for EU-only processing, which Anthropic's own API doesn't offer (that needs Google
 *   Cloud or Amazon Bedrock in the EU): open, with the key decision.
 */
export const ANON_FREE_CONVERSATIONS = 10;
export const DAILY_MESSAGES = 50;

/** One message, as typed. Longer is refused, not cut, so nothing is silently lost. */
export const MAX_MESSAGE_CHARS = 2000;

/** Turns sent back to the model with each message (the newest ones). */
export const HISTORY_TURNS = 24;

/** Bumped whenever the consent wording on the chat or the sign-up changes. */
export const CONSENT_VERSION = "mira-2026-11-18";

export const DEFAULT_MODEL = "claude-sonnet-5-5";
export const DEFAULT_FALLBACK_MODEL = "claude-haiku-5-5";
export const MODEL_EFFORT = "low";
export const MODEL_MAX_TOKENS = 2000;

/** The cookie holding a signed-in Mira session; separate from the admin and Jarvis sign-in. */
export const MIRA_AUTH_COOKIE = "mira-auth";

/** A random browser id: counts free conversations and links anonymous events, nothing else. */
export const ANON_COOKIE = "mira_anon";
