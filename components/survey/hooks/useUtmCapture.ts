"use client";

import { useState } from "react";

export const UTM_STORAGE_KEY = "loveiq-survey-utm";
const UTM_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;

function captureUtm(): string | null {
  if (typeof window === "undefined") return null;

  // Try to extract UTM params from the current URL
  const params = new URLSearchParams(window.location.search);
  const utm: Record<string, string> = {};

  for (const key of UTM_PARAMS) {
    const value = params.get(key);
    if (value) utm[key] = value;
  }

  if (Object.keys(utm).length > 0) {
    // Found UTM params in URL — persist to localStorage
    const json = JSON.stringify(utm);
    try {
      localStorage.setItem(UTM_STORAGE_KEY, json);
    } catch {
      // Storage full — continue with in-memory value
    }
    return json;
  }

  // No UTM params in URL — check localStorage (user may have refreshed)
  try {
    return localStorage.getItem(UTM_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function useUtmCapture(): string | null {
  const [utmTracker] = useState(captureUtm);
  return utmTracker;
}
