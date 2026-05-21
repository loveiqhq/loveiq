import type { Metadata } from "next";
import CheckoutReturnPage from "@features/checkout/ui/CheckoutReturnPage";
import {
  DEFAULT_REPORT_PURCHASE_PLAN_ID,
  isReportAccessToken,
  isReportPurchasePlanId,
} from "@features/checkout/server/reportPurchase";
import { fromArchetypeSlug } from "@features/report/server/archetypeSlug";

export const metadata: Metadata = {
  title: "Checkout Status | LoveIQ",
  description: "Status page for your LoveIQ checkout session.",
  robots: { index: false, follow: false },
};

interface Props {
  searchParams: Promise<{
    archetype?: string;
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
  const archetype = planId === "full_report" ? fromArchetypeSlug(params.archetype) : null;

  return (
    <CheckoutReturnPage
      archetype={archetype}
      planId={planId}
      sessionId={params.session_id ?? null}
      token={token}
    />
  );
}
