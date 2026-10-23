/**
 * The hourly send takes only reports created from this moment on. An older report is reached
 * only by an admin's tranche on AP-Analytics (server/send.ts), by the same rules.
 */
export const UNLOCK_FEEDBACK_FROM = "2026-10-20T00:00:00Z";
