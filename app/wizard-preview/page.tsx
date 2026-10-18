// STAGING-ONLY preview route: the pre-report wizard on its own page, so the team can
// check it on a phone and on a desktop without finishing a survey first (Mark, sync
// 01.10: "an individual staging link just for the wizard"). In the real flow it only
// appears after the survey's submit.
//
// 404s on production. isNonProdDeploy() treats an unknown site URL as production, so a
// misconfigured build closes the page rather than opening it.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isNonProdDeploy } from "@shared/env/is-non-prod-deploy";
import WizardPreviewClient from "./WizardPreviewClient";

export const metadata: Metadata = {
  title: "Wizard preview",
  robots: { index: false, follow: false },
};

export default async function WizardPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string | string[] }>;
}) {
  if (!isNonProdDeploy()) notFound();
  // ?variant=pay_to_start shows the four slides a reader who paid before the survey gets.
  const { variant } = await searchParams;
  return <WizardPreviewClient variant={variant === "pay_to_start" ? "pay_to_start" : "standard"} />;
}
