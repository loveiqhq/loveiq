import { shortDate } from "@features/admin/server/ap/days";
import { dayLabel } from "../journal";
import { SESSION_OPENING } from "./calendar";
import { localDay } from "./goal-progress";
import { isCrisisMessage } from "./safety";

/**
 * A chat opened by a message that brought the support lines is named by its date, never by those
 * words: "Chat on 22 Nov", in the person's own time zone (round-2 audit CHAT-17, lead decision 5).
 */
export const neutralTitle = (at: Date, timeZone?: string | null) =>
  `Chat on ${shortDate(localDay(at, timeZone ?? "UTC"))}`;

/**
 * The title a chat is shown with (Home, the chat list, search). A weekly session's chat keeps the
 * app's opening line as its stored title, which is how weekly-sessions.ts sessionChat finds it
 * again, and is shown by its date, "Weekly session · Tue 24 Nov" (round-2 audit UX-14). A chat
 * still named after crisis words (from before titles were neutral, or carried in from an
 * anonymous chat at sign-up) is shown by its date too. Dates in the person's own time zone.
 */
export function shownTitle(title: string, created: Date, timeZone?: string | null): string {
  const day = localDay(created, timeZone ?? "UTC");
  if (title === SESSION_OPENING) return `Weekly session · ${dayLabel(day)}`;
  return isCrisisMessage(title) ? `Chat on ${shortDate(day)}` : title;
}
