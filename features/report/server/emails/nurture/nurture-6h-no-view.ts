import { escapeHtml } from "@shared/emails/shared";
import { renderNurtureEmail } from "./shared";

export interface Nurture6hNoViewParams {
  firstName?: string | null;
  ctaUrl: string;
  siteUrl: string;
  unsubscribeUrl?: string;
}

export function nurture6hNoViewEmail({
  firstName,
  ctaUrl,
  siteUrl,
  unsubscribeUrl,
}: Nurture6hNoViewParams) {
  const safeFirstName = firstName?.trim() ? escapeHtml(firstName.trim()) : "there";
  const subject = "You didn't view your report yet.";
  const previewText = "Most users find their results highly insightful. Take a look at yours.";

  return renderNurtureEmail({
    subject,
    previewText,
    siteUrl,
    unsubscribeUrl,
    body: {
      heading: "Don't miss out on viewing the report you invested time in.",
      intro: [
        `Hi ${safeFirstName},`,
        "",
        "So far, it seems you have not viewed your report yet.",
        "",
        "We highly recommend taking a look, as most users find their results highly insightful.",
      ].join("\n"),
      ctaLabel: "View your report now",
      ctaUrl,
      bullets: [
        { text: "+50 pages of insights into your sexuality" },
        { text: "Results based on 100+ science papers" },
        {
          text: "30+ chapters on your fantasies, arousal, desire patterns, and intimacy style",
        },
        {
          text: "Personalized growth paths to better understand your needs, boundaries, and sex life",
        },
        {
          text: "Share access with up to 2 extra emails, so you can open deeper conversations with a partner or someone close to you",
        },
      ],
      closingNote: "Curious minds tend to get the most out of this.",
    },
  });
}
