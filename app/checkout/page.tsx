import type { Metadata } from "next";
import { redirect } from "next/navigation";
import CheckoutPage from "@/components/checkout/CheckoutPage";
import {
  getReportReturnHref,
  isReportAccessToken,
  isReportPurchasePlanId,
} from "@/lib/checkout/reportPurchase";
import { fromArchetypeSlug } from "@/lib/report/archetypeSlug";

export const metadata: Metadata = {
  title: "Complete Your Order | LoveIQ",
  description: "Secure checkout for unlocking your LoveIQ report.",
  robots: { index: false, follow: false },
};

interface Props {
  searchParams: Promise<{
    archetype?: string;
    plan?: string;
    token?: string;
  }>;
}

export default async function Page({ searchParams }: Props) {
  const { archetype: rawArchetype, plan: rawPlan, token: rawToken } = await searchParams;
  const token = isReportAccessToken(rawToken) ? rawToken : null;

  if (!isReportPurchasePlanId(rawPlan)) {
    redirect(getReportReturnHref(token));
  }

  const archetypeName = fromArchetypeSlug(rawArchetype);
  const archetype = rawPlan === "full_report" ? archetypeName : null;

  return <CheckoutPage planId={rawPlan} token={token} archetype={archetype} />;
}
