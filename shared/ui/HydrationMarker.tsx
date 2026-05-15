"use client";

import { useEffect } from "react";

export default function HydrationMarker() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);
  return null;
}
