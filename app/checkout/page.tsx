import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getReportReturnHref, isReportAccessToken } from "@features/checkout/server/reportPurchase";

export const metadata: Metadata = {
  title: "Checkout | LoveIQ",
  robots: { index: false, follow: false },
};

interface Props {
  searchParams: Promise<{ token?: string }>;
}

/**
 * Nothing renders here any more.
 *
 * This used to be the order-review page between the report and Stripe. It was
 * removed on 2026-08-31 — the reader now goes straight from the unlock click to
 * Stripe Checkout — but the ROUTE has to survive, because Stripe bakes a
 * `cancel_url` into every session at creation time. Sessions already in flight
 * when this shipped still carry `/checkout?...`, and a session lives up to 24
 * hours, so deleting the route would 404 anyone who pressed "back" on Stripe
 * during that window. Old links from anywhere else land here too.
 *
 * Safe to delete once no live Stripe session can still point at it, i.e. more
 * than a day after this is in production.
 */
export default async function Page({ searchParams }: Props) {
  const { token: rawToken } = await searchParams;
  redirect(getReportReturnHref(isReportAccessToken(rawToken) ? rawToken : null));
}
