import {
  EMAIL_FONT,
  buildArchetypeReportUrl,
  escapeHtml,
  renderCtaButton,
  wrapEmailShell,
} from "@/lib/emails/shared";
import { toArchetypeSlug } from "@/lib/report/archetypeSlug";

/**
 * Full Report purchase confirmation — Variant B (Figma node 5316-429).
 * Discovery framing: "Not because it's unusual — because it's yours."
 * Cross-sells the All Reports upgrade.
 * Pair with `reportFullEmail` (variant A) for an A/B test on Stripe success.
 */
export interface ReportFullBEmailParams {
  firstName?: string | null;
  reportUrl: string;
  siteUrl: string;
  unsubscribeUrl?: string;
  unlockedArchetype?: string | null;
}

export function reportFullBEmail({
  firstName,
  reportUrl,
  siteUrl,
  unlockedArchetype,
  unsubscribeUrl,
}: ReportFullBEmailParams) {
  const safeFirstName = firstName?.trim() ? escapeHtml(firstName.trim()) : "there";
  const greetingText = firstName?.trim() || "there";
  const trimmedArchetype = unlockedArchetype?.trim() ?? "";
  const archetypeSlug = trimmedArchetype ? toArchetypeSlug(trimmedArchetype) : null;
  const targetReportUrl = buildArchetypeReportUrl(reportUrl, archetypeSlug);

  const subject = "Something specific came up in your results\u2026";
  const previewText =
    "Your Full Report is inside \u2014 18 dimensions of insight, in your language.";

  const bodyHtml = `
  <tr>
    <td style="padding:24px 32px 8px;">
      <h1 style="margin:0; font-family:${EMAIL_FONT}; font-size:26px; font-weight:600; line-height:1.35; color:#000000; letter-spacing:-0.3px;">
        Not because it&rsquo;s unusual &mdash; because it&rsquo;s yours.
      </h1>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 32px 0;">
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        Hi ${safeFirstName},
      </p>
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        Thank you for trusting us with something this personal. That means a lot to us.
      </p>
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        <strong style="font-weight:700;">Your Full report is inside.</strong>
      </p>
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        It goes further than most people expect. <strong style="font-weight:700;">Eighteen analysed dimensions</strong> &mdash; not just who you are, but how you desire, connect, and grow. <strong style="font-weight:700;">The patterns that are hardest to put into words now have language.</strong> Most people find at least one dimension they didn&rsquo;t see coming.
      </p>
      <p style="margin:0 0 24px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        You can <strong style="font-weight:700;">share this report</strong> with up to two people you trust. Some of the most interesting conversations start here. <strong style="font-weight:700;">Don&rsquo;t let that go to waste.</strong>
      </p>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:8px 32px 24px;">
      ${renderCtaButton({ href: targetReportUrl, label: "See what we found" })}
    </td>
  </tr>
  <tr>
    <td style="padding:8px 32px 8px;">
      <p style="margin:0 0 12px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000; font-weight:700;">
        Why it&rsquo;s worth a look:
      </p>
      <ul style="margin:0 0 16px 0; padding-left:22px; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        <li style="margin:0 0 6px 0;">Built on psychology + real response patterns</li>
        <li style="margin:0 0 6px 0;">18 dimensions of insight you can actually use</li>
        <li style="margin:0 0 6px 0;">Private by design &mdash; your data stays yours</li>
      </ul>
      <p style="margin:16px 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        <strong style="font-weight:700;">Want to go further?</strong> Upgrading to All Reports unlocks all 14 archetypes in full &mdash; alongside every benefit of the Full Report &mdash; and includes <strong style="font-weight:700;">six complimentary months of the LoveIQ Journal on Substack.</strong>
      </p>
      <p style="margin:0 0 24px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        Curious minds tend to get the most out of this.
      </p>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:16px 32px 32px;">
      <p style="margin:0 0 12px 0; font-family:${EMAIL_FONT}; font-size:16px; line-height:1.55; color:#000000; text-align:center;">
        If anything gets in the way &mdash; missing link, expired access, or trouble opening your report &mdash; reach out to us at
        <a href="mailto:hello@loveiq.org" style="color:#1a73e8; text-decoration:underline;">hello@loveiq.org</a>.
      </p>
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:16px; line-height:1.55; color:#000000; text-align:center;">
        We&rsquo;ll get you back in.
      </p>
      <p style="margin:0; font-family:${EMAIL_FONT}; font-size:16px; line-height:1.55; color:#000000; text-align:center;">
        With kindness,<br />Your LoveIQ team
      </p>
    </td>
  </tr>`;

  const html = wrapEmailShell({ bodyHtml, previewText, siteUrl, title: subject, unsubscribeUrl });

  const text = [
    "Something specific came up in your results…",
    "",
    `Hi ${greetingText},`,
    "",
    "Thank you for trusting us with something this personal. That means a lot to us.",
    "",
    "Your Full report is inside.",
    "",
    "It goes further than most people expect. Eighteen analysed dimensions — not just who you are, but how you desire, connect, and grow. The patterns that are hardest to put into words now have language. Most people find at least one dimension they didn't see coming.",
    "",
    "You can share this report with up to two people you trust. Some of the most interesting conversations start here. Don't let that go to waste.",
    "",
    `See what we found: ${targetReportUrl}`,
    "",
    "Why it's worth a look:",
    "- Built on psychology + real response patterns",
    "- 18 dimensions of insight you can actually use",
    "- Private by design — your data stays yours",
    "",
    "Want to go further? Upgrading to All Reports unlocks all 14 archetypes in full — alongside every benefit of the Full Report — and includes six complimentary months of the LoveIQ Journal on Substack.",
    "",
    "Curious minds tend to get the most out of this.",
    "",
    "If anything gets in the way — missing link, expired access, or trouble opening your report — reach out to us at hello@loveiq.org.",
    "",
    "We'll get you back in.",
    "",
    "With kindness,",
    "Your LoveIQ team",
  ].join("\n");

  return { subject, html, text };
}
