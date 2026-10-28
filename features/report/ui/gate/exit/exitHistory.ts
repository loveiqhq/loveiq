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

/** Opens an exit page on an entry of its own. */
export function openExit(stage: ExitStage): void {
  window.history.pushState({ [EXIT_STATE_KEY]: stage }, "", exitUrl(stage));
}

/**
 * Leaves an exit page: back off the entry it opened, or, when there is none to step back off
 * (it was opened by a reload or a link), the parameter is dropped in place.
 */
export function closeExit(): void {
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
