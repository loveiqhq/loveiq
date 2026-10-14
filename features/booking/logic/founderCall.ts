/**
 * The booking page behind the founder-call offer: a Google Calendar appointment
 * schedule on Mark and Marcus's calendars, which hands the reader a Google Meet link
 * (Mark, #all-loveiq 08.10: "We then connect a Google Meet Link to our calendars for
 * them to book directly").
 *
 * Read from `NEXT_PUBLIC_FOUNDER_CALL_URL` at call time, by its literal name, so Next
 * inlines it into the client bundle. Unset, blank or not a Google booking page means
 * the offer is OFF: a misconfigured link must hide the pop-up, never send readers to a
 * page we did not mean. Only https on Google's two booking hosts passes.
 */
const BOOKING_HOSTS = new Set(["calendar.app.google", "calendar.google.com"]);

export function getFounderCallUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_FOUNDER_CALL_URL?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (!BOOKING_HOSTS.has(url.hostname)) return null;
  return url.toString();
}
