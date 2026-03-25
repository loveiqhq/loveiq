"use client";

import { useState } from "react";
import { getStoredUtm, LEGACY_UTM_KEY } from "@/lib/utm";

/**
 * Legacy storage key — kept for backward compatibility.
 * Used by useSurveyState.ts clearState() to clean up on survey reset.
 */
export const UTM_STORAGE_KEY = LEGACY_UTM_KEY;

/**
 * Hook that returns the stored UTM tracker JSON string (or null).
 * The global `<UtmCapture />` component in root layout handles capturing
 * UTM params from the URL on every page load. This hook simply reads
 * whatever was stored.
 */
export function useUtmCapture(): string | null {
  const [utmTracker] = useState(getStoredUtm);
  return utmTracker;
}
