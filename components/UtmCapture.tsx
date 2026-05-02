"use client";

import { useEffect } from "react";
import { captureUtmFromUrl } from "@/lib/utm";

/**
 * Invisible client component that captures UTM parameters from the URL
 * on every page load and persists them in localStorage.
 * Rendered once in the root layout so all pages benefit.
 */
export default function UtmCapture() {
  useEffect(() => {
    captureUtmFromUrl();
  }, []);
  return null;
}
