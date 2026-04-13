import type { Metadata } from "next";
import CheckoutReturnPage from "@/components/checkout/CheckoutReturnPage";
import {
  DEFAULT_REPORT_PURCHASE_PLAN_ID,
  isReportAccessToken,
  isReportPurchasePlanId,
} from "@/lib/checkout/reportPurchase";

export const metadata: Metadata = {
  title: "Checkout Status | LoveIQ",
  description: "Status page for your LoveIQ checkout session.",
  robots: { index: false, follow: false },
};

interface Props {
  searchParams: Promise<{
    plan?: string;
    session_id?: string;
    token?: string;
  }>;
}

export default async function Page({ searchParams }: Props) {
  const params = await searchParams;
  const planId = isReportPurchasePlanId(params.plan)
    ? params.plan
    : DEFAULT_REPORT_PURCHASE_PLAN_ID;
  const token = isReportAccessToken(params.token) ? params.token : null;

  return <CheckoutReturnPage planId={planId} sessionId={params.session_id ?? null} token={token} />;
}
