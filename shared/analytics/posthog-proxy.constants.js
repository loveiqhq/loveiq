/**
 * The same four values as `posthog-proxy.ts`, in CommonJS.
 *
 * `next.config.js` is CommonJS and loads before any TypeScript is compiled, so it cannot
 * import the .ts module. Rather than repeat the literals in two files and hope they stay
 * together, the TS module re-exports nothing and instead BOTH read from here — and
 * `posthog-proxy.test.ts` asserts the TS constants, this file, and the actual rewrite rules
 * all agree. Three copies that are checked beat two copies that are not.
 */
module.exports = {
  POSTHOG_PROXY_PATH: "/relay",
  POSTHOG_UPSTREAM_API: "https://eu.i.posthog.com",
  POSTHOG_UPSTREAM_ASSETS: "https://eu-assets.i.posthog.com",
  POSTHOG_UI_HOST: "https://eu.posthog.com",
};
