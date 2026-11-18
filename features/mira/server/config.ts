/**
 * Mira's fixed numbers, in one place. The calls behind them (Eman delegated them on 18 Nov
 * 2026, after the AI Mira Synch of 17 Nov and Marcus's canvas):
 *
 * - FREE REPLIES. Marcus's board 01b asks for a free account "after 10 conversations"; the
 *   call said "after two or three response cycles". Mira's intake runs right after her first
 *   reply and takes about ten turns, so 10 replies lets an anonymous person finish the intake
 *   and meet the sign-up card just before her personal advice. One number, so it can move.
 * - MODEL. Claude Opus 5.5 on Anthropic's own API, through MIRA_LLM_KEY. EU-only processing is
 *   not a must for the beta (Anthropic runs "global"); MIRA_LLM_MODEL swaps the model without a
 *   deploy. Low effort: a chat reply is short and the person is waiting.
 */
export const ANON_REPLY_LIMIT = 10;

/** One message, as typed. Longer is refused, not cut, so nothing is silently lost. */
export const MAX_MESSAGE_CHARS = 2000;

/** Turns sent back to the model with each message (the newest ones). */
export const HISTORY_TURNS = 24;

/** Bumped whenever the consent wording on the chat or the sign-up changes. */
export const CONSENT_VERSION = "mira-2026-11-18";

export const DEFAULT_MODEL = "claude-opus-5-5";
export const MODEL_EFFORT = "low";
export const MODEL_MAX_TOKENS = 2000;

/** The cookie holding a signed-in Mira session; separate from the admin and Jarvis sign-in. */
export const MIRA_AUTH_COOKIE = "mira-auth";

/** A random browser id: counts free replies and links anonymous events, nothing else. */
export const ANON_COOKIE = "mira_anon";
