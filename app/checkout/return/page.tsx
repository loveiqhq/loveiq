import type { Metadata } from "next";
import CheckoutReturnPage from "@features/checkout/ui/CheckoutReturnPage";
import {
  DEFAULT_REPORT_PURCHASE_PLAN_ID,
  isReportAccessToken,
  isReportPurchasePlanId,
  UNLOCK_ANCHOR_REGEX,
} from "@features/checkout/server/reportPurchase";
import { fromArchetypeSlug } from "@features/report/server/archetypeSlug";
import { INITIAL_UNLOCK_PLAN, isInitialUnlockPlan } from "@features/report/logic/initialUnlock";

export const metadata: Metadata = {
  title: "Checkout Status | LoveIQ",
  description: "Status page for your LoveIQ checkout session.",
  robots: { index: false, follow: false },
};

interface Props {
  searchParams: Promise<{
    anchor?: string;
    archetype?: string;
    plan?: string;
    session_id?: string;
    token?: string;
  }>;
}

export default async function Page({ searchParams }: Props) {
  const params = await searchParams;
  // `initial`: the EUR 1.99 Core Archetype from the pre-unlock gate (initialUnlock.ts).
  const planId = isInitialUnlockPlan(params.plan)
    ? INITIAL_UNLOCK_PLAN
    : isReportPurchasePlanId(params.plan)
      ? params.plan
      : DEFAULT_REPORT_PURCHASE_PLAN_ID;
  const token = isReportAccessToken(params.token) ? params.token : null;
  const archetype = planId === "full_report" ? fromArchetypeSlug(params.archetype) : null;
  const anchor =
    typeof params.anchor === "string" && UNLOCK_ANCHOR_REGEX.test(params.anchor)
      ? params.anchor
      : null;

  return (
    <CheckoutReturnPage
      anchor={anchor}
      archetype={archetype}
      planId={planId}
      sessionId={params.session_id ?? null}
      token={token}
    />
  );
}
