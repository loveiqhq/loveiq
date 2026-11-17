"use client";

import { useSyncExternalStore } from "react";

/**
 * The "N people are taking the test right now" number on the landing pages: a plausible
 * band, drawn once per page load. The server renders a fixed number (so hydration matches)
 * and the client swaps in the drawn one, without a setState-in-effect and its extra render.
 * Its source is an open question with Marcus (SEO/GEO phase 1: the live figures need one).
 */
const CONCURRENT_MIN = 70;
const CONCURRENT_MAX = 100;
const CONCURRENT_SSR = 84;

// Drawn once per page load, so the snapshot below is referentially stable.
const CONCURRENT_CLIENT =
  CONCURRENT_MIN + Math.floor(Math.random() * (CONCURRENT_MAX - CONCURRENT_MIN + 1));

const subscribeNoop = () => () => {};

export function useLiveTakers(): number {
  return useSyncExternalStore(
    subscribeNoop,
    () => CONCURRENT_CLIENT,
    () => CONCURRENT_SSR
  );
}
