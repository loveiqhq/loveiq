"use client";

import { useEffect } from "react";
import { track } from "./data";

/**
 * Counts a chat opened from the guide's "Ask Mira about this" (guide_ask, the practice's number):
 * rendered by the chat page next to the chat, so the guide itself keeps nothing.
 */
export default function GuideAskCount({ practice }: { practice: number }) {
  useEffect(() => track("guide_ask", String(practice)), [practice]);
  return null;
}
