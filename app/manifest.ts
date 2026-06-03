import type { MetadataRoute } from "next";

// Web App Manifest — invisible to the rendered page (Next injects only a
// <link rel="manifest">). Provides the canonical app name, description, brand
// colors, and icons for search engines, social/AI cards, and add-to-home-screen.
// No service worker exists, so this never triggers an install prompt → no UI change.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LoveIQ — Science-backed sexual psychology assessment",
    short_name: "LoveIQ",
    description:
      "Take LoveIQ's science-backed sexual psychology assessment to understand your desires, attachment patterns, and intimacy styles.",
    start_url: "/",
    scope: "/",
    // "browser" (not "standalone") intentionally: standalone/minimal-ui/fullscreen
    // make Chrome 108+/112+ surface an "Install app" affordance in the address bar
    // even without a service worker. We want the manifest's SEO/branding metadata
    // (name, description, icons, theme) with zero visible browser-UI change.
    display: "browser",
    background_color: "#0b0613",
    theme_color: "#0b0613",
    categories: ["health", "lifestyle", "education"],
    icons: [
      {
        src: "/images/loveiq-mark-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
