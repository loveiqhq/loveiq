import { EXIT_LEAVE_PARAM, type ExitStage } from "./exitContent";

/**
 * The exit pages live on the report's own URL, `?leave=pre` / `?leave=full`, on a history
 * entry of their own: the phone's Back closes them, and a reload (or Back from Stripe) opens
 * them again.
 *
 * Not `router.push`: to the same path it fetches the page from the server again and scrolls
 * to the top. A native pushState does neither, and Next syncs `useSearchParams` from it, as
 * long as the state is ours: given its own state object back (with its marker, as the
 * `?anchor` / `?unlocked` cleanup does), Next skips the sync and the page would never see the
 * change. So the URL is built from `window.location` rather than `useSearchParams`, which can
 * still hold an `anchor` or `unlocked` that cleanup removed.
 */
const EXIT_STATE_KEY = "__loveiqExit";

/** The current URL with `?leave=` set (or removed), without the anchor and unlock markers. */
export function exitUrl(stage: ExitStage | null, href: string = window.location.href): string {
  const url = new URL(href);
  url.searchParams.delete("anchor");
  url.searchParams.delete("unlocked");
  if (stage) url.searchParams.set(EXIT_LEAVE_PARAM, stage);
  else url.searchParams.delete(EXIT_LEAVE_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** How long a swap between the gate and an exit page swallows taps (shieldTaps). */
export const TAP_SHIELD_MS = 400;

/**
 * A double tap's second tap lands on whatever has just replaced the page under the finger:
 * opening, the exit page's back arrow (it sits where "Not ready to unlock yet" was), which
 * bounced the reader straight back; closing, a second step back off the report itself (to the
 * page before it, measured on Chrome) or the gate's Unlock (Safari). For a moment after either
 * swap a clear layer over the whole screen takes the taps instead. Keys go through.
 */
function shieldTaps(): void {
  const shield = document.createElement("div");
  shield.setAttribute("aria-hidden", "true");
  shield.dataset.exitTapShield = "";
  shield.style.cssText = "position:fixed;inset:0;z-index:2147483647;";
  document.body.appendChild(shield);
  window.setTimeout(() => shield.remove(), TAP_SHIELD_MS);
}

/**
 * Opens an exit page on an entry of its own, once: a second tap before the page has drawn
 * (a double tap, a slow phone) would push a second entry, and the first "Maybe later" would
 * then seem to do nothing.
 */
export function openExit(stage: ExitStage): void {
  if (window.history.state?.[EXIT_STATE_KEY] === stage) return;
  window.history.pushState({ [EXIT_STATE_KEY]: stage }, "", exitUrl(stage));
  shieldTaps();
}

/**
 * Leaves an exit page: back off the entry it opened, or, when there is none to step back off
 * (it was opened by a reload or a link), the parameter is dropped in place.
 */
export function closeExit(): void {
  shieldTaps();
  if (window.history.state?.[EXIT_STATE_KEY]) window.history.back();
  else dropExitParam();
}

/**
 * A `?leave=` the reader can no longer use (bought since, or not theirs): removed in place,
 * never by stepping back, which could leave the report.
 */
export function dropExitParam(): void {
  window.history.replaceState({ [EXIT_STATE_KEY]: null }, "", exitUrl(null));
}
