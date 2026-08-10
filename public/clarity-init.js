/*
 * Microsoft Clarity bootstrap (session replay + heatmaps).
 *
 * Lives in public/ rather than inline in app/layout.tsx on purpose. CookieYes
 * only reliably withholds a script when it is marked type="text/plain"
 * (verified on production: Contentsquare, marked that way, makes zero requests
 * pre-consent, while Hotjar — loaded via next/script with only a data-cookieyes
 * attribute — fetches its tag before the banner is touched). React escapes
 * quote characters in inline <script> children, and the repo's CI gate rejects
 * dangerouslySetInnerHTML, so an external file is the way to get a text/plain
 * tag whose body survives intact.
 *
 * The project id is a public, non-secret vendor identifier, hardcoded the same
 * way the GA4 measurement id is in app/layout.tsx. Recording is switched off
 * from the Clarity dashboard or by removing the tag from the layout.
 *
 * Body below is Microsoft's official snippet, unmodified. It must run before
 * https://www.clarity.ms/tag/<id> — that tag calls window.clarity() and reads
 * window.clarity.q, so it throws without this queue stub in place.
 */
(function (c, l, a, r, i, t, y) {
  c[a] =
    c[a] ||
    function () {
      (c[a].q = c[a].q || []).push(arguments);
    };
  t = l.createElement(r);
  t.async = 1;
  t.src = "https://www.clarity.ms/tag/" + i;
  y = l.getElementsByTagName(r)[0];
  y.parentNode.insertBefore(t, y);
})(window, document, "clarity", "script", "y05pfq0fpn");
