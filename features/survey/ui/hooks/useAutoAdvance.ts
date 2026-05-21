"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "loveiq-survey-autoadvance";

export function useAutoAdvance() {
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(enabled));
    } catch {
      // Storage full or blocked
    }
  }, [enabled]);

  const toggle = useCallback(() => {
    setEnabled((prev) => !prev);
  }, []);

  return { autoAdvance: enabled, toggleAutoAdvance: toggle } as const;
}
