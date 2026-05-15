"use client";

import { useEffect } from "react";
import { onCLS, onFCP, onINP, onLCP, onTTFB } from "web-vitals";
import { track } from "@features/analytics/client";

function sendToGA4(name: string, value: number, id: string, rating: string) {
  track("web_vitals", {
    event_category: "Web Vitals",
    event_label: id,
    metric_name: name,
    metric_value: Math.round(name === "CLS" ? value * 1000 : value),
    metric_rating: rating,
    non_interaction: true,
  });
}

export default function WebVitals() {
  useEffect(() => {
    onCLS((m) => sendToGA4(m.name, m.value, m.id, m.rating));
    onFCP((m) => sendToGA4(m.name, m.value, m.id, m.rating));
    onINP((m) => sendToGA4(m.name, m.value, m.id, m.rating));
    onLCP((m) => sendToGA4(m.name, m.value, m.id, m.rating));
    onTTFB((m) => sendToGA4(m.name, m.value, m.id, m.rating));
  }, []);

  return null;
}
