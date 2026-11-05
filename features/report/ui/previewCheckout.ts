/**
 * A `?preview=1` report has no report of its own: no token, and its gate, plans and quotes come
 * from static copy (app/api/report/preview, never served in production). Its checkout buttons
 * used to send the browser's own last survey session instead, and Stripe's routes answered for
 * that survey: on staging a 409 reloaded the EUR 1.99 exit page onto itself (sync 29.10). In
 * preview nothing is bought. A button opens the preview its buyer would come back to, as the
 * return from Stripe does: the same page with the plan, and without the gate or an exit page.
 */
const DROPPED = ["gate", "leave", "gift", "anchor", "unlocked"] as const;

export function previewPaidHref(plan: string, href: string = window.location.href): string {
  const url = new URL(href);
  for (const key of DROPPED) url.searchParams.delete(key);
  url.searchParams.set("plan", plan);
  return `${url.pathname}${url.search}${url.hash}`;
}
