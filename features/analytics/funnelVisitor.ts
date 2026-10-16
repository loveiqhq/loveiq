import { readCookie } from "@shared/observability/cookie";

/**
 * Who a funnel ping is from (funnel_event, keyed by visitor and day): the visitor cookie, set
 * once the cookie banner's analytics consent is given, or, without it, an id for this page
 * alone, held in memory and never stored on the device, so every visitor's steps are recorded
 * (first-party measurement on legitimate interest, as analytics_event is). Fixed at the first
 * ping, so a banner accepted mid-page does not split one visitor's steps; a reload without
 * the cookie is a new id.
 *
 * Kept here, outside client.ts, so the hand-written mocks of the client keep working.
 */
let funnelId: string | null = null;

/** A random UUID (v4), also where `crypto.randomUUID` is missing (iOS Safari before 15.4). */
function randomId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function funnelVisitorId(): string {
  funnelId ??= readCookie("__Host-liq_vid") || readCookie("__liq_vid") || randomId();
  return funnelId;
}

/** For tests: a new page. */
export const __resetFunnelVisitorForTests = () => {
  funnelId = null;
};
