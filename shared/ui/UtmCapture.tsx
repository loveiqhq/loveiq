"use client";

import { useEffect } from "react";
import { captureUtmFromUrl, rememberLandingPath } from "@shared/url/utm";

/**
 * Invisible client component that captures UTM parameters from the URL
 * on every page load and persists them in localStorage, with the first page
 * this browser ever opened on the site.
 * Rendered once in the root layout so all pages benefit.
 */
export default function UtmCapture() {
  useEffect(() => {
    rememberLandingPath();
    captureUtmFromUrl();
  }, []);
  return null;
}
