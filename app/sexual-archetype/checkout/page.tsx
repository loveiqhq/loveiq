import type { Metadata } from "next";
import { getPayToStartOffer } from "@features/pay-to-start/server/offer";
import { formatOfferPrice } from "@features/pay-to-start/logic/offer";
import { PtsCheckoutProvider } from "@features/pay-to-start/ui/landing/PtsCheckout";
import { isStatusPreview } from "@features/pay-to-start/logic/statusPreview";
import { PayToStartStatusPage } from "@features/pay-to-start/ui/status/PayToStartStatusPage";
import { isNonProdDeploy } from "@shared/env/is-non-prod-deploy";

/**
 * Where Stripe sends a pay-to-start buyer back (the session's success_url). Per buyer,
 * so out of the index. "Start checkout again" is the page's own checkout, at the price
 * the page would show.
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
  searchParams: Promise<{ preview?: string | string[] }>;
}

export default async function PayToStartCheckoutStatusPage({ searchParams }: Props) {
  const { preview } = await searchParams;
  const offer = getPayToStartOffer("full");
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
