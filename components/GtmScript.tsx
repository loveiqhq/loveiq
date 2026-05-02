"use client";

import Script from "next/script";

const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID;

/**
 * Google Tag Manager inline script.
 * Renders only when NEXT_PUBLIC_GTM_ID is set.
 * Place in <head> — nonce is passed as a prop (not from context)
 * because this renders outside the NonceProvider.
 */
export function GtmScript({ nonce }: { nonce: string }) {
  if (!GTM_ID) return null;

  return (
    <Script id="gtm" strategy="afterInteractive" nonce={nonce}>
      {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`}
    </Script>
  );
}

/**
 * GTM noscript fallback iframe. Place at the top of <body>.
 * Renders only when NEXT_PUBLIC_GTM_ID is set.
 */
export function GtmNoScript() {
  if (!GTM_ID) return null;

  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
        height="0"
        width="0"
        style={{ display: "none", visibility: "hidden" }}
      />
    </noscript>
  );
}
