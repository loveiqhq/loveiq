import type { Metadata } from "next";
import { getPayToStartOffer } from "@features/pay-to-start/server/offer";
import { formatOfferPrice } from "@features/pay-to-start/logic/offer";
import { PtsCheckoutProvider } from "@features/pay-to-start/ui/landing/PtsCheckout";
import { PayToStartStatusPage } from "@features/pay-to-start/ui/status/PayToStartStatusPage";

/**
 * Where Stripe sends a pay-to-start buyer back (the session's success_url). Per buyer,
 * so out of the index. "Start checkout again" is the page's own checkout, at the price
 * the page would show.
 */
export const metadata: Metadata = {
  title: "Checkout status | Facets",
  robots: { index: false, follow: false },
};

export default function PayToStartCheckoutStatusPage() {
  const offer = getPayToStartOffer("full");
  return (
    <PtsCheckoutProvider
      offer={offer.id}
      priceCents={offer.priceCents}
      price={formatOfferPrice(offer.priceCents)}
    >
      <PayToStartStatusPage />
    </PtsCheckoutProvider>
  );
}
