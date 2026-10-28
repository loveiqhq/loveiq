// STAGING-ONLY preview route: the pre-report wizard on its own page, so the team can
// check it on a phone and on a desktop without finishing a survey first (Mark, sync
// 01.10: "an individual staging link just for the wizard"). In the real flow it only
// appears after the survey's submit.
//
// 404s on production. isNonProdDeploy() treats an unknown site URL as production, so a
// misconfigured build closes the page rather than opening it.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { INITIAL_UNLOCK_PRICE_CENTS } from "@features/report/logic/initialUnlockGate";
import { isNonProdDeploy } from "@shared/env/is-non-prod-deploy";
import WizardPreviewClient from "./WizardPreviewClient";

export const metadata: Metadata = {
  title: "Wizard preview",
  robots: { index: false, follow: false },
};

export default async function WizardPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string | string[]; gate?: string | string[] }>;
}) {
  if (!isNonProdDeploy()) notFound();
  // ?variant=pay_to_start shows the four slides the full report's buyer gets before the
  // report, ?variant=pay_to_start_initial the five the initial report's buyer gets, and
  // ?gate=1 the map a reader the EUR 1.99 gate will stop reads, with its price.
  const { variant, gate } = await searchParams;
  return (
    <WizardPreviewClient
      variant={
        variant === "pay_to_start" || variant === "pay_to_start_initial" ? variant : "standard"
      }
      gatePriceCents={gate === "1" ? INITIAL_UNLOCK_PRICE_CENTS : null}
    />
  );
}
