import type { Metadata } from "next";
import { getPayToStartOffer } from "@features/pay-to-start/server/offer";
import { formatOfferPrice, offerDefinitionOf } from "@features/pay-to-start/logic/offer";
import { PtsCheckoutProvider } from "@features/pay-to-start/ui/landing/PtsCheckout";
import { isStatusPreview } from "@features/pay-to-start/logic/statusPreview";
import { PayToStartStatusPage } from "@features/pay-to-start/ui/status/PayToStartStatusPage";
import { isNonProdDeploy } from "@shared/env/is-non-prod-deploy";

/**
 * Where Stripe sends a pay-to-start buyer back (the session's success_url). Per buyer,
 * so out of the index. "Start checkout again" and the way back are the offer's own, at
 * the price its page would show: `?offer=pre` for the initial report (statusOfferQuery),
 * the full report without it.
 *
 * Off production (local, staging, previews), `?preview=<state>` shows any status without a
 * payment, as `/wizard-preview` does for the wizard. Decided here, on the server: the live
 * site ignores the parameter.
 */
export const metadata: Metadata = {
  title: "Checkout status | LoveIQ",
  robots: { index: false, follow: false },
};

interface Props {
  searchParams: Promise<{ preview?: string | string[]; offer?: string | string[] }>;
}

export default async function PayToStartCheckoutStatusPage({ searchParams }: Props) {
  const { preview, offer: offerParam } = await searchParams;
  const offer = getPayToStartOffer(offerDefinitionOf(offerParam).id);
  return (
    <PtsCheckoutProvider
      offer={offer.id}
      priceCents={offer.priceCents}
      price={formatOfferPrice(offer.priceCents)}
    >
      <PayToStartStatusPage
        preview={isNonProdDeploy() && isStatusPreview(preview) ? preview : null}
      />
    </PtsCheckoutProvider>
  );
}
